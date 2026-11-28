import { assertSafeExternalUrl, AuthRejectedError, buildAuthHeaders } from './httpClient.ts';
import { integrationStore } from './store.ts';
import type { StoredConnectionRecord } from './store.ts';

/** Refresh when the access token expires within this window. */
const REFRESH_SKEW_MS = 2 * 60_000;

export class TokenRefreshError extends Error {
  permanent: boolean;
  constructor(message: string, permanent: boolean) {
    super(message);
    this.name = 'TokenRefreshError';
    this.permanent = permanent;
  }
}

const inflight = new Map<string, Promise<StoredConnectionRecord>>();

export function tokenNeedsRefresh(conn: StoredConnectionRecord, now = Date.now()): boolean {
  if (!conn.tokenExpiresAt || !conn.encryptedRefreshToken || !conn.oauth) return false;
  const exp = Date.parse(conn.tokenExpiresAt);
  return Number.isFinite(exp) && exp - now <= REFRESH_SKEW_MS;
}

async function requestNewToken(conn: StoredConnectionRecord): Promise<{ accessToken: string; refreshToken?: string; expiresAt: string | null }> {
  const oauth = conn.oauth;
  const refreshToken = integrationStore.getDecryptedRefreshToken(conn);
  if (!oauth || !refreshToken) throw new TokenRefreshError('No refresh token is stored for this connection.', true);
  await assertSafeExternalUrl(oauth.tokenUrl);

  const fields: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: oauth.clientId,
  };
  const clientSecret = integrationStore.getDecryptedClientSecret(conn);
  if (clientSecret) fields.client_secret = clientSecret;

  // Atlassian expects JSON; GitHub / GitLab / generic servers expect form encoding.
  const asJson = /atlassian\.com$/i.test(new URL(oauth.tokenUrl).hostname);
  let lastErr = 'Token endpoint did not respond.';
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(oauth.tokenUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': asJson ? 'application/json' : 'application/x-www-form-urlencoded',
          'User-Agent': 'JiraFlow-Integration-Engine/3.0',
        },
        body: asJson ? JSON.stringify(fields) : new URLSearchParams(fields).toString(),
        redirect: 'error',
        signal: controller.signal,
      });
      const text = await res.text();
      let body: Record<string, unknown> = {};
      try {
        body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        /* non JSON error page */
      }
      if (res.ok && typeof body.access_token === 'string' && body.access_token) {
        const expiresIn = Number(body.expires_in);
        return {
          accessToken: body.access_token,
          refreshToken: typeof body.refresh_token === 'string' && body.refresh_token ? body.refresh_token : undefined,
          expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
        };
      }
      const code = String(body.error || '');
      lastErr = `Token endpoint returned HTTP ${res.status}${code ? ` (${code})` : ''}.`;
      // 4xx other than 429 = the grant is no good (revoked / expired refresh token / wrong client): do not retry.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new TokenRefreshError(lastErr, true);
      }
    } catch (err) {
      if (err instanceof TokenRefreshError) throw err;
      lastErr = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timer);
    }
    await new Promise(r => setTimeout(r, 400 * 2 ** attempt));
  }
  throw new TokenRefreshError(lastErr, false);
}

/**
 * Exchanges the stored refresh token for a new access token and persists it (rotating the refresh token when
 * the provider issues a new one). Concurrent callers share a single request so a rotating refresh token is
 * never spent twice.
 */
export function refreshConnectionToken(conn: StoredConnectionRecord): Promise<StoredConnectionRecord> {
  const existing = inflight.get(conn.id);
  if (existing) return existing;
  const p = (async () => {
    try {
      const token = await requestNewToken(conn);
      return integrationStore.storeRefreshedToken(conn, token);
    } catch (err) {
      if (err instanceof TokenRefreshError) integrationStore.recordRefreshFailure(conn, err.message, err.permanent);
      throw err;
    } finally {
      inflight.delete(conn.id);
    }
  })();
  inflight.set(conn.id, p);
  return p;
}

export interface ResolvedCredential {
  conn: StoredConnectionRecord;
  secret: string;
  headers: Record<string, string>;
}

function toResolved(conn: StoredConnectionRecord): ResolvedCredential {
  const dec = integrationStore.getDecryptedSecret(conn);
  if (!dec.ok || !dec.secret) throw new AuthRejectedError('Stored credential requires re-authentication.', 401);
  return { conn, secret: dec.secret, headers: buildAuthHeaders(conn.authMethod, dec.secret, conn.email, conn.username) };
}

/** Returns a usable credential, refreshing an expiring OAuth token first. */
export async function resolveCredential(conn: StoredConnectionRecord): Promise<ResolvedCredential> {
  let current = integrationStore.getConnectionById(conn.organizationId, conn.id) || conn;
  if (tokenNeedsRefresh(current)) {
    try {
      current = await refreshConnectionToken(current);
    } catch (err) {
      // An expired token that could not be refreshed cannot work; a token that is merely close to expiry still can.
      const exp = current.tokenExpiresAt ? Date.parse(current.tokenExpiresAt) : Infinity;
      if (exp <= Date.now()) throw new AuthRejectedError(err instanceof Error ? err.message : 'Access token expired.', 401);
    }
  }
  return toResolved(current);
}

/**
 * Runs `fn` with a valid credential. If the provider rejects it (AuthRejectedError, i.e. 401), the token is
 * refreshed once and `fn` is retried; a second rejection propagates and the connection is flagged for re-auth.
 */
export async function withCredential<T>(
  orgId: string,
  connectionId: string,
  fn: (cred: ResolvedCredential) => Promise<T>
): Promise<T> {
  const conn = integrationStore.getConnectionById(orgId, connectionId);
  if (!conn) throw new Error('Integration connection not found.');
  let cred = await resolveCredential(conn);
  try {
    return await fn(cred);
  } catch (err) {
    if (!(err instanceof AuthRejectedError)) throw err;
    const fresh = integrationStore.getConnectionById(orgId, connectionId) || conn;
    if (fresh.encryptedRefreshToken && fresh.oauth) {
      try {
        cred = toResolved(await refreshConnectionToken(fresh));
        return await fn(cred);
      } catch (err2) {
        if (!(err2 instanceof AuthRejectedError) && !(err2 instanceof TokenRefreshError)) throw err2;
      }
    }
    integrationStore.updateConnectionHealthById(fresh, 'needs_reauth', 'The provider rejected the stored credential.');
    throw err;
  }
}
