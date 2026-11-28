/**
 * Inbound webhooks: every delivery is authenticated against the endpoint secret, stored once (provider delivery
 * id makes redelivery harmless), acknowledged immediately and processed on the durable job queue with retries.
 * Failed events stay inspectable and can be replayed.
 */
import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { db, transaction } from './db.ts';
import { PermanentJobError, enqueueJob, registerJobHandler } from './jobs.ts';
import { decryptSecret, encryptSecret } from './cryptoVault.ts';
import { writeAudit } from './audit.ts';
import { integrationStore } from './store.ts';
import type { ProviderKind } from './store.ts';
import { withCredential } from './tokens.ts';
import {
  alertNewVulnerabilities,
  evaluateDeployments,
  getRepository,
  githubMap,
  gitlabMap,
  ingestScmData,
  listRepositories,
  normalizeSeverity,
  queueRepositorySync,
  reconcileDevLinks,
  repoConnectionProblem,
  repoPathOf,
} from './scm.ts';
import type { ScmRepository, ScmSnapshot } from './scm.ts';
import { handleExternalChange } from './sync.ts';

type Rec = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));
const obj = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): Rec[] => (Array.isArray(v) ? (v as Rec[]) : []);
const nowIso = () => new Date().toISOString();
const MAX_EVENTS_PER_ORG = 2000;

export interface WebhookEndpoint {
  id: string;
  organizationId: string;
  provider: ProviderKind;
  name: string;
  repoId: string | null;
  enabled: boolean;
  createdBy: string | null;
  createdAt: string;
  lastDeliveryAt: string | null;
  deliveryCount: number;
  path: string;
}

interface EndpointRow {
  id: string;
  org_id: string;
  provider: ProviderKind;
  name: string;
  repo_id: string | null;
  secret_enc: string;
  enabled: number;
  created_by: string | null;
  created_at: string;
  last_delivery_at: string | null;
  delivery_count: number;
}

const toEndpoint = (r: EndpointRow): WebhookEndpoint => ({
  id: r.id,
  organizationId: r.org_id,
  provider: r.provider,
  name: r.name,
  repoId: r.repo_id,
  enabled: Boolean(r.enabled),
  createdBy: r.created_by,
  createdAt: r.created_at,
  lastDeliveryAt: r.last_delivery_at,
  deliveryCount: r.delivery_count,
  path: `/api/webhooks/${r.id}`,
});

export function listEndpoints(orgId: string): WebhookEndpoint[] {
  return (db.prepare('SELECT * FROM integ_webhooks WHERE org_id = ? ORDER BY created_at DESC').all(orgId) as unknown as EndpointRow[]).map(toEndpoint);
}

/** The secret is returned exactly once, when the endpoint is created or rotated. */
export function createEndpoint(orgId: string, input: { provider: ProviderKind; name: string; repoId?: string | null; createdBy: string }) {
  const id = `wh_${crypto.randomBytes(18).toString('base64url')}`;
  const secret = crypto.randomBytes(32).toString('base64url');
  db.prepare(
    'INSERT INTO integ_webhooks (id, org_id, provider, name, repo_id, secret_enc, enabled, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)'
  ).run(id, orgId, input.provider, input.name.slice(0, 140), input.repoId || null, encryptSecret(secret), input.createdBy, nowIso());
  return { endpoint: listEndpoints(orgId).find(e => e.id === id)!, secret };
}

export function rotateEndpointSecret(orgId: string, id: string): string | null {
  const secret = crypto.randomBytes(32).toString('base64url');
  const res = db.prepare('UPDATE integ_webhooks SET secret_enc = ? WHERE id = ? AND org_id = ?').run(encryptSecret(secret), id, orgId);
  return Number(res.changes) ? secret : null;
}

export function setEndpointEnabled(orgId: string, id: string, enabled: boolean): boolean {
  return Number(db.prepare('UPDATE integ_webhooks SET enabled = ? WHERE id = ? AND org_id = ?').run(enabled ? 1 : 0, id, orgId).changes) > 0;
}

