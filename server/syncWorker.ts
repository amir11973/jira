import crypto from 'node:crypto';
import { computeSyncHash } from './cryptoVault.ts';
import { discoverJiraData } from './connectors/jiraConnector.ts';
import { discoverConfluenceData } from './connectors/confluenceConnector.ts';
import { integrationStore } from './store.ts';
import type {
  IntegrationConfigRecord,
  IntegrationJobRecord,
  ProviderKind,
} from './store.ts';

const WORKER_ID = `worker-${process.pid}-${crypto.randomUUID().slice(0, 6)}`;
const activeLoops = new Set<string>();
let schedulerTimer: NodeJS.Timeout | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function diffFields(
  sourceSnap: Record<string, unknown>,
  localSnap: Record<string, unknown>
): Array<{ field: string; sourceValue: unknown; localValue: unknown }> {
  const keys = ['summary', 'title', 'status', 'priority', 'assignee', 'dueDate', 'description', 'content'];
  const diffs: Array<{ field: string; sourceValue: unknown; localValue: unknown }> = [];
  for (const k of keys) {
    if (k in sourceSnap || k in localSnap) {
      const sv = sourceSnap[k];
      const lv = localSnap[k];
      if (lv !== undefined && sv !== undefined && JSON.stringify(sv) !== JSON.stringify(lv)) {
        diffs.push({ field: k, sourceValue: sv, localValue: lv });
      }
    }
  }
  return diffs;
}

async function hydrateRemoteJobItems(job: IntegrationJobRecord): Promise<Array<Record<string, unknown>>> {
  if (job.pendingPayload?.items && Array.isArray(job.pendingPayload.items)) {
    return job.pendingPayload.items;
  }

  if (job.provider !== 'jira' && job.provider !== 'confluence') {
    return [];
  }

  const conn =
    (job.connectionId
      ? integrationStore.getConnectionById(job.organizationId, job.connectionId)
      : undefined) || integrationStore.getConnection(job.organizationId, job.provider as ProviderKind);

  if (!conn) {
    throw new Error(`No active ${job.provider} connection found for background sync.`);
  }

  const dec = integrationStore.getDecryptedSecret(conn);
  if (!dec.ok || !dec.secret) {
    throw new Error('Stored credential requires re-authentication before syncing.');
  }

  const cfg = job.configId ? integrationStore.getConfig(job.organizationId, job.configId) : undefined;
  const updatedSince = job.mode === 'incremental' ? cfg?.lastCheckpointCursor : undefined;

  if (job.provider === 'jira') {
    const discovered = await discoverJiraData({
      conn,
      secret: dec.secret,
      projectKeys: job.pendingPayload?.sourceScopes || cfg?.sourceScopes || [],
      jql: job.pendingPayload?.jqlOrCql || cfg?.jqlOrCqlFilter || '',
      maxResults: 200,
      updatedSince,
    });
    return discovered.issues.map(iss => ({
      ...iss,
      _entityType: 'issue',
      _externalId: iss.id || iss.key,
      _externalKey: iss.key,
      _externalUrl: iss.externalUrl,
      _updatedAt: iss.updated,
    }));
  }

  const discovered = await discoverConfluenceData({
    conn,
    secret: dec.secret,
    spaceKeys: job.pendingPayload?.sourceScopes || cfg?.sourceScopes || [],
    maxResults: 150,
    updatedSince,
  });
  return discovered.pages.map(pg => ({
    ...pg,
    _entityType: 'page',
    _externalId: pg.id,
    _externalKey: `${pg.spaceKey}:${pg.id}`,
    _externalUrl: pg.sourceUrl,
    _updatedAt: pg.updatedAt,
  }));
}

