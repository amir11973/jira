import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { AuthMethod } from './server/httpClient.ts';
import { computeSyncHash } from './server/cryptoVault.ts';
import { integrationStore } from './server/store.ts';
import type { AllProviderKind } from './server/store.ts';
import { connectJira, discoverJiraData } from './server/connectors/jiraConnector.ts';
import { connectConfluence, discoverConfluenceData } from './server/connectors/confluenceConnector.ts';
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
  resolveSyncConflict,
  resumeSyncJob,
  retryFailedSyncJob,
} from './server/sync.ts';
import { createIntegrationRouter, isProvider, parseTokenOptions, requireIntegrationManager } from './server/integrationRoutes.ts';
import { receiveWebhook } from './server/webhooks.ts';
import { startHealthMonitor } from './server/health.ts';
import { startScmScheduler } from './server/scm.ts';
import { resolveCredential } from './server/tokens.ts';
import { asyncHandler, csrfGuard, purgeExpiredSessions, requireAuth } from './server/auth.ts';
import type { AuthenticatedRequest } from './server/auth.ts';
import { apiErrorHandler, apiRateLimit, baseMiddleware, createDataRouter } from './server/apiRoutes.ts';
import { migrateP1Data, migrateP2Data, seedIfEmpty } from './server/seed.ts';
import { startJobWorker } from './server/jobs.ts';
import './server/notify.ts';
import './server/automation.ts';
import { badRequest, notFound } from './server/errors.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

