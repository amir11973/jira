import crypto from 'node:crypto';

const EPHEMERAL_KEY = crypto.randomBytes(32);

function getCipherKey(): Buffer {
  const configured = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
  if (configured && configured.length >= 8) {
    return crypto.createHash('sha256').update(configured, 'utf8').digest();
  }
  return EPHEMERAL_KEY;
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
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
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
    const key = getCipherKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return { ok: true, value: decrypted.toString('utf8') };
  } catch {
    return { ok: false, needsReauth: true };
  }
}

export function computeSyncHash(payload: unknown): string {
  const normalized = JSON.stringify(payload ?? {});
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 24);
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
