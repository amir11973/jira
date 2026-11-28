import dns from 'node:dns';
import net from 'node:net';

export type AuthMethod = 'api_token' | 'pat' | 'basic' | 'oauth_bearer';

/** Development / test escape hatch: allow integrations to talk to localhost and private networks. */
function allowPrivateHosts(): boolean {
  return process.env.INTEGRATIONS_ALLOW_PRIVATE_HOSTS === 'true';
}

export function isPrivateOrBlockedIp(ip: string): boolean {
  const cleaned = ip.trim().toLowerCase();
  if (!cleaned) return true;

  if (cleaned.startsWith('::ffff:')) {
    return isPrivateOrBlockedIp(cleaned.slice(7));
  }

  if (net.isIPv4(cleaned)) {
    const octets = cleaned.split('.').map(Number);
    if (octets.length !== 4 || octets.some(n => Number.isNaN(n))) return true;
    const [a, b] = octets;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  if (net.isIPv6(cleaned)) {
    if (cleaned === '::' || cleaned === '::1') return true;
    if (
      cleaned.startsWith('fe80:') ||
      cleaned.startsWith('fe8') ||
      cleaned.startsWith('fe9') ||
      cleaned.startsWith('fea') ||
      cleaned.startsWith('feb')
    ) {
      return true;
    }
    if (cleaned.startsWith('fc') || cleaned.startsWith('fd')) {
      return true;
    }
    if (cleaned.startsWith('ff')) return true;
    return false;
  }

  return true;
}

export async function assertSafeExternalUrl(rawUrl: string): Promise<URL> {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    throw new Error('Server URL is required.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid server URL format. Include https:// or http://.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only HTTP and HTTPS protocols are permitted.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('Credentials must not be embedded in the server URL.');
  }

  if (allowPrivateHosts()) return parsed;

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal' ||
    host === '169.254.169.254'
  ) {
    throw new Error('Connections to local or internal network addresses are blocked.');
  }

  if (net.isIP(host)) {
    if (isPrivateOrBlockedIp(host)) {
      throw new Error('Connections to private or loopback IP addresses are blocked.');
    }
    return parsed;
  }

  try {
    const records = await dns.promises.lookup(host, { all: true });
    if (!records.length) {
      throw new Error(`Unable to resolve host: ${host}`);
    }
    for (const r of records) {
      if (isPrivateOrBlockedIp(r.address)) {
        throw new Error('Target domain resolves to a restricted private or loopback IP address.');
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('restricted')) {
      throw err;
    }
    throw new Error(`Host resolution failed for "${host}". Verify the server URL.`);
  }

  return parsed;
}

export function buildAuthHeaders(
  authMethod: AuthMethod,
  secret: string,
  email?: string,
  username?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'JiraFlow-Integration-Engine/3.0',
  };

  if (authMethod === 'api_token') {
    const creds = Buffer.from(`${email || ''}:${secret}`, 'utf8').toString('base64');
    headers.Authorization = `Basic ${creds}`;
  } else if (authMethod === 'basic') {
    const creds = Buffer.from(`${username || email || ''}:${secret}`, 'utf8').toString('base64');
    headers.Authorization = `Basic ${creds}`;
  } else {
    headers.Authorization = `Bearer ${secret}`;
  }

  return headers;
}

export interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  /** Epoch ms when the window resets / the request may be retried. */
  resetAtMs?: number;
}

