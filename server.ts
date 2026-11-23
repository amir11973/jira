import 'dotenv/config';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { AuthMethod } from './server/httpClient.ts';
import { computeSyncHash } from './server/cryptoVault.ts';
import { integrationStore } from './server/store.ts';
import type { AllProviderKind, ProviderKind } from './server/store.ts';
import { checkJiraHealth, connectJira, discoverJiraData } from './server/connectors/jiraConnector.ts';
import {
  checkConfluenceHealth,
  connectConfluence,
  discoverConfluenceData,
} from './server/connectors/confluenceConnector.ts';
import {
  buildExcelTemplateBuffer,
  parseExcelOrCsvBuffer,
} from './server/connectors/excelEngine.ts';
import type { ExcelTemplateType } from './server/connectors/excelEngine.ts';
import {
  cancelSyncJob,
  enqueueSyncJob,
  pauseSyncJob,
  recoverInterruptedJobsAndStartScheduler,
  resumeSyncJob,
  retryFailedSyncJob,
} from './server/syncWorker.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const ALLOWED_ROLES = new Set([
  'admin',
  'developer',
  'qa',
  'product_owner',
  'designer',
]);

interface SessionClaims {
  userId: string;
  organizationId: string;
  email: string;
  role: string;
  exp: number;
}

interface AuthenticatedRequest extends Request {
  authUser?: SessionClaims;
}

function signSessionToken(claims: SessionClaims): string {
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string): SessionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, providedSig] = parts;
  if (!payload || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');

  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    ) as SessionClaims;
    if (
      !parsed ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.role !== 'string' ||
      typeof parsed.exp !== 'number' ||
      Date.now() > parsed.exp
    ) {
      return null;
    }
    if (!parsed.organizationId) parsed.organizationId = 'org-default';
    return parsed;
  } catch {
    return null;
  }
}

function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) {
    res.status(401).json({
      error: 'Authentication required. Missing Bearer session token.',
      code: 'UNAUTHORIZED',
    });
    return;
  }
  const claims = verifySessionToken(match[1]);
  if (!claims) {
    res.status(401).json({
      error: 'Invalid or expired session token.',
      code: 'INVALID_SESSION',
    });
    return;
  }
  req.authUser = claims;
  next();
}

function requireAdminOrOwner(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const role = req.authUser?.role || '';
  if (role !== 'admin' && role !== 'product_owner') {
    res.status(403).json({
      error: 'Administrator or Product Owner permission is required for this integration operation.',
      code: 'FORBIDDEN',
    });
    return;
  }
  next();
}

