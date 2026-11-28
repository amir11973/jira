import dns from 'node:dns/promises';
import net from 'node:net';
import { PermanentJobError, registerJobHandler } from './jobs.ts';
import type { Job } from './jobs.ts';
import { applyBatch, getRecord, getUserRow } from './repo.ts';
import type { BatchOp } from './repo.ts';
import { isDoneStatus } from './events.ts';
import { notifyUser } from './notify.ts';
import { db } from './db.ts';
import type { Actor } from './permissions.ts';

type Rec = Record<string, unknown>;

const AUTOMATION_ACTOR = (orgId: string): Actor => ({
  userId: 'automation',
  orgId,
  email: 'automation@jiraflow.local',
  role: 'admin',
});

interface ExecPayload {
  ruleId: string;
  issueId: string;
  event: string;
  to: string | null;
  actorId: string;
}

interface Outcome {
  status: 'success' | 'skipped';
  message: string;
  issuePatch?: Rec;
  epicPatch?: { id: string; status: string };
}

// ---------------------------------------------------------------------------
// Webhook delivery (SSRF-safe)
// ---------------------------------------------------------------------------

function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.') || v.startsWith('::ffff:10.') || v.startsWith('::ffff:192.168.');
}

export async function assertWebhookUrlAllowed(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new PermanentJobError('Webhook URL is not a valid URL.');
  }
  const allowPrivate = process.env.AUTOMATION_ALLOW_PRIVATE_WEBHOOKS === 'true';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && allowPrivate)) {
    throw new PermanentJobError('Webhook URLs must use https.');
  }
  if (url.username || url.password) throw new PermanentJobError('Webhook URLs must not embed credentials.');
  if (!allowPrivate) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
    if (addrs.length === 0 || addrs.some(a => isPrivateAddress(a.address))) {
      throw new PermanentJobError('Webhook target resolves to a private or loopback address and is blocked.');
    }
  }
  return url;
}

async function postWebhook(rawUrl: string, body: unknown): Promise<void> {
  const url = await assertWebhookUrlAllowed(rawUrl);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'JiraFlow-Automation/1.0' },
      body: JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    throw new Error(`Webhook request failed: ${(err as Error).message}`);
  }
  if (res.status >= 300 && res.status < 400) throw new PermanentJobError(`Webhook responded with a redirect (${res.status}); redirects are not followed.`);
  if (res.status === 408 || res.status === 429 || res.status >= 500) throw new Error(`Webhook responded with HTTP ${res.status}.`);
  if (res.status >= 400) throw new PermanentJobError(`Webhook rejected the request with HTTP ${res.status}.`);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function displayName(userId: string): string {
  const row = getUserRow(userId);
  if (!row) return userId;
  return (JSON.parse(row.profile) as { name?: string }).name || row.email;
}

async function runAction(job: Job, rule: Rec, issue: Rec, payload: ExecPayload): Promise<Outcome> {
  const orgId = job.orgId;
  const projectId = String(issue.projectId);
  const action = String(rule.action);

  switch (action) {
    case 'auto_assign_mover': {
      if (issue.assigneeId) return { status: 'skipped', message: `Already assigned to ${displayName(String(issue.assigneeId))}.` };
      const actor = getUserRow(payload.actorId);
      if (!actor || actor.status !== 'active') return { status: 'skipped', message: 'The user who moved the item is not an active user.' };
      return {
        status: 'success',
        message: `Auto-assigned to ${displayName(actor.id)}.`,
        issuePatch: { assigneeId: actor.id },
      };
    }
    case 'unflag_issue': {
      if (!payload.to || !isDoneStatus(orgId, projectId, payload.to)) {
        return { status: 'skipped', message: 'Item is not in a done status.' };
      }
      return {
        status: 'success',
        message: 'Resolution set to Done and Flagged cleared.',
        issuePatch: { flagged: false, resolution: issue.resolution || 'Done' },
      };
    }
    case 'set_resolution_done': {
      if (issue.resolution) return { status: 'skipped', message: `Resolution already set (${String(issue.resolution)}).` };
      return { status: 'success', message: 'Resolution set to Done.', issuePatch: { resolution: 'Done' } };
    }
    case 'add_watcher_lead': {
      const project = getRecord(orgId, 'projects', projectId)?.record;
      const lead = project?.leadId as string | undefined;
      const watchers = (issue.watchers as string[] | undefined) || [];
      if (!lead) return { status: 'skipped', message: 'The space has no lead.' };
      if (watchers.includes(lead)) return { status: 'skipped', message: 'The space lead already watches this item.' };
      return { status: 'success', message: `Added ${displayName(lead)} as a watcher.`, issuePatch: { watchers: [...watchers, lead] } };
    }
    case 'close_parent': {
      const epicId = issue.epicId as string | null | undefined;
      if (!epicId) return { status: 'skipped', message: 'The item has no parent epic.' };
      const epic = getRecord(orgId, 'epics', epicId)?.record;
      if (!epic) return { status: 'skipped', message: 'Parent epic no longer exists.' };
      if (epic.status === 'done') return { status: 'skipped', message: 'Parent epic is already done.' };
      const siblings = (
        db
          .prepare("SELECT data FROM records WHERE collection = 'issues' AND org_id = ? AND deleted = 0 AND id != ? AND json_extract(data, '$.epicId') = ?")
          .all(orgId, issue.id as string, epicId) as unknown as Array<{ data: string }>
      ).map(r => JSON.parse(r.data) as Rec);
      const open = siblings.filter(s => !s.archived && s.type !== 'epic' && !isDoneStatus(orgId, projectId, String(s.status)));
      const selfDone = isDoneStatus(orgId, projectId, String(issue.status));
      if (!selfDone || open.length > 0) {
        return { status: 'skipped', message: `${open.length + (selfDone ? 0 : 1)} child item(s) are not done yet.` };
      }
      return {
        status: 'success',
        message: `Parent epic ${String(epic.key)} marked Done.`,
        epicPatch: { id: epicId, status: 'done' },
      };
    }
    case 'notify_assignee': {
      const assignee = issue.assigneeId as string | null | undefined;
      if (!assignee) return { status: 'skipped', message: 'The item has no assignee.' };
      await notifyUser(orgId, assignee, {
        id: `ntf-auto-${job.id}`,
        kind: 'automation',
        title: `Automation: ${String(rule.name)} (${String(issue.key)})`,
        titleFa: `اتوماسیون: ${String(rule.nameFa || rule.name)} (${String(issue.key)})`,
        message: String(issue.summary),
        issueKey: String(issue.key),
        issueId: String(issue.id),
      });
      return { status: 'success', message: `Notified ${displayName(assignee)}.` };
    }
    case 'send_webhook': {
      const url = ((rule.actionConfig as Record<string, string> | undefined) || {}).url;
      if (!url) throw new PermanentJobError('The rule has no webhook URL configured.');
      await postWebhook(url, {
        source: 'jiraflow',
        rule: { id: rule.id, name: rule.name },
        event: payload.event,
        issue: { id: issue.id, key: issue.key, summary: issue.summary, status: issue.status, priority: issue.priority },
        at: new Date().toISOString(),
      });
      return { status: 'success', message: 'Webhook delivered.' };
    }
    default:
      throw new PermanentJobError(`Unknown automation action "${action}".`);
  }
}

