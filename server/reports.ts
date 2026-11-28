import { db } from './db.ts';
import { toIso } from './history.ts';
import { categoryResolver, loadRows, todayIso } from './planning.ts';

/**
 * Sprint reports computed from the server-side history (issue_events / sprint_events) and live issues.
 *  - burndown: remaining work per day of one sprint, replayed from status / sprint / estimate changes
 *  - velocity: committed vs completed work of completed sprints
 *  - breakdown: live counts of work items grouped by type, priority, status, assignee, ...
 */

type Rec = Record<string, unknown>;

interface EventRow {
  issue_id: string;
  ts: string;
  kind: string;
  from_value: string | null;
  to_value: string | null;
  estimated: number;
}

interface State {
  exists: boolean;
  deleted: boolean;
  archived: boolean;
  sprintId: string | null;
  status: string;
  points: number;
}

interface Step {
  ms: number;
  state: State;
  estimated: boolean;
}

const EMPTY: State = { exists: false, deleted: false, archived: false, sprintId: null, status: '', points: 0 };
const DAY = 86_400_000;

const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const dayStart = (d: string): number => Date.parse(`${d}T00:00:00.000Z`);
const round1 = (n: number): number => Math.round(n * 10) / 10;

function buildTimelines(rows: EventRow[]): Map<string, Step[]> {
  const timelines = new Map<string, Step[]>();
  const current = new Map<string, State>();
  for (const e of rows) {
    const prev = current.get(e.issue_id) || EMPTY;
    let next: State = { ...prev };
    switch (e.kind) {
      case 'created': {
        const snap = JSON.parse(e.to_value || '{}') as { status?: string; sprintId?: string | null; storyPoints?: number; archived?: boolean };
        next = {
          exists: true,
          deleted: false,
          archived: snap.archived === true,
          sprintId: snap.sprintId || null,
          status: snap.status || '',
          points: snap.storyPoints || 0,
        };
        break;
      }
      case 'status':
        next.status = e.to_value || '';
        break;
      case 'sprint':
        next.sprintId = e.to_value || null;
        break;
      case 'points':
        next.points = Number(e.to_value) || 0;
        break;
      case 'archived':
        next.archived = e.to_value === 'true';
        break;
      case 'deleted':
        next.deleted = true;
        break;
      default:
        continue;
    }
    current.set(e.issue_id, next);
    const steps = timelines.get(e.issue_id) || [];
    steps.push({ ms: Date.parse(e.ts), state: next, estimated: e.estimated === 1 });
    timelines.set(e.issue_id, steps);
  }
  return timelines;
}

function stateAt(steps: Step[], ms: number): State | null {
  let found: Step | null = null;
  for (const s of steps) {
    if (s.ms <= ms) found = s;
    else break;
  }
  return found ? found.state : null;
}

const isMember = (s: State | null, sprintId: string): s is State =>
  !!s && s.exists && !s.deleted && !s.archived && s.sprintId === sprintId;

/** All events of every issue that was ever part of the sprint (one query). */
function loadSprintTimelines(orgId: string, projectId: string, sprintId: string): Map<string, Step[]> {
  const rows = db
    .prepare(
      `SELECT issue_id, ts, kind, from_value, to_value, estimated FROM issue_events
       WHERE org_id = ? AND project_id = ? AND issue_id IN (
         SELECT DISTINCT issue_id FROM issue_events
         WHERE org_id = ? AND project_id = ? AND (
           (kind = 'sprint' AND (to_value = ? OR from_value = ?))
           OR (kind = 'created' AND json_extract(to_value, '$.sprintId') = ?)))
       ORDER BY ts, id`
    )
    .all(orgId, projectId, orgId, projectId, sprintId, sprintId, sprintId) as unknown as EventRow[];
  return buildTimelines(rows);
}

interface SprintEvents {
  startedMs: number | null;
  completedMs: number | null;
  estimated: boolean;
}

