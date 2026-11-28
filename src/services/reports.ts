import { useEffect, useMemo, useRef, useState } from 'react';
import { api, describeApiError } from './api';
import { useJira } from '../context/JiraContext';

/** Response shapes of the server-side report / planning endpoints (server/reports.ts, server/planning.ts). */

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

export interface BurndownPoint {
  date: string;
  ideal: number;
  remaining: number | null;
  scope: number | null;
  completed: number | null;
  isToday: boolean;
}

export interface BurndownReport {
  sprint: { id: string; projectId: string; name: string; goal: string; status: string; startDate: string | null; endDate: string | null };
  state: 'planned' | 'active' | 'completed';
  metric: 'points' | 'count';
  canToggleMetric?: boolean;
  committed?: number;
  scopeAdded?: number;
  scopeRemoved?: number;
  scope?: number;
  completed?: number;
  remaining?: number;
  burnRate?: number;
  forecast?: 'completed' | 'ahead' | 'on_track' | 'behind' | 'no_scope';
  projectedFinishDate?: string | null;
  plannedEndDate?: string;
  series: BurndownPoint[];
  estimated: boolean;
}

export interface VelocitySprint {
  sprintId: string;
  name: string;
  startDate: string;
  endDate: string;
  committedPoints: number;
  committedCount: number;
  addedPoints: number;
  addedCount: number;
  completedPoints: number;
  completedCount: number;
  incompletePoints: number;
  incompleteCount: number;
  completionRate: number;
  estimated: boolean;
}

export interface VelocityReport {
  hasPoints: boolean;
  sprints: VelocitySprint[];
  averageCompletedPoints: number;
  averageCompletedCount: number;
  averageWindow: number;
  estimated: boolean;
}

export interface BreakdownGroup {
  key: string;
  label: string;
  labelFa?: string;
  count: number;
  points: number;
  doneCount: number;
  donePoints: number;
  category?: string;
}

export interface BreakdownReport {
  totals: { count: number; points: number; doneCount: number; donePoints: number; unestimated: number; overdue: number; unassigned: number; flagged: number };
  dimensions: Record<string, BreakdownGroup[]>;
}

export type Health = 'completed' | 'overdue' | 'blocked' | 'at_risk' | 'not_started' | 'on_track';

export interface GoalView {
  id: string;
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

export interface MilestoneView {
  id: string;
  progress: Progress;
  health: Health;
  overdue: boolean;
  daysRemaining: number | null;
  blockedBy: Array<{ id: string; title: string }>;
  workItemCount: number;
}

export interface GoalsReport {
  today: string;
  goals: GoalView[];
  milestones: MilestoneView[];
}

export type ReleaseHealth = 'released' | 'overdue' | 'at_risk' | 'on_track' | 'no_scope';

export interface ReleaseView {
  id: string;
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

export interface ReleasesReport {
  today: string;
  releases: ReleaseView[];
}

export interface Schedule {
  startDate: string | null;
  dueDate: string | null;
  source: 'epic' | 'issues' | 'sprints' | 'none';
}

export interface RoadmapChild {
  id: string;
  key: string;
  summary: string;
  type: string;
  status: string;
  category: 'todo' | 'inprogress' | 'done';
  schedule: Schedule;
}

export interface RoadmapEpic {
  id: string;
  progress: Progress;
  schedule: Schedule;
  effectiveStatus: 'todo' | 'inprogress' | 'done';
  slipping: boolean;
  overdue: boolean;
  children: RoadmapChild[];
}

export interface RoadmapReport {
  today: string;
  epics: RoadmapEpic[];
  sprints: Array<{ id: string; name: string; status: string; startDate: string | null; endDate: string | null; progress: Progress }>;
  releases: Array<{ id: string; name: string; startDate?: string | null; releaseDate?: string | null; isReleased: boolean; health: ReleaseHealth; progress: Progress; openIssueCount: number }>;
  milestones: Array<{ id: string; title: string; titleFa?: string; startDate?: string; dueDate?: string; health: Health; progress: Progress }>;
  unassignedWorkItems: number;
}

export interface ReportState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Fetches a server-computed report and keeps it live: it reloads whenever the underlying work data changes
 * (debounced, and only after local edits have been saved so the server sees them).
 */
export function useReport<T>(path: string | null, scope: 'issues' | 'planning' = 'issues'): ReportState<T> {
  const { issues, sprints, versions, epics, goals, milestones, syncStatus } = useJira();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const lastPath = useRef<string | null>(null);

  const signature = useMemo(() => {
    const parts: string[] = [];
    for (const i of issues) {
      parts.push(
        `${i.id}|${i.status}|${i.sprintId ?? ''}|${i.storyPoints ?? ''}|${i.archived ? 1 : 0}|${i.epicId ?? ''}|${(i.fixVersionIds || []).join(',')}|${i.assigneeId ?? ''}|${i.priority}|${i.type}|${i.startDate ?? ''}|${i.dueDate ?? ''}|${(i.labels || []).join(',')}|${(i.components || []).join(',')}|${i.resolution ?? ''}`
      );
    }
    for (const s of sprints) parts.push(`${s.id}|${s.status}|${s.startDate ?? ''}|${s.endDate ?? ''}|${s.completedAt ?? ''}`);
    if (scope === 'planning') {
      for (const v of versions) parts.push(`${v.id}|${v.isReleased}|${v.releaseDate ?? ''}|${v.startDate ?? ''}|${v.name}`);
      for (const e of epics) parts.push(`${e.id}|${e.status}|${e.startDate}|${e.dueDate}`);
      parts.push(JSON.stringify(goals), JSON.stringify(milestones));
    }
    return parts.join('\n');
  }, [issues, sprints, versions, epics, goals, milestones, scope]);

  const settled = syncStatus.pending === 0 && syncStatus.state !== 'saving';

  useEffect(() => {
    if (path === null) {
      setData(null);
      setLoading(false);
      return;
    }
    if (!settled) return;
    let cancelled = false;
    const pathChanged = lastPath.current !== path;
    lastPath.current = path;
    if (pathChanged) setLoading(true);
    const timer = window.setTimeout(
      () => {
        api
          .get<T>(path)
          .then(res => {
            if (cancelled) return;
            setData(res);
            setError(null);
          })
          .catch(err => {
            if (!cancelled) setError(describeApiError(err));
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      },
      pathChanged ? 0 : 400
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [path, signature, settled, syncStatus.lastSavedAt, nonce]);

  return { data, loading, error, reload: () => setNonce(n => n + 1) };
}