function registerApiRoutes(app: express.Express) {
  // Inbound webhooks are authenticated by signature, so they get the raw body and skip session / CSRF checks.
  app.post('/api/webhooks/:id', baseMiddleware, apiRateLimit(), express.raw({ type: () => true, limit: '5mb' }), receiveWebhook);

  app.use(express.json({ limit: '15mb' }));

  // Authentication, sessions, data API and audit log live in server/apiRoutes.ts
  app.use('/api', baseMiddleware, apiRateLimit(), csrfGuard);
  app.use('/api', createDataRouter());
  app.use('/api', createIntegrationRouter());

  const summaryOf = (orgId: string, provider: 'github' | 'gitlab') => {
    const conn = integrationStore.getConnection(orgId, provider);
    return conn ? integrationStore.summarizeConnection(conn) : null;
  };

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
        github: summaryOf(orgId, 'github'),
        gitlab: summaryOf(orgId, 'gitlab'),
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
    requireIntegrationManager,
    (req: AuthenticatedRequest, res: Response) => {
      const provider = req.params.provider;
      if (!isProvider(provider)) {
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

  app.post('/api/integrations/configs', requireAuth, requireIntegrationManager, (req: AuthenticatedRequest, res: Response) => {
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
      bidirectional?: boolean;
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
      bidirectional: typeof body.bidirectional === 'boolean' ? body.bidirectional : undefined,
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
    requireIntegrationManager,
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

  app.post('/api/integrations/jobs', requireAuth, requireIntegrationManager, (req: AuthenticatedRequest, res: Response) => {
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
      statusMap?: Record<string, string>;
      bidirectional?: boolean;
    };

    if (!body.provider || !body.destinationModule) {
      res.status(400).json({ error: 'provider and destinationModule are required to queue a job.' });
      return;
    }
    if (body.provider !== 'jira' && body.provider !== 'confluence') {
      res.status(400).json({ error: 'Background sync is available for Jira and Confluence. Import Excel files with "Execute import".' });
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
      // records are always read from the source by the server (never taken from the browser)
      pendingPayload: {
        sourceScopes: body.sourceScopes,
        jqlOrCql: body.jqlOrCql,
        statusMap: body.statusMap,
        bidirectional: body.bidirectional === true,
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

  app.post('/api/integrations/jobs/:id/pause', requireAuth, requireIntegrationManager, (req: AuthenticatedRequest, res: Response) => {
    const job = pauseSyncJob(req.authUser!.organizationId, req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }
    res.json({ job: integrationStore.getJob(req.authUser!.organizationId, job.id) });
  });

  app.post('/api/integrations/jobs/:id/resume', requireAuth, requireIntegrationManager, (req: AuthenticatedRequest, res: Response) => {
    const job = resumeSyncJob(req.authUser!.organizationId, req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }
    res.json({ job: integrationStore.getJob(req.authUser!.organizationId, job.id) });
  });

  app.post('/api/integrations/jobs/:id/cancel', requireAuth, requireIntegrationManager, (req: AuthenticatedRequest, res: Response) => {
    const job = cancelSyncJob(req.authUser!.organizationId, req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }
    res.json({ job: integrationStore.getJob(req.authUser!.organizationId, job.id) });
  });

  app.post('/api/integrations/jobs/:id/retry', requireAuth, requireIntegrationManager, (req: AuthenticatedRequest, res: Response) => {
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

  app.post('/api/integrations/external-links/record', requireAuth, requireIntegrationManager, (req: AuthenticatedRequest, res: Response) => {
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

  app.post(
    '/api/integrations/conflicts/:id/resolve',
    requireAuth,
    requireIntegrationManager,
    asyncHandler<AuthenticatedRequest>(async (req, res) => {
      const user = req.authUser!;
      const orgId = user.organizationId;
      const { resolution, mergedFields } = (req.body || {}) as {
        resolution?: 'resolved_source' | 'resolved_destination' | 'resolved_merged' | 'dismissed';
        mergedFields?: Record<string, 'source' | 'destination'>;
      };
      if (!resolution || !['resolved_source', 'resolved_destination', 'resolved_merged', 'dismissed'].includes(resolution)) {
        throw badRequest('A valid resolution is required.');
      }
      const result = await resolveSyncConflict(
        orgId,
        req.params.id,
        resolution,
        { userId: user.userId, orgId, email: user.email, role: user.role },
        mergedFields
      );
      integrationStore.appendAuditLog({
        organizationId: orgId,
        actorUserId: user.userId,
        actorRole: user.role,
        provider: result.conflict.provider,
        action: 'resolve_conflict',
        resourceType: 'integration_conflict',
        resourceId: result.conflict.id,
        status: result.notes.length ? 'warning' : 'success',
        summary: `Resolved conflict for ${result.conflict.externalKey} using ${resolution}. ${result.notes.join(' ')}`.trim().slice(0, 500),
      });
      res.json(result);
    })
  );

  // Audit Log Query
  app.get('/api/integrations/audit', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined;
    res.json({ logs: integrationStore.listAuditLogs(req.authUser!.organizationId, provider) });
  });

  // ======================== JIRA REAL INTEGRATION ========================
  app.post('/api/integrations/jira/connect', requireAuth, requireIntegrationManager, async (req: AuthenticatedRequest, res: Response) => {
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
      const tokenOptions = await parseTokenOptions(req.body || {});
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
        ...tokenOptions,
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

  app.post('/api/integrations/jira/discover', requireAuth, requireIntegrationManager, async (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.authUser!.organizationId;
    const conn = integrationStore.getConnection(orgId, 'jira');
    if (!conn) {
      res.status(404).json({ error: 'No active Jira connection found. Please authenticate first.' });
      return;
    }

    const cred = await resolveCredential(conn).catch(() => null);
    if (!cred) {
      res.status(401).json({ code: 'NEEDS_REAUTH', error: 'The stored Jira credential needs re-authentication.' });
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
        conn: cred.conn,
        secret: cred.secret,
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
    requireIntegrationManager,
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
          ...(await parseTokenOptions(req.body || {})),
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
    requireIntegrationManager,
    async (req: AuthenticatedRequest, res: Response) => {
      const orgId = req.authUser!.organizationId;
      const conn = integrationStore.getConnection(orgId, 'confluence');
      if (!conn) {
        res.status(404).json({ error: 'No active Confluence connection found. Please authenticate first.' });
        return;
      }

      const cred = await resolveCredential(conn).catch(() => null);
      if (!cred) {
        res.status(401).json({ code: 'NEEDS_REAUTH', error: 'The stored Confluence credential needs re-authentication.' });
        return;
      }

      const { spaceKeys = [], maxResults = 150, updatedSince } = (req.body || {}) as {
        spaceKeys?: string[];
        maxResults?: number;
        updatedSince?: string;
      };

      try {
        const discovered = await discoverConfluenceData({
          conn: cred.conn,
          secret: cred.secret,
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
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);

  // Create the demo workspace on first start (no-op afterwards) before accepting traffic.
  await seedIfEmpty();
  await migrateP1Data();
  migrateP2Data();
  const legacy = integrationStore.importLegacyJsonStore();
  if (legacy.imported) console.log('Imported the previous integration file store into SQLite:', legacy.counts);
  startJobWorker();
  purgeExpiredSessions();
  setInterval(purgeExpiredSessions, 60 * 60 * 1000).unref();

  registerApiRoutes(app);
  app.use('/api', (_req, _res, next) => next(notFound('API endpoint not found.')));
  app.use('/api', apiErrorHandler);

  // Recover any interrupted background sync jobs and start the schedulers
  recoverInterruptedJobsAndStartScheduler();
  startHealthMonitor();
  startScmScheduler();

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