function sprintEvents(sprintId: string, sprint: Rec): SprintEvents {
  const rows = db
    .prepare('SELECT kind, ts, estimated FROM sprint_events WHERE sprint_id = ? ORDER BY ts, id')
    .all(sprintId) as unknown as Array<{ kind: string; ts: string; estimated: number }>;
  let startedMs: number | null = null;
  let completedMs: number | null = null;
  let estimated = false;
  for (const r of rows) {
    if (r.kind === 'started') {
      startedMs = Date.parse(r.ts);
      completedMs = null;
      estimated = estimated || r.estimated === 1;
    } else if (r.kind === 'completed') {
      completedMs = Date.parse(r.ts);
      estimated = estimated || r.estimated === 1;
    } else if (r.kind === 'planned') {
      startedMs = null;
      completedMs = null;
    }
  }
  if (startedMs === null && sprint.status !== 'planned') {
    const t = toIso(sprint.startDate);
    startedMs = t ? Date.parse(t) : null;
  }
  if (completedMs === null && sprint.status === 'completed') {
    const t = toIso(sprint.completedAt) || toIso(sprint.endDate);
    completedMs = t ? Date.parse(t) : null;
  }
  return { startedMs, completedMs, estimated };
}

function sprintRow(orgId: string, sprintId: string): Rec | null {
  const row = db
    .prepare("SELECT data FROM records WHERE collection = 'sprints' AND id = ? AND org_id = ? AND deleted = 0")
    .get(sprintId, orgId) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as Rec) : null;
}

// ---------------------------------------------------------------------------
// Burndown
// ---------------------------------------------------------------------------

export interface BurndownPoint {
  date: string;
  ideal: number;
  remaining: number | null;
  scope: number | null;
  completed: number | null;
  isToday: boolean;
}

