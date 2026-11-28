import { db } from './db.ts';
import { enqueueJob } from './jobs.ts';

type Rec = Record<string, unknown>;

export interface IssueEventInput {
  orgId: string;
  actorId: string;
  before: Rec | null;
  after: Rec;
  newComments: Array<{ id: string; authorId: string }>;
}

interface RuleRow {
  id: string;
  data: string;
}

export function isDoneStatus(orgId: string, projectId: string, statusId: string): boolean {
  if (statusId === 'done') return true;
  const rows = db
    .prepare("SELECT data FROM records WHERE collection = 'workflows' AND org_id = ? AND deleted = 0 AND project_id = ?")
    .all(orgId, projectId) as unknown as Array<{ data: string }>;
  for (const r of rows) {
    const wf = JSON.parse(r.data) as { statuses: Array<{ id: string; category: string }> };
    const st = wf.statuses.find(s => s.id === statusId);
    if (st) return st.category === 'done';
  }
  return false;
}

function enabledRules(orgId: string, projectId: string): Array<Rec & { id: string }> {
  const rows = db
    .prepare("SELECT id, data FROM records WHERE collection = 'automationRules' AND org_id = ? AND deleted = 0 AND project_id = ?")
    .all(orgId, projectId) as unknown as RuleRow[];
  return rows.map(r => JSON.parse(r.data) as Rec & { id: string }).filter(r => r.enabled === true);
}

/**
 * Turns a committed issue change into follow-up background jobs (called inside the write transaction):
 *  - issue.notify: in-app / email notifications for the people involved
 *  - automation.exec: one job per matching automation rule, so each rule retries independently
 */
export function emitIssueEvents(input: IssueEventInput): void {
  const { orgId, actorId, before, after, newComments } = input;
  const issueId = after.id as string;
  const projectId = after.projectId as string;

  type Ev = { event: 'created' | 'transitioned' | 'assigned' | 'commented' | 'subtasks_done'; [k: string]: unknown };
  const events: Ev[] = [];

  if (!before) {
    events.push({ event: 'created' });
  } else {
    if (before.status !== after.status) events.push({ event: 'transitioned', from: before.status, to: after.status });
    if (before.assigneeId !== after.assigneeId && after.assigneeId) events.push({ event: 'assigned', to: after.assigneeId });
    const subs = (after.subtasks as Array<{ isCompleted?: boolean }> | undefined) || [];
    const prevSubs = (before.subtasks as Array<{ isCompleted?: boolean }> | undefined) || [];
    const allDone = subs.length > 0 && subs.every(s => s.isCompleted);
    const wasAllDone = prevSubs.length > 0 && prevSubs.every(s => s.isCompleted);
    if (allDone && !wasAllDone) events.push({ event: 'subtasks_done' });
  }
  for (const c of newComments) events.push({ event: 'commented', commentId: c.id, authorId: c.authorId });
  if (events.length === 0) return;

  let rules: Array<Rec & { id: string }> | null = null;
  const getRules = () => (rules ??= enabledRules(orgId, projectId));

  for (const ev of events) {
    const base = { ...ev, issueId, actorId };
    // Notifications
    enqueueJob(orgId, 'issue.notify', base, { maxAttempts: 5 });

    // Automation rules
    for (const rule of getRules()) {
      let matches = false;
      if (ev.event === 'created') matches = rule.trigger === 'issue_created';
      else if (ev.event === 'transitioned') {
        matches =
          (rule.trigger === 'issue_transitioned' && (!rule.triggerTargetStatus || rule.triggerTargetStatus === ev.to)) ||
          // roll-up rules (close parent epic) are evaluated whenever an item reaches a done status
          (rule.trigger === 'subtasks_all_done' && rule.action === 'close_parent' && isDoneStatus(orgId, projectId, String(ev.to)));
      } else if (ev.event === 'subtasks_done') matches = rule.trigger === 'subtasks_all_done';
      if (!matches) continue;
      enqueueJob(
        orgId,
        'automation.exec',
        { ruleId: rule.id, issueId, event: ev.event, to: ev.to ?? null, actorId },
        { maxAttempts: 4 }
      );
    }
  }
}
