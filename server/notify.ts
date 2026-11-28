import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { db } from './db.ts';
import { PermanentJobError, enqueueJob, registerJobHandler } from './jobs.ts';
import type { Job } from './jobs.ts';
import { applyBatch, getRecord, getUserRow } from './repo.ts';
import type { Actor } from './permissions.ts';

type Rec = Record<string, unknown>;

const SYSTEM_ACTOR = (orgId: string): Actor => ({ userId: 'system', orgId, email: 'system@jiraflow.local', role: 'admin' });

// ---------------------------------------------------------------------------
// Email transport (optional): set SMTP_URL, e.g. smtp://user:pass@smtp.example.com:587
// ---------------------------------------------------------------------------

let transport: Transporter | null | undefined;
function getTransport(): Transporter | null {
  if (transport !== undefined) return transport;
  const url = process.env.SMTP_URL?.trim();
  transport = url ? nodemailer.createTransport(url) : null;
  return transport;
}

export function isEmailEnabled(): boolean {
  return Boolean(process.env.SMTP_URL?.trim());
}

/** Test hook: swap the transport (used by automated tests only). */
export function setMailTransportForTests(t: Transporter | null): void {
  transport = t;
}

registerJobHandler('email.send', async (job: Job) => {
  const t = getTransport();
  if (!t) throw new PermanentJobError('SMTP is not configured (set SMTP_URL).');
  const { to, subject, text } = job.payload as { to?: string; subject?: string; text?: string };
  if (!to || !subject) throw new PermanentJobError('Email job is missing recipient or subject.');
  await t.sendMail({
    from: process.env.MAIL_FROM || 'JiraFlow <no-reply@jiraflow.local>',
    to,
    subject,
    text: text || '',
  });
});

// ---------------------------------------------------------------------------
// In-app notifications
// ---------------------------------------------------------------------------

interface NotifyPayload {
  event: 'created' | 'transitioned' | 'assigned' | 'commented' | 'subtasks_done';
  issueId: string;
  actorId: string;
  from?: string;
  to?: string;
  commentId?: string;
  authorId?: string;
}

function userName(id: string): { en: string; fa: string } {
  const row = getUserRow(id);
  if (!row) return { en: 'Someone', fa: 'یک کاربر' };
  const p = JSON.parse(row.profile) as { name?: string; nameFa?: string };
  return { en: p.name || row.email, fa: p.nameFa || p.name || row.email };
}

function statusName(orgId: string, projectId: string, statusId: string): { en: string; fa: string } {
  const rows = db
    .prepare("SELECT data FROM records WHERE collection = 'workflows' AND org_id = ? AND deleted = 0 AND project_id = ?")
    .all(orgId, projectId) as unknown as Array<{ data: string }>;
  for (const r of rows) {
    const wf = JSON.parse(r.data) as { statuses: Array<{ id: string; name: string; nameFa?: string }> };
    const st = wf.statuses.find(s => s.id === statusId);
    if (st) return { en: st.name, fa: st.nameFa || st.name };
  }
  return { en: statusId, fa: statusId };
}

