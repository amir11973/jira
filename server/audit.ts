import { db } from './db.ts';

export interface AuditEntryInput {
  orgId: string;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  collection?: string | null;
  entityId?: string | null;
  status?: 'success' | 'denied' | 'failed';
  summary: string;
  changes?: unknown;
  ip?: string | null;
  requestId?: string | null;
}

const SENSITIVE = /(password|secret|token|authorization|api_?key|credential|cookie)/i;

function scrub(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 300 ? `${value.slice(0, 297)}...` : value;
  if (typeof value !== 'object') return value;
  if (depth > 3) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map(v => scrub(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE.test(k) ? '[REDACTED]' : scrub(v, depth + 1);
  }
  return out;
}

const insertStmt = () =>
  db.prepare(
    `INSERT INTO audit_log
      (ts, org_id, actor_id, actor_email, actor_role, action, collection, entity_id, status, summary, changes, ip, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

export function writeAudit(entry: AuditEntryInput): void {
  try {
    insertStmt().run(
      new Date().toISOString(),
      entry.orgId,
      entry.actorId ?? null,
      entry.actorEmail ?? null,
      entry.actorRole ?? null,
      entry.action,
      entry.collection ?? null,
      entry.entityId ?? null,
      entry.status ?? 'success',
      entry.summary.slice(0, 500),
      entry.changes === undefined ? null : JSON.stringify(scrub(entry.changes)),
      entry.ip ?? null,
      entry.requestId ?? null
    );
  } catch (err) {
    // Audit failures must never take the request down, but they must be visible.
    console.error('[audit] failed to write audit entry:', err);
  }
}

export interface AuditRow {
  id: number;
  ts: string;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  collection: string | null;
  entityId: string | null;
  status: string;
  summary: string;
  changes: unknown;
  ip: string | null;
  requestId: string | null;
}

export function queryAudit(
  orgId: string,
  filter: { collection?: string; entityId?: string; actorId?: string; action?: string; before?: number; limit?: number }
): AuditRow[] {
  const where = ['org_id = ?'];
  const params: Array<string | number> = [orgId];
  if (filter.collection) {
    where.push('collection = ?');
    params.push(filter.collection);
  }
  if (filter.entityId) {
    where.push('entity_id = ?');
    params.push(filter.entityId);
  }
  if (filter.actorId) {
    where.push('actor_id = ?');
    params.push(filter.actorId);
  }
  if (filter.action) {
    where.push('action = ?');
    params.push(filter.action);
  }
  if (filter.before) {
    where.push('id < ?');
    params.push(filter.before);
  }
  const limit = Math.min(Math.max(filter.limit || 100, 1), 500);
  const rows = db
    .prepare(`SELECT * FROM audit_log WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ${limit}`)
    .all(...params) as Array<Record<string, unknown>>;
  return rows.map(r => ({
    id: r.id as number,
    ts: r.ts as string,
    actorId: (r.actor_id as string) ?? null,
    actorEmail: (r.actor_email as string) ?? null,
    actorRole: (r.actor_role as string) ?? null,
    action: r.action as string,
    collection: (r.collection as string) ?? null,
    entityId: (r.entity_id as string) ?? null,
    status: r.status as string,
    summary: r.summary as string,
    changes: r.changes ? JSON.parse(r.changes as string) : null,
    ip: (r.ip as string) ?? null,
    requestId: (r.request_id as string) ?? null,
  }));
}