// ---------------------------------------------------------------------------
// Job handler
// ---------------------------------------------------------------------------

registerJobHandler('automation.exec', async (job: Job) => {
  const payload = job.payload as unknown as ExecPayload;
  const orgId = job.orgId;
  const rule = getRecord(orgId, 'automationRules', payload.ruleId);
  const issueRec = getRecord(orgId, 'issues', payload.issueId);
  if (!rule || !issueRec || rule.record.enabled !== true) return; // rule disabled/removed or issue deleted: nothing to do
  const issue = issueRec.record;
  const projectId = String(issue.projectId);
  const logId = `alog-job-${job.id}`;
  const now = new Date().toISOString();
  const actor = AUTOMATION_ACTOR(orgId);

  const logOp = (status: 'success' | 'skipped' | 'failed' | 'retrying', details: string): BatchOp => ({
    collection: 'automationLogs',
    op: 'upsert',
    id: logId,
    data: {
      id: logId,
      projectId,
      ruleId: payload.ruleId,
      ruleName: String(rule.record.name),
      issueKey: String(issue.key),
      status,
      details: details.slice(0, 1900),
      timestamp: now,
      jobId: job.id,
      attempts: job.attempts,
    },
  });

  let outcome: Outcome;
  try {
    outcome = await runAction(job, rule.record, issue, payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const finalFailure = err instanceof PermanentJobError || job.attempts >= job.maxAttempts;
    try {
      await applyBatch(actor, [logOp(finalFailure ? 'failed' : 'retrying', message)], { system: true });
    } catch (logErr) {
      console.error('[automation] could not record failure log:', logErr);
    }
    throw err;
  }

  const ops: BatchOp[] = [logOp(outcome.status, outcome.message)];
  const executions = (issue.automationExecutions as Rec[] | undefined) || [];
  const execEntry = {
    id: `ae-job-${job.id}`,
    ruleId: payload.ruleId,
    ruleName: String(rule.record.name),
    status: outcome.status,
    message: outcome.message,
    executedAt: now,
  };
  const issueData: Rec = {
    ...issue,
    ...(outcome.issuePatch || {}),
    automationExecutions: [execEntry, ...executions.filter(e => e.id !== execEntry.id)].slice(0, 100),
  };
  ops.push({ collection: 'issues', op: 'upsert', id: payload.issueId, data: issueData, baseVersion: issueRec.version });
  if (outcome.epicPatch) {
    const epic = getRecord(orgId, 'epics', outcome.epicPatch.id);
    if (epic) ops.push({ collection: 'epics', op: 'upsert', id: epic.record.id as string, data: { ...epic.record, status: outcome.epicPatch.status } });
  }
  if (outcome.status === 'success') {
    ops.push({
      collection: 'automationRules',
      op: 'upsert',
      id: payload.ruleId,
      data: { ...rule.record, executionsCount: (Number(rule.record.executionsCount) || 0) + 1 },
    });
  }
  // A version conflict (someone edited the issue meanwhile) throws and the job is retried with fresh data.
  await applyBatch(actor, ops, { system: true, audit: true, suppressEvents: true });
});
