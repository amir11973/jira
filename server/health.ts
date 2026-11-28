import { db } from './db.ts';
import { enqueueJob, registerJobHandler } from './jobs.ts';
import { getRateState, RateLimitedError, safeExternalFetch } from './httpClient.ts';
import type { ExternalFetchResult } from './httpClient.ts';
import { integrationStore } from './store.ts';
import type { HealthStatus, ProviderKind, StoredConnectionRecord } from './store.ts';
import { refreshConnectionToken, resolveCredential, TokenRefreshError, tokenNeedsRefresh } from './tokens.ts';
import { listUsers } from './repo.ts';
import { notifyUser } from './notify.ts';
import { writeAudit } from './audit.ts';

export interface HealthResult {
  status: HealthStatus;
  message: string;
  latencyMs: number;
  httpStatus?: number;
  tokenExpiresInMs?: number | null;
  refreshed?: boolean;
  rateLimit?: { limit?: number; remaining?: number; resetAt?: string | null };
}

/** Light authenticated request per provider (the cheapest "who am I" call). */
const PROBE_PATHS: Record<ProviderKind, string[]> = {
  jira: ['/rest/api/3/myself', '/rest/api/2/myself'],
  confluence: ['/wiki/rest/api/user/current', '/rest/api/user/current'],
  github: ['/user'],
  gitlab: ['/user'],
};

export const WARN_TOKEN_EXPIRY_MS = 3 * 24 * 3600 * 1000;

async function probe(conn: StoredConnectionRecord, headers: Record<string, string>): Promise<ExternalFetchResult> {
  let res: ExternalFetchResult | null = null;
  for (const p of PROBE_PATHS[conn.provider]) {
    res = await safeExternalFetch(conn.serverUrl, p, headers, 'GET', undefined, 2, { maxRetries: 2, timeoutMs: 12000 });
    if (res.status !== 404) break;
  }
  return res as ExternalFetchResult;
}

/** Checks reachability, authentication, token lifetime and rate limit headroom of one connection. */
export async function checkConnectionHealth(connIn: StoredConnectionRecord): Promise<HealthResult> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  let conn = integrationStore.getConnectionById(connIn.organizationId, connIn.id) || connIn;
  let refreshed = false;

  const rate = () => {
    try {
      const st = getRateState(new URL(conn.serverUrl).origin);
      if (!st) return undefined;
      return { limit: st.limit, remaining: st.remaining, resetAt: st.resetAtMs ? new Date(st.resetAtMs).toISOString() : null };
    } catch {
      return undefined;
    }
  };

  // 1. credential decrypts + token refresh when expiring
  const dec = integrationStore.getDecryptedSecret(conn);
  if (!dec.ok) {
    return { status: 'needs_reauth', message: 'Stored credential cannot be decrypted. Please re-authenticate.', latencyMs: elapsed() };
  }
  if (tokenNeedsRefresh(conn)) {
    try {
      conn = await refreshConnectionToken(conn);
      refreshed = true;
    } catch (err) {
      const permanent = err instanceof TokenRefreshError && err.permanent;
      const exp = conn.tokenExpiresAt ? Date.parse(conn.tokenExpiresAt) : Infinity;
      if (permanent || exp <= Date.now()) {
        return {
          status: 'needs_reauth',
          message: `Access token could not be refreshed: ${err instanceof Error ? err.message : 'unknown error'}`,
          latencyMs: elapsed(),
          tokenExpiresInMs: Number.isFinite(exp) ? exp - Date.now() : null,
        };
      }
    }
  }

  // 2. live request
  let cred;
  try {
    cred = await resolveCredential(conn);
  } catch (err) {
    return { status: 'needs_reauth', message: err instanceof Error ? err.message : 'Credential unavailable.', latencyMs: elapsed() };
  }
  let res: ExternalFetchResult;
  try {
    res = await probe(conn, cred.headers);
    if ((res.status === 401 || res.status === 403) && conn.encryptedRefreshToken && conn.oauth && !refreshed) {
      // Token rejected before its recorded expiry (revoked / clock skew): refresh once and probe again.
      conn = await refreshConnectionToken(conn);
      refreshed = true;
      cred = await resolveCredential(conn);
      res = await probe(conn, cred.headers);
    }
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return {
        status: 'degraded',
        message: `Rate limited by the provider until ${new Date(err.retryAtMs).toISOString()}.`,
        latencyMs: elapsed(),
        rateLimit: rate(),
      };
    }
    if (err instanceof TokenRefreshError) {
      return { status: err.permanent ? 'needs_reauth' : 'degraded', message: err.message, latencyMs: elapsed() };
    }
    return {
      status: 'unreachable',
      message: `Host did not respond: ${err instanceof Error ? err.message : 'network error'}`.slice(0, 250),
      latencyMs: elapsed(),
    };
  }

  const exp = conn.tokenExpiresAt ? Date.parse(conn.tokenExpiresAt) : NaN;
  const tokenExpiresInMs = Number.isFinite(exp) ? exp - Date.now() : null;
  const common = { latencyMs: elapsed(), httpStatus: res.status, tokenExpiresInMs, refreshed, rateLimit: rate() };

  if (res.status === 401 || res.status === 403) {
    return { status: 'needs_reauth', message: `Credentials were rejected (HTTP ${res.status}).`, ...common };
  }
  if (!res.ok) {
    return { status: 'degraded', message: `Provider returned HTTP ${res.status}.`, ...common };
  }

  // 3. healthy, but warn about things that will break soon
  const warnings: string[] = [];
  if (tokenExpiresInMs !== null && tokenExpiresInMs < WARN_TOKEN_EXPIRY_MS && !(conn.encryptedRefreshToken && conn.oauth)) {
    warnings.push(`Access token expires ${new Date(exp).toISOString()} and cannot be refreshed automatically.`);
  }
  const rl = common.rateLimit;
  if (rl?.remaining !== undefined && rl.limit && rl.remaining / rl.limit < 0.1) {
    warnings.push(`Only ${rl.remaining} of ${rl.limit} API calls left in the current window.`);
  }
  if (res.retries && res.retries > 0) warnings.push(`Needed ${res.retries} retr${res.retries === 1 ? 'y' : 'ies'} to get a response.`);

  if (warnings.length > 0) return { status: 'degraded', message: warnings.join(' '), ...common };
  return { status: 'healthy', message: refreshed ? 'Authenticated (access token was refreshed).' : 'Reachable and authenticated.', ...common };
}