export function deleteEndpoint(orgId: string, id: string): boolean {
  return Number(db.prepare('DELETE FROM integ_webhooks WHERE id = ? AND org_id = ?').run(id, orgId).changes) > 0;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type EventStatus = 'received' | 'retrying' | 'processed' | 'ignored' | 'failed';

interface EventRow {
  id: number;
  org_id: string;
  webhook_id: string;
  provider: ProviderKind;
  delivery_id: string;
  event_type: string;
  payload: string;
  status: EventStatus;
  attempts: number;
  error: string | null;
  result: string | null;
  received_at: string;
  processed_at: string | null;
}

const toEvent = (r: EventRow, withPayload = false) => ({
  id: r.id,
  webhookId: r.webhook_id,
  provider: r.provider,
  deliveryId: r.delivery_id,
  eventType: r.event_type,
  status: r.status,
  attempts: r.attempts,
  error: r.error,
  result: r.result,
  receivedAt: r.received_at,
  processedAt: r.processed_at,
  ...(withPayload ? { payload: JSON.parse(r.payload) as Rec } : {}),
});

export function listEvents(orgId: string, filter: { status?: string; limit?: number } = {}) {
  const where = filter.status ? 'org_id = ? AND status = ?' : 'org_id = ?';
  const params = filter.status ? [orgId, filter.status] : [orgId];
  const limit = Math.min(Math.max(1, filter.limit || 100), 500);
  return (db.prepare(`SELECT * FROM integ_events WHERE ${where} ORDER BY id DESC LIMIT ${limit}`).all(...params) as unknown as EventRow[]).map(r => toEvent(r));
}

export function getEvent(orgId: string, id: number) {
  const r = db.prepare('SELECT * FROM integ_events WHERE id = ? AND org_id = ?').get(id, orgId) as EventRow | undefined;
  return r ? toEvent(r, true) : undefined;
}

export function replayEvent(orgId: string, id: number): boolean {
  const event = getEvent(orgId, id);
  if (!event || event.status === 'received' || event.status === 'retrying') return false;
  db.prepare("UPDATE integ_events SET status = 'received', error = NULL, result = NULL, processed_at = NULL, attempts = 0 WHERE id = ?").run(id);
  enqueueJob(orgId, 'integration.event', { eventId: id }, { maxAttempts: 5, dedupeKey: `event-${id}-replay-${Date.now()}` });
  return true;
}

// ---------------------------------------------------------------------------
// Receiver
// ---------------------------------------------------------------------------

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function verifySignature(provider: ProviderKind, headers: Record<string, unknown>, raw: Buffer, secret: string): boolean {
  const header = (n: string) => str(headers[n]);
  const expected = () => `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
  if (provider === 'github') {
    return safeEqual(header('x-hub-signature-256'), expected());
  }
  if (provider === 'gitlab') {
    return safeEqual(header('x-gitlab-token'), secret);
  }
  // Atlassian: HMAC signature (Jira / Confluence Cloud) or a shared token header (automation rules, Data Center)
  const signature = header('x-hub-signature-256') || header('x-hub-signature');
  if (signature) return safeEqual(signature, expected());
  return safeEqual(header('x-jf-webhook-token'), secret);
}

function describeDelivery(provider: ProviderKind, headers: Record<string, unknown>, body: Rec, raw: Buffer) {
  const bodyHash = () => crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  if (provider === 'github') {
    return { deliveryId: str(headers['x-github-delivery']) || bodyHash(), eventType: str(headers['x-github-event']) || 'unknown' };
  }
  if (provider === 'gitlab') {
    return {
      deliveryId: str(headers['x-gitlab-event-uuid']) || bodyHash(),
      eventType: str(headers['x-gitlab-event']) || str(body.object_kind) || 'unknown',
    };
  }
  return {
    deliveryId: str(headers['x-atlassian-webhook-identifier']) || bodyHash(),
    eventType: str(body.webhookEvent) || str(body.eventType) || str(body.event) || 'unknown',
  };
}

/** Express handler. Must be mounted with a raw body parser and without session auth / CSRF checks. */
export function receiveWebhook(req: Request, res: Response): void {
  const row = db.prepare('SELECT * FROM integ_webhooks WHERE id = ?').get(String(req.params.id)) as EndpointRow | undefined;
  if (!row || !row.enabled) {
    res.status(404).json({ error: 'Unknown webhook endpoint.' });
    return;
  }
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const secret = decryptSecret(row.secret_enc);
  if (!secret.ok || !verifySignature(row.provider, req.headers as Record<string, unknown>, raw, secret.value!)) {
    writeAudit({
      orgId: row.org_id, actorId: 'webhook', actorRole: 'system', action: 'integrations.webhook', status: 'denied',
      summary: `Rejected a delivery to webhook "${row.name}": signature or token mismatch.`, ip: req.ip,
    });
    res.status(401).json({ error: 'Signature verification failed.' });
    return;
  }
  let body: Rec;
  try {
    let text = raw.toString('utf8');
    // GitHub can be configured to send application/x-www-form-urlencoded
    if (str(req.headers['content-type']).includes('application/x-www-form-urlencoded')) text = new URLSearchParams(text).get('payload') || '';
    body = JSON.parse(text) as Rec;
    if (!body || typeof body !== 'object') throw new Error('not an object');
  } catch {
    res.status(400).json({ error: 'Payload must be JSON.' });
    return;
  }
  const { deliveryId, eventType } = describeDelivery(row.provider, req.headers as Record<string, unknown>, body, raw);

  const eventId = transaction(() => {
    const inserted = db
      .prepare(
        `INSERT OR IGNORE INTO integ_events (org_id, webhook_id, provider, delivery_id, event_type, payload, status, received_at)
         VALUES (?, ?, ?, ?, ?, ?, 'received', ?)`
      )
      .run(row.org_id, row.id, row.provider, deliveryId.slice(0, 200), eventType.slice(0, 120), JSON.stringify(body), nowIso());
    db.prepare('UPDATE integ_webhooks SET last_delivery_at = ?, delivery_count = delivery_count + 1 WHERE id = ?').run(nowIso(), row.id);
    if (!Number(inserted.changes)) return null;
    const id = Number(inserted.lastInsertRowid);
    enqueueJob(row.org_id, 'integration.event', { eventId: id }, { maxAttempts: 5, dedupeKey: `event-${id}` });
    return id;
  });

  if (eventId === null) {
    res.status(200).json({ ok: true, duplicate: true });
    return;
  }
  if (eventId % 100 === 0) {
    db.prepare('DELETE FROM integ_events WHERE org_id = ? AND id NOT IN (SELECT id FROM integ_events WHERE org_id = ? ORDER BY id DESC LIMIT ?)').run(
      row.org_id, row.org_id, MAX_EVENTS_PER_ORG
    );
  }
  res.status(202).json({ ok: true, eventId });
}

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

interface Handled {
  status: 'processed' | 'ignored';
  result: string;
}

const ignored = (result: string): Handled => ({ status: 'ignored', result });
const done = (result: string): Handled => ({ status: 'processed', result });
const ZERO_SHA = /^0+$/;

function resolveRepository(orgId: string, endpoint: WebhookEndpoint, fullName: string): ScmRepository | string {
  const wanted = fullName.toLowerCase();
  const matches = (r: ScmRepository) => r.provider === endpoint.provider && (r.name.toLowerCase() === wanted || repoPathOf(r).toLowerCase() === wanted);
  if (endpoint.repoId) {
    const repo = getRepository(orgId, endpoint.repoId);
    if (!repo) return 'The repository of this webhook no longer exists.';
    return !wanted || matches(repo) ? repo : `Delivery is for "${fullName}" but this webhook belongs to "${repo.name}".`;
  }
  return listRepositories(orgId).find(matches) || `Repository "${fullName}" is not connected.`;
}

interface Parsed {
  snapshot: ScmSnapshot;
  removedBranch?: string;
  /** The payload is not detailed enough: fetch the repository from the API instead. */
  needsFullSync?: boolean;
}

export function parseGithubEvent(eventType: string, p: Rec, repo: ScmRepository, defaultBranch: string): Parsed | null {
  const web = repo.baseUrl.replace(/\.git$/, '').replace(/\/+$/, '');
  const branchEntry = (name: string, sha: string) => ({ name, sha, url: `${web}/tree/${name}`, isDefault: name === defaultBranch });
  if (eventType === 'pull_request' && p.pull_request) return { snapshot: { pullRequests: [githubMap.pr(obj(p.pull_request))] } };
  if (eventType === 'push') {
    const ref = str(p.ref);
    if (!ref.startsWith('refs/heads/')) return null;
    const name = ref.slice('refs/heads/'.length);
    if (p.deleted === true) return { snapshot: {}, removedBranch: name };
    const onDefault = name === defaultBranch;
    return {
      snapshot: {
        branches: [branchEntry(name, str(p.after))],
        commits: arr(p.commits).map(c => ({
          sha: str(c.id),
          message: str(c.message),
          author: str(obj(c.author).username) || str(obj(c.author).name),
          authoredAt: str(c.timestamp) || undefined,
          url: str(c.url) || `${web}/commit/${str(c.id)}`,
          onDefaultBranch: onDefault,
        })),
      },
    };
  }
  if (eventType === 'create' && p.ref_type === 'branch') return { snapshot: { branches: [branchEntry(str(p.ref), '')] } };
  if (eventType === 'delete' && p.ref_type === 'branch') return { snapshot: {}, removedBranch: str(p.ref) };
  if (eventType === 'deployment_status' && p.deployment && p.deployment_status) {
    const d = obj(p.deployment);
    const s = obj(p.deployment_status);
    return {
      snapshot: {
        deployments: [{
          id: str(d.id),
          environment: str(s.environment) || str(d.environment),
          sha: str(d.sha),
          ref: str(d.ref) || undefined,
          state: githubMap.deploymentState(s.state),
          createdAt: str(d.created_at) || undefined,
          updatedAt: str(s.created_at) || undefined,
          url: str(s.environment_url) || str(s.log_url) || undefined,
        }],
      },
    };
  }
  if (eventType === 'dependabot_alert' && p.alert) {
    const v = githubMap.vulnerability(obj(p.alert));
    return { snapshot: { vulnerabilities: [{ ...v, severity: normalizeSeverity(v.severity) }] } };
  }
  return null;
}

export function parseGitlabEvent(eventType: string, p: Rec, repo: ScmRepository, defaultBranch: string): Parsed | null {
  const web = repo.baseUrl.replace(/\.git$/, '').replace(/\/+$/, '');
  const kind = str(p.object_kind) || eventType;
  const iso = (v: unknown) => {
    const t = Date.parse(str(v).replace(' UTC', 'Z').replace(' ', 'T'));
    return Number.isNaN(t) ? undefined : new Date(t).toISOString();
  };
  if (kind === 'merge_request') {
    const a = obj(p.object_attributes);
    const pr = gitlabMap.pr({ ...a, author: p.user, web_url: a.url });
    return {
      snapshot: {
        pullRequests: [{ ...pr, createdAt: iso(a.created_at), updatedAt: iso(a.updated_at), mergedAt: pr.state === 'merged' ? iso(a.updated_at) : undefined }],
      },
    };
  }
  if (kind === 'push') {
    const ref = str(p.ref);
    if (!ref.startsWith('refs/heads/')) return null;
    const name = ref.slice('refs/heads/'.length);
    if (ZERO_SHA.test(str(p.after))) return { snapshot: {}, removedBranch: name };
    return {
      snapshot: {
        branches: [{ name, sha: str(p.after), url: `${web}/-/tree/${name}`, isDefault: name === defaultBranch }],
        commits: arr(p.commits).map(c => ({ ...gitlabMap.commit(c, web), onDefaultBranch: name === defaultBranch })),
      },
    };
  }
  if (kind === 'deployment') {
    const sha = str(p.sha);
    if (sha.length < 40) return { snapshot: {}, needsFullSync: true };
    return {
      snapshot: {
        deployments: [{
          id: str(p.deployment_id),
          environment: str(p.environment),
          sha,
          ref: str(p.ref) || undefined,
          state: gitlabMap.deploymentState(p.status),
          updatedAt: iso(p.status_changed_at),
          url: str(p.environment_external_url) || undefined,
        }],
      },
    };
  }
  if (kind === 'vulnerability') return { snapshot: {}, needsFullSync: true };
  return null;
}

async function processScmEvent(orgId: string, endpoint: WebhookEndpoint, eventType: string, payload: Rec, eventId: number): Promise<Handled> {
  if (eventType === 'ping') return done('Ping received: the webhook is configured correctly.');
  const fullName = str(obj(payload.repository).full_name) || str(obj(payload.project).path_with_namespace);
  const repo = resolveRepository(orgId, endpoint, fullName);
  if (typeof repo === 'string') return ignored(repo);
  if (!repo.enabled) return ignored(`Repository "${repo.name}" is disabled.`);

  const state = integrationStore.getRepoSyncState(repo.id);
  const defaultBranch =
    str(obj(payload.repository).default_branch) || str(obj(payload.project).default_branch) || state?.defaultBranch || repo.defaultBranch || 'main';
  const parsed =
    endpoint.provider === 'github' ? parseGithubEvent(eventType, payload, repo, defaultBranch) : parseGitlabEvent(eventType, payload, repo, defaultBranch);
  if (!parsed) return ignored(`Event "${eventType}" is not used.`);
  if (parsed.needsFullSync) {
    queueRepositorySync(orgId, repo.id, { bucket: `event-${eventId}` });
    return done(`Queued a full sync of ${repo.name}.`);
  }

  // a push payload does not know a branch's earlier sha etc.: keep what we already have when it is empty
  const ingest = ingestScmData(orgId, repo, parsed.snapshot);
  const keys = new Set(ingest.affectedKeys);
  if (parsed.removedBranch) {
    const row = db.prepare("SELECT issue_keys FROM scm_items WHERE kind = 'branch' AND repo_id = ? AND ext_id = ?").get(repo.id, parsed.removedBranch) as
      | { issue_keys: string }
      | undefined;
    if (row) {
      for (const k of JSON.parse(row.issue_keys) as string[]) keys.add(k);
      db.prepare("DELETE FROM scm_items WHERE kind = 'branch' AND repo_id = ? AND ext_id = ?").run(repo.id, parsed.removedBranch);
    }
  }

  // merged / deployed work may now be live: ask the provider whether a production deployment contains it
  const conn = repo.provider === 'github' || repo.provider === 'gitlab' ? integrationStore.getConnection(orgId, repo.provider) : undefined;
  const mayDeploy = Boolean(parsed.snapshot.deployments?.length || parsed.snapshot.pullRequests?.some(pr => pr.state === 'merged'));
  if (mayDeploy && !repoConnectionProblem(repo, conn)) {
    const deployed = await withCredential(orgId, conn!.id, cred => evaluateDeployments(orgId, repo, cred));
    deployed.forEach(k => keys.add(k));
  }

  const reconciled = await reconcileDevLinks(orgId, repo, keys);
  await alertNewVulnerabilities(orgId, repo, ingest.newVulnerabilities);
  return done(
    `${repo.name}: ${keys.size} work item key(s) referenced, ${reconciled.updated} work item(s) updated${
      ingest.newVulnerabilities.length ? `, ${ingest.newVulnerabilities.length} new alert(s)` : ''
    }.`
  );
}

function processAtlassianEvent(orgId: string, provider: 'jira' | 'confluence', eventType: string, payload: Rec, eventId: number): Handled {
  const removed = /deleted|removed|trashed/i.test(eventType) && !/comment|attachment|worklog|link/i.test(eventType);
  if (provider === 'jira') {
    const issue = obj(payload.issue);
    const externalId = str(issue.id) || str(issue.key);
    if (!externalId) return ignored('The payload has no issue.');
    const containerKey = str(obj(obj(issue.fields).project).key) || str(issue.key).split('-')[0];
    return done(handleExternalChange(orgId, 'jira', { externalId, containerKey, deleted: removed, stamp: String(eventId) }));
  }
  const page = obj(payload.page || payload.content);
  const externalId = str(page.id);
  if (!externalId) return ignored('The payload has no page.');
  const containerKey = str(page.spaceKey) || str(obj(page.space).key) || undefined;
  return done(handleExternalChange(orgId, 'confluence', { externalId, containerKey, deleted: removed, stamp: String(eventId) }));
}

registerJobHandler('integration.event', async job => {
  const { eventId } = job.payload as { eventId?: number };
  const row = db.prepare('SELECT * FROM integ_events WHERE id = ? AND org_id = ?').get(Number(eventId), job.orgId) as EventRow | undefined;
  if (!row || row.status === 'processed' || row.status === 'ignored') return;
  const endpoint = listEndpoints(job.orgId).find(e => e.id === row.webhook_id);
  const finish = (status: EventStatus, result: string | null, error: string | null) =>
    db.prepare('UPDATE integ_events SET status = ?, result = ?, error = ?, attempts = ?, processed_at = ? WHERE id = ?').run(
      status, result, error, job.attempts, status === 'retrying' ? null : nowIso(), row.id
    );
  if (!endpoint) {
    finish('ignored', 'The webhook endpoint was removed.', null);
    return;
  }
  try {
    const payload = JSON.parse(row.payload) as Rec;
    const outcome =
      row.provider === 'github' || row.provider === 'gitlab'
        ? await processScmEvent(job.orgId, endpoint, row.event_type, payload, row.id)
        : processAtlassianEvent(job.orgId, row.provider, row.event_type, payload, row.id);
    finish(outcome.status, outcome.result.slice(0, 500), null);
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    const final = err instanceof PermanentJobError || job.attempts >= job.maxAttempts;
    finish(final ? 'failed' : 'retrying', null, message);
    throw err;
  }
});