async function processJobLoop(jobId: string): Promise<void> {
  if (activeLoops.has(jobId)) return;
  activeLoops.add(jobId);

  try {
    let job = integrationStore.getRawJobById(jobId);
    if (!job || job.status === 'cancelled' || job.status === 'paused') return;

    integrationStore.updateJob(jobId, {
      status: 'running',
      startedAt: job.startedAt || new Date().toISOString(),
      attemptCount: job.attemptCount + 1,
      workerLeaseOwner: WORKER_ID,
      leaseExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      errorSummary: undefined,
    });

    const items = await hydrateRemoteJobItems(job);
    const total = items.length;
    const resumeIdx = Math.max(0, Number(job.checkpointCursor || 0));

    integrationStore.updateJob(jobId, { totalItems: total });

    const seenExternalIds = new Set<string>();
    const entityTypeDefault =
      job.provider === 'confluence'
        ? 'page'
        : job.provider === 'jira'
        ? 'issue'
        : job.destinationModule;

    for (let i = resumeIdx; i < items.length; i++) {
      // Refresh lease & check pause/cancel signals cleanly between items
      job = integrationStore.getRawJobById(jobId);
      if (!job || job.status === 'cancelled' || job.status === 'paused') {
        return;
      }

      const rawItem = items[i] || {};
      const extType = String(rawItem._entityType || entityTypeDefault);
      const extId = String(rawItem._externalId || rawItem.id || rawItem.key || `row-${i + 1}`);
      const extKey = String(rawItem._externalKey || rawItem.key || rawItem.title || rawItem.summary || extId);
      const extUrl = typeof rawItem._externalUrl === 'string' ? rawItem._externalUrl : undefined;
      const sourceUpdatedAt =
        typeof rawItem._updatedAt === 'string'
          ? rawItem._updatedAt
          : typeof rawItem.updated === 'string'
          ? rawItem.updated
          : typeof rawItem.updatedAt === 'string'
          ? rawItem.updatedAt
          : new Date().toISOString();

      seenExternalIds.add(extId);

      // Build clean hash excluding transient hints
      const hashable: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rawItem)) {
        if (!k.startsWith('_')) hashable[k] = v;
      }
      const syncHash = computeSyncHash(hashable);

      const connId = job.connectionId || `${job.provider}-upload`;
      const existingLink = integrationStore.findExternalLink(
        job.organizationId,
        job.provider,
        connId,
        extType,
        extId
      );

      let action: 'create' | 'update' | 'skip' | 'conflict' | 'fail' = 'create';
      let itemStatus: 'succeeded' | 'failed' | 'conflict' = 'succeeded';
      let errorMessage: string | undefined;
      const localEntityId = existingLink?.localEntityId || `loc-${crypto.randomUUID().slice(0, 8)}`;

      // Check row validation error markers passed from preview/client if any
      const cellErrors = Array.isArray(rawItem._cellErrors)
        ? (rawItem._cellErrors as Array<{
            rowIndex: number;
            columnKey: string;
            severity: 'error' | 'warning';
            messageEn: string;
            messageFa: string;
          }>)
        : undefined;

      const hasBlockingCellError = cellErrors?.some(e => e.severity === 'error');

      if (hasBlockingCellError) {
        action = 'fail';
        itemStatus = 'failed';
        errorMessage = cellErrors!.find(e => e.severity === 'error')?.messageEn || 'Validation failed';
        integrationStore.updateJob(jobId, { failedCount: job.failedCount + 1 });
      } else if (!existingLink) {
        action = 'create';
        integrationStore.upsertExternalLink({
          organizationId: job.organizationId,
          provider: job.provider,
          connectionId: connId,
          externalEntityType: extType,
          externalEntityId: extId,
          externalKey: extKey,
          externalUrl: extUrl,
          localEntityType: job.destinationModule,
          localEntityId,
          localProjectId: job.targetSpaceKey,
          syncHash,
          sourceUpdatedAt,
        });
        integrationStore.updateJob(jobId, { createdCount: job.createdCount + 1 });
      } else if (existingLink.syncHash === syncHash && !existingLink.missingInSource) {
        action = 'skip';
        integrationStore.updateJob(jobId, { skippedCount: job.skippedCount + 1 });
      } else {
        // Check if local record was modified since last sync or policy requires conflict review
        const localEditedSinceSync =
          existingLink.localUpdatedAt &&
          existingLink.lastSyncedAt &&
          existingLink.localUpdatedAt > existingLink.lastSyncedAt;

        if (job.conflictPolicy === 'manual_review' && localEditedSinceSync) {
          action = 'conflict';
          itemStatus = 'conflict';
          const localSnap = (rawItem._localSnapshot as Record<string, unknown>) || {
            summary: existingLink.externalKey,
            updatedAt: existingLink.localUpdatedAt,
          };
          const diffs = diffFields(hashable, localSnap);
          integrationStore.createConflict({
            organizationId: job.organizationId,
            jobId,
            configId: job.configId,
            externalLinkId: existingLink.id,
            provider: job.provider,
            entityType: extType,
            externalKey: extKey,
            localEntityId: existingLink.localEntityId,
            fieldDiffs:
              diffs.length > 0
                ? diffs
                : [{ field: 'syncHash', sourceValue: syncHash, localValue: existingLink.syncHash }],
            sourceSnapshot: hashable,
            localSnapshot: localSnap,
          });
          integrationStore.updateJob(jobId, { conflictCount: job.conflictCount + 1 });
        } else if (job.conflictPolicy === 'destination_wins' && localEditedSinceSync) {
          action = 'skip';
          integrationStore.updateJob(jobId, { skippedCount: job.skippedCount + 1 });
        } else {
          action = 'update';
          integrationStore.upsertExternalLink({
            organizationId: job.organizationId,
            provider: job.provider,
            connectionId: connId,
            externalEntityType: extType,
            externalEntityId: extId,
            externalKey: extKey,
            externalUrl: extUrl,
            localEntityType: job.destinationModule,
            localEntityId: existingLink.localEntityId,
            localProjectId: job.targetSpaceKey,
            syncHash,
            sourceUpdatedAt,
          });
          integrationStore.updateJob(jobId, { updatedCount: job.updatedCount + 1 });
        }
      }

      integrationStore.addOrUpdateJobItem({
        id: `jitem-${crypto.randomUUID().slice(0, 9)}`,
        jobId,
        externalEntityType: extType,
        externalEntityId: extId,
        externalKey: extKey,
        localEntityType: job.destinationModule,
        localEntityId,
        action,
        status: itemStatus,
        rowNumber: i + 1,
        cellErrors,
        errorMessage,
        payloadSnapshot: hashable,
        syncHash,
        sourceUpdatedAt,
      });

      integrationStore.updateJob(jobId, {
        processedItems: i + 1,
        checkpointCursor: String(i + 1),
        leaseExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      });

      // Tiny yield so event loop remains completely responsive for HTTP & UI polling
      if (i % 10 === 9) await sleep(15);
    }

    // Safe deletion handling on full remote sync: never delete local records, only flag missingInSource
    if (job.mode === 'full' && (job.provider === 'jira' || job.provider === 'confluence') && seenExternalIds.size > 0) {
      const connId = job.connectionId || `${job.provider}-upload`;
      const flagged = integrationStore.flagMissingInSource(
        job.organizationId,
        job.provider,
        connId,
        entityTypeDefault,
        seenExternalIds,
        job.targetSpaceKey
      );
      if (flagged.length > 0) {
        integrationStore.appendAuditLog({
          organizationId: job.organizationId,
          actorUserId: job.createdByUserId,
          actorRole: 'system',
          provider: job.provider,
          action: 'flag_missing_source_records',
          resourceType: 'external_link',
          resourceId: job.id,
          status: 'warning',
          summary: `Flagged ${flagged.length} previously synced record(s) missing in source without deleting local data.`,
        });
      }
    }

    const latest = integrationStore.getRawJobById(jobId);
    if (!latest || latest.status === 'cancelled' || latest.status === 'paused') return;

    const finalStatus =
      latest.failedCount > 0 || latest.conflictCount > 0 ? 'partial' : 'completed';
    const finishedAt = new Date().toISOString();

    integrationStore.updateJob(jobId, {
      status: finalStatus,
      finishedAt,
      leaseExpiresAt: null,
      workerLeaseOwner: undefined,
    });

    if (latest.provider === 'jira' || latest.provider === 'confluence') {
      integrationStore.markConnectionSynced(latest.organizationId, latest.provider, finishedAt);
    }

    if (latest.configId) {
      const cfg = integrationStore.getConfig(latest.organizationId, latest.configId);
      if (cfg) {
        integrationStore.upsertConfig({
          ...cfg,
          lastCheckpointCursor: finishedAt,
          lastSuccessfulSyncAt: finishedAt,
        });
      }
    }

    integrationStore.appendHistory({
      organizationId: latest.organizationId,
      userId: latest.createdByUserId,
      provider: latest.provider,
      status: finalStatus === 'partial' ? 'partial' : 'success',
      sourceLabel: latest.sourceLabel,
      targetSpaceKey: latest.targetSpaceKey,
      createdCount: latest.createdCount,
      updatedCount: latest.updatedCount,
      skippedCount: latest.skippedCount,
    });

    integrationStore.appendAuditLog({
      organizationId: latest.organizationId,
      actorUserId: latest.createdByUserId,
      actorRole: 'system',
      provider: latest.provider,
      action: 'sync_job_finished',
      resourceType: 'integration_job',
      resourceId: latest.id,
      status: finalStatus === 'partial' ? 'warning' : 'success',
      summary: `Job ${latest.id} (${latest.provider}) finished: +${latest.createdCount} created, ~${latest.updatedCount} updated, ${latest.skippedCount} skipped, ${latest.conflictCount} conflicts, ${latest.failedCount} failed.`,
      metadata: {
        mode: latest.mode,
        destinationModule: latest.destinationModule,
        targetSpaceKey: latest.targetSpaceKey,
      },
    });
  } catch (err) {
    const job = integrationStore.getRawJobById(jobId);
    const msg = err instanceof Error ? err.message : 'Background job execution failed.';
    if (job) {
      const canRetry = job.attemptCount < job.maxAttempts;
      integrationStore.updateJob(jobId, {
        status: canRetry ? 'queued' : 'failed',
        errorSummary: msg,
        nextRetryAt: canRetry ? new Date(Date.now() + 15_000 * job.attemptCount).toISOString() : null,
        finishedAt: canRetry ? null : new Date().toISOString(),
        leaseExpiresAt: null,
      });
      integrationStore.appendAuditLog({
        organizationId: job.organizationId,
        actorUserId: job.createdByUserId,
        actorRole: 'system',
        provider: job.provider,
        action: 'sync_job_error',
        resourceType: 'integration_job',
        resourceId: job.id,
        status: 'failed',
        summary: msg,
      });
      if (canRetry) {
        setTimeout(() => {
          void processJobLoop(jobId);
        }, 5000);
      }
    }
  } finally {
    activeLoops.delete(jobId);
  }
}

