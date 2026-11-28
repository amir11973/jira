/**
 * Thin fetch wrapper for the JiraFlow backend.
 *  - authentication is a HttpOnly session cookie (never readable from JS)
 *  - every mutating request carries X-JF-Client (CSRF defence in depth)
 *  - failures are normalised into ApiError so callers can show meaningful messages
 */
export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  requestId?: string;

  constructor(status: number, code: string, message: string, details?: unknown, requestId?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
  get isTransient(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

type UnauthorizedListener = () => void;
let unauthorizedListener: UnauthorizedListener | null = null;

export function onUnauthorized(listener: UnauthorizedListener | null): void {
  unauthorizedListener = listener;
}

export function withClientHeaders(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers || {});
  headers.set('X-JF-Client', 'web');
  return { ...init, headers, credentials: 'same-origin' };
}

/** Same signature as fetch(); used by the Integration Center and anything that needs the raw Response. */
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, withClientHeaders(init));
  } catch (err) {
    throw new ApiError(0, 'NETWORK_ERROR', err instanceof Error ? err.message : 'Network request failed.');
  }
  if (res.status === 401 && unauthorizedListener && !url.startsWith('/api/auth/')) {
    unauthorizedListener();
  }
  return res;
}

export async function apiRequest<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!res.ok) {
    const p = (payload || {}) as { error?: string; code?: string; details?: unknown; requestId?: string };
    throw new ApiError(
      res.status,
      p.code || `HTTP_${res.status}`,
      p.error || `Request failed with status ${res.status}.`,
      p.details,
      p.requestId
    );
  }
  return payload as T;
}

export const api = {
  get: <T>(url: string) => apiRequest<T>('GET', url),
  post: <T>(url: string, body?: unknown) => apiRequest<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => apiRequest<T>('PUT', url, body ?? {}),
  del: <T>(url: string) => apiRequest<T>('DELETE', url),
};

/** Human friendly message including field level validation details when present. */
export function describeApiError(err: unknown): string {
  if (err instanceof ApiError) {
    const details = err.details;
    if (Array.isArray(details) && details.length > 0) {
      const first = details
        .slice(0, 3)
        .map(d => {
          const item = d as { path?: string; message?: string };
          return item.path && item.message ? `${item.path} ${item.message}` : item.message || '';
        })
        .filter(Boolean)
        .join('; ');
      if (first) return `${err.message} (${first})`;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'Unexpected error.';
}
