import crypto from 'node:crypto';
import type { StatementSync } from 'node:sqlite';
import { db, transaction } from './db.ts';
import { writeAudit } from './audit.ts';
import { generateTemporaryPassword, hashPassword, passwordPolicyError, revokeUserSessions } from './auth.ts';
import { HttpError, conflict, forbidden, validationFailed } from './errors.ts';
import { authorize, changedKeys } from './permissions.ts';
import type { Actor, Operation } from './permissions.ts';
import {
  ALL_COLLECTIONS,
  RECORD_COLLECTIONS,
  RECORD_SCHEMAS,
  USER_PROFILE_SCHEMA,
  isCollection,
} from './schemas.ts';
import type { AnyCollection, CollectionName, Role } from './schemas.ts';
import { ID_PATTERN, validate } from './validation.ts';
import { VisibilityContext, canEditDashboard, canRead } from './visibility.ts';
import { validateChangedDevLinks } from './devlinks.ts';
import { deleteStoredFiles } from './files.ts';
import { emitIssueEvents } from './events.ts';
import { recordIssueDeleted, recordIssueHistory, recordSprintHistory } from './history.ts';
import {
  stampPlanning,
  validateGoalPlanning,
  validateIssueVersions,
  validateMilestonePlanning,
  validateVersionPlanning,
} from './planning.ts';
import type { PlanningProblem } from './planning.ts';
import type { FieldIssue } from './validation.ts';

type Rec = Record<string, unknown>;

export interface BatchOp {
  collection: string;
  op: 'upsert' | 'delete';
  id: string;
  data?: unknown;
  baseVersion?: number;
}

export interface BatchMeta {
  ip?: string | null;
  requestId?: string | null;
  /** System operations (seeding, migrations) skip permission checks and per-record audit. */
  system?: boolean;
  /** Record per-record audit entries even for system operations (automation). */
  audit?: boolean;
  /** Do not enqueue notification/automation jobs for these writes (prevents loops). */
  suppressEvents?: boolean;
  /** Seeding only: skip report history; it is reconstructed afterwards (history.ts backfillHistory). */
  skipHistory?: boolean;
}

export interface OpResult {
  collection: string;
  id: string;
  version: number;
  deleted?: boolean;
  /** Present only when the server modified the record (e.g. renumbered an issue key). */
  record?: Rec;
}

export interface IssuedCredential {
  userId: string;
  email: string;
  temporaryPassword: string;
}

export interface BatchResult {
  results: OpResult[];
  seq: number;
  issuedCredentials: IssuedCredential[];
}

const COLLECTION_ORDER: AnyCollection[] = [...ALL_COLLECTIONS];
const MAX_RECORD_BYTES = 1_000_000;
export const MAX_BATCH_OPS = 500;

// ---------------------------------------------------------------------------
// Prepared statement cache
// ---------------------------------------------------------------------------

const stmtCache = new Map<string, StatementSync>();
function q(sql: string): StatementSync {
  let stmt = stmtCache.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    stmtCache.set(sql, stmt);
  }
  return stmt;
}

const nowIso = () => new Date().toISOString();

/** JSON.stringify with sorted keys, used to detect no-op writes regardless of key order. */
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(obj)
      .filter(k => obj[k] !== undefined)
      .sort()
      .map(k => JSON.stringify(k) + ':' + stable(obj[k]))
      .join(',') +
    '}'
  );
}

function logChange(orgId: string, collection: string, id: string, op: string): void {
  q('INSERT INTO changes (collection, id, org_id, op, ts) VALUES (?, ?, ?, ?, ?)').run(collection, id, orgId, op, nowIso());
}

export function currentSeq(orgId: string): number {
  const row = q('SELECT COALESCE(MAX(seq), 0) AS seq FROM changes WHERE org_id = ?').get(orgId) as { seq: number };
  return row.seq;
}

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

interface RecordRow {
  collection: string;
  id: string;
  org_id: string;
  project_id: string | null;
  owner_id: string | null;
  data: string;
  version: number;
  deleted: number;
  created_at: string;
  updated_at: string;
}

function getRecordRow(orgId: string, collection: string, id: string): RecordRow | undefined {
  return q('SELECT * FROM records WHERE collection = ? AND id = ? AND org_id = ?').get(collection, id, orgId) as
    | RecordRow
    | undefined;
}

function recordExists(orgId: string, collection: string, id: string | null | undefined): boolean {
  if (!id) return false;
  if (collection === 'users') {
    return Boolean(q('SELECT 1 FROM users WHERE id = ? AND org_id = ?').get(id, orgId));
  }
  const row = q('SELECT deleted FROM records WHERE collection = ? AND id = ? AND org_id = ?').get(collection, id, orgId) as
    | { deleted: number }
    | undefined;
  return Boolean(row && !row.deleted);
}

