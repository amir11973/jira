import { db } from './db.ts';

/**
 * Planning data derived from live work items: goals, milestones, releases (versions) and the roadmap.
 * Progress is always computed from the current issues / versions / sprints, never stored, so it cannot drift.
 * The same module validates writes to goals, milestones and versions (dependencies, dates, completion rules).
 */

type Rec = Record<string, unknown>;
type Row = Rec & { id: string };
export type Category = 'todo' | 'inprogress' | 'done';

export interface PlanningIssue {
  id: string;
  key: string;
  summary: string;
  type: string;
  status: string;
  category: Category;
  priority?: string;
  assigneeId: string | null;
  epicId: string | null;
  sprintId: string | null;
  storyPoints: number;
  startDate: string | null;
  dueDate: string | null;
  fixVersionIds: string[];
}

export interface Progress {
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  totalPoints: number;
  donePoints: number;
  percent: number;
  basis: 'points' | 'count' | 'manual' | 'none';
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export function loadRows(orgId: string, collection: string, projectId?: string | null): Row[] {
  const rows = (
    projectId
      ? db
          .prepare('SELECT data FROM records WHERE collection = ? AND org_id = ? AND deleted = 0 AND project_id = ?')
          .all(collection, orgId, projectId)
      : db.prepare('SELECT data FROM records WHERE collection = ? AND org_id = ? AND deleted = 0').all(collection, orgId)
  ) as unknown as Array<{ data: string }>;
  return rows.map(r => JSON.parse(r.data) as Row);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const day = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const dayMs = (d: string): number => Date.parse(`${d}T00:00:00.000Z`);
const minDay = (a: string | null, b: string | null): string | null => (a && b ? (a < b ? a : b) : a || b);
const maxDay = (a: string | null, b: string | null): string | null => (a && b ? (a > b ? a : b) : a || b);
const daysBetween = (from: string, to: string): number => Math.round((dayMs(to) - dayMs(from)) / 86_400_000);

export function categoryResolver(orgId: string, projectId: string | null): (statusId: string) => Category {
  const map = new Map<string, Category>();
  for (const wf of loadRows(orgId, 'workflows', projectId)) {
    for (const s of (wf.statuses as Array<{ id: string; category: Category }> | undefined) || []) {
      if (!map.has(s.id)) map.set(s.id, s.category);
    }
  }
  return id => {
    const known = map.get(id);
    if (known) return known;
    if (id === 'done') return 'done';
    if (id === 'inprogress' || id === 'review') return 'inprogress';
    return 'todo';
  };
}

export interface PlanningData {
  orgId: string;
  projectId: string | null;
  today: string;
  issues: PlanningIssue[]; // work items (no epics / sub-tasks / archived)
  issueById: Map<string, PlanningIssue>;
  epics: Row[];
  sprints: Row[];
  versions: Row[];
  goals: Row[];
  milestones: Row[];
  category: (statusId: string) => Category;
}

export function loadPlanningData(orgId: string, projectId: string | null): PlanningData {
  const category = categoryResolver(orgId, projectId);
  const issues: PlanningIssue[] = [];
  for (const i of loadRows(orgId, 'issues', projectId)) {
    if (i.archived === true || i.type === 'epic' || i.type === 'subtask') continue;
    const points = typeof i.storyPoints === 'number' && i.storyPoints > 0 ? i.storyPoints : 0;
    issues.push({
      id: i.id,
      key: String(i.key),
      summary: String(i.summary ?? ''),
      type: String(i.type),
      status: String(i.status),
      category: category(String(i.status)),
      priority: typeof i.priority === 'string' ? i.priority : undefined,
      assigneeId: typeof i.assigneeId === 'string' ? i.assigneeId : null,
      epicId: typeof i.epicId === 'string' && i.epicId ? i.epicId : null,
      sprintId: typeof i.sprintId === 'string' && i.sprintId ? i.sprintId : null,
      storyPoints: points,
      startDate: day(i.startDate),
      dueDate: day(i.dueDate),
      fixVersionIds: Array.isArray(i.fixVersionIds) ? (i.fixVersionIds as string[]) : [],
    });
  }
  return {
    orgId,
    projectId,
    today: todayIso(),
    issues,
    issueById: new Map(issues.map(i => [i.id, i])),
    epics: loadRows(orgId, 'epics', projectId),
    sprints: loadRows(orgId, 'sprints', projectId),
    versions: loadRows(orgId, 'versions', projectId),
    goals: loadRows(orgId, 'goals', projectId),
    milestones: loadRows(orgId, 'milestones', projectId),
    category,
  };
}

export function progressOf(items: PlanningIssue[]): Progress {
  const p: Progress = { total: items.length, done: 0, inProgress: 0, todo: 0, totalPoints: 0, donePoints: 0, percent: 0, basis: 'none' };
  for (const i of items) {
    p.totalPoints += i.storyPoints;
    if (i.category === 'done') {
      p.done++;
      p.donePoints += i.storyPoints;
    } else if (i.category === 'inprogress') p.inProgress++;
    else p.todo++;
  }
  if (p.totalPoints > 0) {
    p.percent = Math.round((p.donePoints / p.totalPoints) * 100);
    p.basis = 'points';
  } else if (p.total > 0) {
    p.percent = Math.round((p.done / p.total) * 100);
    p.basis = 'count';
  }
  return p;
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

function uniqueIssues(data: PlanningData, groups: PlanningIssue[][]): PlanningIssue[] {
  const seen = new Map<string, PlanningIssue>();
  for (const g of groups) for (const i of g) seen.set(i.id, i);
  return [...seen.values()];
}

function milestoneItems(data: PlanningData, m: Rec): PlanningIssue[] {
  const byEpic = m.epicId ? data.issues.filter(i => i.epicId === m.epicId) : [];
  const linked = arr(m.linkedIssueIds)
    .map(id => data.issueById.get(id))
    .filter((i): i is PlanningIssue => Boolean(i));
  return uniqueIssues(data, [byEpic, linked]);
}

function goalItems(data: PlanningData, g: Rec): PlanningIssue[] {
  const epics = new Set(arr(g.linkedEpicIds));
  const byEpic = data.issues.filter(i => i.epicId && epics.has(i.epicId));
  const linked = arr(g.linkedIssueIds)
    .map(id => data.issueById.get(id))
    .filter((i): i is PlanningIssue => Boolean(i));
  const viaMilestones = arr(g.linkedMilestoneIds).flatMap(mid => {
    const m = data.milestones.find(x => x.id === mid);
    return m ? milestoneItems(data, m) : [];
  });
  return uniqueIssues(data, [byEpic, linked, viaMilestones]);
}

export function goalProgress(data: PlanningData, g: Rec): Progress {
  if (g.progressMode === 'manual') {
    const pct = typeof g.manualProgress === 'number' ? Math.round(g.manualProgress) : 0;
    return { total: 0, done: 0, inProgress: 0, todo: 0, totalPoints: 0, donePoints: 0, percent: pct, basis: 'manual' };
  }
  const items = goalItems(data, g);
  const p = progressOf(items);
  if (p.basis === 'none' && g.status === 'completed') p.percent = 100;
  return p;
}

export function milestoneProgress(data: PlanningData, m: Rec): Progress {
  const p = progressOf(milestoneItems(data, m));
  if (p.basis === 'none' && (m.status === 'completed' || m.status === 'achieved')) p.percent = 100;
  return p;
}

const milestoneDone = (m: Rec) => m.status === 'completed' || m.status === 'achieved';

/** A goal counts as finished when it is marked completed, or when all of its linked work is done. */
export function goalFinished(data: PlanningData, g: Rec): boolean {
  if (g.status === 'completed') return true;
  if (g.progressMode === 'manual') return false;
  const p = goalProgress(data, g);
  return p.basis !== 'none' && p.percent >= 100;
}

export function milestoneFinished(data: PlanningData, m: Rec): boolean {
  if (milestoneDone(m)) return true;
  const p = milestoneProgress(data, m);
  return p.basis !== 'none' && p.percent >= 100;
}

export type Health = 'completed' | 'overdue' | 'blocked' | 'at_risk' | 'not_started' | 'on_track';

function scheduleRisk(start: string | null, end: string | null, percent: number, today: string): boolean {
  if (!start || !end || end <= start || today <= start) return false;
  const elapsed = Math.min(1, daysBetween(start, today) / daysBetween(start, end));
  return elapsed - percent / 100 > 0.25;
}

export interface GoalView extends Rec {
  progress: Progress;
  health: Health;
  overdue: boolean;
  daysRemaining: number | null;
  readyToComplete: boolean;
  blockedBy: Array<{ id: string; title: string }>;
  blocks: Array<{ id: string; title: string }>;
  milestones: Array<{ id: string; title: string; percent: number; health: Health }>;
  workItemCount: number;
}

export interface MilestoneView extends Rec {
  progress: Progress;
  health: Health;
  overdue: boolean;
  daysRemaining: number | null;
  blockedBy: Array<{ id: string; title: string }>;
  workItemCount: number;
}

export function computeMilestones(data: PlanningData): MilestoneView[] {
  const byId = new Map(data.milestones.map(m => [m.id, m]));
  return data.milestones.map(m => {
    const progress = milestoneProgress(data, m);
    const finished = milestoneDone(m);
    const due = day(m.dueDate);
    const overdue = !finished && !!due && due < data.today;
    const blockedBy = arr(m.dependsOnMilestoneIds)
      .map(id => byId.get(id))
      .filter((d): d is Row => Boolean(d) && !milestoneFinished(data, d as Row))
      .map(d => ({ id: d.id, title: String(d.title) }));
    let health: Health;
    if (finished) health = 'completed';
    else if (overdue) health = 'overdue';
    else if (blockedBy.length > 0) health = 'blocked';
    else if (m.status === 'at_risk' || scheduleRisk(day(m.startDate), due, progress.percent, data.today)) health = 'at_risk';
    else if (progress.percent === 0 && day(m.startDate) && (day(m.startDate) as string) > data.today) health = 'not_started';
    else health = 'on_track';
    return {
      ...m,
      progress,
      health,
      overdue,
      daysRemaining: due ? daysBetween(data.today, due) : null,
      blockedBy,
      workItemCount: milestoneItems(data, m).length,
    };
  });
}

export function computeGoals(data: PlanningData): GoalView[] {
  const byId = new Map(data.goals.map(g => [g.id, g]));
  const msViews = new Map(computeMilestones(data).map(m => [m.id, m]));
  return data.goals.map(g => {
    const progress = goalProgress(data, g);
    const finished = g.status === 'completed';
    const effectivelyFinished = goalFinished(data, g);
    const target = day(g.targetDate);
    const overdue = !effectivelyFinished && !!target && target < data.today;
    const blockedBy = arr(g.dependsOnGoalIds)
      .map(id => byId.get(id))
      .filter((d): d is Row => Boolean(d) && !goalFinished(data, d as Row))
      .map(d => ({ id: d.id, title: String(d.title) }));
    const blocks = data.goals
      .filter(o => arr(o.dependsOnGoalIds).includes(g.id) && !finished)
      .map(o => ({ id: o.id, title: String(o.title) }));
    let health: Health;
    if (effectivelyFinished) health = 'completed';
    else if (overdue) health = 'overdue';
    else if (blockedBy.length > 0) health = 'blocked';
    else if (g.status === 'at_risk' || scheduleRisk(day(g.startDate), target, progress.percent, data.today)) health = 'at_risk';
    else if (progress.percent === 0 && day(g.startDate) && (day(g.startDate) as string) > data.today) health = 'not_started';
    else health = 'on_track';
    return {
      ...g,
      progress,
      health,
      overdue,
      daysRemaining: target ? daysBetween(data.today, target) : null,
      readyToComplete: !finished && effectivelyFinished,
      blockedBy,
      blocks,
      milestones: arr(g.linkedMilestoneIds)
        .map(id => msViews.get(id))
        .filter((m): m is MilestoneView => Boolean(m))
        .map(m => ({ id: String(m.id), title: String(m.title), percent: m.progress.percent, health: m.health })),
      workItemCount: goalItems(data, g).length,
    };
  });
}

// ---------------------------------------------------------------------------
// Releases
// ---------------------------------------------------------------------------

export type ReleaseHealth = 'released' | 'overdue' | 'at_risk' | 'on_track' | 'no_scope';

export interface ReleaseView extends Rec {
  progress: Progress;
  health: ReleaseHealth;
  daysToRelease: number | null;
  readyToRelease: boolean;
  derivedStartDate: string | null;
  derivedReleaseDate: string | null;
  openIssues: Array<{ id: string; key: string; summary: string; status: string; assigneeId: string | null; dueDate: string | null }>;
  openIssueCount: number;
  issueIds: string[];
}

export function computeReleases(data: PlanningData): ReleaseView[] {
  const sprintById = new Map(data.sprints.map(s => [s.id, s]));
  return data.versions.map(v => {
    const items = data.issues.filter(i => i.fixVersionIds.includes(v.id));
    const progress = progressOf(items);
    const open = items.filter(i => i.category !== 'done');
    let derivedStart: string | null = null;
    let derivedEnd: string | null = null;
    for (const i of items) {
      const sp = i.sprintId ? sprintById.get(i.sprintId) : undefined;
      derivedStart = minDay(derivedStart, i.startDate || (sp ? day(sp.startDate) : null));
    }
    for (const i of open) {
      const sp = i.sprintId ? sprintById.get(i.sprintId) : undefined;
      derivedEnd = maxDay(derivedEnd, i.dueDate || (sp ? day(sp.endDate) : null));
    }
    const releaseDate = day(v.releaseDate);
    const released = v.isReleased === true;
    let health: ReleaseHealth;
    if (released) health = 'released';
    else if (releaseDate && releaseDate < data.today) health = 'overdue';
    else if (items.length === 0) health = 'no_scope';
    else if (
      (releaseDate && derivedEnd && derivedEnd > releaseDate) ||
      (releaseDate && daysBetween(data.today, releaseDate) <= 7 && progress.percent < 80)
    ) {
      health = 'at_risk';
    } else health = 'on_track';
    return {
      ...v,
      progress,
      health,
      daysToRelease: releaseDate ? daysBetween(data.today, releaseDate) : null,
      readyToRelease: !released && items.length > 0 && open.length === 0,
      derivedStartDate: derivedStart,
      derivedReleaseDate: derivedEnd,
      openIssueCount: open.length,
      openIssues: open.slice(0, 25).map(i => ({
        id: i.id,
        key: i.key,
        summary: i.summary,
        status: i.status,
        assigneeId: i.assigneeId,
        dueDate: i.dueDate,
      })),
      issueIds: items.map(i => i.id),
    };
  });
}

// ---------------------------------------------------------------------------
// Roadmap
// ---------------------------------------------------------------------------

export interface Schedule {
  startDate: string | null;
  dueDate: string | null;
  source: 'epic' | 'issues' | 'sprints' | 'none';
}

export function computeRoadmap(data: PlanningData) {
  const sprintById = new Map(data.sprints.map(s => [s.id, s]));
  const issueSchedule = (i: PlanningIssue): Schedule => {
    if (i.startDate || i.dueDate) return { startDate: i.startDate || i.dueDate, dueDate: i.dueDate || i.startDate, source: 'issues' };
    const sp = i.sprintId ? sprintById.get(i.sprintId) : undefined;
    if (sp && (day(sp.startDate) || day(sp.endDate))) {
      return { startDate: day(sp.startDate) || day(sp.endDate), dueDate: day(sp.endDate) || day(sp.startDate), source: 'sprints' };
    }
    return { startDate: null, dueDate: null, source: 'none' };
  };

  const epics = data.epics.map(e => {
    const children = data.issues.filter(i => i.epicId === e.id);
    const progress = progressOf(children);
    const schedules = children.map(issueSchedule).filter(s => s.startDate);
    const childStart = schedules.reduce<string | null>((a, s) => minDay(a, s.startDate), null);
    const childEnd = schedules.reduce<string | null>((a, s) => maxDay(a, s.dueDate), null);
    const epicStart = day(e.startDate);
    const epicDue = day(e.dueDate);
    const schedule: Schedule =
      epicStart || epicDue
        ? { startDate: epicStart || childStart, dueDate: epicDue || childEnd, source: 'epic' }
        : childStart || childEnd
        ? { startDate: childStart, dueDate: childEnd, source: schedules.some(s => s.source === 'issues') ? 'issues' : 'sprints' }
        : { startDate: null, dueDate: null, source: 'none' };
    const effectiveStatus: 'todo' | 'inprogress' | 'done' =
      children.length === 0
        ? (e.status as 'todo' | 'inprogress' | 'done')
        : progress.done === progress.total
        ? 'done'
        : progress.done > 0 || progress.inProgress > 0
        ? 'inprogress'
        : 'todo';
    const slipping = !!epicDue && !!childEnd && childEnd > epicDue && effectiveStatus !== 'done';
    const overdue = effectiveStatus !== 'done' && !!schedule.dueDate && schedule.dueDate < data.today;
    return {
      ...e,
      progress,
      schedule,
      effectiveStatus,
      slipping,
      overdue,
      childEnd,
      children: children.map(c => ({ ...c, schedule: issueSchedule(c) })),
    };
  });

  const sprints = data.sprints.map(s => {
    const items = data.issues.filter(i => i.sprintId === s.id);
    return {
      id: s.id,
      name: s.name,
      status: s.status,
      startDate: day(s.startDate),
      endDate: day(s.endDate),
      progress: progressOf(items),
    };
  });

  return {
    today: data.today,
    epics,
    sprints,
    releases: computeReleases(data).map(r => ({
      id: r.id,
      name: r.name,
      startDate: r.startDate ?? r.derivedStartDate,
      releaseDate: r.releaseDate ?? r.derivedReleaseDate,
      isReleased: r.isReleased,
      health: r.health,
      progress: r.progress,
      openIssueCount: r.openIssueCount,
    })),
    milestones: computeMilestones(data).map(m => ({
      id: m.id,
      title: m.title,
      titleFa: m.titleFa,
      startDate: m.startDate,
      dueDate: m.dueDate,
      health: m.health,
      progress: m.progress,
    })),
    unassignedWorkItems: data.issues.filter(i => !i.epicId).length,
  };
}

// ---------------------------------------------------------------------------
// Write-time validation (called from repo.ts checkIntegrity)
// ---------------------------------------------------------------------------

export interface PlanningProblem {
  path: string;
  message: string;
}

function dateOrder(start: unknown, end: unknown, startPath: string, endPath: string, label: string): PlanningProblem[] {
  const a = day(start);
  const b = day(end);
  return a && b && a > b ? [{ path: endPath, message: `${label} must not be before the start date (${a}).` }] : [];
}

function findCycle(startId: string, depsOf: (id: string) => string[]): string[] | null {
  const path: string[] = [];
  const visiting = new Set<string>();
  const done = new Set<string>();
  const dfs = (id: string): string[] | null => {
    if (id === startId && path.length > 0) return [...path, id];
    if (done.has(id) || visiting.has(id)) return null;
    visiting.add(id);
    path.push(id);
    for (const d of depsOf(id)) {
      const hit = dfs(d);
      if (hit) return hit;
    }
    path.pop();
    visiting.delete(id);
    done.add(id);
    return null;
  };
  return dfs(startId);
}

function refsExist(orgId: string, collection: string, ids: string[], projectId: string | null, path: string, label: string): PlanningProblem[] {
  const problems: PlanningProblem[] = [];
  for (const id of ids) {
    const row = db.prepare('SELECT project_id FROM records WHERE collection = ? AND id = ? AND org_id = ? AND deleted = 0').get(collection, id, orgId) as
      | { project_id: string | null }
      | undefined;
    if (!row) problems.push({ path, message: `references an unknown ${label} "${id}"` });
    else if (projectId && row.project_id && row.project_id !== projectId) problems.push({ path, message: `${label} "${id}" belongs to a different space` });
  }
  return problems;
}

export function validateGoalPlanning(orgId: string, data: Rec, existing: Rec | null): PlanningProblem[] {
  const projectId = typeof data.projectId === 'string' && data.projectId ? data.projectId : null;
  const problems: PlanningProblem[] = [...dateOrder(data.startDate, data.targetDate, '$.startDate', '$.targetDate', 'The target date')];
  problems.push(...refsExist(orgId, 'epics', arr(data.linkedEpicIds), projectId, '$.linkedEpicIds', 'epic'));
  problems.push(...refsExist(orgId, 'issues', arr(data.linkedIssueIds), projectId, '$.linkedIssueIds', 'work item'));
  problems.push(...refsExist(orgId, 'milestones', arr(data.linkedMilestoneIds), projectId, '$.linkedMilestoneIds', 'milestone'));
  const deps = arr(data.dependsOnGoalIds);
  if (deps.includes(String(data.id))) problems.push({ path: '$.dependsOnGoalIds', message: 'A goal cannot depend on itself.' });
  problems.push(...refsExist(orgId, 'goals', deps.filter(d => d !== data.id), projectId, '$.dependsOnGoalIds', 'goal'));
  if (problems.length > 0) return problems;

  const all = loadRows(orgId, 'goals');
  const depsOf = (id: string) => (id === data.id ? deps : arr(all.find(g => g.id === id)?.dependsOnGoalIds));
  const cycle = findCycle(String(data.id), depsOf);
  if (cycle) {
    const titles = cycle.map(id => String(id === data.id ? data.title : all.find(g => g.id === id)?.title ?? id));
    return [{ path: '$.dependsOnGoalIds', message: `Circular dependency: ${titles.join(' → ')}.` }];
  }

  if (data.status === 'completed' && existing?.status !== 'completed' && deps.length > 0) {
    const pd = loadPlanningData(orgId, projectId);
    const unfinished = deps
      .map(id => pd.goals.find(g => g.id === id) || all.find(g => g.id === id))
      .filter((g): g is Row => Boolean(g) && !goalFinished(pd, g as Row));
    if (unfinished.length > 0) {
      return [{ path: '$.status', message: `Cannot complete this goal while it depends on unfinished goals: ${unfinished.map(g => `"${g.title}"`).join(', ')}.` }];
    }
  }
  return [];
}

export function validateMilestonePlanning(orgId: string, data: Rec, existing: Rec | null): PlanningProblem[] {
  const projectId = String(data.projectId);
  const problems: PlanningProblem[] = [...dateOrder(data.startDate, data.dueDate, '$.startDate', '$.dueDate', 'The due date')];
  if (data.epicId) problems.push(...refsExist(orgId, 'epics', [String(data.epicId)], projectId, '$.epicId', 'epic'));
  problems.push(...refsExist(orgId, 'issues', arr(data.linkedIssueIds), projectId, '$.linkedIssueIds', 'work item'));
  const deps = arr(data.dependsOnMilestoneIds);
  if (deps.includes(String(data.id))) problems.push({ path: '$.dependsOnMilestoneIds', message: 'A milestone cannot depend on itself.' });
  problems.push(...refsExist(orgId, 'milestones', deps.filter(d => d !== data.id), projectId, '$.dependsOnMilestoneIds', 'milestone'));
  if (problems.length > 0) return problems;

  const all = loadRows(orgId, 'milestones', projectId);
  const depsOf = (id: string) => (id === data.id ? deps : arr(all.find(m => m.id === id)?.dependsOnMilestoneIds));
  const cycle = findCycle(String(data.id), depsOf);
  if (cycle) {
    const titles = cycle.map(id => String(id === data.id ? data.title : all.find(m => m.id === id)?.title ?? id));
    return [{ path: '$.dependsOnMilestoneIds', message: `Circular dependency: ${titles.join(' → ')}.` }];
  }

  if (milestoneDone(data) && !(existing && milestoneDone(existing)) && deps.length > 0) {
    const pd = loadPlanningData(orgId, projectId);
    const unfinished = deps
      .map(id => all.find(m => m.id === id))
      .filter((m): m is Row => Boolean(m) && !milestoneFinished(pd, m as Row));
    if (unfinished.length > 0) {
      return [{ path: '$.status', message: `Cannot complete this milestone while it depends on unfinished milestones: ${unfinished.map(m => `"${m.title}"`).join(', ')}.` }];
    }
  }
  return [];
}

export function validateVersionPlanning(orgId: string, data: Rec): PlanningProblem[] {
  const problems = dateOrder(data.startDate, data.releaseDate, '$.startDate', '$.releaseDate', 'The release date');
  const dup = db
    .prepare(
      "SELECT id FROM records WHERE collection = 'versions' AND org_id = ? AND deleted = 0 AND project_id = ? AND id != ? AND LOWER(json_extract(data, '$.name')) = ?"
    )
    .get(orgId, String(data.projectId), String(data.id), String(data.name).toLowerCase());
  if (dup) problems.push({ path: '$.name', message: `A version named "${data.name}" already exists in this space.` });
  return problems;
}

export function validateIssueVersions(orgId: string, data: Rec, existing: Rec | null): PlanningProblem[] {
  const before = new Set(arr(existing?.fixVersionIds));
  const added = arr(data.fixVersionIds).filter(id => !before.has(id));
  return added.length ? refsExist(orgId, 'versions', added, String(data.projectId), '$.fixVersionIds', 'version') : [];
}

/** Fills server-controlled planning fields; returns true when the record was modified. */
export function stampPlanning(collection: string, data: Rec, existing: Rec | null, nowIso: string): boolean {
  let changed = false;
  if (collection === 'goals' || collection === 'milestones') {
    const finished = collection === 'goals' ? data.status === 'completed' : milestoneDone(data);
    if (finished) {
      const keep = typeof existing?.completedAt === 'string' ? (existing.completedAt as string) : nowIso;
      if (data.completedAt !== keep) {
        data.completedAt = keep;
        changed = true;
      }
    } else if (data.completedAt !== undefined) {
      delete data.completedAt;
      changed = true;
    }
  }
  if (collection === 'versions' && data.isReleased === true && !day(data.releaseDate)) {
    data.releaseDate = todayIso();
    changed = true;
  }
  return changed;
}
