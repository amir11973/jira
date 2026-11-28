/** P3 endpoints: source control, webhooks, connection health / tokens, synced links. */
import express from 'express';
import type { Response } from 'express';
import { asyncHandler, requireAuth, requireRole } from './auth.ts';
import type { AuthenticatedRequest } from './auth.ts';
import { badRequest, HttpError, notFound } from './errors.ts';
import { assertSafeExternalUrl } from './httpClient.ts';
import type { AuthMethod } from './httpClient.ts';
import { integrationStore } from './store.ts';
import type { ProviderKind, StoredConnectionRecord } from './store.ts';
import { refreshConnectionToken, TokenRefreshError } from './tokens.ts';
import { runHealthCheck } from './health.ts';
import {
  connectScm,
  deliveryMetrics,
  getRepository,
  listRepositories,
  listScmItems,
  queueRepositorySync,
  repoConnectionProblem,
  vulnerabilitySummary,
} from './scm.ts';
import {
  createEndpoint,
  deleteEndpoint,
  getEvent,
  listEndpoints,
  listEvents,
  replayEvent,
  rotateEndpointSecret,
  setEndpointEnabled,
} from './webhooks.ts';
import { syncLink } from './sync.ts';

export const PROVIDERS: ProviderKind[] = ['jira', 'confluence', 'github', 'gitlab'];
export const isProvider = (v: unknown): v is ProviderKind => PROVIDERS.includes(v as ProviderKind);

/** Integration settings, credentials and anything that writes data with system rights. */
export const requireIntegrationManager = requireRole('admin', 'product_owner');
/** Security alerts and webhook payloads are for the people who build and run the software. */
const requireBuilder = requireRole('admin', 'product_owner', 'developer', 'qa');

export interface TokenOptions {
  refreshToken?: string;
  tokenExpiresAt?: string | null;
  oauth?: { tokenUrl: string; clientId: string; clientSecret?: string; scope?: string };
}

/** Optional OAuth 2.0 fields accepted by every "connect" endpoint. */
export async function parseTokenOptions(body: Record<string, unknown>): Promise<TokenOptions> {
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const out: TokenOptions = {};
  const expiresIn = Number(body.expiresIn);
  if (Number.isFinite(expiresIn) && expiresIn > 0) out.tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  else if (text(body.tokenExpiresAt)) {
    const t = Date.parse(String(body.tokenExpiresAt));
    if (Number.isNaN(t)) throw badRequest('tokenExpiresAt must be a date.');
    out.tokenExpiresAt = new Date(t).toISOString();
  }
  const refreshToken = text(body.refreshToken);
  const oauth = (body.oauth || {}) as Record<string, unknown>;
  const tokenUrl = text(oauth.tokenUrl);
  const clientId = text(oauth.clientId);
  if (refreshToken || tokenUrl || clientId) {
    if (!refreshToken || !tokenUrl || !clientId) {
      throw badRequest('Automatic token refresh needs a refresh token, the token URL and the OAuth client id together.');
    }
    try {
      await assertSafeExternalUrl(tokenUrl);
    } catch (err) {
      throw badRequest(`Token URL: ${(err as Error).message}`);
    }
    out.refreshToken = refreshToken;
    out.oauth = { tokenUrl, clientId, clientSecret: text(oauth.clientSecret), scope: text(oauth.scope) };
  }
  return out;
}

const audit = (
  req: AuthenticatedRequest,
  provider: ProviderKind,
  action: string,
  summary: string,
  resourceId?: string,
  status: 'success' | 'warning' | 'failed' = 'success'
) =>
  integrationStore.appendAuditLog({
    organizationId: req.authUser!.organizationId,
    actorUserId: req.authUser!.userId,
    actorRole: req.authUser!.role,
    provider,
    action,
    resourceType: 'integration',
    resourceId,
    status,
    summary,
  });