function projectLeadOf(orgId: string, projectId: string | undefined | null): string | undefined {
  if (!projectId) return undefined;
  const row = getRecordRow(orgId, 'projects', projectId);
  if (!row || row.deleted) return undefined;
  return (JSON.parse(row.data) as Rec).leadId as string | undefined;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

interface UserRow {
  id: string;
  org_id: string;
  email: string;
  password_hash: string | null;
  role: Role;
  status: string;
  must_change_password: number;
  failed_logins: number;
  locked_until: number | null;
  profile: string;
  version: number;
  created_at: string;
  updated_at: string;
}

function userRowToRecord(row: UserRow): Rec {
  const profile = JSON.parse(row.profile) as Rec;
  return { ...profile, id: row.id, email: row.email, role: row.role, status: row.status };
}

export function listUsers(orgId: string): Array<{ record: Rec; version: number }> {
  const rows = q('SELECT * FROM users WHERE org_id = ? ORDER BY created_at, id').all(orgId) as unknown as UserRow[];
  return rows.map(r => ({ record: userRowToRecord(r), version: r.version }));
}

export function getUserRow(id: string): UserRow | undefined {
  return q('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function getUserByEmail(email: string): UserRow | undefined {
  return q('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email) as UserRow | undefined;
}

export function getPublicUser(id: string): Rec | null {
  const row = getUserRow(id);
  return row ? userRowToRecord(row) : null;
}

export function mustChangePassword(id: string): boolean {
  const row = getUserRow(id);
  return Boolean(row?.must_change_password);
}

function activeAdminCount(orgId: string, excludeUserId?: string): number {
  const row = q(
    "SELECT COUNT(*) AS c FROM users WHERE org_id = ? AND role = 'admin' AND status = 'active' AND id != ?"
  ).get(orgId, excludeUserId || '') as { c: number };
  return row.c;
}

// ---------------------------------------------------------------------------
// Issues (children live in dedicated tables)
// ---------------------------------------------------------------------------

interface CommentRow {
  id: string;
  issue_id: string;
  author_id: string;
  content: string;
  created_at: string;
}
interface WorklogRow {
  id: string;
  issue_id: string;
  author_id: string;
  time_spent_minutes: number;
  started_at: string;
  comment: string | null;
}
interface AttachmentRow {
  id: string;
  issue_id: string;
  name: string;
  size: string;
  mime_type: string;
  uploaded_by: string;
  uploaded_at: string;
  storage_key: string | null;
  size_bytes: number | null;
}

const commentOut = (r: CommentRow): Rec => ({
  id: r.id,
  authorId: r.author_id,
  content: r.content,
  createdAt: r.created_at,
});
const worklogOut = (r: WorklogRow): Rec => ({
  id: r.id,
  authorId: r.author_id,
  timeSpentMinutes: r.time_spent_minutes,
  startedAt: r.started_at,
  ...(r.comment ? { comment: r.comment } : {}),
});
const attachmentOut = (r: AttachmentRow): Rec => ({
  id: r.id,
  name: r.name,
  size: r.size,
  mimeType: r.mime_type,
  uploadedBy: r.uploaded_by,
  uploadedAt: r.uploaded_at,
  ...(r.storage_key ? { downloadUrl: `/api/attachments/${r.id}`, sizeBytes: r.size_bytes ?? 0 } : {}),
});

function groupBy<T extends { issue_id: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const list = map.get(r.issue_id);
    if (list) list.push(r);
    else map.set(r.issue_id, [r]);
  }
  return map;
}

function assembleIssues(orgId: string, rows: RecordRow[], onlyIssueId?: string): Array<{ record: Rec; version: number }> {
  const filterSql = onlyIssueId ? ' AND issue_id = ?' : '';
  const params: string[] = onlyIssueId ? [orgId, onlyIssueId] : [orgId];
  const comments = groupBy(
    q(`SELECT * FROM issue_comments WHERE org_id = ?${filterSql} ORDER BY created_at DESC, rowid DESC`).all(
      ...params
    ) as unknown as CommentRow[]
  );
  const worklogs = groupBy(
    q(`SELECT * FROM issue_worklogs WHERE org_id = ?${filterSql} ORDER BY started_at DESC, rowid DESC`).all(
      ...params
    ) as unknown as WorklogRow[]
  );
  const attachments = groupBy(
    q(`SELECT * FROM issue_attachments WHERE org_id = ?${filterSql} ORDER BY uploaded_at, rowid`).all(
      ...params
    ) as unknown as AttachmentRow[]
  );
  return rows.map(row => {
    const data = JSON.parse(row.data) as Rec;
    data.comments = (comments.get(row.id) || []).map(commentOut);
    data.worklogs = (worklogs.get(row.id) || []).map(worklogOut);
    data.attachments = (attachments.get(row.id) || []).map(attachmentOut);
    return { record: data, version: row.version };
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function listCollection(
  orgId: string,
  collection: AnyCollection,
  viewer?: Actor,
  vis?: VisibilityContext
): Array<{ record: Rec; version: number }> {
  const items = listCollectionRaw(orgId, collection);
  if (!viewer) return items;
  const v = vis || new VisibilityContext(orgId);
  return items.filter(i => canRead(viewer, collection, i.record, v));
}

function listCollectionRaw(orgId: string, collection: AnyCollection): Array<{ record: Rec; version: number }> {
  if (collection === 'users') return listUsers(orgId);
  const rows = q(
    'SELECT * FROM records WHERE collection = ? AND org_id = ? AND deleted = 0 ORDER BY created_at, rowid'
  ).all(collection, orgId) as unknown as RecordRow[];
  if (collection === 'issues') return assembleIssues(orgId, rows);
  return rows.map(r => ({ record: JSON.parse(r.data) as Rec, version: r.version }));
}

export function getRecord(
  orgId: string,
  collection: AnyCollection,
  id: string,
  viewer?: Actor
): { record: Rec; version: number } | null {
  const found = getRecordRaw(orgId, collection, id);
  if (!found || !viewer) return found;
  return canRead(viewer, collection, found.record, new VisibilityContext(orgId)) ? found : null;
}

function getRecordRaw(orgId: string, collection: AnyCollection, id: string): { record: Rec; version: number } | null {
  if (collection === 'users') {
    const row = getUserRow(id);
    return row && row.org_id === orgId ? { record: userRowToRecord(row), version: row.version } : null;
  }
  const row = getRecordRow(orgId, collection, id);
  if (!row || row.deleted) return null;
  if (collection === 'issues') return assembleIssues(orgId, [row], id)[0];
  return { record: JSON.parse(row.data) as Rec, version: row.version };
}

export function bootstrapData(orgId: string, viewer?: Actor): {
  collections: Record<string, Rec[]>;
  versions: Record<string, Record<string, number>>;
  seq: number;
} {
  return transaction(() => {
    const collections: Record<string, Rec[]> = {};
    const versions: Record<string, Record<string, number>> = {};
    const vis = new VisibilityContext(orgId);
    for (const name of ALL_COLLECTIONS) {
      const items = listCollection(orgId, name, viewer, vis);
      collections[name] = items.map(i => i.record);
      versions[name] = Object.fromEntries(items.map(i => [i.record.id as string, i.version]));
    }
    return { collections, versions, seq: currentSeq(orgId) };
  });
}

export interface ChangeEntry {
  collection: string;
  id: string;
  deleted: boolean;
  version?: number;
  record?: Rec;
}

export function changesSince(
  orgId: string,
  since: number,
  viewer?: Actor
): { seq: number; resync: boolean; changes: ChangeEntry[] } {
  const LIMIT = 1000;
  const rows = q(
    `SELECT collection, id, MAX(seq) AS seq FROM changes WHERE org_id = ? AND seq > ?
      GROUP BY collection, id ORDER BY seq LIMIT ${LIMIT + 1}`
  ).all(orgId, since) as unknown as Array<{ collection: string; id: string; seq: number }>;
  const seq = currentSeq(orgId);
  if (rows.length > LIMIT) return { seq, resync: true, changes: [] };
  const changes: ChangeEntry[] = rows.map(r => {
    if (!isCollection(r.collection)) return { collection: r.collection, id: r.id, deleted: true };
    const found = getRecord(orgId, r.collection, r.id, viewer);
    return found
      ? { collection: r.collection, id: r.id, deleted: false, version: found.version, record: found.record }
      : { collection: r.collection, id: r.id, deleted: true };
  });
  return { seq, resync: false, changes };
}

// ---------------------------------------------------------------------------
// Integrity checks
// ---------------------------------------------------------------------------

interface WriteContext {
  orgId: string;
  actor: Actor;
  system: boolean;
  meta: BatchMeta;
  serverModified: boolean;
  vis: VisibilityContext;
  filesToDelete: string[];
  newComments: Array<{ id: string; authorId: string }>;
}

function fail(path: string, message: string): never {
  throw validationFailed([{ path, message }]);
}

function failAll(problems: PlanningProblem[]): void {
  if (problems.length > 0) throw validationFailed(problems);
}

function requireRef(ctx: WriteContext, collection: AnyCollection, id: unknown, path: string): void {
  if (id === undefined || id === null || id === '') return;
  if (!recordExists(ctx.orgId, collection, String(id))) {
    fail(path, `references an unknown ${collection === 'projects' ? 'space' : collection.replace(/s$/, '')} "${String(id)}"`);
  }
}

function nextIssueKey(orgId: string, projectKey: string): string {
  const rows = q(
    "SELECT json_extract(data, '$.key') AS k FROM records WHERE collection = 'issues' AND org_id = ? AND json_extract(data, '$.key') LIKE ?"
  ).all(orgId, `${projectKey}-%`) as unknown as Array<{ k: string }>;
  let max = 100;
  for (const { k } of rows) {
    const n = Number(k.slice(projectKey.length + 1));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${projectKey}-${max + 1}`;
}

function statusTransitionAllowed(orgId: string, projectId: string, from: string, to: string): boolean {
  const rows = q(
    "SELECT data FROM records WHERE collection = 'workflows' AND org_id = ? AND deleted = 0 AND project_id = ?"
  ).all(orgId, projectId) as unknown as Array<{ data: string }>;
  if (rows.length === 0) return true; // no workflow configured => unrestricted
  return rows.some(r => {
    const wf = JSON.parse(r.data) as {
      statuses: Array<{ id: string }>;
      transitions: Array<{ fromStatusId: string; fromStatusIds?: string[]; toStatusId: string }>;
    };
    if (!wf.statuses.some(s => s.id === to)) return false;
    return wf.transitions.some(
      tr =>
        tr.toStatusId === to &&
        (tr.fromStatusId === 'any' ||
          tr.fromStatusId === from ||
          (tr.fromStatusIds || []).includes('any') ||
          (tr.fromStatusIds || []).includes(from))
    );
  });
}

function checkIntegrity(
  ctx: WriteContext,
  collection: CollectionName,
  data: Rec,
  existing: Rec | null
): void {
  const { orgId } = ctx;
  switch (collection) {
    case 'projects': {
      const dup = q(
        "SELECT id FROM records WHERE collection = 'projects' AND org_id = ? AND deleted = 0 AND id != ? AND UPPER(json_extract(data, '$.key')) = ?"
      ).get(orgId, data.id as string, String(data.key).toUpperCase());
      if (dup) fail('$.key', `Space key "${data.key}" is already in use.`);
      if (!existing || existing.leadId !== data.leadId) requireRef(ctx, 'users', data.leadId, '$.leadId');
      if (existing && existing.key !== data.key) {
        const issueCount = q(
          "SELECT COUNT(*) AS c FROM records WHERE collection = 'issues' AND org_id = ? AND deleted = 0 AND project_id = ?"
        ).get(orgId, data.id as string) as { c: number };
        if (issueCount.c > 0) fail('$.key', 'A space key cannot be changed once work items exist.');
      }
      break;
    }
    case 'workflows':
      if (data.projectId) requireRef(ctx, 'projects', data.projectId, '$.projectId');
      break;
    case 'epics':
    case 'risks':
      requireRef(ctx, 'projects', data.projectId, '$.projectId');
      break;
    case 'versions':
      requireRef(ctx, 'projects', data.projectId, '$.projectId');
      failAll(validateVersionPlanning(orgId, data));
      break;
    case 'milestones':
      requireRef(ctx, 'projects', data.projectId, '$.projectId');
      failAll(validateMilestonePlanning(orgId, data, existing));
      break;
    case 'goals':
      if (data.projectId) requireRef(ctx, 'projects', data.projectId, '$.projectId');
      failAll(validateGoalPlanning(orgId, data, existing));
      break;
    case 'sprints': {
      requireRef(ctx, 'projects', data.projectId, '$.projectId');
      if (data.status === 'active') {
        const other = q(
          "SELECT id FROM records WHERE collection = 'sprints' AND org_id = ? AND deleted = 0 AND project_id = ? AND id != ? AND json_extract(data, '$.status') = 'active'"
        ).get(orgId, data.projectId as string, data.id as string);
        if (other) fail('$.status', 'Another sprint is already active in this space.');
      }
      break;
    }
    case 'issues': {
      requireRef(ctx, 'projects', data.projectId, '$.projectId');
      if (!existing || existing.sprintId !== data.sprintId) {
        if (data.sprintId) {
          const sprint = getRecordRow(orgId, 'sprints', data.sprintId as string);
          if (!sprint || sprint.deleted) fail('$.sprintId', `references an unknown sprint "${data.sprintId}"`);
          else if (sprint.project_id !== data.projectId) fail('$.sprintId', 'The sprint belongs to a different space.');
        }
      }
      if (!existing || existing.epicId !== data.epicId) requireRef(ctx, 'epics', data.epicId, '$.epicId');
      if (!existing || existing.parentIssueId !== data.parentIssueId) {
        requireRef(ctx, 'issues', data.parentIssueId, '$.parentIssueId');
        if (data.parentIssueId === data.id) fail('$.parentIssueId', 'A work item cannot be its own parent.');
      }
      if (!existing || existing.assigneeId !== data.assigneeId) requireRef(ctx, 'users', data.assigneeId, '$.assigneeId');
      if (!existing) requireRef(ctx, 'users', data.reporterId, '$.reporterId');
      failAll(validateIssueVersions(orgId, data, existing));
      if (existing && existing.status !== data.status && !ctx.system) {
        if (!statusTransitionAllowed(orgId, data.projectId as string, String(existing.status), String(data.status))) {
          throw validationFailed(
            [{ path: '$.status', message: `Workflow does not allow moving from "${existing.status}" to "${data.status}".` }],
            'This status transition is not permitted by the workflow.'
          );
        }
      }
      break;
    }
    case 'automationRules': {
      requireRef(ctx, 'projects', data.projectId, '$.projectId');
      if (data.action === 'send_webhook') {
        const url = (data.actionConfig as Record<string, string> | undefined)?.url;
        let ok = false;
        try {
          const u = new URL(String(url));
          ok = u.protocol === 'https:' || (u.protocol === 'http:' && process.env.AUTOMATION_ALLOW_PRIVATE_WEBHOOKS === 'true');
        } catch {
          ok = false;
        }
        if (!ok) fail('$.actionConfig.url', 'A valid https webhook URL is required for the send_webhook action.');
      }
      break;
    }
    case 'repositories': {
      const dup = q(
        "SELECT id FROM records WHERE collection = 'repositories' AND org_id = ? AND deleted = 0 AND id != ? AND LOWER(json_extract(data, '$.name')) = ?"
      ).get(orgId, data.id as string, String(data.name).toLowerCase());
      if (dup) fail('$.name', `Repository "${data.name}" is already connected.`);
      for (const pid of (data.projectIds as string[] | undefined) || []) requireRef(ctx, 'projects', pid, '$.projectIds');
      break;
    }
    case 'siteConfig':
      if (data.id !== 'site') fail('$.id', 'Site configuration id must be "site".');
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Audit helpers
// ---------------------------------------------------------------------------

function describe(collection: string, data: Rec | null): string {
  if (!data) return '';
  return String(data.key ?? data.name ?? data.title ?? data.email ?? data.id ?? '');
}

function diffFields(before: Rec | null, after: Rec | null, ignore: string[] = []): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of changedKeys(before, after)) {
    if (ignore.includes(key)) continue;
    out[key] = { from: before ? before[key] : undefined, to: after ? after[key] : undefined };
    if (Object.keys(out).length >= 25) break;
  }
  return out;
}

function audit(
  ctx: WriteContext,
  action: string,
  collection: string,
  id: string,
  summary: string,
  changes?: unknown
): void {
  if (ctx.system && !ctx.meta.audit) return;
  writeAudit({
    orgId: ctx.orgId,
    actorId: ctx.actor.userId,
    actorEmail: ctx.actor.email,
    actorRole: ctx.actor.role,
    action,
    collection,
    entityId: id,
    summary,
    changes,
    ip: ctx.meta.ip,
    requestId: ctx.meta.requestId,
  });
}

// ---------------------------------------------------------------------------
// Writes: generic records
// ---------------------------------------------------------------------------

function indexColumns(collection: CollectionName, data: Rec): { projectId: string | null; ownerId: string | null } {
  const projectId = typeof data.projectId === 'string' && data.projectId ? data.projectId : null;
  const ownerId =
    typeof data.ownerId === 'string'
      ? data.ownerId
      : collection === 'issues' && typeof data.reporterId === 'string'
      ? data.reporterId
      : null;
  return { projectId, ownerId };
}

const privileged = (actor: Actor) => actor.role === 'admin' || actor.role === 'product_owner';

interface ChildSets {
  comments?: Rec[];
  worklogs?: Rec[];
  attachments?: Rec[];
}

function splitIssueChildren(data: Rec): { core: Rec; children: ChildSets } {
  const { comments, worklogs, attachments, ...core } = data as Rec & {
    comments?: Rec[];
    worklogs?: Rec[];
    attachments?: Rec[];
  };
  return { core, children: { comments, worklogs, attachments } };
}

function syncIssueChildren(ctx: WriteContext, issueId: string, issueKey: string, children: ChildSets): void {
  const { orgId, actor } = ctx;
  const canImpersonate = ctx.system || privileged(actor);
  const authorFor = (claimed: unknown): string => {
    if (canImpersonate && typeof claimed === 'string' && recordExists(orgId, 'users', claimed)) return claimed;
    return actor.userId;
  };
  const mayModify = (ownerId: string) => ctx.system || actor.role === 'admin' || ownerId === actor.userId;

  // --- comments ---
  if (children.comments) {
    const existing = q('SELECT * FROM issue_comments WHERE issue_id = ?').all(issueId) as unknown as CommentRow[];
    const byId = new Map(existing.map(r => [r.id, r]));
    const incomingIds = new Set<string>();
    for (const c of children.comments) {
      const id = c.id as string;
      incomingIds.add(id);
      const prev = byId.get(id);
      if (!prev) {
        const clash = q('SELECT issue_id FROM issue_comments WHERE id = ?').get(id);
        if (clash) fail('$.comments', `Comment id "${id}" already exists.`);
        const authorId = authorFor(c.authorId);
        if (authorId !== c.authorId) ctx.serverModified = true;
        const createdAt = (c.createdAt as string) || nowIso();
        q(
          'INSERT INTO issue_comments (id, org_id, issue_id, author_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(id, orgId, issueId, authorId, c.content as string, createdAt, createdAt);
        ctx.newComments.push({ id, authorId });
        audit(ctx, 'issues.comment.add', 'issues', issueId, `Commented on ${issueKey}`, { commentId: id });
      } else if (prev.content !== c.content) {
        if (!mayModify(prev.author_id)) throw forbidden('Only the author or an administrator can edit a comment.');
        q('UPDATE issue_comments SET content = ?, updated_at = ? WHERE id = ?').run(c.content as string, nowIso(), id);
        audit(ctx, 'issues.comment.edit', 'issues', issueId, `Edited a comment on ${issueKey}`, { commentId: id });
      }
    }
    for (const prev of existing) {
      if (!incomingIds.has(prev.id)) {
        if (!mayModify(prev.author_id)) throw forbidden('Only the author or an administrator can delete a comment.');
        q('DELETE FROM issue_comments WHERE id = ?').run(prev.id);
        audit(ctx, 'issues.comment.delete', 'issues', issueId, `Deleted a comment on ${issueKey}`, { commentId: prev.id });
      }
    }
  }

  // --- worklogs ---
  if (children.worklogs) {
    const existing = q('SELECT * FROM issue_worklogs WHERE issue_id = ?').all(issueId) as unknown as WorklogRow[];
    const byId = new Map(existing.map(r => [r.id, r]));
    const incomingIds = new Set<string>();
    for (const w of children.worklogs) {
      const id = w.id as string;
      incomingIds.add(id);
      const prev = byId.get(id);
      const minutes = w.timeSpentMinutes as number;
      const comment = (w.comment as string | undefined) ?? null;
      if (!prev) {
        const clash = q('SELECT issue_id FROM issue_worklogs WHERE id = ?').get(id);
        if (clash) fail('$.worklogs', `Worklog id "${id}" already exists.`);
        const authorId = authorFor(w.authorId);
        if (authorId !== w.authorId) ctx.serverModified = true;
        q(
          'INSERT INTO issue_worklogs (id, org_id, issue_id, author_id, time_spent_minutes, started_at, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(id, orgId, issueId, authorId, minutes, (w.startedAt as string) || nowIso(), comment, nowIso());
        audit(ctx, 'issues.worklog.add', 'issues', issueId, `Logged ${minutes} min on ${issueKey}`, { worklogId: id });
      } else if (prev.time_spent_minutes !== minutes || (prev.comment ?? null) !== comment) {
        if (!mayModify(prev.author_id)) throw forbidden('Only the author or an administrator can edit a worklog.');
        q('UPDATE issue_worklogs SET time_spent_minutes = ?, comment = ? WHERE id = ?').run(minutes, comment, id);
        audit(ctx, 'issues.worklog.edit', 'issues', issueId, `Edited a worklog on ${issueKey}`, { worklogId: id });
      }
    }
    for (const prev of existing) {
      if (!incomingIds.has(prev.id)) {
        if (!mayModify(prev.author_id)) throw forbidden('Only the author or an administrator can delete a worklog.');
        q('DELETE FROM issue_worklogs WHERE id = ?').run(prev.id);
        audit(ctx, 'issues.worklog.delete', 'issues', issueId, `Deleted a worklog on ${issueKey}`, { worklogId: prev.id });
      }
    }
  }

  // --- attachments (metadata; file bytes are handled by the attachments API) ---
  if (children.attachments) {
    const existing = q('SELECT * FROM issue_attachments WHERE issue_id = ?').all(issueId) as unknown as AttachmentRow[];
    const byId = new Map(existing.map(r => [r.id, r]));
    const incomingIds = new Set<string>();
    for (const a of children.attachments) {
      const id = a.id as string;
      incomingIds.add(id);
      if (!byId.has(id)) {
        if (!ctx.system) {
          fail('$.attachments', 'Files must be uploaded with POST /api/issues/:id/attachments; metadata-only attachments are not accepted.');
        }
        const clash = q('SELECT issue_id FROM issue_attachments WHERE id = ?').get(id);
        if (clash) fail('$.attachments', `Attachment id "${id}" already exists.`);
        const uploadedBy = authorFor(a.uploadedBy);
        if (uploadedBy !== a.uploadedBy) ctx.serverModified = true;
        q(
          'INSERT INTO issue_attachments (id, org_id, issue_id, name, size, mime_type, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          id,
          orgId,
          issueId,
          a.name as string,
          (a.size as string) || '',
          (a.mimeType as string) || 'application/octet-stream',
          uploadedBy,
          (a.uploadedAt as string) || nowIso()
        );
        audit(ctx, 'issues.attachment.add', 'issues', issueId, `Attached ${a.name} to ${issueKey}`, { attachmentId: id });
      }
    }
    for (const prev of existing) {
      if (!incomingIds.has(prev.id)) {
        if (!mayModify(prev.uploaded_by)) throw forbidden('Only the uploader or an administrator can remove an attachment.');
        q('DELETE FROM issue_attachments WHERE id = ?').run(prev.id);
        if (prev.storage_key) ctx.filesToDelete.push(prev.storage_key);
        audit(ctx, 'issues.attachment.delete', 'issues', issueId, `Removed attachment ${prev.name} from ${issueKey}`, {
          attachmentId: prev.id,
        });
      }
    }
  }
}

function upsertRecord(ctx: WriteContext, collection: CollectionName, op: BatchOp, results: OpResult[]): void {
  const { orgId, actor } = ctx;
  const spec = RECORD_SCHEMAS[collection];
  const parsed = validate(spec, op.data);
  if (!parsed.ok) throw validationFailed(parsed.issues.map(i => ({ ...i, path: `${op.collection}/${op.id}${i.path.slice(1)}` })));
  let data = parsed.value;
  if (data.id !== op.id) throw validationFailed([{ path: `${collection}/${op.id}.id`, message: 'must match the resource id' }]);
  if (JSON.stringify(data).length > MAX_RECORD_BYTES) {
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', `Record ${collection}/${op.id} exceeds the maximum size.`);
  }

  const row = getRecordRow(orgId, collection, op.id);
  const live = row && !row.deleted ? row : undefined;
  const existingFull = live
    ? collection === 'issues'
      ? assembleIssues(orgId, [live], op.id)[0].record
      : (JSON.parse(live.data) as Rec)
    : null;

  if (live && existingFull && !ctx.system && !canRead(actor, collection, existingFull, ctx.vis)) {
    throw forbidden('You do not have access to this item.', { collection, id: op.id });
  }

  if (live && op.baseVersion !== undefined && op.baseVersion !== live.version) {
    throw conflict(`${collection}/${op.id} was modified by someone else.`, {
      collection,
      id: op.id,
      current: existingFull,
      version: live.version,
    });
  }

  const operation: Operation = live ? 'update' : 'create';
  if (!ctx.system) {
    const denial = authorize(actor, collection, operation, existingFull, data, {
      projectLead: pid => projectLeadOf(orgId, pid),
      canEditDashboard: rec => canEditDashboard(actor, rec, ctx.vis),
    });
    if (denial) {
      writeAudit({
        orgId,
        actorId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: `${collection}.${operation}`,
        collection,
        entityId: op.id,
        status: 'denied',
        summary: `Denied: ${denial}`,
        ip: ctx.meta.ip,
        requestId: ctx.meta.requestId,
      });
      throw forbidden(denial, { collection, id: op.id });
    }
  }

  // --- server-controlled fields ---
  if (collection === 'issues') {
    if (existingFull) {
      // Keys and reporters are immutable once created (except for administrators / system imports).
      if (!ctx.system && actor.role !== 'admin') {
        if (data.key !== existingFull.key) {
          data.key = existingFull.key;
          ctx.serverModified = true;
        }
        if (data.reporterId !== existingFull.reporterId) {
          data.reporterId = existingFull.reporterId;
          ctx.serverModified = true;
        }
      }
      data.createdAt = (existingFull.createdAt as string) || data.createdAt;
    } else {
      const project = getRecordRow(orgId, 'projects', String(data.projectId));
      const projectKey = project && !project.deleted ? String((JSON.parse(project.data) as Rec).key) : null;
      const keyTaken = q(
        "SELECT id FROM records WHERE collection = 'issues' AND org_id = ? AND deleted = 0 AND id != ? AND json_extract(data, '$.key') = ?"
      ).get(orgId, op.id, data.key as string);
      if (keyTaken && projectKey) {
        data.key = nextIssueKey(orgId, projectKey);
        ctx.serverModified = true;
      } else if (keyTaken) {
        fail('$.key', `Work item key "${data.key}" is already in use.`);
      }
      if (!ctx.system && actor.role !== 'admin' && actor.role !== 'product_owner' && data.reporterId !== actor.userId) {
        data.reporterId = actor.userId;
        ctx.serverModified = true;
      }
    }
    // History entries authored by the server-side actor cannot be forged by ordinary users.
    if (!ctx.system && !privileged(actor) && Array.isArray(data.history)) {
      const known = new Set(
        ((existingFull?.history as Rec[] | undefined) || []).map(h => h.id as string)
      );
      data.history = (data.history as Rec[]).map(h => {
        if (!known.has(h.id as string) && h.authorId !== actor.userId) {
          ctx.serverModified = true;
          return { ...h, authorId: actor.userId };
        }
        return h;
      });
    }
  }

  checkIntegrity(ctx, collection, data, existingFull);
  if (stampPlanning(collection, data, existingFull, nowIso())) ctx.serverModified = true;

  if (collection === 'issues' && !ctx.system) {
    const problems = validateChangedDevLinks(
      orgId,
      String(data.projectId),
      existingFull?.devLinks as Rec[] | undefined,
      data.devLinks as Rec[] | undefined,
      privileged(actor)
    );
    if (problems.length) {
      throw validationFailed(problems.map(p => ({ path: `issues/${op.id}.devLinks[${p.linkId}]`, message: p.message })));
    }
  }

  // Idempotent writes: identical content must not bump the version or flood the change feed.
  if (live && existingFull && !ctx.serverModified && stable(existingFull) === stable(data)) {
    results.push({ collection, id: op.id, version: live.version });
    return;
  }

  const now = nowIso();
  let core = data;
  let children: ChildSets = {};
  if (collection === 'issues') {
    const split = splitIssueChildren(data);
    core = split.core;
    children = split.children;
  }
  const cols = indexColumns(collection, data);
  let version: number;
  if (row) {
    version = row.version + 1;
    q(
      'UPDATE records SET data = ?, version = ?, deleted = 0, project_id = ?, owner_id = ?, updated_at = ? WHERE collection = ? AND id = ? AND org_id = ?'
    ).run(JSON.stringify(core), version, cols.projectId, cols.ownerId, now, collection, op.id, orgId);
  } else {
    version = 1;
    q(
      'INSERT INTO records (collection, id, org_id, project_id, owner_id, data, version, deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)'
    ).run(collection, op.id, orgId, cols.projectId, cols.ownerId, JSON.stringify(core), now, now);
  }

  if (!ctx.meta.skipHistory) {
    if (collection === 'issues') recordIssueHistory(orgId, actor.userId, existingFull, data, now);
    else if (collection === 'sprints') recordSprintHistory(orgId, actor.userId, existingFull, data, now);
  }

  if (collection === 'issues') {
    syncIssueChildren(ctx, op.id, String(data.key), children);
    if (!ctx.system && !ctx.meta.suppressEvents) {
      emitIssueEvents({ orgId, actorId: actor.userId, before: existingFull, after: data, newComments: ctx.newComments });
    }
  }

  logChange(orgId, collection, op.id, operation);
  const ignore = collection === 'issues' ? ['comments', 'worklogs', 'attachments', 'history', 'updatedAt'] : ['updatedAt'];
  const before = existingFull ? { ...existingFull } : null;
  const changes = operation === 'update' ? diffFields(before, data, ignore) : undefined;
  if (operation === 'create' || (changes && Object.keys(changes).length > 0)) {
    audit(
      ctx,
      `${collection}.${operation}`,
      collection,
      op.id,
      `${operation === 'create' ? 'Created' : 'Updated'} ${collection} ${describe(collection, data)}${
        changes ? ` (${Object.keys(changes).join(', ')})` : ''
      }`,
      changes
    );
  }

  const result: OpResult = { collection, id: op.id, version };
  results.push(result);
  if (ctx.serverModified) {
    result.record = collection === 'issues' ? assembleIssues(orgId, [getRecordRow(orgId, collection, op.id)!], op.id)[0].record : data;
  }
}

function deleteRecord(ctx: WriteContext, collection: CollectionName, op: BatchOp, results: OpResult[]): void {
  const { orgId, actor } = ctx;
  const row = getRecordRow(orgId, collection, op.id);
  if (!row || row.deleted) {
    results.push({ collection, id: op.id, version: row?.version ?? 0, deleted: true });
    return; // idempotent
  }
  const existing = collection === 'issues' ? assembleIssues(orgId, [row], op.id)[0].record : (JSON.parse(row.data) as Rec);
  if (!ctx.system && !canRead(actor, collection, existing, ctx.vis)) {
    throw forbidden('You do not have access to this item.', { collection, id: op.id });
  }
  if (op.baseVersion !== undefined && op.baseVersion !== row.version) {
    throw conflict(`${collection}/${op.id} was modified by someone else.`, {
      collection,
      id: op.id,
      current: existing,
      version: row.version,
    });
  }
  if (!ctx.system) {
    const denial = authorize(actor, collection, 'delete', existing, null, {
      projectLead: pid => projectLeadOf(orgId, pid),
      canEditDashboard: rec => canEditDashboard(actor, rec, ctx.vis),
    });
    if (denial) {
      writeAudit({
        orgId,
        actorId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: `${collection}.delete`,
        collection,
        entityId: op.id,
        status: 'denied',
        summary: `Denied: ${denial}`,
        ip: ctx.meta.ip,
        requestId: ctx.meta.requestId,
      });
      throw forbidden(denial, { collection, id: op.id });
    }
  }
  if (collection === 'projects') {
    const used = q(
      "SELECT COUNT(*) AS c FROM records WHERE collection = 'issues' AND org_id = ? AND deleted = 0 AND project_id = ?"
    ).get(orgId, op.id) as { c: number };
    if (used.c > 0) throw conflict('A space that still contains work items cannot be deleted.');
  }
  if (collection === 'issues') {
    const keys = q('SELECT storage_key FROM issue_attachments WHERE issue_id = ? AND storage_key IS NOT NULL').all(op.id) as unknown as Array<{ storage_key: string }>;
    ctx.filesToDelete.push(...keys.map(k => k.storage_key));
    q('DELETE FROM issue_comments WHERE issue_id = ?').run(op.id);
    q('DELETE FROM issue_worklogs WHERE issue_id = ?').run(op.id);
    q('DELETE FROM issue_attachments WHERE issue_id = ?').run(op.id);
  }
  const version = row.version + 1;
  if (collection === 'issues' && !ctx.meta.skipHistory) recordIssueDeleted(orgId, actor.userId, existing, nowIso());
  q('UPDATE records SET deleted = 1, version = ?, updated_at = ? WHERE collection = ? AND id = ? AND org_id = ?').run(
    version,
    nowIso(),
    collection,
    op.id,
    orgId
  );
  logChange(orgId, collection, op.id, 'delete');
  audit(ctx, `${collection}.delete`, collection, op.id, `Deleted ${collection} ${describe(collection, existing)}`);
  results.push({ collection, id: op.id, version, deleted: true });
}

// ---------------------------------------------------------------------------
// Writes: users
// ---------------------------------------------------------------------------

function deleteUser(ctx: WriteContext, op: BatchOp, results: OpResult[]): void {
  const { orgId, actor } = ctx;
  const row = getUserRow(op.id);
  if (!row || row.org_id !== orgId) {
    results.push({ collection: 'users', id: op.id, version: 0, deleted: true });
    return;
  }
  if (!ctx.system) {
    const denial = authorize(actor, 'users', 'delete', userRowToRecord(row), null, { projectLead: () => undefined });
    if (denial) {
      writeAudit({
        orgId,
        actorId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'users.delete',
        collection: 'users',
        entityId: op.id,
        status: 'denied',
        summary: `Denied: ${denial}`,
        ip: ctx.meta.ip,
        requestId: ctx.meta.requestId,
      });
      throw forbidden(denial, { collection: 'users', id: op.id });
    }
  }
  if (actor.userId === op.id && !ctx.system) throw forbidden('You cannot delete your own account.');
  if (row.role === 'admin' && row.status === 'active' && activeAdminCount(orgId, row.id) === 0) {
    throw validationFailed([{ path: `users/${op.id}`, message: 'The last active administrator cannot be deleted.' }]);
  }
  q('DELETE FROM users WHERE id = ?').run(op.id);
  logChange(orgId, 'users', op.id, 'delete');
  audit(ctx, 'users.delete', 'users', op.id, `Deleted user ${row.email}`);
  results.push({ collection: 'users', id: op.id, version: row.version + 1, deleted: true });
}

// ---------------------------------------------------------------------------
// Batch entry point
// ---------------------------------------------------------------------------

/**
 * Applies a batch atomically: either every operation succeeds or none is persisted.
 * Passwords are hashed up-front (async) so the SQLite transaction itself stays synchronous.
 */
export async function applyBatch(actor: Actor, ops: BatchOp[], meta: BatchMeta = {}): Promise<BatchResult> {
  if (!Array.isArray(ops) || ops.length === 0) throw validationFailed([{ path: 'ops', message: 'must be a non-empty array' }]);
  if (ops.length > MAX_BATCH_OPS) {
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', `A batch may contain at most ${MAX_BATCH_OPS} operations.`);
  }

  const issues: FieldIssue[] = [];
  ops.forEach((op, i) => {
    if (!op || typeof op !== 'object') issues.push({ path: `ops[${i}]`, message: 'must be an object' });
    else {
      if (typeof op.collection !== 'string' || !isCollection(op.collection)) {
        issues.push({ path: `ops[${i}].collection`, message: 'is not a known collection' });
      }
      if (op.op !== 'upsert' && op.op !== 'delete') issues.push({ path: `ops[${i}].op`, message: 'must be "upsert" or "delete"' });
      if (typeof op.id !== 'string' || !ID_PATTERN.test(op.id)) issues.push({ path: `ops[${i}].id`, message: 'is not a valid id' });
      if (op.baseVersion !== undefined && !Number.isInteger(op.baseVersion)) {
        issues.push({ path: `ops[${i}].baseVersion`, message: 'must be an integer' });
      }
    }
  });
  if (issues.length) throw validationFailed(issues);

  const ordered = [...ops].sort((a, b) => {
    const ia = COLLECTION_ORDER.indexOf(a.collection as AnyCollection);
    const ib = COLLECTION_ORDER.indexOf(b.collection as AnyCollection);
    if (a.op !== b.op) return a.op === 'upsert' ? -1 : 1; // upserts first, then deletes
    return a.op === 'upsert' ? ia - ib : ib - ia;
  });

  const ctx: WriteContext = {
    orgId: actor.orgId,
    actor,
    system: Boolean(meta.system),
    meta,
    serverModified: false,
    vis: new VisibilityContext(actor.orgId),
    filesToDelete: [],
    newComments: [],
  };

  const userOps = ordered.filter(o => o.collection === 'users');
  const recordOps = ordered.filter(o => o.collection !== 'users');
  return applyOrdered(ctx, userOps, recordOps);
}

function runRecordOps(ctx: WriteContext, recordOps: BatchOp[], results: OpResult[]): void {
  for (const op of recordOps) {
    ctx.serverModified = false;
    ctx.newComments = [];
    const collection = op.collection as CollectionName;
    if (op.op === 'upsert') upsertRecord(ctx, collection, op, results);
    else deleteRecord(ctx, collection, op, results);
  }
}

async function applyOrdered(
  ctx: WriteContext,
  userOps: BatchOp[],
  recordOps: BatchOp[]
): Promise<BatchResult> {
  const results: OpResult[] = [];
  const issued: IssuedCredential[] = [];
  // Phase 1: hash every password asynchronously (CPU heavy) before touching the database.
  const hashed = new Map<string, string>();
  const generated = new Map<string, string>();
  for (const op of userOps) {
    if (op.op !== 'upsert') continue;
    const raw = (op.data as Rec | undefined)?.password;
    if (typeof raw === 'string' && raw.length > 0) {
      const policy = passwordPolicyError(raw);
      if (policy) throw validationFailed([{ path: `users/${op.id}.password`, message: policy }]);
      hashed.set(op.id, await hashPassword(raw));
    } else if (!getUserRow(op.id)) {
      const temp = generateTemporaryPassword();
      generated.set(op.id, temp);
      hashed.set(op.id, await hashPassword(temp));
    }
  }

  const result = transaction(() => {
    for (const op of userOps) {
      ctx.serverModified = false;
      if (op.op === 'delete') {
        deleteUser(ctx, op, results);
      } else {
        upsertUserSync(ctx, op, results, issued, hashed.get(op.id), generated.get(op.id));
      }
    }
    runRecordOps(ctx, recordOps, results);
    return { results, seq: currentSeq(ctx.orgId), issuedCredentials: issued };
  });
  deleteStoredFiles(ctx.filesToDelete);
  return result;
}

/** Synchronous variant of upsertUser that receives a pre-computed password hash. */
function upsertUserSync(
  ctx: WriteContext,
  op: BatchOp,
  results: OpResult[],
  issued: IssuedCredential[],
  passwordHash: string | undefined,
  temporaryPassword: string | undefined
): void {
  const { orgId, actor } = ctx;
  const parsed = validate(USER_PROFILE_SCHEMA, op.data);
  if (!parsed.ok) throw validationFailed(parsed.issues.map(i => ({ ...i, path: `users/${op.id}${i.path.slice(1)}` })));
  const data = parsed.value;
  if (data.id !== op.id) throw validationFailed([{ path: `users/${op.id}.id`, message: 'must match the resource id' }]);
  const rawPassword = (op.data as Rec | undefined)?.password;

  const row = getUserRow(op.id);
  const existing = row ? userRowToRecord(row) : null;
  const operation: Operation = row ? 'update' : 'create';

  if (row && op.baseVersion !== undefined && op.baseVersion !== row.version) {
    throw conflict(`users/${op.id} was modified by someone else.`, { collection: 'users', id: op.id, current: existing, version: row.version });
  }

  if (!ctx.system) {
    const denial = authorize(
      actor,
      'users',
      operation,
      existing,
      { ...data, ...(typeof rawPassword === 'string' ? { password: '[set]' } : {}) },
      { projectLead: pid => projectLeadOf(orgId, pid) }
    );
    if (denial) {
      writeAudit({
        orgId,
        actorId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: `users.${operation}`,
        collection: 'users',
        entityId: op.id,
        status: 'denied',
        summary: `Denied: ${denial}`,
        ip: ctx.meta.ip,
        requestId: ctx.meta.requestId,
      });
      throw forbidden(denial, { collection: 'users', id: op.id });
    }
    if (typeof rawPassword === 'string' && rawPassword.length > 0 && actor.role !== 'admin') {
      throw forbidden('Use the change-password endpoint to change your own password.');
    }
  }

  const email = String(data.email).trim();
  const dup = getUserByEmail(email);
  if (dup && dup.id !== op.id) throw validationFailed([{ path: `users/${op.id}.email`, message: 'This email is already registered.' }]);

  const newStatus = (data.status as string) || 'active';
  if (row && row.role === 'admin' && (data.role !== 'admin' || newStatus !== 'active') && activeAdminCount(orgId, row.id) === 0) {
    throw validationFailed([{ path: `users/${op.id}.role`, message: 'The last active administrator cannot be demoted or deactivated.' }]);
  }

  const mustChange = Boolean(passwordHash) && !ctx.system;
  if (temporaryPassword) issued.push({ userId: op.id, email, temporaryPassword });

  const now = nowIso();
  const profile = { ...data };
  delete profile.email;
  delete profile.role;
  delete profile.status;
  let version: number;
  if (row) {
    version = row.version + 1;
    q(
      `UPDATE users SET email = ?, role = ?, status = ?, profile = ?, version = ?, updated_at = ?,
              password_hash = COALESCE(?, password_hash),
              must_change_password = CASE WHEN ? IS NOT NULL THEN ? ELSE must_change_password END
        WHERE id = ?`
    ).run(email, data.role as string, newStatus, JSON.stringify(profile), version, now, passwordHash ?? null, passwordHash ?? null, mustChange ? 1 : 0, op.id);
    if (passwordHash || newStatus !== 'active') revokeUserSessions(op.id);
  } else {
    version = 1;
    q(
      `INSERT INTO users (id, org_id, email, password_hash, role, status, must_change_password, profile, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(op.id, orgId, email, passwordHash ?? null, data.role as string, newStatus, temporaryPassword ? 1 : mustChange ? 1 : 0, JSON.stringify(profile), now, now);
  }

  logChange(orgId, 'users', op.id, operation);
  const after = { ...data, status: newStatus };
  const changes = operation === 'update' ? diffFields(existing, after, ['joinedDate']) : undefined;
  if (typeof rawPassword === 'string' && rawPassword.length > 0) {
    (changes || {}).password = { from: '[REDACTED]', to: '[REDACTED]' };
  }
  audit(ctx, `users.${operation}`, 'users', op.id, `${operation === 'create' ? 'Created' : 'Updated'} user ${email}`, changes);
  results.push({ collection: 'users', id: op.id, version });
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export { RECORD_COLLECTIONS };
