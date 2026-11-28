import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Key used to encrypt integration credentials at rest (AES-256-GCM).
 * Order: INTEGRATION_ENCRYPTION_KEY env var -> persistent key file next to the database (created on first use,
 * owner-only permissions) -> process-lifetime random key (only when the data directory is not writable, e.g.
 * ":memory:" databases in tests; credentials then need re-entering after a restart).
 */
let cachedKey: Buffer | null = null;

function keyFilePath(): string | null {
  if (process.env.INTEGRATION_KEY_FILE) return path.resolve(process.env.INTEGRATION_KEY_FILE);
  const dbPath = process.env.JIRAFLOW_DB_PATH;
  if (dbPath === ':memory:') return null;
  const dir = dbPath ? path.dirname(path.resolve(dbPath)) : path.resolve(process.cwd(), '.data');
  return path.join(dir, 'integration.key');
}

function getCipherKey(): Buffer {
  if (cachedKey) return cachedKey;
  const configured = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
  if (configured && configured.length >= 8) {
    cachedKey = crypto.createHash('sha256').update(configured, 'utf8').digest();
    return cachedKey;
  }
  const file = keyFilePath();
  if (file) {
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf8').trim();
        if (raw.length >= 32) {
          cachedKey = crypto.createHash('sha256').update(raw, 'utf8').digest();
          return cachedKey;
        }
      }
      const fresh = crypto.randomBytes(48).toString('base64url');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, fresh, { encoding: 'utf8', mode: 0o600 });
      cachedKey = crypto.createHash('sha256').update(fresh, 'utf8').digest();
      return cachedKey;
    } catch (err) {
      console.warn('[cryptoVault] could not persist the credential key, using an ephemeral key:', (err as Error).message);
    }
  }
  cachedKey = crypto.randomBytes(32);
  return cachedKey;
}

export interface DecryptedSecretResult {
  ok: boolean;
  value?: string;
  needsReauth?: boolean;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const key = getCipherKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${authTag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSecret(ciphertext: string): DecryptedSecretResult {
  if (!ciphertext || typeof ciphertext !== 'string') {
    return { ok: false, needsReauth: true };
  }
  const parts = ciphertext.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    return { ok: false, needsReauth: true };
  }
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const authTag = Buffer.from(parts[2], 'base64url');
    const encrypted = Buffer.from(parts[3], 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getCipherKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return { ok: true, value: decrypted.toString('utf8') };
  } catch {
    return { ok: false, needsReauth: true };
  }
}

export function computeSyncHash(payload: unknown): string {
  const normalized = stableStringify(payload ?? {});
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 24);
}

/** JSON.stringify with sorted keys so equal objects always hash equally. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(obj)
      .filter(k => obj[k] !== undefined)
      .sort()
      .map(k => JSON.stringify(k) + ':' + stableStringify(obj[k]))
      .join(',') +
    '}'
  );
}

const SENSITIVE_KEY_PATTERN = /(secret|token|password|authorization|apikey|api_key|credential|cookie)/i;

export function scrubSensitiveMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = scrubSensitiveMetadata(v);
    } else if (typeof v === 'string' && v.length > 500) {
      out[k] = `${v.slice(0, 497)}...`;
    } else {
      out[k] = v;
    }
  }
  return out;
}
