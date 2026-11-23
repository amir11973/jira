import dns from 'node:dns';
import net from 'node:net';

export type AuthMethod = 'api_token' | 'pat' | 'basic' | 'oauth_bearer';

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
    'User-Agent': 'JiraFlow-Integration-Engine/2.0',
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

export interface ExternalFetchResult {
  ok: boolean;
  status: number;
  data: unknown;
  text: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseRetryAfterMs(headerVal: string | null, attempt: number): number {
  if (headerVal) {
    const seconds = Number(headerVal);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(10000, Math.round(seconds * 1000));
    }
    const dt = Date.parse(headerVal);
    if (!Number.isNaN(dt)) {
      const diff = dt - Date.now();
      if (diff > 0) return Math.min(10000, diff);
    }
  }
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(8000, 600 * Math.pow(2, attempt) + jitter);
}

export async function safeExternalFetch(
  baseUrl: string,
  endpointPath: string,
  headers: Record<string, string>,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
  maxRedirects = 2
): Promise<ExternalFetchResult> {
  const safeBase = await assertSafeExternalUrl(baseUrl);
  const cleanBase = `${safeBase.origin}${safeBase.pathname.replace(/\/+$/, '')}`;
  const normalizedPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  let currentUrl = `${cleanBase}${normalizedPath}`;
  let redirects = 0;

  for (let attempt = 0; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);

    try {
      const reqHeaders: Record<string, string> = { ...headers };
      let payload: string | undefined;
      if (body !== undefined && method === 'POST') {
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

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location || redirects >= maxRedirects) {
          return { ok: false, status: res.status, data: null, text: 'Too many redirects' };
        }
        const resolved = new URL(location, currentUrl);
        await assertSafeExternalUrl(resolved.toString());
        currentUrl = resolved.toString();
        redirects += 1;
        attempt -= 1;
        continue;
      }

      if ((res.status === 429 || res.status === 503) && attempt < 2) {
        const delayMs = parseRetryAfterMs(res.headers.get('retry-after'), attempt);
        await sleep(delayMs);
        continue;
      }

      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }

      return {
        ok: res.ok,
        status: res.status,
        data: parsed,
        text,
      };
    } catch (err) {
      if (attempt < 2) {
        await sleep(450 * (attempt + 1));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, status: 503, data: null, text: 'External request exhausted retries' };
}