registerJobHandler('issue.notify', async (job: Job) => {
  const p = job.payload as unknown as NotifyPayload;
  const orgId = job.orgId;
  const issueRec = getRecord(orgId, 'issues', p.issueId);
  if (!issueRec) return; // issue deleted meanwhile: nothing to notify about
  const issue = issueRec.record;
  const project = getRecord(orgId, 'projects', String(issue.projectId))?.record;
  const settings = ((project?.notifications as Rec | undefined) || {}) as {
    onCreated?: boolean;
    onTransitioned?: boolean;
    onCommented?: boolean;
    onAssigned?: boolean;
  };
  const enabled =
    p.event === 'created'
      ? settings.onCreated !== false
      : p.event === 'transitioned'
      ? settings.onTransitioned !== false
      : p.event === 'commented'
      ? settings.onCommented !== false
      : p.event === 'assigned'
      ? settings.onAssigned !== false
      : false;
  if (!enabled) return;

  const actorId = p.event === 'commented' ? p.authorId || p.actorId : p.actorId;
  const actor = userName(actorId);
  const key = String(issue.key);
  const summary = String(issue.summary);

  const recipients = new Set<string>();
  const add = (id: unknown) => typeof id === 'string' && id && recipients.add(id);
  if (p.event === 'assigned') add(p.to);
  else if (p.event === 'created') add(issue.assigneeId);
  else {
    add(issue.assigneeId);
    add(issue.reporterId);
    for (const w of (issue.watchers as string[] | undefined) || []) add(w);
  }
  recipients.delete(actorId);

  let kind: string = p.event;
  let title = '';
  let titleFa = '';
  let message = summary;
  if (p.event === 'created') {
    title = `${actor.en} created ${key}`;
    titleFa = `${actor.fa} تسک ${key} را ایجاد کرد`;
  } else if (p.event === 'assigned') {
    title = `${actor.en} assigned ${key} to you`;
    titleFa = `${actor.fa} تسک ${key} را به شما محول کرد`;
  } else if (p.event === 'transitioned') {
    const to = statusName(orgId, String(issue.projectId), String(p.to));
    title = `${actor.en} moved ${key} to ${to.en}`;
    titleFa = `${actor.fa} تسک ${key} را به «${to.fa}» منتقل کرد`;
  } else if (p.event === 'commented') {
    const comment = (issue.comments as Array<{ id: string; content: string }>).find(c => c.id === p.commentId);
    title = `${actor.en} commented on ${key}`;
    titleFa = `${actor.fa} روی ${key} دیدگاه ثبت کرد`;
    message = comment ? comment.content.slice(0, 500) : summary;
  } else {
    return;
  }

  const live: string[] = [];
  for (const id of recipients) {
    const row = getUserRow(id);
    if (row && row.org_id === orgId && row.status === 'active') live.push(id);
  }
  if (live.length === 0) return;

  const now = new Date().toISOString();
  await applyBatch(
    SYSTEM_ACTOR(orgId),
    live.map(uid => ({
      collection: 'notifications',
      op: 'upsert' as const,
      id: `ntf-${job.id}-${uid}`, // deterministic: a retried job never duplicates notifications
      data: {
        id: `ntf-${job.id}-${uid}`,
        userId: uid,
        kind,
        title,
        titleFa,
        message,
        issueKey: key,
        issueId: p.issueId,
        actorId,
        createdAt: now,
        read: false,
      },
    })),
    { system: true }
  );

  if (isEmailEnabled()) {
    for (const uid of live) {
      const row = getUserRow(uid);
      if (!row) continue;
      enqueueJob(
        orgId,
        'email.send',
        { to: row.email, subject: `[${key}] ${title}`, text: `${title}\n\n${summary}\n\n${message !== summary ? message : ''}`.trim() },
        { maxAttempts: 6, dedupeKey: `email-${job.id}-${uid}` }
      );
    }
  }
});

/** Server-side creation of a notification for a single user (used by automation actions). */
export async function notifyUser(
  orgId: string,
  userId: string,
  data: { id: string; kind: 'automation' | 'system'; title: string; titleFa?: string; message: string; issueKey?: string; issueId?: string }
): Promise<void> {
  await applyBatch(
    SYSTEM_ACTOR(orgId),
    [
      {
        collection: 'notifications',
        op: 'upsert',
        id: data.id,
        data: { ...data, userId, createdAt: new Date().toISOString(), read: false, titleFa: data.titleFa || data.title },
      },
    ],
    { system: true }
  );
  const row = getUserRow(userId);
  if (row && isEmailEnabled()) {
    enqueueJob(orgId, 'email.send', { to: row.email, subject: data.title, text: data.message }, { dedupeKey: `email-${data.id}` });
  }
}