export function burndownReport(orgId: string, sprintId: string, metricParam: string) {
  const sprint = sprintRow(orgId, sprintId);
  if (!sprint) return null;
  const projectId = String(sprint.projectId);
  const base = {
    sprint: {
      id: sprintId,
      projectId,
      name: String(sprint.name),
      goal: String(sprint.goal ?? ''),
      status: String(sprint.status),
      startDate: sprint.startDate ?? null,
      endDate: sprint.endDate ?? null,
      completedAt: sprint.completedAt ?? null,
    },
    generatedAt: new Date().toISOString(),
  };
  const ev = sprintEvents(sprintId, sprint);
  if (sprint.status === 'planned' || ev.startedMs === null) {
    return { ...base, state: 'planned' as const, metric: 'points', unit: 'points', series: [] as BurndownPoint[], estimated: false };
  }

  const done = categoryResolver(orgId, projectId);
  const timelines = loadSprintTimelines(orgId, projectId, sprintId);
  const startMs = ev.startedMs;
  const nowMs = Date.now();
  // For a finished sprint the report is frozen just before completion (carry-over moves happen at that instant).
  const endCap = ev.completedMs !== null ? ev.completedMs - 1 : nowMs;
  if (ev.completedMs !== null) {
    for (const [id, steps] of timelines) if (steps[steps.length - 1].state.deleted) timelines.delete(id);
  }

  // choose the unit: story points when the sprint has estimates, otherwise item count
  let anyPoints = false;
  for (const steps of timelines.values()) if (steps.some(s => isMember(s.state, sprintId) && s.state.points > 0)) anyPoints = true;
  const metric = metricParam === 'count' ? 'count' : metricParam === 'points' ? 'points' : anyPoints ? 'points' : 'count';
  const w = (s: State): number => (metric === 'points' ? s.points : 1);

  const measure = (asOf: number) => {
    let scope = 0;
    let completed = 0;
    for (const steps of timelines.values()) {
      const s = stateAt(steps, asOf);
      if (!isMember(s, sprintId)) continue;
      scope += w(s);
      if (done(s.status) === 'done') completed += w(s);
    }
    return { scope, completed, remaining: scope - completed };
  };

  // commitment = membership at the moment the sprint started
  const committedIds = new Set<string>();
  let committed = 0;
  for (const [id, steps] of timelines) {
    const s = stateAt(steps, startMs);
    if (isMember(s, sprintId)) {
      committedIds.add(id);
      committed += w(s);
    }
  }

  const startDay = dayOf(startMs);
  const plannedEnd = typeof sprint.endDate === 'string' && sprint.endDate ? dayOf(Date.parse(toIso(sprint.endDate) || '')) : null;
  const plannedEndDay = plannedEnd && plannedEnd > startDay ? plannedEnd : dayOf(startMs + 14 * DAY);
  const lastDay = ev.completedMs !== null ? dayOf(ev.completedMs) : plannedEndDay > dayOf(nowMs) ? plannedEndDay : dayOf(nowMs);
  const plannedDays = Math.max(1, Math.round((dayStart(plannedEndDay) - dayStart(startDay)) / DAY));
  const totalDays = Math.min(180, Math.round((dayStart(lastDay) - dayStart(startDay)) / DAY) + 1);
  const today = dayOf(nowMs);

  const series: BurndownPoint[] = [];
  for (let i = 0; i < totalDays; i++) {
    const date = dayOf(dayStart(startDay) + i * DAY);
    const ideal = round1(Math.max(0, committed * (1 - i / plannedDays)));
    const future = dayStart(date) > endCap;
    if (future) {
      series.push({ date, ideal, remaining: null, scope: null, completed: null, isToday: date === today });
      continue;
    }
    const asOf = Math.min(dayStart(date) + DAY - 1, endCap);
    const m = measure(asOf);
    series.push({ date, ideal, remaining: round1(m.remaining), scope: round1(m.scope), completed: round1(m.completed), isToday: date === today });
  }

  const final = measure(endCap);
  // scope changes after the start
  let added = 0;
  let removed = 0;
  const finalMembers = new Set<string>();
  for (const [id, steps] of timelines) {
    const s = stateAt(steps, endCap);
    if (isMember(s, sprintId)) {
      finalMembers.add(id);
      if (!committedIds.has(id)) added += w(s);
    }
  }
  for (const id of committedIds) {
    if (!finalMembers.has(id)) {
      const s = stateAt(timelines.get(id) || [], startMs);
      if (s) removed += w(s);
    }
  }

  const elapsedDays = Math.max(1, (endCap - startMs) / DAY);
  const burnRate = round1(final.completed / elapsedDays);
  const idxToday = Math.min(series.length - 1, Math.max(0, Math.round((dayStart(today) - dayStart(startDay)) / DAY)));
  const idealNow = ev.completedMs !== null ? 0 : series[idxToday]?.ideal ?? 0;
  const tolerance = Math.max(0.5, committed * 0.1);
  let forecast: 'completed' | 'ahead' | 'on_track' | 'behind' | 'no_scope';
  if (final.scope === 0) forecast = 'no_scope';
  else if (final.remaining === 0) forecast = 'completed';
  else if (final.remaining < idealNow - tolerance) forecast = 'ahead';
  else if (final.remaining <= idealNow + tolerance) forecast = 'on_track';
  else forecast = 'behind';
  let projectedFinishDate: string | null = null;
  if (final.remaining === 0) projectedFinishDate = ev.completedMs !== null ? dayOf(ev.completedMs) : today;
  else if (burnRate > 0 && ev.completedMs === null) projectedFinishDate = dayOf(nowMs + Math.ceil(final.remaining / burnRate) * DAY);

  let estimated = ev.estimated;
  for (const steps of timelines.values()) if (steps.some(s => s.estimated)) estimated = true;

  return {
    ...base,
    state: ev.completedMs !== null ? ('completed' as const) : ('active' as const),
    metric,
    unit: metric,
    canToggleMetric: anyPoints,
    committed: round1(committed),
    scopeAdded: round1(added),
    scopeRemoved: round1(removed),
    scope: round1(final.scope),
    completed: round1(final.completed),
    remaining: round1(final.remaining),
    burnRate,
    forecast,
    projectedFinishDate,
    plannedEndDate: plannedEndDay,
    startedAt: new Date(startMs).toISOString(),
    series,
    estimated,
  };
}

// ---------------------------------------------------------------------------
// Velocity
// ---------------------------------------------------------------------------

