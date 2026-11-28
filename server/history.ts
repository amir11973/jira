import { db } from './db.ts';

type Rec = Record<string, unknown>;

/**
 * Append-only issue / sprint history that the reports (burndown, velocity) are computed from.
 * The rows are written by the server inside the same transaction as the change itself, so clients cannot
 * rewrite them. Rows flagged `estimated` were reconstructed for data that pre-dates history tracking.
 */

export interface IssueSnapshot {
  status: string;
  sprintId: string | null;
  storyPoints: number;
  archived: boolean;
}

function pointsOf(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

export function snapshotOf(issue: Rec): IssueSnapshot {
  return {
    status: String(issue.status ?? ''),
    sprintId: issue.sprintId ? String(issue.sprintId) : null,
    storyPoints: pointsOf(issue.storyPoints),
    archived: issue.archived === true,
  };
}

const INSERT_ISSUE_EVENT =
  'INSERT INTO issue_events (org_id, issue_id, project_id, ts, actor_id, kind, from_value, to_value, estimated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
const INSERT_SPRINT_EVENT =
  'INSERT INTO sprint_events (org_id, sprint_id, project_id, ts, actor_id, kind, estimated) VALUES (?, ?, ?, ?, ?, ?, ?)';

export function recordIssueHistory(
  orgId: string,
  actorId: string | null,
  before: Rec | null,
  after: Rec,
  ts: string
): void {
  const issueId = String(after.id);
  const projectId = String(after.projectId);
  const ins = db.prepare(INSERT_ISSUE_EVENT);
  if (!before) {
    ins.run(orgId, issueId, projectId, ts, actorId, 'created', null, JSON.stringify(snapshotOf(after)), 0);
    return;
  }
  const a = snapshotOf(before);
  const b = snapshotOf(after);
  if (a.status !== b.status) ins.run(orgId, issueId, projectId, ts, actorId, 'status', a.status, b.status, 0);
  if (a.sprintId !== b.sprintId) ins.run(orgId, issueId, projectId, ts, actorId, 'sprint', a.sprintId ?? '', b.sprintId ?? '', 0);
  if (a.storyPoints !== b.storyPoints) ins.run(orgId, issueId, projectId, ts, actorId, 'points', String(a.storyPoints), String(b.storyPoints), 0);
  if (a.archived !== b.archived) ins.run(orgId, issueId, projectId, ts, actorId, 'archived', String(a.archived), String(b.archived), 0);
}

export function recordIssueDeleted(orgId: string, actorId: string | null, issue: Rec, ts: string): void {
  db.prepare(INSERT_ISSUE_EVENT).run(orgId, String(issue.id), String(issue.projectId), ts, actorId, 'deleted', null, null, 0);
}

export function recordSprintHistory(orgId: string, actorId: string | null, before: Rec | null, after: Rec, ts: string): void {
  const sprintId = String(after.id);
  const projectId = String(after.projectId);
  const ins = db.prepare(INSERT_SPRINT_EVENT);
  const prev = before ? String(before.status) : null;
  const next = String(after.status);
  if (prev === next) return;
  if (next === 'active') {
    ins.run(orgId, sprintId, projectId, ts, actorId, 'started', 0);
  } else if (next === 'completed') {
    const started = db
      .prepare("SELECT 1 FROM sprint_events WHERE sprint_id = ? AND kind = 'started' LIMIT 1")
      .get(sprintId);
    if (!started) ins.run(orgId, sprintId, projectId, ts, actorId, 'started', 0);
    ins.run(orgId, sprintId, projectId, ts, actorId, 'completed', 0);
  } else if (prev !== null) {
    ins.run(orgId, sprintId, projectId, ts, actorId, 'planned', 0);
  }
}

// ---------------------------------------------------------------------------
// Reconstruction for data that existed before history tracking
// ---------------------------------------------------------------------------

export function toIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const t = /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00.000Z`) : Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

interface RecordRow {
  id: string;
  org_id: string;
  project_id: string | null;
  data: string;
  created_at: string;
}

/**
 * Creates history for issues and sprints that have none (legacy data and the demo workspace).
 * Every reconstructed row is marked `estimated`: items in a started sprint are assumed to be part of its
 * commitment, and the status change to the current status is dated at the item's last update.
 * Idempotent: only issues/sprints without any history are touched.
 */
export function backfillHistory(): { issues: number; sprints: number } {
  const sprintRows = db
    .prepare("SELECT id, org_id, project_id, data, created_at FROM records WHERE collection = 'sprints' AND deleted = 0")
    .all() as unknown as RecordRow[];
  const sprints = new Map<string, { startTs: string | null; completedTs: string | null; status: string }>();
  const insSprint = db.prepare(INSERT_SPRINT_EVENT);
  let sprintCount = 0;
  for (const r of sprintRows) {
    const s = JSON.parse(r.data) as Rec;
    const status = String(s.status);
    const startTs = toIso(s.startDate);
    const completedTs = toIso(s.completedAt) || (status === 'completed' ? toIso(s.endDate) : null);
    sprints.set(r.id, { startTs, completedTs, status });
    const has = db.prepare('SELECT 1 FROM sprint_events WHERE sprint_id = ? LIMIT 1').get(r.id);
    if (has || status === 'planned') continue;
    const projectId = r.project_id || String(s.projectId);
    insSprint.run(r.org_id, r.id, projectId, startTs || r.created_at, null, 'started', 1);
    if (status === 'completed') insSprint.run(r.org_id, r.id, projectId, completedTs || startTs || r.created_at, null, 'completed', 1);
    sprintCount++;
  }

  const firstStatus = new Map<string, string>();
  const wfRows = db
    .prepare("SELECT project_id, data FROM records WHERE collection = 'workflows' AND deleted = 0")
    .all() as unknown as Array<{ project_id: string | null; data: string }>;
  for (const w of wfRows) {
    if (!w.project_id) continue;
    const wf = JSON.parse(w.data) as { statuses?: Array<{ id: string; category: string }> };
    const first = wf.statuses?.find(s => s.category === 'todo') || wf.statuses?.[0];
    if (first && !firstStatus.has(w.project_id)) firstStatus.set(w.project_id, first.id);
  }

  const issueRows = db
    .prepare(
      `SELECT id, org_id, project_id, data, created_at FROM records
       WHERE collection = 'issues' AND deleted = 0
         AND NOT EXISTS (SELECT 1 FROM issue_events e WHERE e.issue_id = records.id)`
    )
    .all() as unknown as RecordRow[];
  const insIssue = db.prepare(INSERT_ISSUE_EVENT);
  const nowMs = Date.now();
  for (const r of issueRows) {
    const issue = JSON.parse(r.data) as Rec;
    const projectId = r.project_id || String(issue.projectId);
    const snap = snapshotOf(issue);
    const sprint = snap.sprintId ? sprints.get(snap.sprintId) : undefined;
    let createdMs = Date.parse(toIso(issue.createdAt) || r.created_at);
    if (!Number.isFinite(createdMs)) createdMs = nowMs;
    // Assume work that sits in a started sprint was committed when the sprint began.
    if (sprint?.startTs && Date.parse(sprint.startTs) < createdMs) createdMs = Date.parse(sprint.startTs);
    const initialStatus = firstStatus.get(projectId) || 'todo';
    const created: IssueSnapshot = { ...snap, status: initialStatus, archived: false };
    insIssue.run(r.org_id, r.id, projectId, new Date(createdMs).toISOString(), null, 'created', null, JSON.stringify(created), 1);
    if (snap.status !== initialStatus) {
      let changedMs = Date.parse(toIso(issue.updatedAt) || r.created_at);
      if (!Number.isFinite(changedMs) || changedMs < createdMs) changedMs = createdMs + 1;
      const doneBy = sprint?.completedTs ? Date.parse(sprint.completedTs) : null;
      if (doneBy && changedMs >= doneBy) changedMs = Math.max(createdMs + 1, doneBy - 1);
      insIssue.run(r.org_id, r.id, projectId, new Date(changedMs).toISOString(), null, 'status', initialStatus, snap.status, 1);
    }
    if (snap.archived) {
      insIssue.run(r.org_id, r.id, projectId, new Date(Math.min(nowMs, Date.parse(toIso(issue.updatedAt) || new Date(nowMs).toISOString()))).toISOString(), null, 'archived', 'false', 'true', 1);
    }
  }
  return { issues: issueRows.length, sprints: sprintCount };
}