export function enqueueSyncJob(job: IntegrationJobRecord): void {
  setImmediate(() => {
    void processJobLoop(job.id);
  });
}

export function pauseSyncJob(orgId: string, jobId: string): IntegrationJobRecord | undefined {
  const job = integrationStore.getRawJobById(jobId);
  if (!job || job.organizationId !== orgId) return undefined;
  if (job.status !== 'running' && job.status !== 'queued') return job;
  return integrationStore.updateJob(jobId, {
    status: 'paused',
    leaseExpiresAt: null,
  });
}

export function resumeSyncJob(orgId: string, jobId: string): IntegrationJobRecord | undefined {
  const job = integrationStore.getRawJobById(jobId);
  if (!job || job.organizationId !== orgId) return undefined;
  if (job.status !== 'paused' && job.status !== 'failed') return job;
  const updated = integrationStore.updateJob(jobId, {
    status: 'queued',
    errorSummary: undefined,
  });
  if (updated) enqueueSyncJob(updated);
  return updated;
}

export function cancelSyncJob(orgId: string, jobId: string): IntegrationJobRecord | undefined {
  const job = integrationStore.getRawJobById(jobId);
  if (!job || job.organizationId !== orgId) return undefined;
  if (job.status === 'completed' || job.status === 'cancelled') return job;
  return integrationStore.updateJob(jobId, {
    status: 'cancelled',
    finishedAt: new Date().toISOString(),
    leaseExpiresAt: null,
  });
}