export function velocityReport(orgId: string, projectId: string, limit: number) {
  const sprints = loadRows(orgId, 'sprints', projectId).filter(s => s.status === 'completed');
  const done = categoryResolver(orgId, projectId);

  const rows = sprints
    .map(sprint => {
      const sprintId = sprint.id;
      const ev = sprintEvents(sprintId, sprint);
      if (ev.startedMs === null || ev.completedMs === null) return null;
      const timelines = loadSprintTimelines(orgId, projectId, sprintId);
      const out = {
        committedPoints: 0,
        committedCount: 0,
        addedPoints: 0,
        addedCount: 0,
        completedPoints: 0,
        completedCount: 0,
        incompletePoints: 0,
        incompleteCount: 0,
      };
      let estimated = ev.estimated;
      for (const steps of timelines.values()) {
        const atStart = stateAt(steps, ev.startedMs);
        const wasCommitted = isMember(atStart, sprintId);
        if (wasCommitted) {
          out.committedPoints += atStart.points;
          out.committedCount += 1;
        }
        // the last state the item had while it belonged to the sprint, up to the moment the sprint ended
        // Items deleted afterwards are not part of the report. Moves written in the same instant as the
        // sprint completion (carry-over to the next sprint) still count as belonging to the sprint.
        if (steps[steps.length - 1].state.deleted) continue;
        let last: State | null = null;
        let final: State | null = null;
        for (const s of steps) {
          if (s.ms >= ev.completedMs) break;
          if (s.estimated) estimated = true;
          const st: State = s.state;
          final = st;
          if (st.deleted) last = null;
          else if (isMember(st, sprintId)) last = st;
        }
        if (!last) continue;
        // Work that was taken out of the sprint before it ended (and was not finished) was descoped, not missed.
        if (!isMember(final, sprintId) && done(last.status) !== 'done') continue;
        if (!wasCommitted) {
          out.addedPoints += last.points;
          out.addedCount += 1;
        }
        if (done(last.status) === 'done') {
          out.completedPoints += last.points;
          out.completedCount += 1;
        } else {
          out.incompletePoints += last.points;
          out.incompleteCount += 1;
        }
      }
      const totalPoints = out.completedPoints + out.incompletePoints;
      const totalCount = out.completedCount + out.incompleteCount;
      return {
        sprintId,
        name: String(sprint.name),
        goal: String(sprint.goal ?? ''),
        startDate: dayOf(ev.startedMs),
        endDate: dayOf(ev.completedMs),
        completedMs: ev.completedMs,
        ...out,
        completionRate: totalPoints > 0 ? Math.round((out.completedPoints / totalPoints) * 100) : totalCount > 0 ? Math.round((out.completedCount / totalCount) * 100) : 0,
        estimated,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.completedMs - a.completedMs)
    .slice(0, limit)
    .reverse()
    .map(({ completedMs: _ms, ...rest }) => rest);

  const recent = rows.slice(-3);
  const avg = (pick: (r: (typeof rows)[number]) => number) => (recent.length ? round1(recent.reduce((s, r) => s + pick(r), 0) / recent.length) : 0);
  return {
    projectId,
    generatedAt: new Date().toISOString(),
    hasPoints: rows.some(r => r.committedPoints > 0 || r.completedPoints > 0),
    sprints: rows,
    averageCompletedPoints: avg(r => r.completedPoints),
    averageCompletedCount: avg(r => r.completedCount),
    averageWindow: recent.length,
    estimated: rows.some(r => r.estimated),
  };
}

// ---------------------------------------------------------------------------
// Breakdown
// ---------------------------------------------------------------------------

export interface BreakdownFilters {
  sprintId?: string;
  versionId?: string;
  epicId?: string;
  assigneeId?: string;
  includeArchived?: boolean;
}

interface Group {
  key: string;
  label: string;
  labelFa?: string;
  count: number;
  points: number;
  doneCount: number;
  donePoints: number;
  category?: string;
}

export function breakdownReport(orgId: string, projectId: string, f: BreakdownFilters) {
  const done = categoryResolver(orgId, projectId);
  const today = todayIso();
  const users = new Map(
    (db.prepare('SELECT id, profile FROM users WHERE org_id = ?').all(orgId) as unknown as Array<{ id: string; profile: string }>).map(u => {
      const p = JSON.parse(u.profile) as { name?: string; nameFa?: string };
      return [u.id, { name: p.name || u.id, nameFa: p.nameFa || p.name || u.id }] as const;
    })
  );
  const epics = new Map(loadRows(orgId, 'epics', projectId).map(e => [e.id, e]));
  const sprints = new Map(loadRows(orgId, 'sprints', projectId).map(s => [s.id, s]));
  const versions = new Map(loadRows(orgId, 'versions', projectId).map(v => [v.id, v]));
  const statusNames = new Map<string, { name: string; nameFa?: string }>();
  for (const wf of loadRows(orgId, 'workflows', projectId)) {
    for (const s of (wf.statuses as Array<{ id: string; name: string; nameFa?: string }> | undefined) || []) {
      if (!statusNames.has(s.id)) statusNames.set(s.id, { name: s.name, nameFa: s.nameFa });
    }
  }

  const issues = loadRows(orgId, 'issues', projectId).filter(i => {
    if (!f.includeArchived && i.archived === true) return false;
    if (f.sprintId && i.sprintId !== f.sprintId) return false;
    if (f.versionId && !((i.fixVersionIds as string[] | undefined) || []).includes(f.versionId)) return false;
    if (f.epicId && i.epicId !== f.epicId) return false;
    if (f.assigneeId && (i.assigneeId || '') !== (f.assigneeId === 'none' ? '' : f.assigneeId)) return false;
    return true;
  });

  const dims: Record<string, Map<string, Group>> = {};
  const add = (dim: string, key: string, label: string, labelFa: string | undefined, points: number, isDone: boolean, category?: string) => {
    const m = (dims[dim] ||= new Map());
    let g = m.get(key);
    if (!g) {
      g = { key, label, labelFa, count: 0, points: 0, doneCount: 0, donePoints: 0, category };
      m.set(key, g);
    }
    g.count += 1;
    g.points += points;
    if (isDone) {
      g.doneCount += 1;
      g.donePoints += points;
    }
  };
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const totals = { count: 0, points: 0, doneCount: 0, donePoints: 0, unestimated: 0, overdue: 0, unassigned: 0, flagged: 0 };
  for (const i of issues) {
    const pts = typeof i.storyPoints === 'number' && i.storyPoints > 0 ? i.storyPoints : 0;
    const cat = done(String(i.status));
    const isDone = cat === 'done';
    totals.count++;
    totals.points += pts;
    if (isDone) {
      totals.doneCount++;
      totals.donePoints += pts;
    }
    if (i.type !== 'epic' && pts === 0) totals.unestimated++;
    if (!isDone && typeof i.dueDate === 'string' && i.dueDate.slice(0, 10) < today && i.dueDate) totals.overdue++;
    if (!i.assigneeId) totals.unassigned++;
    if (i.flagged === true) totals.flagged++;

    add('type', String(i.type), cap(String(i.type)), undefined, pts, isDone);
    add('priority', String(i.priority), cap(String(i.priority)), undefined, pts, isDone);
    const st = statusNames.get(String(i.status));
    add('status', String(i.status), st?.name || cap(String(i.status)), st?.nameFa, pts, isDone, cat);
    const u = i.assigneeId ? users.get(String(i.assigneeId)) : undefined;
    add('assignee', i.assigneeId ? String(i.assigneeId) : '', i.assigneeId ? u?.name || String(i.assigneeId) : 'Unassigned', i.assigneeId ? u?.nameFa : 'بدون مسئول', pts, isDone);
    const ep = i.epicId ? epics.get(String(i.epicId)) : undefined;
    add('epic', i.epicId ? String(i.epicId) : '', ep ? String(ep.name) : i.epicId ? String(i.epicId) : 'No epic', ep ? String(ep.nameFa || ep.name) : i.epicId ? undefined : 'بدون اپیک', pts, isDone);
    const sp = i.sprintId ? sprints.get(String(i.sprintId)) : undefined;
    add('sprint', i.sprintId ? String(i.sprintId) : '', sp ? String(sp.name) : i.sprintId ? String(i.sprintId) : 'Backlog', sp ? undefined : i.sprintId ? undefined : 'بک‌لاگ', pts, isDone);
    const vids = ((i.fixVersionIds as string[] | undefined) || []).filter(Boolean);
    if (vids.length === 0) add('version', '', 'No fix version', 'بدون نسخه', pts, isDone);
    for (const vid of vids) add('version', vid, String(versions.get(vid)?.name ?? vid), undefined, pts, isDone);
    for (const c of ((i.components as string[] | undefined) || []).filter(Boolean)) add('component', c, c, undefined, pts, isDone);
    for (const l of ((i.labels as string[] | undefined) || []).filter(Boolean)) add('label', l, l, undefined, pts, isDone);
    add('resolution', i.resolution ? String(i.resolution) : '', i.resolution ? cap(String(i.resolution)) : 'Unresolved', i.resolution ? undefined : 'حل‌نشده', pts, isDone);
  }

  const ordered: Record<string, Group[]> = {};
  const fixedOrder: Record<string, string[]> = {
    type: ['epic', 'story', 'feature', 'task', 'bug', 'subtask'],
    priority: ['highest', 'high', 'medium', 'low', 'lowest'],
  };
  for (const [dim, m] of Object.entries(dims)) {
    const list = [...m.values()];
    const fixed = fixedOrder[dim];
    list.sort((a, b) => (fixed ? fixed.indexOf(a.key) - fixed.indexOf(b.key) : b.count - a.count || a.label.localeCompare(b.label)));
    ordered[dim] = list;
  }
  return { projectId, generatedAt: new Date().toISOString(), filters: f, totals, dimensions: ordered };
}