function connectionOf(req: AuthenticatedRequest): StoredConnectionRecord {
  const provider = req.params.provider;
  if (!isProvider(provider)) throw badRequest('Invalid provider.');
  const conn = integrationStore.getConnection(req.authUser!.organizationId, provider);
  if (!conn) throw notFound(`No ${provider} connection found.`);
  return conn;
}

export function createIntegrationRouter(): express.Router {
  const router = express.Router();
  const org = (req: AuthenticatedRequest) => req.authUser!.organizationId;

  // ------------------------------------------------------------ connections, health, tokens
  router.get('/integrations/connections', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({ connections: integrationStore.listConnections(org(req)).map(c => integrationStore.summarizeConnection(c)) });
  });

  router.post(
    '/integrations/scm/connect',
    requireAuth,
    requireIntegrationManager,
    asyncHandler<AuthenticatedRequest>(async (req, res) => {
      const body = (req.body || {}) as Record<string, unknown>;
      const provider = body.provider;
      if (provider !== 'github' && provider !== 'gitlab') throw badRequest('provider must be "github" or "gitlab".');
      const token = typeof body.token === 'string' ? body.token.trim() : '';
      if (!token) throw badRequest('An access token is required.');
      const apiUrl = (typeof body.apiUrl === 'string' && body.apiUrl.trim()) || (provider === 'github' ? 'https://api.github.com' : 'https://gitlab.com');
      const options = await parseTokenOptions(body);
      // OAuth access tokens and GitLab OAuth use "Bearer"; personal access tokens do too
      const authMethod: AuthMethod = options.oauth ? 'oauth_bearer' : 'pat';
      let result;
      try {
        await assertSafeExternalUrl(apiUrl);
        result = await connectScm(provider, apiUrl, token, authMethod as 'pat' | 'oauth_bearer');
      } catch (err) {
        throw badRequest((err as Error).message);
      }
      if (!result.ok) {
        res.status(result.status === 401 ? 400 : result.status).json({ error: result.error });
        return;
      }
      const conn = integrationStore.upsertConnection({
        organizationId: org(req),
        userId: req.authUser!.userId,
        provider,
        serverUrl: apiUrl,
        authMethod,
        plainSecret: token,
        ...options,
        account: result.account,
        projectsOrSpaces: result.projectsOrSpaces,
      });
      audit(req, provider, 'connect_provider', `Connected ${provider} (${conn.serverUrl}) as ${result.account.displayName}.`, conn.id);
      // start pulling data for the repositories that belong to this account
      const queued = listRepositories(org(req))
        .filter(r => r.enabled && r.provider === provider && !repoConnectionProblem(r, conn))
        .filter(r => queueRepositorySync(org(req), r.id) !== null).length;
      res.json({ connection: integrationStore.summarizeConnection(conn), queuedRepositories: queued });
    })
  );

  router.post(
    '/integrations/:provider/refresh-token',
    requireAuth,
    requireIntegrationManager,
    asyncHandler<AuthenticatedRequest>(async (req, res) => {
      const conn = connectionOf(req);
      if (!conn.encryptedRefreshToken || !conn.oauth) throw badRequest('This connection has no refresh token (API tokens do not expire this way).');
      try {
        const fresh = await refreshConnectionToken(conn);
        audit(req, conn.provider, 'refresh_token', 'Access token refreshed.', conn.id);
        res.json({ connection: integrationStore.summarizeConnection(fresh) });
      } catch (err) {
        if (!(err instanceof TokenRefreshError)) throw err;
        audit(req, conn.provider, 'refresh_token', err.message, conn.id, 'failed');
        throw new HttpError(502, 'TOKEN_REFRESH_FAILED', err.message);
      }
    })
  );

  router.post(
    '/integrations/:provider/health',
    requireAuth,
    asyncHandler<AuthenticatedRequest>(async (req, res) => {
      const conn = connectionOf(req);
      const { connection, result } = await runHealthCheck(conn);
      audit(req, conn.provider, 'health_check', result.message, conn.id, result.status === 'healthy' ? 'success' : 'warning');
      res.json({ connection: integrationStore.summarizeConnection(connection), result });
    })
  );

  router.get('/integrations/:provider/health-history', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const conn = connectionOf(req);
    const checks = integrationStore.listHealthChecks(org(req), conn.id, Number(req.query.limit) || 50);
    const ok = checks.filter(c => c.status === 'healthy').length;
    res.json({ checks, healthyPercent: checks.length ? Math.round((ok / checks.length) * 100) : null });
  });

  // ------------------------------------------------------------ source control
  router.get('/scm/repositories', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const orgId = org(req);
    const vulns = vulnerabilitySummary(orgId);
    res.json({
      repositories: listRepositories(orgId).map(r => {
        const conn = r.provider === 'github' || r.provider === 'gitlab' ? integrationStore.getConnection(orgId, r.provider) : undefined;
        return {
          id: r.id,
          name: r.name,
          provider: r.provider,
          baseUrl: r.baseUrl,
          enabled: r.enabled,
          syncProblem: repoConnectionProblem(r, conn),
          sync: integrationStore.getRepoSyncState(r.id) || null,
          openVulnerabilities: vulns.byRepo[r.id] || 0,
        };
      }),
    });
  });

  router.post('/scm/repositories/:id/sync', requireAuth, requireBuilder, (req: AuthenticatedRequest, res: Response) => {
    const repo = getRepository(org(req), req.params.id);
    if (!repo) throw notFound('Repository not found.');
    const conn = repo.provider === 'github' || repo.provider === 'gitlab' ? integrationStore.getConnection(org(req), repo.provider) : undefined;
    const problem = repoConnectionProblem(repo, conn);
    if (problem) throw new HttpError(409, 'CONFLICT', problem);
    const jobId = queueRepositorySync(org(req), repo.id);
    res.status(202).json({ ok: true, jobId });
  });

  const liveItems = (orgId: string, filter: Parameters<typeof listScmItems>[1]) => {
    // data of repositories that were disconnected is not shown
    const repos = new Map(listRepositories(orgId).map(r => [r.id, r.name]));
    return listScmItems(orgId, filter)
      .filter(i => repos.has(i.repoId))
      .map(i => ({ ...i, repo: repos.get(i.repoId) }));
  };

  router.get('/scm/items', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const q = req.query;
    const one = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
    const kind = one(q.kind);
    const seesAlerts = req.authUser!.role !== 'designer';
    if (kind === 'vulnerability' && !seesAlerts) throw new HttpError(403, 'FORBIDDEN', 'Security alerts are not available to your role.');
    const items = liveItems(org(req), { kind, repoId: one(q.repoId), state: one(q.state), issueKey: one(q.issueKey), limit: Number(q.limit) || 100 });
    res.json({ items: seesAlerts ? items : items.filter(i => i.kind !== 'vulnerability') });
  });

  router.get('/scm/metrics', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : '';
    if (!projectId) throw badRequest('projectId is required.');
    const metrics = deliveryMetrics(org(req), projectId);
    // same rule as the item list: designers do not get security alerts
    res.json(req.authUser!.role === 'designer' ? { ...metrics, vulnerabilities: null } : metrics);
  });

  router.get('/scm/vulnerabilities/summary', requireAuth, requireBuilder, (req: AuthenticatedRequest, res: Response) => {
    res.json(vulnerabilitySummary(org(req)));
  });

  // ------------------------------------------------------------ webhooks
  router.get('/integrations/webhooks', requireAuth, requireIntegrationManager, (req: AuthenticatedRequest, res: Response) => {
    res.json({ webhooks: listEndpoints(org(req)) });
  });

  router.post('/integrations/webhooks', requireAuth, requireIntegrationManager, (req: AuthenticatedRequest, res: Response) => {
    const { provider, name, repoId } = (req.body || {}) as { provider?: unknown; name?: string; repoId?: string };
    if (!isProvider(provider)) throw badRequest(`provider must be one of ${PROVIDERS.join(', ')}.`);
    if (!name || !name.trim()) throw badRequest('A name is required.');
    if (repoId) {
      const repo = getRepository(org(req), repoId);
      if (!repo || repo.provider !== provider) throw badRequest('The repository does not exist or belongs to another provider.');
    }
    const created = createEndpoint(org(req), { provider, name: name.trim(), repoId, createdBy: req.authUser!.userId });
    audit(req, provider, 'create_webhook', `Created webhook endpoint "${created.endpoint.name}".`, created.endpoint.id);
    res.status(201).json(created);
  });

  router.patch('/integrations/webhooks/:id', requireAuth, requireIntegrationManager, (req: AuthenticatedRequest, res: Response) => {
    if (typeof req.body?.enabled !== 'boolean') throw badRequest('enabled must be true or false.');
    if (!setEndpointEnabled(org(req), req.params.id, req.body.enabled)) throw notFound('Webhook not found.');
    res.json({ ok: true });
  });

  router.post('/integrations/webhooks/:id/rotate', requireAuth, requireIntegrationManager, (req: AuthenticatedRequest, res: Response) => {
    const secret = rotateEndpointSecret(org(req), req.params.id);
    if (!secret) throw notFound('Webhook not found.');
    res.json({ secret });
  });

  router.delete('/integrations/webhooks/:id', requireAuth, requireIntegrationManager, (req: AuthenticatedRequest, res: Response) => {
    if (!deleteEndpoint(org(req), req.params.id)) throw notFound('Webhook not found.');
    res.json({ ok: true });
  });

  router.get('/integrations/events', requireAuth, requireIntegrationManager, (req: AuthenticatedRequest, res: Response) => {
    const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
    res.json({ events: listEvents(org(req), { status, limit: Number(req.query.limit) || 50 }) });
  });

  router.get('/integrations/events/:id', requireAuth, requireIntegrationManager, (req: AuthenticatedRequest, res: Response) => {
    const event = getEvent(org(req), Number(req.params.id));
    if (!event) throw notFound('Event not found.');
    res.json({ event });
  });

  router.post('/integrations/events/:id/replay', requireAuth, requireIntegrationManager, (req: AuthenticatedRequest, res: Response) => {
    if (!replayEvent(org(req), Number(req.params.id))) throw new HttpError(409, 'CONFLICT', 'The event does not exist or is still being processed.');
    res.status(202).json({ ok: true });
  });

  // ------------------------------------------------------------ synced links
  router.post(
    '/integrations/external-links/:id/sync',
    requireAuth,
    requireIntegrationManager,
    asyncHandler<AuthenticatedRequest>(async (req, res) => {
      if (!integrationStore.getExternalLink(org(req), req.params.id)) throw notFound('Link not found.');
      try {
        const outcome = await syncLink(org(req), req.params.id, 'manual');
        res.json({ outcome, link: integrationStore.getExternalLink(org(req), req.params.id) });
      } catch (err) {
        throw new HttpError(502, 'SYNC_FAILED', (err as Error).message);
      }
    })
  );

  router.patch('/integrations/external-links/:id', requireAuth, requireIntegrationManager, (req: AuthenticatedRequest, res: Response) => {
    const { bidirectional, conflictPolicy } = (req.body || {}) as { bidirectional?: unknown; conflictPolicy?: unknown };
    const patch: Record<string, unknown> = {};
    if (typeof bidirectional === 'boolean') patch.bidirectional = bidirectional;
    if (conflictPolicy === 'source_wins' || conflictPolicy === 'destination_wins' || conflictPolicy === 'manual_review') patch.conflictPolicy = conflictPolicy;
    if (Object.keys(patch).length === 0) throw badRequest('Nothing to change.');
    const link = integrationStore.patchExternalLink(org(req), req.params.id, patch);
    if (!link) throw notFound('Link not found.');
    res.json({ link });
  });

  return router;
}
