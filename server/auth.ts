import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';
import { forbidden, tooMany, unauthorized, HttpError } from './errors.ts';
import type { Role } from './schemas.ts';

const scryptAsync = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions
) => Promise<Buffer>;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

export const SESSION_COOKIE = 'jf_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours sliding window
const SESSION_ABSOLUTE_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  try {
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await scryptAsync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Used to equalize response time when the account does not exist.
let dummyHashPromise: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(crypto.randomBytes(12).toString('hex'));
  return dummyHashPromise;
}

export function passwordPolicyError(password: unknown): string | null {
  if (typeof password !== 'string') return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  if (password.length > 200) return 'Password is too long.';
  if (!/[A-Za-z؀-ۿ]/.test(password) || !/\d/.test(password)) {
    return 'Password must contain at least one letter and one digit.';
  }
  return null;
}

export function generateTemporaryPassword(): string {
  // 12 chars, guaranteed to contain letters + digits.
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (set: string) => set[crypto.randomInt(set.length)];
  const chars = [pick(digits), pick(digits), pick(letters), pick(letters)];
  while (chars.length < 12) chars.push(pick(letters + digits));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

export interface SessionUser {
  userId: string;
  organizationId: string;
  email: string;
  role: Role;
  sessionId: string;
}

export function createSession(userId: string, orgId: string, ip?: string, userAgent?: string): { token: string; expiresAt: number } {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  db.prepare(
    'INSERT INTO sessions (id, user_id, org_id, created_at, expires_at, last_seen_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(sha256(token), userId, orgId, now, expiresAt, now, ip ?? null, (userAgent ?? '').slice(0, 300));
  return { token, expiresAt };
}

export function resolveSession(token: string): (SessionUser & { expiresAt: number }) | null {
  const row = db
    .prepare(
      `SELECT s.id AS sid, s.org_id, s.expires_at, s.created_at, s.last_seen_at, s.revoked,
              u.id AS uid, u.email, u.role, u.status
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ?`
    )
    .get(sha256(token)) as
    | {
        sid: string;
        org_id: string;
        expires_at: number;
        created_at: number;
        last_seen_at: number;
        revoked: number;
        uid: string;
        email: string;
        role: Role;
        status: string;
      }
    | undefined;
  if (!row) return null;
  const now = Date.now();
  if (row.revoked || row.expires_at < now || row.status !== 'active') return null;
  if (now - row.created_at > SESSION_ABSOLUTE_MAX_MS) return null;

  let expiresAt = row.expires_at;
  // Sliding expiration: refresh at most once per minute.
  if (now - row.last_seen_at > 60_000) {
    expiresAt = Math.min(now + SESSION_TTL_MS, row.created_at + SESSION_ABSOLUTE_MAX_MS);
    db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?').run(now, expiresAt, row.sid);
  }
  return {
    userId: row.uid,
    organizationId: row.org_id,
    email: row.email,
    role: row.role,
    sessionId: row.sid,
    expiresAt,
  };
}

export function revokeSessionByToken(token: string): void {
  db.prepare('UPDATE sessions SET revoked = 1 WHERE id = ?').run(sha256(token));
}

export function revokeUserSessions(userId: string, exceptSessionId?: string): void {
  if (exceptSessionId) {
    db.prepare('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND id != ?').run(userId, exceptSessionId);
  } else {
    db.prepare('UPDATE sessions SET revoked = 1 WHERE user_id = ?').run(userId);
  }
}

export function purgeExpiredSessions(): void {
  db.prepare('DELETE FROM sessions WHERE expires_at < ? OR revoked = 1').run(Date.now() - 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Cookies
// ---------------------------------------------------------------------------

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(value);
      } catch {
        out[key] = value;
      }
    }
  }
  return out;
}

function isSecureRequest(req: Request): boolean {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  return req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
}

export function setSessionCookie(req: Request, res: Response, token: string, expiresAt: number): void {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (isSecureRequest(req)) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const attrs = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isSecureRequest(req)) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

// ---------------------------------------------------------------------------
// Login throttling
// ---------------------------------------------------------------------------

const ipAttempts = new Map<string, { count: number; resetAt: number }>();

export function checkIpRateLimit(ip: string, max = 30, windowMs = 15 * 60 * 1000): void {
  const now = Date.now();
  const entry = ipAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    ipAttempts.set(ip, { count: 1, resetAt: now + windowMs });
    return;
  }
  entry.count += 1;
  if (entry.count > max) {
    throw tooMany('Too many login attempts from this address. Please try again later.');
  }
}

export function resetIpRateLimit(ip: string): void {
  ipAttempts.delete(ip);
}

export function registerFailedLogin(userId: string): { locked: boolean } {
  const row = db.prepare('SELECT failed_logins FROM users WHERE id = ?').get(userId) as
    | { failed_logins: number }
    | undefined;
  const failed = (row?.failed_logins || 0) + 1;
  if (failed >= MAX_FAILED_LOGINS) {
    db.prepare('UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?').run(Date.now() + LOCK_MS, userId);
    return { locked: true };
  }
  db.prepare('UPDATE users SET failed_logins = ? WHERE id = ?').run(failed, userId);
  return { locked: false };
}

export function clearFailedLogins(userId: string): void {
  db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(userId);
}

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------

export interface AuthenticatedRequest extends Request {
  authUser?: SessionUser;
  sessionToken?: string;
  requestId?: string;
}

export function clientIp(req: Request): string {
  return (req.ip || req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
}

export function requireAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) {
    next(unauthorized('Authentication required. Please sign in.'));
    return;
  }
  const session = resolveSession(token);
  if (!session) {
    next(unauthorized('Your session has expired. Please sign in again.', 'INVALID_SESSION'));
    return;
  }
  req.authUser = session;
  req.sessionToken = token;
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    const role = req.authUser?.role;
    if (!role || !roles.includes(role)) {
      next(forbidden(`This operation requires one of the following roles: ${roles.join(', ')}.`));
      return;
    }
    next();
  };
}

/** Requires an Admin or Product Owner (used by existing integration endpoints). */
export const requireAdminOrOwner = requireRole('admin', 'product_owner');

/**
 * CSRF defence in depth on top of SameSite=Lax cookies: state-changing requests must carry a custom
 * header that cross-site HTML forms cannot send, and any Origin header must match the host.
 */
export function csrfGuard(req: Request, _res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  if (req.headers['x-jf-client'] !== 'web') {
    next(forbidden('Missing X-JF-Client header.'));
    return;
  }
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) {
        next(forbidden('Cross-origin request rejected.'));
        return;
      }
    } catch {
      next(forbidden('Invalid Origin header.'));
      return;
    }
  }
  next();
}

export function asyncHandler<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown> | unknown
) {
  return (req: T, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export { HttpError };