export function retryFailedSyncJob(orgId: string, jobId: string): IntegrationJobRecord | undefined {
  const job = integrationStore.getRawJobById(jobId);
  if (!job || job.organizationId !== orgId) return undefined;
  const updated = integrationStore.updateJob(jobId, {
    status: 'queued',
    checkpointCursor: '0',
    failedCount: 0,
    errorSummary: undefined,
    finishedAt: null,
  });
  if (updated) enqueueSyncJob(updated);
  return updated;
}

export function recoverInterruptedJobsAndStartScheduler(): void {
  const recoverable = integrationStore.getRecoverableJobs();
  for (const job of recoverable) {
    enqueueSyncJob(job);
  }

  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = setInterval(() => {
    const now = Date.now();
    const configs: IntegrationConfigRecord[] = integrationStore.listAllEnabledScheduledConfigs();
    for (const cfg of configs) {
      const lastTs = cfg.lastSuccessfulSyncAt ? Date.parse(cfg.lastSuccessfulSyncAt) : 0;
      const dueMs = cfg.syncIntervalMinutes * 60_000;
      if (now - lastTs < dueMs) continue;

      // Avoid double-queueing if an active job for this config already exists
      const existingJobs = integrationStore.listJobs(cfg.organizationId);
      const alreadyActive = existingJobs.some(
        j => j.configId === cfg.id && (j.status === 'queued' || j.status === 'running')
      );
      if (alreadyActive) continue;

      const job = integrationStore.createJob({
        organizationId: cfg.organizationId,
        createdByUserId: 'scheduler',
        configId: cfg.id,
        connectionId: cfg.connectionId,
        provider: cfg.provider,
        mode: cfg.lastCheckpointCursor ? 'incremental' : 'full',
        sourceLabel: `Scheduled: ${cfg.name}`,
        targetSpaceKey: cfg.targetProjectId,
        destinationModule: cfg.destinationModule,
        conflictPolicy: cfg.conflictPolicy,
        pendingPayload: {
          sourceScopes: cfg.sourceScopes,
          jqlOrCql: cfg.jqlOrCqlFilter,
        },
      });
      enqueueSyncJob(job);
    }
  }, 60_000);
  schedulerTimer.unref?.();
}