function registerApiRoutes(app: express.Express) {
  app.use(express.json({ limit: '15mb' }));

  // Issue a short-lived signed session token bound to the current signed-in user & organization
  app.post('/api/auth/session', (req: Request, res: Response) => {
    const { userId, organizationId, email, role } = (req.body || {}) as {
      userId?: string;
      organizationId?: string;
      email?: string;
      role?: string;
    };

    if (!userId || !email || !role || !ALLOWED_ROLES.has(role)) {
      res.status(400).json({ error: 'Valid userId, email, and role are required.' });
      return;
    }

    const exp = Date.now() + 12 * 60 * 60 * 1000;
    const token = signSessionToken({
      userId: String(userId).slice(0, 120),
      organizationId: String(organizationId || 'org-default').slice(0, 80),
      email: String(email).slice(0, 180),
      role,
      exp,
    });

    res.json({ token, expiresAt: exp });
  });

  // Integration Center full summary state
  app.get('/api/integrations/state', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.authUser!.organizationId;
    const jiraConn = integrationStore.getConnection(orgId, 'jira');
    const confluenceConn = integrationStore.getConnection(orgId, 'confluence');
    const jobs = integrationStore.listJobs(orgId);
    const conflicts = integrationStore.listConflicts(orgId, 'pending');

    res.json({
      connections: {
        jira: jiraConn ? integrationStore.summarizeConnection(jiraConn) : null,
        confluence: confluenceConn ? integrationStore.summarizeConnection(confluenceConn) : null,
      },
      history: integrationStore.listHistory(orgId),
      templates: integrationStore.listTemplates(orgId),
      configs: integrationStore.listConfigs(orgId),
      jobs: jobs.slice(0, 20),
      pendingConflictsCount: conflicts.length,
      activeJobsCount: jobs.filter(j => j.status === 'running' || j.status === 'queued').length,
    });
  });

  // Disconnect provider
  app.delete(
    '/api/integrations/connections/:provider',
    requireAuth,
    requireAdminOrOwner,
    (req: AuthenticatedRequest, res: Response) => {
      const provider = req.params.provider;
      if (provider !== 'jira' && provider !== 'confluence') {
        res.status(400).json({ error: 'Invalid provider.' });
        return;
      }
      const orgId = req.authUser!.organizationId;
      integrationStore.deleteConnection(orgId, provider);
      integrationStore.appendAuditLog({
        organizationId: orgId,
        actorUserId: req.authUser!.userId,
        actorRole: req.authUser!.role,
        provider,
        action: 'disconnect_provider',
        resourceType: 'integration_connection',
        status: 'success',
        summary: `Disconnected ${provider} integration.`,
      });
      res.json({ ok: true, provider });
    }
  );

  // Live Health Check for Jira or Confluence
  app.post(
    '/api/integrations/:provider/health',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      const provider = req.params.provider;
      if (provider !== 'jira' && provider !== 'confluence') {
        res.status(400).json({ error: 'Invalid provider.' });
        return;
      }
      const orgId = req.authUser!.organizationId;
      const conn = integrationStore.getConnection(orgId, provider);
      if (!conn) {
        res.status(404).json({ error: `No ${provider} connection found.` });
        return;
      }
      const dec = integrationStore.getDecryptedSecret(conn);
      if (!dec.ok || !dec.secret) {
        const updated = integrationStore.updateConnectionHealth(
          orgId,
          provider,
          'needs_reauth',
          'Stored credential key rotated or unavailable. Please re-authenticate.'
        );
        res.json({ connection: updated ? integrationStore.summarizeConnection(updated) : null });
        return;
      }

      const health =
        provider === 'jira'
          ? await checkJiraHealth(conn, dec.secret)
          : await checkConfluenceHealth(conn, dec.secret);
      const updated = integrationStore.updateConnectionHealth(
        orgId,
        provider,
        health.healthStatus,
        health.healthMessage
      );
      integrationStore.appendAuditLog({
        organizationId: orgId,
        actorUserId: req.authUser!.userId,
        actorRole: req.authUser!.role,
        provider,
        action: 'health_check',
        resourceType: 'integration_connection',
        resourceId: conn.id,
        status: health.healthStatus === 'healthy' ? 'success' : 'warning',
        summary: health.healthMessage,
      });
      res.json({ connection: updated ? integrationStore.summarizeConnection(updated) : null });
    }
  );

  // Record sync history entry after client executes import/sync
  app.post('/api/integrations/history', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.authUser!.organizationId;
    const userId = req.authUser!.userId;
    const body = (req.body || {}) as {
      provider?: AllProviderKind;
      status?: 'success' | 'partial' | 'failed';
      sourceLabel?: string;
      targetSpaceKey?: string;
      createdCount?: number;
      updatedCount?: number;
      skippedCount?: number;
      errorMessage?: string;
    };

    if (!body.provider || !['jira', 'confluence', 'excel'].includes(body.provider)) {
      res.status(400).json({ error: 'Valid provider is required.' });
      return;
    }

    const record = integrationStore.appendHistory({
      organizationId: orgId,
      userId,
      provider: body.provider,
      status: body.status === 'failed' || body.status === 'partial' ? body.status : 'success',
      sourceLabel: String(body.sourceLabel || body.provider).slice(0, 180),
      targetSpaceKey: String(body.targetSpaceKey || '-').slice(0, 32),
      createdCount: Number(body.createdCount || 0),
      updatedCount: Number(body.updatedCount || 0),
      skippedCount: Number(body.skippedCount || 0),
      errorMessage: body.errorMessage ? String(body.errorMessage).slice(0, 300) : undefined,
    });

    if ((body.provider === 'jira' || body.provider === 'confluence') && record.status !== 'failed') {
      integrationStore.markConnectionSynced(orgId, body.provider, record.timestamp);
    }

    integrationStore.appendAuditLog({
      organizationId: orgId,
      actorUserId: userId,
      actorRole: req.authUser!.role,
      provider: body.provider,
      action: 'execute_import',
      resourceType: 'sync_history',
      resourceId: record.id,
      status: record.status === 'failed' ? 'failed' : record.status === 'partial' ? 'warning' : 'success',
      summary: `${body.provider.toUpperCase()} import to ${record.targetSpaceKey}: +${record.createdCount} created, ~${record.updatedCount} updated, ${record.skippedCount} skipped.`,
    });

    res.json({ record });
  });

  // Templates CRUD
  app.post('/api/integrations/templates', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.authUser!.organizationId;
    const userId = req.authUser!.userId;
    const { name, source, destinationModule, mappings, statusMap } = (req.body || {}) as {
      name?: string;
      source?: AllProviderKind;
      destinationModule?: string;
      mappings?: unknown[];
      statusMap?: Record<string, string>;
    };

    if (!name || !name.trim() || !source || !destinationModule || !Array.isArray(mappings)) {
      res.status(400).json({ error: 'Template name, source, destinationModule, and mappings are required.' });
      return;
    }

    const template = integrationStore.saveTemplate({
      organizationId: orgId,
      userId,
      name,
      source,
      destinationModule,
      mappings,
      statusMap: statusMap || {},
    });

    res.json({ template });
  });

  app.delete('/api/integrations/templates/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    integrationStore.deleteTemplate(req.authUser!.organizationId, req.params.id);
    res.json({ ok: true });
  });

  // Sync Configs & Scheduled Sync Profiles
  app.get('/api/integrations/configs', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({ configs: integrationStore.listConfigs(req.authUser!.organizationId) });
  });

  app.post('/api/integrations/configs', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.authUser!.organizationId;
    const body = (req.body || {}) as {
      id?: string;
      connectionId?: string;
      provider?: AllProviderKind;
      name?: string;
      targetProjectId?: string;
      destinationModule?: string;
      sourceScopes?: string[];
      jqlOrCqlFilter?: string;
      syncMode?: 'manual' | 'scheduled';
      syncIntervalMinutes?: number;
      conflictPolicy?: 'source_wins' | 'destination_wins' | 'manual_review';
      enabled?: boolean;
    };

    if (!body.provider || !body.name || !body.destinationModule) {
      res.status(400).json({ error: 'Config name, provider, and destinationModule are required.' });
      return;
    }

    const config = integrationStore.upsertConfig({
      id: body.id,
      organizationId: orgId,
      connectionId: body.connectionId || `${body.provider}-default`,
      provider: body.provider,
      name: body.name,
      targetProjectId: body.targetProjectId || 'DEFAULT',
      destinationModule: body.destinationModule,
      sourceScopes: body.sourceScopes || [],
      jqlOrCqlFilter: body.jqlOrCqlFilter,
      syncMode: body.syncMode === 'scheduled' ? 'scheduled' : 'manual',
      syncIntervalMinutes: Number(body.syncIntervalMinutes || 60),
      conflictPolicy: body.conflictPolicy || 'manual_review',
      enabled: body.enabled ?? true,
    });

    integrationStore.appendAuditLog({
      organizationId: orgId,
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.role,
      provider: config.provider,
      action: 'save_sync_config',
      resourceType: 'integration_config',
      resourceId: config.id,
      status: 'success',
      summary: `Saved sync profile "${config.name}" (${config.syncMode}, every ${config.syncIntervalMinutes}m).`,
    });

    res.json({ config });
  });

  app.delete(
    '/api/integrations/configs/:id',
    requireAuth,
    requireAdminOrOwner,
    (req: AuthenticatedRequest, res: Response) => {
      const ok = integrationStore.deleteConfig(req.authUser!.organizationId, req.params.id);
      res.json({ ok });
    }
  );

  // Background Jobs Queue & Controls
  app.get('/api/integrations/jobs', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({ jobs: integrationStore.listJobs(req.authUser!.organizationId) });
  });

  app.get('/api/integrations/jobs/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const job = integrationStore.getJob(req.authUser!.organizationId, req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Integration job not found.' });
      return;
    }
    res.json({ job });
  });

  app.post('/api/integrations/jobs', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.authUser!.organizationId;
    const body = (req.body || {}) as {
      configId?: string;
      connectionId?: string;
      provider?: AllProviderKind;
      mode?: 'full' | 'incremental';
      sourceLabel?: string;
      targetSpaceKey?: string;
      destinationModule?: string;
      conflictPolicy?: 'source_wins' | 'destination_wins' | 'manual_review';
      sourceScopes?: string[];
      jqlOrCql?: string;
      items?: Array<Record<string, unknown>>;
    };

    if (!body.provider || !body.destinationModule) {
      res.status(400).json({ error: 'provider and destinationModule are required to queue a job.' });
      return;
    }

    const job = integrationStore.createJob({
      organizationId: orgId,
      createdByUserId: req.authUser!.userId,
      configId: body.configId,
      connectionId: body.connectionId,
      provider: body.provider,
      mode: body.mode === 'incremental' ? 'incremental' : 'full',
      sourceLabel: body.sourceLabel || `${body.provider.toUpperCase()} Background Sync`,
      targetSpaceKey: body.targetSpaceKey || 'DEFAULT',
      destinationModule: body.destinationModule,
      conflictPolicy: body.conflictPolicy || 'manual_review',
      totalItems: Array.isArray(body.items) ? body.items.length : 0,
      pendingPayload: {
        sourceScopes: body.sourceScopes,
        jqlOrCql: body.jqlOrCql,
        items: body.items,
      },
    });

    enqueueSyncJob(job);

    integrationStore.appendAuditLog({
      organizationId: orgId,
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.role,
      provider: job.provider,
      action: 'queue_sync_job',
      resourceType: 'integration_job',
      resourceId: job.id,
      status: 'success',
      summary: `Queued ${job.mode} sync job (${job.sourceLabel}) -> ${job.targetSpaceKey}.`,
    });

    const safe = integrationStore.getJob(orgId, job.id);
    res.status(201).json({ job: safe });
  });

  app.post('/api/integrations/jobs/:id/pause', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const job = pauseSyncJob(req.authUser!.organizationId, req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }
    res.json({ job: integrationStore.getJob(req.authUser!.organizationId, job.id) });
  });

  app.post('/api/integrations/jobs/:id/resume', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const job = resumeSyncJob(req.authUser!.organizationId, req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }
    res.json({ job: integrationStore.getJob(req.authUser!.organizationId, job.id) });
  });

  app.post('/api/integrations/jobs/:id/cancel', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const job = cancelSyncJob(req.authUser!.organizationId, req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }
    res.json({ job: integrationStore.getJob(req.authUser!.organizationId, job.id) });
  });

  app.post('/api/integrations/jobs/:id/retry', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const job = retryFailedSyncJob(req.authUser!.organizationId, req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }
    res.json({ job: integrationStore.getJob(req.authUser!.organizationId, job.id) });
  });

  // External Links Registry (Idempotent Deduplication Tracking)
  app.get('/api/integrations/external-links', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const provider = typeof req.query.provider === 'string' ? (req.query.provider as AllProviderKind) : undefined;
    res.json({
      links: integrationStore.listExternalLinks(req.authUser!.organizationId, provider),
    });
  });

  app.post('/api/integrations/external-links/record', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.authUser!.organizationId;
    const { provider, connectionId, links } = (req.body || {}) as {
      provider?: AllProviderKind;
      connectionId?: string;
      links?: Array<{
        externalEntityType: string;
        externalEntityId: string;
        externalKey: string;
        externalUrl?: string;
        localEntityType: string;
        localEntityId: string;
        localProjectId?: string;
        syncHash?: string;
        sourceUpdatedAt?: string;
      }>;
    };

    if (!provider || !Array.isArray(links)) {
      res.status(400).json({ error: 'provider and links array are required.' });
      return;
    }

    const saved = links.slice(0, 500).map(l =>
      integrationStore.upsertExternalLink({
        organizationId: orgId,
        provider,
        connectionId: connectionId || `${provider}-default`,
        externalEntityType: l.externalEntityType,
        externalEntityId: l.externalEntityId,
        externalKey: l.externalKey,
        externalUrl: l.externalUrl,
        localEntityType: l.localEntityType,
        localEntityId: l.localEntityId,
        localProjectId: l.localProjectId,
        syncHash: l.syncHash || computeSyncHash(l),
        sourceUpdatedAt: l.sourceUpdatedAt,
      })
    );

    res.json({ count: saved.length, links: saved });
  });

  // Conflicts Review & Resolution
  app.get('/api/integrations/conflicts', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.json({ conflicts: integrationStore.listConflicts(req.authUser!.organizationId, status) });
  });

  app.post('/api/integrations/conflicts', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.authUser!.organizationId;
    const body = (req.body || {}) as {
      jobId?: string;
      provider?: AllProviderKind;
      entityType?: string;
      externalKey?: string;
      localEntityId?: string;
      fieldDiffs?: Array<{ field: string; sourceValue: unknown; localValue: unknown }>;
      sourceSnapshot?: Record<string, unknown>;
      localSnapshot?: Record<string, unknown>;
    };
    if (!body.provider || !body.externalKey || !body.localEntityId) {
      res.status(400).json({ error: 'provider, externalKey, and localEntityId are required.' });
      return;
    }
    const conflict = integrationStore.createConflict({
      organizationId: orgId,
      jobId: body.jobId || 'manual',
      provider: body.provider,
      entityType: body.entityType || 'issue',
      externalKey: body.externalKey,
      localEntityId: body.localEntityId,
      fieldDiffs: body.fieldDiffs || [],
      sourceSnapshot: body.sourceSnapshot || {},
      localSnapshot: body.localSnapshot || {},
    });
    res.status(201).json({ conflict });
  });

  app.post(
    '/api/integrations/conflicts/:id/resolve',
    requireAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const orgId = req.authUser!.organizationId;
      const { resolution, mergedFields } = (req.body || {}) as {
        resolution?: 'resolved_source' | 'resolved_destination' | 'resolved_merged' | 'dismissed';
        mergedFields?: Record<string, 'source' | 'destination'>;
      };
      if (!resolution) {
        res.status(400).json({ error: 'resolution is required.' });
        return;
      }
      const resolved = integrationStore.resolveConflict(
        orgId,
        req.params.id,
        resolution,
        req.authUser!.email,
        mergedFields
      );
      if (!resolved) {
        res.status(404).json({ error: 'Conflict record not found.' });
        return;
      }
      integrationStore.appendAuditLog({
        organizationId: orgId,
        actorUserId: req.authUser!.userId,
        actorRole: req.authUser!.role,
        provider: resolved.provider,
        action: 'resolve_conflict',
        resourceType: 'integration_conflict',
        resourceId: resolved.id,
        status: 'success',
        summary: `Resolved conflict for ${resolved.externalKey} using ${resolution}.`,
      });
      res.json({ conflict: resolved });
    }
  );

  // Audit Log Query
  app.get('/api/integrations/audit', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined;
    res.json({ logs: integrationStore.listAuditLogs(req.authUser!.organizationId, provider) });
  });

  // ======================== JIRA REAL INTEGRATION ========================
  app.post('/api/integrations/jira/connect', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.authUser!.organizationId;
    const userId = req.authUser!.userId;
    const { serverUrl, authMethod, email, username, secret } = (req.body || {}) as {
      serverUrl?: string;
      authMethod?: AuthMethod;
      email?: string;
      username?: string;
      secret?: string;
    };

    if (!serverUrl || !authMethod || !secret) {
      res.status(400).json({ error: 'Server URL, authentication method, and token/password are required.' });
      return;
    }
    if (authMethod === 'api_token' && !email) {
      res.status(400).json({ error: 'Account email is required for Atlassian Cloud API Token.' });
      return;
    }
    if (authMethod === 'basic' && !username && !email) {
      res.status(400).json({ error: 'Username is required for Basic Authentication.' });
      return;
    }

    try {
      const result = await connectJira({ serverUrl, authMethod, email, username, secret });
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      const conn = integrationStore.upsertConnection({
        organizationId: orgId,
        userId,
        provider: 'jira',
        serverUrl,
        authMethod,
        email,
        username,
        plainSecret: secret,
        account: result.account,
        projectsOrSpaces: result.projectsOrSpaces,
      });

      integrationStore.appendAuditLog({
        organizationId: orgId,
        actorUserId: userId,
        actorRole: req.authUser!.role,
        provider: 'jira',
        action: 'connect_provider',
        resourceType: 'integration_connection',
        resourceId: conn.id,
        status: 'success',
        summary: `Connected Jira (${conn.serverUrl}) with ${result.projectsOrSpaces.length} accessible projects.`,
      });

      res.json({ connection: integrationStore.summarizeConnection(conn) });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to connect to Jira server.',
      });
    }
  });

  app.post('/api/integrations/jira/discover', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.authUser!.organizationId;
    const conn = integrationStore.getConnection(orgId, 'jira');
    if (!conn) {
      res.status(404).json({ error: 'No active Jira connection found. Please authenticate first.' });
      return;
    }

    const dec = integrationStore.getDecryptedSecret(conn);
    if (!dec.ok || !dec.secret) {
      res.status(401).json({
        code: 'NEEDS_REAUTH',
        error: 'Stored Jira credential needs re-authentication after server restart.',
      });
      return;
    }

    const { projectKeys = [], jql = '', maxResults = 200, updatedSince } = (req.body || {}) as {
      projectKeys?: string[];
      jql?: string;
      maxResults?: number;
      updatedSince?: string;
    };

    try {
      const discovered = await discoverJiraData({
        conn,
        secret: dec.secret,
        projectKeys,
        jql,
        maxResults,
        updatedSince,
      });
      res.json(discovered);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to discover Jira data.',
      });
    }
  });

  // ======================== CONFLUENCE REAL INTEGRATION ========================
  app.post(
    '/api/integrations/confluence/connect',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      const orgId = req.authUser!.organizationId;
      const userId = req.authUser!.userId;
      const { serverUrl, authMethod, email, username, secret } = (req.body || {}) as {
        serverUrl?: string;
        authMethod?: AuthMethod;
        email?: string;
        username?: string;
        secret?: string;
      };

      if (!serverUrl || !authMethod || !secret) {
        res.status(400).json({ error: 'Server URL, authentication method, and token/password are required.' });
        return;
      }

      try {
        const result = await connectConfluence({ serverUrl, authMethod, email, username, secret });
        if (!result.ok) {
          res.status(result.status).json({ error: result.error });
          return;
        }

        const conn = integrationStore.upsertConnection({
          organizationId: orgId,
          userId,
          provider: 'confluence',
          serverUrl,
          authMethod,
          email,
          username,
          plainSecret: secret,
          account: result.account,
          projectsOrSpaces: result.projectsOrSpaces,
        });

        integrationStore.appendAuditLog({
          organizationId: orgId,
          actorUserId: userId,
          actorRole: req.authUser!.role,
          provider: 'confluence',
          action: 'connect_provider',
          resourceType: 'integration_connection',
          resourceId: conn.id,
          status: 'success',
          summary: `Connected Confluence (${conn.serverUrl}) with ${result.projectsOrSpaces.length} spaces.`,
        });

        res.json({ connection: integrationStore.summarizeConnection(conn) });
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Failed to connect to Confluence server.',
        });
      }
    }
  );

  app.post(
    '/api/integrations/confluence/discover',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      const orgId = req.authUser!.organizationId;
      const conn = integrationStore.getConnection(orgId, 'confluence');
      if (!conn) {
        res.status(404).json({ error: 'No active Confluence connection found. Please authenticate first.' });
        return;
      }

      const dec = integrationStore.getDecryptedSecret(conn);
      if (!dec.ok || !dec.secret) {
        res.status(401).json({
          code: 'NEEDS_REAUTH',
          error: 'Stored Confluence credential needs re-authentication after server restart.',
        });
        return;
      }

      const { spaceKeys = [], maxResults = 150, updatedSince } = (req.body || {}) as {
        spaceKeys?: string[];
        maxResults?: number;
        updatedSince?: string;
      };

      try {
        const discovered = await discoverConfluenceData({
          conn,
          secret: dec.secret,
          spaceKeys,
          maxResults,
          updatedSince,
        });
        res.json(discovered);
      } catch (err) {
        res.status(502).json({
          error: err instanceof Error ? err.message : 'Failed to fetch Confluence pages.',
        });
      }
    }
  );

  // ======================== EXCEL / CSV PARSING & 5 TEMPLATES ========================
  app.post('/api/integrations/excel/parse', requireAuth, async (req: Request, res: Response) => {
    const { fileName, base64Data, headerRow } = (req.body || {}) as {
      fileName?: string;
      base64Data?: string;
      headerRow?: number;
    };

    if (!fileName || !base64Data) {
      res.status(400).json({ error: 'File name and file payload are required.' });
      return;
    }

    try {
      const parsed = await parseExcelOrCsvBuffer({
        fileName,
        base64Data,
        headerRowOverride: typeof headerRow === 'number' && headerRow >= 1 ? headerRow : undefined,
      });
      res.json(parsed);
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      res.status(400).json({
        ...(code ? { code } : {}),
        error:
          err instanceof Error
            ? err.message
            : 'Unable to parse the uploaded Excel/CSV file.',
      });
    }
  });

  app.get('/api/integrations/excel/template', requireAuth, async (req: Request, res: Response) => {
    const rawType = String(req.query.type || 'all').toLowerCase();
    const allowed: ExcelTemplateType[] = ['project', 'task', 'wbs', 'resource', 'risk', 'all'];
    const templateType: ExcelTemplateType = allowed.includes(rawType as ExcelTemplateType)
      ? (rawType as ExcelTemplateType)
      : 'all';

    try {
      const { buffer, fileName } = await buildExcelTemplateBuffer(templateType);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(buffer);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to generate Excel template.',
      });
    }
  });
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  registerApiRoutes(app);

  // Recover any interrupted background sync jobs and start scheduled sync runner
  recoverInterruptedJobsAndStartScheduler();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`JiraFlow server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start JiraFlow server:', err);
  process.exit(1);
});