export interface ExternalFetchResult {
  ok: boolean;
  status: number;
  data: unknown;
  text: string;
  headers?: Record<string, string>;
  rateLimit?: RateLimitInfo;
  /** How many retries were needed (0 = first attempt succeeded). */
  retries?: number;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Thrown when the remote API told us to back off for longer than we are willing to wait inline. */
export class RateLimitedError extends Error {
  retryAtMs: number;
  constructor(message: string, retryAtMs: number) {
    super(message);
    this.name = 'RateLimitedError';
    this.retryAtMs = retryAtMs;
  }
}

/** Thrown by integration code when a request is rejected with 401/403 so callers can refresh the credential. */
export class AuthRejectedError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = 'AuthRejectedError';
    this.status = status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Rate limit bookkeeping (per origin: one API host shares one budget)
// ---------------------------------------------------------------------------

const rateState = new Map<string, RateLimitInfo & { updatedAtMs: number }>();
const MAX_INLINE_WAIT_MS = Number(process.env.INTEGRATION_MAX_INLINE_WAIT_MS || 8000);

export function getRateState(origin: string): (RateLimitInfo & { updatedAtMs: number }) | undefined {
  return rateState.get(origin);
}

export function resetRateStateForTests(): void {
  rateState.clear();
}

function num(v: string | null | undefined): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseRateHeaders(h: Headers): RateLimitInfo | undefined {
  const limit = num(h.get('x-ratelimit-limit')) ?? num(h.get('ratelimit-limit'));
  const remaining = num(h.get('x-ratelimit-remaining')) ?? num(h.get('ratelimit-remaining'));
  let resetAtMs: number | undefined;
  const reset = num(h.get('x-ratelimit-reset')) ?? num(h.get('ratelimit-reset'));
  if (reset !== undefined) {
    // GitHub/GitLab send epoch seconds; some servers send "seconds until reset".
    resetAtMs = reset > 1e9 ? reset * 1000 : Date.now() + reset * 1000;
  }
  const retryAfter = h.get('retry-after');
  if (retryAfter) {
    const secs = num(retryAfter);
    if (secs !== undefined) resetAtMs = Date.now() + secs * 1000;
    else {
      const dt = Date.parse(retryAfter);
      if (!Number.isNaN(dt)) resetAtMs = dt;
    }
  }
  if (limit === undefined && remaining === undefined && resetAtMs === undefined) return undefined;
  return { limit, remaining, resetAtMs };
}

/** Waits for (or fails fast on) an exhausted rate-limit window before sending another request. */
async function respectRateLimit(origin: string): Promise<void> {
  const st = rateState.get(origin);
  if (!st || st.remaining === undefined || st.remaining > 0 || !st.resetAtMs) return;
  const wait = st.resetAtMs - Date.now();
  if (wait <= 0) {
    rateState.delete(origin);
    return;
  }
  if (wait > MAX_INLINE_WAIT_MS) {
    throw new RateLimitedError(`Rate limit exhausted for ${origin}; retry after ${new Date(st.resetAtMs).toISOString()}.`, st.resetAtMs);
  }
  await sleep(wait + 25);
  rateState.delete(origin);
}

function backoffMs(attempt: number, suggested?: number): number {
  const jitter = Math.floor(Math.random() * 250);
  const exp = Math.min(8000, 400 * 2 ** attempt + jitter);
  return suggested !== undefined ? Math.min(MAX_INLINE_WAIT_MS, Math.max(suggested, 50)) : exp;
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export interface FetchOptions {
  maxRetries?: number;
  timeoutMs?: number;
}

/**
 * SSRF-guarded JSON HTTP client with:
 *  - exponential backoff + jitter for 429/502/503/504 and network errors (honouring Retry-After)
 *  - rate limit tracking from X-RateLimit-* / Retry-After headers; an exhausted budget makes the next call wait
 *    (short) or throw RateLimitedError (long) instead of hammering the API
 *  - safe, validated redirects
 */
export async function safeExternalFetch(
  baseUrl: string,
  endpointPath: string,
  headers: Record<string, string>,
  method: HttpMethod = 'GET',
  body?: unknown,
  maxRedirects = 2,
  opts: FetchOptions = {}
): Promise<ExternalFetchResult> {
  const safeBase = await assertSafeExternalUrl(baseUrl);
  const cleanBase = `${safeBase.origin}${safeBase.pathname.replace(/\/+$/, '')}`;
  const normalizedPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  const origin = safeBase.origin;
  let currentUrl = `${cleanBase}${normalizedPath}`;
  let redirects = 0;
  const maxRetries = opts.maxRetries ?? 3;
  let retries = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await respectRateLimit(origin);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 18000);

    try {
      const reqHeaders: Record<string, string> = { ...headers };
      let payload: string | undefined;
      if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
        reqHeaders['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
      }

      const res = await fetch(currentUrl, {
        method,
        headers: reqHeaders,
        body: payload,
        redirect: 'manual',
        signal: controller.signal,
      });

      const rl = parseRateHeaders(res.headers);
      if (rl) rateState.set(origin, { ...rl, updatedAtMs: Date.now() });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location || redirects >= maxRedirects) {
          return { ok: false, status: res.status, data: null, text: 'Too many redirects', retries };
        }
        const resolved = new URL(location, currentUrl);
        await assertSafeExternalUrl(resolved.toString());
        currentUrl = resolved.toString();
        redirects += 1;
        attempt -= 1;
        continue;
      }

      // GitHub signals primary/secondary limits with 403 + remaining=0 or Retry-After.
      const limited = res.status === 429 || (res.status === 403 && (rl?.remaining === 0 || res.headers.get('retry-after') !== null));
      if ((limited || RETRYABLE_STATUS.has(res.status)) && attempt < maxRetries) {
        const wait = rl?.resetAtMs !== undefined ? rl.resetAtMs - Date.now() : undefined;
        if (limited && wait !== undefined && wait > MAX_INLINE_WAIT_MS) {
          throw new RateLimitedError(`Rate limited by ${origin}; retry after ${new Date(rl!.resetAtMs!).toISOString()}.`, rl!.resetAtMs!);
        }
        await res.text().catch(() => '');
        await sleep(backoffMs(attempt, limited ? wait : undefined));
        retries += 1;
        continue;
      }
      if (limited && rl?.resetAtMs && rl.resetAtMs - Date.now() > 0) {
        throw new RateLimitedError(`Rate limited by ${origin}; retry after ${new Date(rl.resetAtMs).toISOString()}.`, rl.resetAtMs);
      }

      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }

      const outHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        outHeaders[k] = v;
      });

      return { ok: res.ok, status: res.status, data: parsed, text, headers: outHeaders, rateLimit: rl, retries };
    } catch (err) {
      if (err instanceof RateLimitedError) throw err;
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        retries += 1;
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, status: 503, data: null, text: 'External request exhausted retries', retries };
}
