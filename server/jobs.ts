import { db } from './db.ts';
import { writeAudit } from './audit.ts';

/**
 * Durable background job queue (SQLite backed) with leases, exponential backoff and a dead-letter state.
 * Jobs are enqueued inside the same transaction as the change that caused them (transactional outbox),
 * so a committed change always has its follow-up work and a rolled back change never does.
 */
export interface Job {
  id: number;
  orgId: string;
  type: string;
  payload: Record<string, unknown>;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  attempts: number;
  maxAttempts: number;
  runAt: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

/** Throw from a handler to fail the job immediately without retrying. */
export class PermanentJobError extends Error {}

type Handler = (job: Job) => Promise<void> | void;
const handlers = new Map<string, Handler>();

export function registerJobHandler(type: string, handler: Handler): void {
  handlers.set(type, handler);
}

interface JobRow {
  id: number;
  org_id: string;
  type: string;
  payload: string;
  status: Job['status'];
  attempts: number;
  max_attempts: number;
  run_at: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

const toJob = (r: JobRow): Job => ({
  id: r.id,
  orgId: r.org_id,
  type: r.type,
  payload: JSON.parse(r.payload) as Record<string, unknown>,
  status: r.status,
  attempts: r.attempts,
  maxAttempts: r.max_attempts,
  runAt: r.run_at,
  lastError: r.last_error,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  finishedAt: r.finished_at,
});

export function enqueueJob(
  orgId: string,
  type: string,
  payload: Record<string, unknown>,
  opts: { runAt?: number; maxAttempts?: number; dedupeKey?: string } = {}
): number | null {
  const now = new Date().toISOString();
  try {
    const res = db
      .prepare(
        `INSERT INTO jobs (org_id, type, payload, status, attempts, max_attempts, run_at, dedupe_key, created_at, updated_at)
         VALUES (?, ?, ?, 'queued', 0, ?, ?, ?, ?, ?)`
      )
      .run(orgId, type, JSON.stringify(payload), opts.maxAttempts ?? 5, opts.runAt ?? Date.now(), opts.dedupeKey ?? null, now, now);
    wake();
    return Number(res.lastInsertRowid);
  } catch (err) {
    if (String((err as Error).message).includes('UNIQUE')) return null; // duplicate dedupe key => already queued
    throw err;
  }
}

export function getJob(orgId: string, id: number): Job | undefined {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ? AND org_id = ?').get(id, orgId) as JobRow | undefined;
  return row ? toJob(row) : undefined;
}

export function listJobs(orgId: string, filter: { status?: string; type?: string; limit?: number } = {}): Job[] {
  const where = ['org_id = ?'];
  const params: Array<string | number> = [orgId];
  if (filter.status) {
    where.push('status = ?');
    params.push(filter.status);
  }
  if (filter.type) {
    where.push('type = ?');
    params.push(filter.type);
  }
  const limit = Math.min(filter.limit || 100, 500);
  return (
    db.prepare(`SELECT * FROM jobs WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ${limit}`).all(...params) as unknown as JobRow[]
  ).map(toJob);
}

export function retryJob(orgId: string, id: number): Job | undefined {
  const job = getJob(orgId, id);
  if (!job || (job.status !== 'failed' && job.status !== 'cancelled')) return undefined;
  db.prepare(
    "UPDATE jobs SET status = 'queued', attempts = 0, run_at = ?, last_error = NULL, finished_at = NULL, updated_at = ? WHERE id = ?"
  ).run(Date.now(), new Date().toISOString(), id);
  wake();
  return getJob(orgId, id);
}

export function cancelJob(orgId: string, id: number): Job | undefined {
  db.prepare("UPDATE jobs SET status = 'cancelled', updated_at = ?, finished_at = ? WHERE id = ? AND org_id = ? AND status IN ('queued','failed')").run(
    new Date().toISOString(),
    new Date().toISOString(),
    id,
    orgId
  );
  return getJob(orgId, id);
}

export function jobStats(orgId: string): Record<string, number> {
  const rows = db.prepare('SELECT status, COUNT(*) AS c FROM jobs WHERE org_id = ? GROUP BY status').all(orgId) as unknown as Array<{
    status: string;
    c: number;
  }>;
  return Object.fromEntries(rows.map(r => [r.status, r.c]));
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

const LEASE_MS = 60_000;
const TICK_MS = 1000;
let timer: ReturnType<typeof setInterval> | null = null;
let processing = false;

function wake(): void {
  if (timer && !processing) setTimeout(() => void tick(), 0);
}

function backoffMs(attempts: number): number {
  return Math.min(5 * 60_000, 5000 * 2 ** Math.max(0, attempts - 1));
}

async function runJob(job: Job): Promise<void> {
  const handler = handlers.get(job.type);
  const now = new Date().toISOString();
  if (!handler) {
    db.prepare("UPDATE jobs SET status = 'failed', last_error = ?, updated_at = ?, finished_at = ? WHERE id = ?").run(
      `No handler registered for job type "${job.type}"`,
      now,
      now,
      job.id
    );
    return;
  }
  try {
    await handler(job);
    const done = new Date().toISOString();
    db.prepare("UPDATE jobs SET status = 'done', locked_until = NULL, last_error = NULL, updated_at = ?, finished_at = ? WHERE id = ?").run(
      done,
      done,
      job.id
    );
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
    const attempts = job.attempts; // already incremented when claimed
    const permanent = err instanceof PermanentJobError;
    const finished = new Date().toISOString();
    if (permanent || attempts >= job.maxAttempts) {
      db.prepare("UPDATE jobs SET status = 'failed', locked_until = NULL, last_error = ?, updated_at = ?, finished_at = ? WHERE id = ?").run(
        message,
        finished,
        finished,
        job.id
      );
      writeAudit({
        orgId: job.orgId,
        actorId: 'system',
        actorRole: 'system',
        action: 'jobs.failed',
        status: 'failed',
        summary: `Job #${job.id} (${job.type}) failed permanently after ${attempts} attempt(s): ${message}`.slice(0, 500),
      });
    } else {
      db.prepare("UPDATE jobs SET status = 'queued', locked_until = NULL, last_error = ?, run_at = ?, updated_at = ? WHERE id = ?").run(
        message,
        Date.now() + backoffMs(attempts),
        finished,
        job.id
      );
    }
  }
}

async function tick(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    for (let i = 0; i < 50; i++) {
      const now = Date.now();
      // Claim one due job (or a job whose lease expired because the process died mid-run).
      const row = db
        .prepare(
          `SELECT * FROM jobs
            WHERE (status = 'queued' AND run_at <= ?) OR (status = 'running' AND locked_until < ?)
            ORDER BY run_at, id LIMIT 1`
        )
        .get(now, now) as JobRow | undefined;
      if (!row) break;
      db.prepare("UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_until = ?, updated_at = ? WHERE id = ?").run(
        now + LEASE_MS,
        new Date().toISOString(),
        row.id
      );
      await runJob(toJob({ ...row, attempts: row.attempts + 1 }));
    }
  } catch (err) {
    console.error('[jobs] worker tick failed:', err);
  } finally {
    processing = false;
  }
}

export function startJobWorker(): void {
  if (timer) return;
  timer = setInterval(() => void tick(), TICK_MS);
  timer.unref?.();
  void tick();
}

export function stopJobWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