function adminIds(orgId: string): string[] {
  return listUsers(orgId)
    .map(u => u.record as { id?: string; role?: string; status?: string })
    .filter(u => u.id && (u.role === 'admin' || u.role === 'product_owner') && (u.status || 'active') === 'active')
    .map(u => String(u.id));
}

/** Audits a status change and tells the administrators, wherever the change was noticed. */
integrationStore.onHealthChange((previous, conn) => {
  const status = conn.healthStatus;
  const message = conn.healthMessage || status;
  integrationStore.appendAuditLog({
    organizationId: conn.organizationId,
    actorUserId: 'system',
    actorRole: 'system',
    provider: conn.provider,
    action: 'health_status_changed',
    resourceType: 'integration_connection',
    resourceId: conn.id,
    status: status === 'healthy' ? 'success' : 'warning',
    summary: `${conn.provider} connection ${previous} -> ${status}: ${message}`.slice(0, 400),
  });
  if (status !== 'healthy') {
    writeAudit({
      orgId: conn.organizationId,
      actorId: 'system',
      actorRole: 'system',
      action: 'integrations.health',
      status: 'failed',
      summary: `${conn.provider} health: ${status} - ${message}`.slice(0, 300),
    });
  }
  const title =
    status === 'healthy'
      ? `${conn.provider.toUpperCase()} integration recovered`
      : `${conn.provider.toUpperCase()} integration needs attention (${status.replace('_', ' ')})`;
  const stamp = Date.now();
  // after the current (possibly transactional) work: notifications are written through the normal data layer
  setImmediate(() => {
    for (const uid of adminIds(conn.organizationId)) {
      notifyUser(conn.organizationId, uid, {
        id: `ntf-health-${conn.id}-${stamp}-${uid}`.slice(0, 120),
        kind: 'system',
        title,
        message,
      }).catch(err => console.error('[health] could not notify admin:', err));
    }
  });
});

/** Runs a check, stores the result + history and alerts admins when the status changes. */
export async function runHealthCheck(connIn: StoredConnectionRecord): Promise<{ connection: StoredConnectionRecord; result: HealthResult }> {
  const before = integrationStore.getConnectionById(connIn.organizationId, connIn.id) || connIn;
  const result = await checkConnectionHealth(before);
  const updated = integrationStore.updateConnectionHealthById(before, result.status, result.message);
  if (result.rateLimit && (result.rateLimit.remaining !== undefined || result.rateLimit.limit !== undefined)) {
    integrationStore.updateConnectionRateLimit(updated.id, updated.organizationId, result.rateLimit);
  }
  integrationStore.appendHealthCheck(updated.organizationId, updated.id, {
    status: result.status,
    latencyMs: result.latencyMs,
    message: result.message,
    detail: { httpStatus: result.httpStatus, refreshed: result.refreshed, tokenExpiresInMs: result.tokenExpiresInMs, rateLimit: result.rateLimit },
  });

  return { connection: updated, result };
}

registerJobHandler('integration.health', async job => {
  const { connectionId } = job.payload as { connectionId?: string };
  if (!connectionId) return;
  const conn = integrationStore.getConnectionById(job.orgId, connectionId);
  if (!conn) return;
  await runHealthCheck(conn);
});

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

let timer: ReturnType<typeof setInterval> | null = null;

function intervalMs(): number {
  return Math.max(1000, Number(process.env.INTEGRATION_HEALTH_INTERVAL_MS || 5 * 60_000));
}

/** Queues a health check for every connection that is due (failing connections are probed less often). */
export function scheduleDueHealthChecks(now = Date.now()): number {
  const base = intervalMs();
  let queued = 0;
  for (const conn of integrationStore.listAllConnections()) {
    const last = conn.lastHealthCheckAt ? Date.parse(conn.lastHealthCheckAt) : 0;
    const backoff = Math.min(6, 1 + (conn.consecutiveFailures || 0));
    if (now - last < base * backoff) continue;
    const id = enqueueJob(conn.organizationId, 'integration.health', { connectionId: conn.id }, {
      maxAttempts: 2,
      dedupeKey: `health-${conn.id}-${Math.floor(now / base)}`,
    });
    if (id !== null) queued += 1;
  }
  return queued;
}

export function startHealthMonitor(): void {
  if (timer) return;
  timer = setInterval(() => {
    try {
      scheduleDueHealthChecks();
      // keep the table of finished health jobs from growing forever
      db.prepare("DELETE FROM jobs WHERE type = 'integration.health' AND status = 'done' AND finished_at < ?").run(
        new Date(Date.now() - 24 * 3600_000).toISOString()
      );
    } catch (err) {
      console.error('[health] scheduler failed:', err);
    }
  }, Math.min(intervalMs(), 60_000));
  timer.unref?.();
}

export function stopHealthMonitor(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
