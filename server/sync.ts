/**
 * Server-side synchronisation with Jira (work items) and Confluence (space docs):
 *  - pulls remote records and writes them into the real work items / docs
 *  - with two-way sync, pushes local edits back
 *  - merges field by field against the last agreed values and raises conflicts only for real collisions
 *  - resolves conflicts by writing the chosen values to both sides
 * Sync runs on the durable job queue ('integration.sync', 'integration.push').
 */
import crypto from 'node:crypto';
import { PermanentJobError, enqueueJob, registerJobHandler } from './jobs.ts';
import { computeSyncHash } from './cryptoVault.ts';
import { AuthRejectedError, RateLimitedError, safeExternalFetch } from './httpClient.ts';
import type { ExternalFetchResult, HttpMethod } from './httpClient.ts';
import { integrationStore } from './store.ts';
import type {
  IntegrationConfigRecord,
  IntegrationConflictRecord,
  IntegrationExternalLinkRecord,
  IntegrationJobRecord,
} from './store.ts';
import { withCredential } from './tokens.ts';
import type { ResolvedCredential } from './tokens.ts';
import { discoverJiraData, normalizeJiraIssue } from './connectors/jiraConnector.ts';
import type { NormalizedJiraIssue } from './connectors/jiraConnector.ts';
import { discoverConfluenceData, parseConfluenceXhtml } from './connectors/confluenceConnector.ts';
import { applyBatch, getRecord, listCollection, listUsers } from './repo.ts';
import { loadRows } from './planning.ts';
import { pairHash, same, threeWayMerge } from './merge.ts';
import type { ConflictPolicy, FieldConflict, Fields } from './merge.ts';
import type { Actor } from './permissions.ts';
import { conflict as conflictError, HttpError, notFound } from './errors.ts';

type Rec = Record<string, unknown>;

const nowIso = () => new Date().toISOString();
const str = (v: unknown): string => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));
const obj = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const SYSTEM = (orgId: string): Actor => ({ userId: 'system', orgId, email: 'system@jiraflow.local', role: 'admin' });

export const ISSUE_SYNC_FIELDS = ['summary', 'description', 'status', 'priority', 'assigneeId', 'dueDate', 'labels', 'storyPoints'];
/** Story points live in an instance-specific Jira custom field, so they are pull-only. */
const JIRA_PUSHABLE: ReadonlySet<string> = new Set(['summary', 'description', 'status', 'priority', 'assigneeId', 'dueDate', 'labels']);
const PAGE_PUSHABLE: ReadonlySet<string> = new Set(['title', 'content']);
const MAX_DOC_CHARS = 200_000;

/** A single record could not be synced; the run continues with the next one. */
class ItemError extends Error {}

export interface SyncContext {
  orgId: string;
  cred: ResolvedCredential;
  /** Target space for records that are not linked yet. */
  projectId: string;
  bidirectional: boolean;
  policy: ConflictPolicy;
  statusMap: Record<string, string>;
  jobId: string;
  configId?: string;
  actorUserId: string;
}

export interface ItemOutcome {
  action: 'create' | 'update' | 'push' | 'skip' | 'conflict' | 'fail';
  status: 'succeeded' | 'failed' | 'conflict';
  localId?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Value mapping (everything is compared in the local vocabulary)
// ---------------------------------------------------------------------------

interface LocalStatus {
  id: string;
  name: string;
  nameFa?: string;
  category: 'todo' | 'inprogress' | 'done';
}

export function projectStatuses(orgId: string, projectId: string): LocalStatus[] {
  const own = loadRows(orgId, 'workflows', projectId);
  const flows = own.length ? own : loadRows(orgId, 'workflows');
  const active = flows.filter(f => f.isActive !== false);
  const seen = new Map<string, LocalStatus>();
  for (const wf of active.length ? active : flows) {
    for (const s of (wf.statuses as LocalStatus[] | undefined) || []) if (!seen.has(s.id)) seen.set(s.id, s);
  }
  if (seen.size === 0) {
    return [
      { id: 'todo', name: 'To Do', category: 'todo' },
      { id: 'inprogress', name: 'In Progress', category: 'inprogress' },
      { id: 'done', name: 'Done', category: 'done' },
    ];
  }
  return [...seen.values()];
}

const loose = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export function mapRemoteStatus(
  name: string,
  categoryKey: string,
  statuses: LocalStatus[],
  statusMap: Record<string, string>
): string | undefined {
  const mapped = statusMap[name];
  if (mapped && statuses.some(s => s.id === mapped)) return mapped;
  const wanted = loose(name);
  const byName = statuses.find(s => loose(s.name) === wanted || loose(s.id) === wanted || (s.nameFa && loose(s.nameFa) === wanted));
  if (byName) return byName.id;
  const category = categoryKey === 'done' ? 'done' : categoryKey === 'indeterminate' ? 'inprogress' : categoryKey === 'new' ? 'todo' : null;
  return category ? statuses.find(s => s.category === category)?.id : undefined;
}

const PRIORITY_NAMES: Record<string, string> = {
  highest: 'highest', blocker: 'highest', critical: 'highest',
  high: 'high', major: 'high',
  medium: 'medium', normal: 'medium',
  low: 'low', minor: 'low',
  lowest: 'lowest', trivial: 'lowest',
};

export const mapRemotePriority = (name: string): string | undefined => PRIORITY_NAMES[name.toLowerCase()];
const JIRA_PRIORITY: Record<string, string> = { highest: 'Highest', high: 'High', medium: 'Medium', low: 'Low', lowest: 'Lowest' };

export function normalizeType(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('epic')) return 'epic';
  if (n.includes('sub')) return 'subtask';
  if (n.includes('story')) return 'story';
  if (n.includes('bug') || n.includes('defect')) return 'bug';
  if (n.includes('feature')) return 'feature';
  return 'task';
}

const cleanText = (v: unknown, max: number) => str(v).replace(/\r\n/g, '\n').trim().slice(0, max);
const cleanLabels = (v: unknown): string[] =>
  [...new Set((Array.isArray(v) ? v : []).map(l => str(l).trim().slice(0, 120)).filter(Boolean))].sort();
const cleanDay = (v: unknown): string | null => (/^\d{4}-\d{2}-\d{2}/.test(str(v)) ? str(v).slice(0, 10) : null);

interface UserRef {
  id: string;
  email: string;
  name: string;
}

function activeUsers(orgId: string): UserRef[] {
  return listUsers(orgId).map(u => ({ id: str(u.record.id), email: str(u.record.email).toLowerCase(), name: str(u.record.name).toLowerCase() }));
}

function findUser(users: UserRef[], hint: string): string | undefined {
  const h = hint.trim().toLowerCase();
  return h ? users.find(u => u.email === h || u.name === h)?.id : undefined;
}

export function remoteIssueFields(
  remote: NormalizedJiraIssue,
  statuses: LocalStatus[],
  statusMap: Record<string, string>,
  users: UserRef[]
): Fields {
  const assignee = str(remote.assignee);
  return {
    summary: cleanText(remote.summary, 500) || str(remote.key),
    description: cleanText(remote.description, 100_000),
    status: mapRemoteStatus(str(remote.status), str(remote.statusCategory), statuses, statusMap),
    priority: mapRemotePriority(str(remote.priority)),
    // unassigned is a value; an assignee nobody here matches is "unknown" and must not clear the local one
    assigneeId: assignee ? findUser(users, assignee) ?? findUser(users, str(remote.assigneeName)) : null,
    dueDate: cleanDay(remote.dueDate),
    labels: cleanLabels(remote.labels),
    storyPoints: typeof remote.storyPoints === 'number' && remote.storyPoints >= 0 ? remote.storyPoints : undefined,
  };
}

export function localIssueFields(issue: Rec): Fields {
  return {
    summary: cleanText(issue.summary, 500),
    description: cleanText(issue.description, 100_000),
    status: str(issue.status),
    priority: str(issue.priority),
    assigneeId: issue.assigneeId ? str(issue.assigneeId) : null,
    dueDate: cleanDay(issue.dueDate),
    labels: cleanLabels(issue.labels),
    storyPoints: typeof issue.storyPoints === 'number' ? issue.storyPoints : null,
  };
}

// ---------------------------------------------------------------------------
// Remote APIs
// ---------------------------------------------------------------------------

async function call(cred: ResolvedCredential, path: string, method: HttpMethod = 'GET', body?: unknown): Promise<ExternalFetchResult> {
  const res = await safeExternalFetch(cred.conn.serverUrl, path, cred.headers, method, body);
  if (res.status === 401) throw new AuthRejectedError(`${cred.conn.provider} rejected the credential (HTTP 401).`);
  return res;
}

/** Jira Cloud serves REST v3, Server / Data Center only v2. */
async function jira(cred: ResolvedCredential, path: string, method: HttpMethod = 'GET', body?: unknown) {
  let version: 2 | 3 = 3;
  let res = await call(cred, `/rest/api/3${path}`, method, body);
  if (res.status === 404 && !(res.data && typeof res.data === 'object' && 'errorMessages' in (res.data as Rec))) {
    version = 2;
    res = await call(cred, `/rest/api/2${path}`, method, body);
  }
  return { res, version };
}

const ISSUE_QUERY_FIELDS =
  'summary,description,status,priority,issuetype,assignee,reporter,project,parent,labels,duedate,created,updated,customfield_10016,customfield_10026,customfield_10004';

export async function fetchJiraIssue(cred: ResolvedCredential, idOrKey: string): Promise<NormalizedJiraIssue | null> {
  const { res } = await jira(cred, `/issue/${encodeURIComponent(idOrKey)}?fields=${ISSUE_QUERY_FIELDS}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Jira returned HTTP ${res.status} for issue ${idOrKey}.`);
  return normalizeJiraIssue(res.data as Rec, cred.conn.serverUrl, {});
}

const toAdf = (text: string) => ({
  type: 'doc',
  version: 1,
  content: text.split(/\n{2,}|\n/).map(line => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })),
});

const errorText = (res: ExternalFetchResult) => {
  const d = obj(res.data);
  const messages = [...(Array.isArray(d.errorMessages) ? d.errorMessages : []), ...Object.values(obj(d.errors)), d.message].filter(Boolean);
  return `HTTP ${res.status}${messages.length ? `: ${messages.map(str).join('; ').slice(0, 200)}` : ''}`;
};

/** Writes local values to a Jira issue. Returns the fields that could not be written and why. */
export async function pushJiraFields(
  cred: ResolvedCredential,
  issueKey: string,
  patch: Fields,
  ctx: { statuses: LocalStatus[]; statusMap: Record<string, string>; orgId: string }
): Promise<Record<string, string>> {
  const failures: Record<string, string> = {};
  const key = encodeURIComponent(issueKey);
  const probe = await jira(cred, `/issue/${key}?fields=summary`);
  if (!probe.res.ok) {
    for (const f of Object.keys(patch)) failures[f] = `Cannot read ${issueKey}: ${errorText(probe.res)}`;
    return failures;
  }
  const api = `/rest/api/${probe.version}`;
  const update: Rec = {};
  const owner: Record<string, string> = {};

  if ('summary' in patch) {
    update.summary = patch.summary;
    owner.summary = 'summary';
  }
  if ('description' in patch) {
    update.description = probe.version === 3 ? toAdf(str(patch.description)) : str(patch.description);
    owner.description = 'description';
  }
  if ('priority' in patch) {
    update.priority = { name: JIRA_PRIORITY[str(patch.priority)] || str(patch.priority) };
    owner.priority = 'priority';
  }
  if ('labels' in patch) {
    update.labels = (patch.labels as string[]).map(l => l.replace(/\s+/g, '_'));
    owner.labels = 'labels';
  }
  if ('dueDate' in patch) {
    update.duedate = patch.dueDate;
    owner.duedate = 'dueDate';
  }
  if ('assigneeId' in patch) {
    if (patch.assigneeId === null) {
      update.assignee = probe.version === 3 ? { accountId: null } : { name: null };
      owner.assignee = 'assigneeId';
    } else {
      const user = activeUsers(ctx.orgId).find(u => u.id === patch.assigneeId);
      const param = probe.version === 3 ? 'query' : 'username';
      const found = user ? await call(cred, `${api}/user/search?${param}=${encodeURIComponent(user.email)}`) : null;
      const list = found?.ok && Array.isArray(found.data) ? (found.data as Rec[]) : [];
      const match = list.find(u => str(u.emailAddress).toLowerCase() === user?.email) || (list.length === 1 ? list[0] : undefined);
      if (match) {
        update.assignee = probe.version === 3 ? { accountId: str(match.accountId) } : { name: str(match.name) };
        owner.assignee = 'assigneeId';
      } else {
        failures.assigneeId = `No Jira account found for ${user?.email || str(patch.assigneeId)}.`;
      }
    }
  }

  if (Object.keys(update).length > 0) {
    const res = await call(cred, `${api}/issue/${key}`, 'PUT', { fields: update });
    if (!res.ok) {
      // find out which field Jira objects to so the others still get through
      for (const [remoteName, value] of Object.entries(update)) {
        const one = await call(cred, `${api}/issue/${key}`, 'PUT', { fields: { [remoteName]: value } });
        if (!one.ok) failures[owner[remoteName]] = `Jira rejected ${owner[remoteName]} (${errorText(one)}).`;
      }
    }
  }

  if ('status' in patch) {
    const res = await call(cred, `${api}/issue/${key}/transitions`);
    const transitions = res.ok && Array.isArray(obj(res.data).transitions) ? (obj(res.data).transitions as Rec[]) : [];
    const target = str(patch.status);
    const mapsTo = (t: Rec) => {
      const to = obj(t.to);
      return mapRemoteStatus(str(to.name), str(obj(to.statusCategory).key), ctx.statuses, ctx.statusMap);
    };
    const wantedName = loose(ctx.statuses.find(s => s.id === target)?.name || target);
    const transition = transitions.find(t => loose(str(obj(t.to).name)) === wantedName) || transitions.find(t => mapsTo(t) === target);
    if (!transition) {
      failures.status = `The Jira workflow has no transition from the current status to "${target}".`;
    } else {
      const done = await call(cred, `${api}/issue/${key}/transitions`, 'POST', { transition: { id: str(transition.id) } });
      if (!done.ok) failures.status = `Jira refused the transition (${errorText(done)}).`;
    }
  }
  return failures;
}

export interface RemotePage {
  id: string;
  title: string;
  content: string;
  version: number;
  spaceKey: string;
  storage: string;
  parentId?: string;
  ancestors: Array<{ id: string; title: string }>;
  sourceUrl: string;
  labels: string[];
  updatedAt: string;
  createdAt: string;
  author: string;
  conversionWarnings: string[];
  structuredBlocks?: unknown[];
}

async function confluencePrefix(cred: ResolvedCredential): Promise<string> {
  const probe = await call(cred, '/wiki/rest/api/user/current');
  return probe.status === 404 ? '' : '/wiki';
}

export async function fetchConfluencePage(cred: ResolvedCredential, pageId: string): Promise<RemotePage | null> {
  const prefix = await confluencePrefix(cred);
  const res = await call(cred, `${prefix}/rest/api/content/${encodeURIComponent(pageId)}?expand=body.storage,version,space,history,ancestors,metadata.labels`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Confluence returned HTTP ${res.status} for page ${pageId}.`);
  const p = obj(res.data);
  if (str(p.status) === 'trashed') return null;
  const storage = str(obj(obj(p.body).storage).value);
  const parsed = parseConfluenceXhtml(storage);
  const ancestors = (Array.isArray(p.ancestors) ? (p.ancestors as Rec[]) : [])
    .filter(a => a.id && a.title)
    .map(a => ({ id: str(a.id), title: str(a.title) }));
  const version = obj(p.version);
  const spaceKey = str(obj(p.space).key);
  const webui = str(obj(p._links).webui) || `/spaces/${spaceKey}/pages/${pageId}`;
  return {
    id: str(p.id) || pageId,
    title: str(p.title) || 'Untitled Page',
    content: parsed.markdown,
    version: Number(version.number || 1),
    spaceKey,
    storage,
    parentId: ancestors.length ? ancestors[ancestors.length - 1].id : undefined,
    ancestors,
    sourceUrl: `${cred.conn.serverUrl}${prefix}${webui.startsWith('/') ? webui : `/${webui}`}`,
    labels: (Array.isArray(obj(obj(p.metadata).labels).results) ? (obj(obj(p.metadata).labels).results as Rec[]) : []).map(l => str(l.name)).filter(Boolean),
    updatedAt: str(version.when) || nowIso(),
    createdAt: str(obj(p.history).createdDate) || str(version.when) || nowIso(),
    author: str(obj(version.by).displayName) || cred.conn.account.displayName,
    conversionWarnings: parsed.conversionWarnings,
  };
}

/** Markup that the plain-text editor cannot represent: writing the body back would destroy it. */
export function unsafeToOverwrite(storage: string): boolean {
  return /<(ac:|ri:|table[\s>]|img[\s/>]|iframe[\s>]|a\s|sub[\s>]|sup[\s>]|span\s)/i.test(storage);
}

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s: string) =>
  escapeXml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

export function markdownToStorage(markdown: string): string {
  const out: string[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let para: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  const flush = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br/>')}</p>`);
    if (list) out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
    para = [];
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith('```'); i++) code.push(lines[i]);
      out.push(`<pre><code>${escapeXml(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^\s*(?:[-*•])\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
    } else if (bullet || numbered) {
      const tag = bullet ? 'ul' : 'ol';
      if (para.length || (list && list.tag !== tag)) flush();
      list = list || { tag, items: [] };
      list.items.push((bullet || numbered)![1]);
    } else if (!line.trim()) {
      flush();
    } else {
      if (list) flush();
      para.push(line);
    }
  }
  flush();
  return out.join('');
}

export async function pushConfluencePage(cred: ResolvedCredential, expected: RemotePage, patch: Fields): Promise<Record<string, string>> {
  const failures: Record<string, string> = {};
  const wanted: Fields = { ...patch };
  if ('content' in wanted && unsafeToOverwrite(expected.storage)) {
    failures.content =
      'This page contains macros, tables, links or images that cannot be written back without losing them. Edit the body in Confluence.';
    delete wanted.content;
  }
  if (Object.keys(wanted).length === 0) return failures;
  const prefix = await confluencePrefix(cred);
  const res = await call(cred, `${prefix}/rest/api/content/${encodeURIComponent(expected.id)}`, 'PUT', {
    id: expected.id,
    type: 'page',
    title: 'title' in wanted ? str(wanted.title) : expected.title,
    version: { number: expected.version + 1 },
    // a title-only change re-sends the original markup untouched
    body: { storage: { representation: 'storage', value: 'content' in wanted ? markdownToStorage(str(wanted.content)) : expected.storage } },
  });
  if (res.status === 409) throw new ItemError('The Confluence page changed while it was being updated; it will be merged on the next sync.');
  if (!res.ok) for (const f of Object.keys(wanted)) failures[f] = `Confluence rejected the update (${errorText(res)}).`;
  return failures;
}

// ---------------------------------------------------------------------------
// Local writes
// ---------------------------------------------------------------------------

const isVersionConflict = (err: unknown) => (err as { code?: string })?.code === 'CONFLICT';

async function writeIssue(orgId: string, record: Rec, version: number | undefined, actor: Actor = SYSTEM(orgId)): Promise<{ version: number; record: Rec }> {
  const id = str(record.id);
  const result = await applyBatch(actor, [{ collection: 'issues', op: 'upsert', id, data: record, baseVersion: version }], {
    system: true,
    audit: true,
    suppressEvents: true,
  });
  const fresh = getRecord(orgId, 'issues', id)!;
  return { version: result.results[0]?.version ?? fresh.version, record: fresh.record };
}

function issueWithPatch(issue: Rec, patch: Fields): Rec {
  const next: Rec = { ...issue };
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'assigneeId') next.assigneeId = v;
    else if (v === null && (k === 'dueDate' || k === 'storyPoints')) delete next[k];
    else next[k] = v;
  }
  next.updatedAt = nowIso();
  return next;
}

/** Docs live inside their project record: read-modify-write with optimistic concurrency. */
async function writeDoc(orgId: string, projectId: string, docId: string, change: (doc: Rec | undefined) => Rec, actor: Actor = SYSTEM(orgId)): Promise<{ version: number; doc: Rec }> {
  for (let attempt = 0; ; attempt++) {
    const project = getRecord(orgId, 'projects', projectId);
    if (!project) throw new ItemError('The target space no longer exists.');
    const docs = ((project.record.docs as Rec[] | undefined) || []).slice();
    const i = docs.findIndex(d => d.id === docId);
    const next = change(i >= 0 ? docs[i] : undefined);
    if (i >= 0) docs[i] = next;
    else docs.push(next);
    const data = { ...project.record, docs };
    if (JSON.stringify(data).length > 950_000) {
      throw new ItemError('The space has no room for more document content. Sync fewer or smaller pages into this space.');
    }
    try {
      const result = await applyBatch(actor, [{ collection: 'projects', op: 'upsert', id: projectId, data, baseVersion: project.version }], {
        system: true,
        audit: true,
        suppressEvents: true,
      });
      return { version: result.results[0].version, doc: next };
    } catch (err) {
      if (!isVersionConflict(err) || attempt >= 3) throw err;
    }
  }
}

export function findDoc(orgId: string, docId: string): { projectId: string; version: number; doc: Rec } | undefined {
  for (const p of listCollection(orgId, 'projects')) {
    const doc = ((p.record.docs as Rec[] | undefined) || []).find(d => d.id === docId);
    if (doc) return { projectId: str(p.record.id), version: p.version, doc };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Conflict bookkeeping shared by issues and pages
// ---------------------------------------------------------------------------

function recordConflicts(
  ctx: SyncContext,
  link: IntegrationExternalLinkRecord,
  conflicts: FieldConflict[],
  localSnapshot: Rec,
  sourceSnapshot: Rec,
  localVersion: number
): void {
  const pending = integrationStore.findPendingConflictForLink(ctx.orgId, link.id);
  if (conflicts.length === 0) {
    if (pending) {
      integrationStore.resolveConflict(ctx.orgId, pending.id, 'dismissed', 'system', undefined, 'Both sides now agree.');
    }
    return;
  }
  const body = {
    jobId: ctx.jobId,
    configId: ctx.configId,
    externalLinkId: link.id,
    provider: link.provider,
    entityType: link.externalEntityType,
    externalKey: link.externalKey,
    localEntityId: link.localEntityId,
    fieldDiffs: conflicts.map(c => ({ field: c.field, baseValue: c.baseValue, sourceValue: c.sourceValue, localValue: c.localValue })),
    localSnapshot,
    sourceSnapshot,
    localVersion,
  };
  if (pending) integrationStore.refreshConflict(pending, body);
  else integrationStore.createConflict({ organizationId: ctx.orgId, ...body });
}

function outcomeFor(created: boolean, conflicts: number, pushed: number, pulled: number, failures: Record<string, string>, localId: string): ItemOutcome {
  const failed = Object.values(failures);
  if (failed.length) return { action: 'fail', status: 'failed', localId, error: failed.join(' ') };
  if (conflicts) return { action: 'conflict', status: 'conflict', localId };
  if (created) return { action: 'create', status: 'succeeded', localId };
  if (pulled) return { action: 'update', status: 'succeeded', localId };
  if (pushed) return { action: 'push', status: 'succeeded', localId };
  return { action: 'skip', status: 'succeeded', localId };
}

/** A field that failed to reach the source keeps its old ancestor so it is retried / re-examined next time. */
function restoreBase(base: Fields, previous: Fields | undefined, fields: string[]): void {
  for (const f of fields) {
    if (previous && f in previous) base[f] = previous[f];
    else delete base[f];
  }
}

// ---------------------------------------------------------------------------
// Jira work items
// ---------------------------------------------------------------------------

function saveLink(
  ctx: SyncContext,
  input: {
    provider: 'jira' | 'confluence';
    extType: 'issue' | 'page';
    extId: string;
    extKey: string;
    extUrl?: string;
    localType: 'issue' | 'doc';
    localId: string;
    projectId: string;
    base: Fields;
    localVersion: number;
    sourceUpdatedAt?: string;
    pushError: string | null;
  }
): IntegrationExternalLinkRecord {
  return integrationStore.upsertExternalLink({
    organizationId: ctx.orgId,
    provider: input.provider,
    connectionId: ctx.cred.conn.id,
    externalEntityType: input.extType,
    externalEntityId: input.extId,
    externalKey: input.extKey,
    externalUrl: input.extUrl,
    localEntityType: input.localType,
    localEntityId: input.localId,
    localProjectId: input.projectId,
    syncHash: computeSyncHash(input.base),
    base: input.base,
    localVersion: input.localVersion,
    sourceUpdatedAt: input.sourceUpdatedAt,
    bidirectional: ctx.bidirectional,
    conflictPolicy: ctx.policy,
    statusMap: ctx.statusMap,
    pushError: input.pushError,
    missingInSource: false,
  });
}

async function createIssue(ctx: SyncContext, remote: NormalizedJiraIssue, fields: Fields): Promise<{ version: number; record: Rec }> {
  const project = getRecord(ctx.orgId, 'projects', ctx.projectId);
  if (!project) throw new ItemError('The target space no longer exists.');
  const statuses = projectStatuses(ctx.orgId, ctx.projectId);
  const users = activeUsers(ctx.orgId);
  const creator = users.find(u => u.id === ctx.actorUserId)?.id || users[0]?.id || 'system';
  const id = `iss-jira-${crypto.createHash('sha1').update(`${ctx.cred.conn.id}:${remote.id || remote.key}`).digest('hex').slice(0, 16)}`;
  const record: Rec = {
    id,
    // the server assigns the next free number in the space when this one is taken
    key: `${str(project.record.key)}-1`,
    projectId: ctx.projectId,
    type: normalizeType(str(remote.type)),
    summary: fields.summary,
    description: fields.description,
    status: fields.status || statuses.find(s => s.category === 'todo')?.id || statuses[0].id,
    priority: fields.priority || 'medium',
    assigneeId: fields.assigneeId ?? null,
    reporterId: findUser(users, str(remote.reporter)) || creator,
    labels: fields.labels,
    externalKey: str(remote.key),
    externalUrl: str(remote.externalUrl),
    createdAt: str(remote.created) || nowIso(),
    updatedAt: nowIso(),
  };
  if (fields.dueDate) record.dueDate = fields.dueDate;
  if (typeof fields.storyPoints === 'number') record.storyPoints = fields.storyPoints;
  return writeIssue(ctx.orgId, record, undefined);
}

/** A work item imported earlier (e.g. with the import wizard) that is not linked yet. */
function findUnlinkedIssue(orgId: string, projectId: string, externalKey: string): { record: Rec; version: number } | undefined {
  return listCollection(orgId, 'issues').find(
    i => i.record.projectId === projectId && i.record.externalKey === externalKey && !integrationStore.findExternalLinkByLocal(orgId, 'issue', str(i.record.id))
  );
}

export async function syncJiraItem(ctx: SyncContext, remote: NormalizedJiraIssue): Promise<ItemOutcome> {
  const extId = str(remote.id) || str(remote.key);
  for (let attempt = 0; ; attempt++) {
    const link = integrationStore.findExternalLink(ctx.orgId, 'jira', ctx.cred.conn.id, 'issue', extId);
    let local = link && link.localEntityType === 'issue' ? getRecord(ctx.orgId, 'issues', link.localEntityId) : null;
    if (link && !local && link.base) {
      return { action: 'skip', status: 'succeeded', localId: link.localEntityId, error: 'Deleted here after it was synced; it is not recreated.' };
    }
    if (!local) local = findUnlinkedIssue(ctx.orgId, ctx.projectId, str(remote.key)) || null;

    const projectId = local ? str(local.record.projectId) : ctx.projectId;
    const statuses = projectStatuses(ctx.orgId, projectId);
    const users = activeUsers(ctx.orgId);
    const remoteFields = remoteIssueFields(remote, statuses, ctx.statusMap, users);

    try {
      if (!local) {
        const created = await createIssue(ctx, remote, remoteFields);
        const stored = localIssueFields(created.record);
        const base: Fields = {};
        for (const f of ISSUE_SYNC_FIELDS) if (remoteFields[f] !== undefined) base[f] = stored[f];
        saveLink(ctx, {
          provider: 'jira', extType: 'issue', extId, extKey: str(remote.key), extUrl: str(remote.externalUrl), localType: 'issue',
          localId: str(created.record.id), projectId, base, localVersion: created.version, sourceUpdatedAt: str(remote.updated), pushError: null,
        });
        return outcomeFor(true, 0, 0, 1, {}, str(created.record.id));
      }

      const localFields = localIssueFields(local.record);
      const merge = threeWayMerge({
        base: link?.base,
        local: localFields,
        remote: remoteFields,
        bidirectional: ctx.bidirectional,
        pushable: JIRA_PUSHABLE,
        policy: ctx.policy,
        dismissed: link?.dismissed,
      });

      let failures: Record<string, string> = {};
      const toPush = Object.keys(merge.remotePatch);
      if (toPush.length) {
        failures = await pushJiraFields(ctx.cred, str(remote.key), merge.remotePatch, { statuses, statusMap: ctx.statusMap, orgId: ctx.orgId });
        restoreBase(merge.base, link?.base, Object.keys(failures));
        // adopt Jira's canonical form of what we wrote so it is not mistaken for a remote edit next time
        const after = await fetchJiraIssue(ctx.cred, str(remote.key));
        if (after) {
          const canonical = remoteIssueFields(after, statuses, ctx.statusMap, users);
          for (const f of toPush) {
            if (failures[f] || canonical[f] === undefined) continue;
            merge.base[f] = canonical[f];
            if (!same(canonical[f], localFields[f])) merge.localPatch[f] = canonical[f];
          }
        }
      }

      let version = local.version;
      let record = local.record;
      const pulled = Object.keys(merge.localPatch).length;
      const needsKey = !record.externalKey;
      if (pulled || needsKey) {
        const next = issueWithPatch(record, merge.localPatch);
        if (needsKey) {
          next.externalKey = str(remote.key);
          next.externalUrl = str(remote.externalUrl);
        }
        ({ version, record } = await writeIssue(ctx.orgId, next, local.version));
      }
      const saved = saveLink(ctx, {
        provider: 'jira', extType: 'issue', extId, extKey: str(remote.key), extUrl: str(remote.externalUrl), localType: 'issue',
        localId: str(record.id), projectId, base: merge.base, localVersion: version, sourceUpdatedAt: str(remote.updated),
        pushError: Object.values(failures).join(' ') || null,
      });
      recordConflicts(ctx, saved, merge.conflicts, localIssueFields(record), remoteFields, version);
      return outcomeFor(false, merge.conflicts.length, toPush.length - Object.keys(failures).length, pulled, failures, str(record.id));
    } catch (err) {
      if (!isVersionConflict(err) || attempt >= 3) throw err; // someone saved the item meanwhile: merge again
    }
  }
}

// ---------------------------------------------------------------------------
// Confluence pages <-> space docs
// ---------------------------------------------------------------------------

const pageFields = (p: { title: unknown; content: unknown }): Fields => ({
  title: cleanText(p.title, 400),
  content: cleanText(p.content, MAX_DOC_CHARS),
});

function docMetadata(page: RemotePage): Rec {
  const blocks = page.structuredBlocks;
  const meta: Rec = {
    version: page.version,
    sourceUrl: page.sourceUrl.slice(0, 2000),
    sourceProvider: 'confluence',
    externalId: page.id,
    labels: cleanLabels(page.labels).slice(0, 50),
    ancestors: page.ancestors.slice(0, 20),
    conversionWarnings: page.conversionWarnings.slice(0, 20).map(w => w.slice(0, 1000)),
  };
  // rich blocks are only kept while small: they live inside the project record
  if (blocks && JSON.stringify(blocks).length <= 20_000) meta.structuredBlocks = blocks;
  return meta;
}

export async function syncConfluencePage(ctx: SyncContext, page: RemotePage): Promise<ItemOutcome> {
  if (page.content.length > MAX_DOC_CHARS) throw new ItemError(`Page is larger than ${MAX_DOC_CHARS} characters.`);
  const link = integrationStore.findExternalLink(ctx.orgId, 'confluence', ctx.cred.conn.id, 'page', page.id);
  let found = link && link.localEntityType === 'doc' ? findDoc(ctx.orgId, link.localEntityId) : undefined;
  if (link && !found && link.base) {
    return { action: 'skip', status: 'succeeded', localId: link.localEntityId, error: 'Deleted here after it was synced; it is not recreated.' };
  }
  if (!found) {
    const project = getRecord(ctx.orgId, 'projects', ctx.projectId);
    const existing = ((project?.record.docs as Rec[] | undefined) || []).find(d => d.externalId === page.id && d.sourceProvider === 'confluence');
    if (existing) found = { projectId: ctx.projectId, version: project!.version, doc: existing };
  }
  const remoteFields = pageFields(page);
  const linkInput = {
    provider: 'confluence' as const, extType: 'page' as const, extId: page.id, extKey: `${page.spaceKey}:${page.id}`,
    extUrl: page.sourceUrl, localType: 'doc' as const, sourceUpdatedAt: page.updatedAt,
  };

  if (!found) {
    const docId = `doc-conf-${crypto.createHash('sha1').update(`${ctx.cred.conn.id}:${page.id}`).digest('hex').slice(0, 16)}`;
    const users = activeUsers(ctx.orgId);
    const parent = page.parentId
      ? integrationStore.findExternalLink(ctx.orgId, 'confluence', ctx.cred.conn.id, 'page', page.parentId)
      : undefined;
    const written = await writeDoc(ctx.orgId, ctx.projectId, docId, () => ({
      id: docId,
      title: remoteFields.title,
      content: remoteFields.content,
      authorId: findUser(users, page.author) || ctx.actorUserId,
      authorName: page.author.slice(0, 300),
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      parentId: parent?.localEntityId || null,
      ...docMetadata(page),
    }));
    saveLink(ctx, { ...linkInput, localId: docId, projectId: ctx.projectId, base: remoteFields, localVersion: written.version, pushError: null });
    return outcomeFor(true, 0, 0, 1, {}, docId);
  }

  const docId = str(found.doc.id);
  const localFields = pageFields({ title: found.doc.title, content: found.doc.content });
  const merge = threeWayMerge({
    base: link?.base,
    local: localFields,
    remote: remoteFields,
    bidirectional: ctx.bidirectional,
    pushable: PAGE_PUSHABLE,
    policy: ctx.policy,
    dismissed: link?.dismissed,
  });

  let failures: Record<string, string> = {};
  let current = page;
  const toPush = Object.keys(merge.remotePatch);
  if (toPush.length) {
    // the listing used for bulk syncs has no raw markup; re-read right before writing
    const raw = await fetchConfluencePage(ctx.cred, page.id);
    if (!raw || raw.version !== page.version) throw new ItemError('The page changed during the sync; it will be merged on the next run.');
    failures = await pushConfluencePage(ctx.cred, raw, merge.remotePatch);
    restoreBase(merge.base, link?.base, Object.keys(failures));
    const after = await fetchConfluencePage(ctx.cred, page.id);
    if (after) {
      current = after;
      const canonical = pageFields(after);
      for (const f of toPush) {
        if (failures[f]) continue;
        merge.base[f] = canonical[f];
        if (!same(canonical[f], localFields[f])) merge.localPatch[f] = canonical[f];
      }
    }
  }

  const pulled = Object.keys(merge.localPatch).length;
  let version = found.version;
  let doc = found.doc;
  const metadataStale = doc.sourceProvider !== 'confluence' || doc.externalId !== page.id || doc.version !== current.version;
  if (pulled || metadataStale) {
    const written = await writeDoc(ctx.orgId, found.projectId, docId, existing => {
      const base = existing || doc;
      if (pulled && !same(pageFields({ title: base.title, content: base.content }), localFields)) {
        throw new ItemError('The document was edited during the sync; it will be merged on the next run.');
      }
      const next: Rec = { ...base, ...merge.localPatch };
      const meta = docMetadata(current);
      // stale rich blocks would hide the new text
      if ('content' in merge.localPatch) delete next.structuredBlocks;
      else delete meta.structuredBlocks;
      return { ...next, ...meta, ...(pulled ? { updatedAt: nowIso() } : {}) };
    });
    version = written.version;
    doc = written.doc;
  }
  const saved = saveLink(ctx, {
    ...linkInput, localId: docId, projectId: found.projectId, base: merge.base, localVersion: version,
    pushError: Object.values(failures).join(' ') || null,
  });
  recordConflicts(ctx, saved, merge.conflicts, pageFields({ title: doc.title, content: doc.content }), remoteFields, version);
  return outcomeFor(false, merge.conflicts.length, toPush.length - Object.keys(failures).length, pulled, failures, docId);
}

// ---------------------------------------------------------------------------
// Sync one linked record (local change, webhook)
// ---------------------------------------------------------------------------

export async function syncLink(orgId: string, linkId: string, jobId = 'push'): Promise<ItemOutcome | null> {
  const link = integrationStore.getExternalLink(orgId, linkId);
  if (!link || (link.provider !== 'jira' && link.provider !== 'confluence')) return null;
  return withCredential(orgId, link.connectionId, async cred => {
    const ctx: SyncContext = {
      orgId,
      cred,
      projectId: link.localProjectId || '',
      bidirectional: Boolean(link.bidirectional),
      policy: link.conflictPolicy || 'manual_review',
      statusMap: link.statusMap || {},
      jobId,
      actorUserId: cred.conn.userId,
    };
    const remote =
      link.provider === 'jira' ? await fetchJiraIssue(cred, link.externalEntityId) : await fetchConfluencePage(cred, link.externalEntityId);
    if (!remote) {
      integrationStore.patchExternalLink(orgId, link.id, { missingInSource: true });
      integrationStore.appendAuditLog({
        organizationId: orgId, actorUserId: 'system', actorRole: 'system', provider: link.provider, action: 'flag_missing_source_records',
        resourceType: 'external_link', resourceId: link.id, status: 'warning',
        summary: `${link.externalKey} no longer exists in ${link.provider}; the local copy was kept.`,
      });
      return { action: 'skip', status: 'succeeded', localId: link.localEntityId, error: 'Missing in source.' } as ItemOutcome;
    }
    const outcome =
      link.provider === 'jira' ? await syncJiraItem(ctx, remote as NormalizedJiraIssue) : await syncConfluencePage(ctx, remote as RemotePage);
    if (outcome.status === 'failed') {
      integrationStore.appendAuditLog({
        organizationId: orgId, actorUserId: 'system', actorRole: 'system', provider: link.provider, action: 'push_failed',
        resourceType: 'external_link', resourceId: link.id, status: 'warning', summary: `${link.externalKey}: ${outcome.error}`.slice(0, 400),
      });
    }
    return outcome;
  });
}

registerJobHandler('integration.push', async job => {
  const { linkId } = job.payload as { linkId?: string };
  if (!linkId) throw new PermanentJobError('Missing link id.');
  try {
    await syncLink(job.orgId, linkId);
  } catch (err) {
    if (err instanceof RateLimitedError) {
      enqueueJob(job.orgId, 'integration.push', { linkId }, { runAt: err.retryAtMs + 1000, dedupeKey: `push-${linkId}-rl-${err.retryAtMs}` });
      return;
    }
    integrationStore.patchExternalLink(job.orgId, linkId, { pushError: (err as Error).message.slice(0, 300) });
    if (err instanceof AuthRejectedError) throw new PermanentJobError(err.message);
    throw err;
  }
});

/** Reacts to a change reported by the source system (webhook). Returns what was queued. */
export function handleExternalChange(
  orgId: string,
  provider: 'jira' | 'confluence',
  change: { externalId: string; containerKey?: string; deleted?: boolean; stamp: string }
): string {
  const conn = integrationStore.getConnection(orgId, provider);
  if (!conn) return `No ${provider} connection.`;
  const type = provider === 'jira' ? 'issue' : 'page';
  const link = integrationStore.findExternalLink(orgId, provider, conn.id, type, change.externalId);
  if (change.deleted) {
    if (!link) return 'Not synced here; nothing to do.';
    integrationStore.patchExternalLink(orgId, link.id, { missingInSource: true });
    return `Flagged ${link.externalKey} as removed in ${provider}; the local copy was kept.`;
  }
  if (link) {
    enqueueJob(orgId, 'integration.push', { linkId: link.id }, { maxAttempts: 4, dedupeKey: `push-${link.id}-wh-${change.stamp}` });
    return `Queued refresh of ${link.externalKey}.`;
  }
  const configs = integrationStore
    .listConfigs(orgId)
    .filter(c => c.enabled && c.provider === provider)
    .filter(c => c.sourceScopes.length === 0 || (change.containerKey && c.sourceScopes.includes(change.containerKey)));
  // a custom JQL filter cannot be evaluated for a single record here
  const config = configs.find(c => !c.jqlOrCqlFilter);
  if (!config) return 'No sync profile covers this record; ignored.';
  const job = createJobForConfig(config, 'incremental', `Webhook: ${provider} ${change.externalId}`, [change.externalId]);
  enqueueSyncJob(job);
  return `Queued import of a new ${type} using profile "${config.name}".`;
}

// ---------------------------------------------------------------------------
// Conflict resolution
// ---------------------------------------------------------------------------

export type Resolution = 'resolved_source' | 'resolved_destination' | 'resolved_merged' | 'dismissed';

export async function resolveSyncConflict(
  orgId: string,
  conflictId: string,
  resolution: Resolution,
  actor: Actor,
  mergedFields: Record<string, 'source' | 'destination'> = {}
): Promise<{ conflict: IntegrationConflictRecord; notes: string[] }> {
  const pending = integrationStore.getConflict(orgId, conflictId);
  if (!pending) throw notFound('Conflict record not found.');
  if (pending.status !== 'pending') throw conflictError('This conflict has already been resolved.');
  const link = pending.externalLinkId ? integrationStore.getExternalLink(orgId, pending.externalLinkId) : undefined;
  const finish = (note?: string) => integrationStore.resolveConflict(orgId, conflictId, resolution, actor.email, mergedFields, note)!;

  if (!link || (link.provider !== 'jira' && link.provider !== 'confluence')) {
    if (resolution !== 'dismissed') throw conflictError('The synced record behind this conflict no longer exists. You can only dismiss it.');
    return { conflict: finish(), notes: [] };
  }

  if (resolution === 'dismissed') {
    // keep both values as they are and do not raise the same difference again
    const dismissed = { ...(link.dismissed || {}) };
    for (const d of pending.fieldDiffs) dismissed[d.field] = pairHash(d.localValue, d.sourceValue);
    integrationStore.patchExternalLink(orgId, link.id, { dismissed });
    return { conflict: finish(), notes: [] };
  }

  return withCredential(orgId, link.connectionId, async cred => {
    const isJira = link.provider === 'jira';
    const remote = isJira ? await fetchJiraIssue(cred, link.externalEntityId) : await fetchConfluencePage(cred, link.externalEntityId);
    if (!remote) throw conflictError(`${link.externalKey} no longer exists in ${link.provider}.`);
    const issue = isJira ? getRecord(orgId, 'issues', link.localEntityId) : null;
    const found = isJira ? undefined : findDoc(orgId, link.localEntityId);
    if (isJira ? !issue : !found) throw conflictError('The local record no longer exists.');
    const projectId = isJira ? str(issue!.record.projectId) : found!.projectId;
    const statuses = projectStatuses(orgId, projectId);
    const users = activeUsers(orgId);
    const statusMap = link.statusMap || {};
    const remoteNow = isJira ? remoteIssueFields(remote as NormalizedJiraIssue, statuses, statusMap, users) : pageFields(remote as RemotePage);
    const localNow = isJira ? localIssueFields(issue!.record) : pageFields({ title: found!.doc.title, content: found!.doc.content });

    // The person decided on specific values. If either side moved since, show the new ones instead of applying.
    const moved = pending.fieldDiffs.filter(d => !same(localNow[d.field], d.localValue) || !same(remoteNow[d.field], d.sourceValue));
    if (moved.length) {
      integrationStore.refreshConflict(pending, {
        fieldDiffs: pending.fieldDiffs.map(d => ({ ...d, localValue: localNow[d.field] ?? null, sourceValue: remoteNow[d.field] ?? null })),
        localSnapshot: localNow,
        sourceSnapshot: remoteNow,
      });
      throw new HttpError(409, 'CONFLICT_STALE', `Values changed since this conflict was detected (${moved.map(d => d.field).join(', ')}). Review the updated values and resolve again.`);
    }

    const localPatch: Fields = {};
    const remotePatch: Fields = {};
    const base: Fields = { ...(link.base || {}) };
    const notes: string[] = [];
    const pushable = isJira ? JIRA_PUSHABLE : PAGE_PUSHABLE;
    for (const d of pending.fieldDiffs) {
      const side = resolution === 'resolved_source' ? 'source' : resolution === 'resolved_destination' ? 'destination' : mergedFields[d.field] || 'destination';
      if (side === 'source') {
        localPatch[d.field] = remoteNow[d.field];
        base[d.field] = remoteNow[d.field];
      } else if (link.bidirectional && pushable.has(d.field)) {
        remotePatch[d.field] = localNow[d.field];
        base[d.field] = localNow[d.field];
      } else {
        base[d.field] = remoteNow[d.field];
        notes.push(`"${d.field}" keeps the local value here; ${link.provider} was not changed (${link.bidirectional ? 'field is read-only there' : 'one-way sync'}).`);
      }
    }

    if (Object.keys(remotePatch).length) {
      const failures = isJira
        ? await pushJiraFields(cred, (remote as NormalizedJiraIssue).key, remotePatch, { statuses, statusMap, orgId })
        : await pushConfluencePage(cred, remote as RemotePage, remotePatch);
      if (Object.keys(failures).length) {
        // nothing is marked resolved unless the source really took the values
        throw new HttpError(502, 'PUSH_FAILED', Object.values(failures).join(' '));
      }
      const after = isJira ? await fetchJiraIssue(cred, link.externalEntityId) : await fetchConfluencePage(cred, link.externalEntityId);
      if (after) {
        const canonical = isJira ? remoteIssueFields(after as NormalizedJiraIssue, statuses, statusMap, users) : pageFields(after as RemotePage);
        for (const f of Object.keys(remotePatch)) {
          if (canonical[f] === undefined) continue;
          base[f] = canonical[f];
          if (!same(canonical[f], localNow[f])) localPatch[f] = canonical[f];
        }
      }
    }

    let localVersion = isJira ? issue!.version : found!.version;
    if (Object.keys(localPatch).length) {
      if (isJira) {
        localVersion = (await writeIssue(orgId, issueWithPatch(issue!.record, localPatch), issue!.version, actor)).version;
      } else {
        const written = await writeDoc(orgId, projectId, link.localEntityId, doc => {
          const next: Rec = { ...(doc || found!.doc), ...localPatch, updatedAt: nowIso() };
          if ('content' in localPatch) delete next.structuredBlocks;
          return next;
        }, actor);
        localVersion = written.version;
      }
    }
    const dismissed = { ...(link.dismissed || {}) };
    for (const d of pending.fieldDiffs) delete dismissed[d.field];
    integrationStore.patchExternalLink(orgId, link.id, { base, dismissed, localVersion, pushError: null, lastSyncedAt: nowIso() });
    return { conflict: finish(notes.join(' ') || undefined), notes };
  });
}

// ---------------------------------------------------------------------------
// Sync jobs
// ---------------------------------------------------------------------------

export function enqueueSyncJob(job: IntegrationJobRecord, runAt?: number): void {
  enqueueJob(job.organizationId, 'integration.sync', { jobId: job.id }, {
    maxAttempts: job.maxAttempts,
    runAt,
    dedupeKey: `sync-${job.id}-${crypto.randomUUID().slice(0, 8)}`,
  });
}

function createJobForConfig(cfg: IntegrationConfigRecord, mode: 'full' | 'incremental', label: string, onlyExternalIds?: string[]): IntegrationJobRecord {
  return integrationStore.createJob({
    organizationId: cfg.organizationId,
    createdByUserId: 'scheduler',
    configId: cfg.id,
    connectionId: cfg.connectionId,
    provider: cfg.provider,
    mode,
    sourceLabel: label,
    targetSpaceKey: cfg.targetProjectId,
    destinationModule: cfg.destinationModule,
    conflictPolicy: cfg.conflictPolicy,
    pendingPayload: { sourceScopes: cfg.sourceScopes, jqlOrCql: cfg.jqlOrCqlFilter, bidirectional: cfg.bidirectional, onlyExternalIds },
  });
}

export function findTargetProject(orgId: string, idOrKey: string): string | undefined {
  const wanted = idOrKey.toLowerCase();
  const match = listCollection(orgId, 'projects').find(p => str(p.record.id).toLowerCase() === wanted || str(p.record.key).toLowerCase() === wanted);
  return match ? str(match.record.id) : undefined;
}

interface Fetched {
  items: Array<{ id: string; key: string; type: 'issue' | 'page'; raw: unknown }>;
  /** The list is every record in scope, so linked records that are absent were removed at the source. */
  complete: boolean;
  missingIds: string[];
}

const JIRA_PAGE_CAP = 200;
const CONFLUENCE_PAGE_CAP = 150;

async function fetchForJob(job: IntegrationJobRecord, cred: ResolvedCredential, cfg: IntegrationConfigRecord | undefined): Promise<Fetched> {
  const payload = job.pendingPayload || {};
  const isJira = job.provider === 'jira';
  const only = payload.onlyExternalIds;
  if (only?.length) {
    const items: Fetched['items'] = [];
    const missingIds: string[] = [];
    for (const id of only) {
      if (isJira) {
        const r = await fetchJiraIssue(cred, id);
        if (r) items.push({ id: r.id || r.key, key: r.key, type: 'issue', raw: r });
        else missingIds.push(id);
      } else {
        const r = await fetchConfluencePage(cred, id);
        if (r) items.push({ id: r.id, key: `${r.spaceKey}:${r.id}`, type: 'page', raw: r });
        else missingIds.push(id);
      }
    }
    return { items, complete: false, missingIds };
  }

  const updatedSince = job.mode === 'incremental' ? cfg?.lastCheckpointCursor : undefined;
  const scopes = payload.sourceScopes || cfg?.sourceScopes || [];
  const jql = payload.jqlOrCql || cfg?.jqlOrCqlFilter || '';
  // surfaces an expired token as 401 (discovery would only report a generic failure)
  await call(cred, isJira ? '/rest/api/3/myself' : '/wiki/rest/api/user/current');
  if (isJira) {
    const found = await discoverJiraData({ conn: cred.conn, secret: cred.secret, projectKeys: scopes, jql, maxResults: JIRA_PAGE_CAP, updatedSince });
    return {
      items: found.issues.map(i => ({ id: i.id || i.key, key: i.key, type: 'issue' as const, raw: i })),
      complete: !updatedSince && !jql && scopes.length > 0 && found.issues.length < JIRA_PAGE_CAP,
      missingIds: [],
    };
  }
  const found = await discoverConfluenceData({ conn: cred.conn, secret: cred.secret, spaceKeys: scopes, maxResults: CONFLUENCE_PAGE_CAP, updatedSince });
  const pages = found.pages
    .map(p => ({ ...p, storage: '' }) as RemotePage)
    // parents first so child pages can point at them
    .sort((a, b) => a.ancestors.length - b.ancestors.length);
  return {
    items: pages.map(p => ({ id: p.id, key: `${p.spaceKey}:${p.id}`, type: 'page' as const, raw: p })),
    complete: !updatedSince && scopes.length > 0 && found.pages.length < CONFLUENCE_PAGE_CAP,
    missingIds: [],
  };
}

export async function runSyncJob(jobId: string): Promise<void> {
  const job = integrationStore.getRawJobById(jobId);
  if (!job || (job.status !== 'queued' && job.status !== 'running')) return;
  if (job.provider !== 'jira' && job.provider !== 'confluence') throw new PermanentJobError('Background sync supports Jira and Confluence.');
  const orgId = job.organizationId;
  const conn =
    (job.connectionId ? integrationStore.getConnectionById(orgId, job.connectionId) : undefined) || integrationStore.getConnection(orgId, job.provider);
  if (!conn) throw new PermanentJobError(`No ${job.provider} connection. Connect it first.`);
  const projectId = findTargetProject(orgId, job.targetSpaceKey);
  if (!projectId) throw new PermanentJobError(`Space "${job.targetSpaceKey}" does not exist. Choose an existing space.`);
  const cfg = job.configId ? integrationStore.getConfig(orgId, job.configId) : undefined;
  const startedAt = nowIso();

  const counts = { totalItems: 0, processedItems: 0, createdCount: 0, updatedCount: 0, skippedCount: 0, failedCount: 0, conflictCount: 0 };
  integrationStore.updateJob(jobId, {
    status: 'running', startedAt: job.startedAt || startedAt, attemptCount: job.attemptCount + 1, errorSummary: undefined, nextRetryAt: null, ...counts,
  });

  const stopped = await withCredential(orgId, conn.id, async cred => {
    Object.assign(counts, { processedItems: 0, createdCount: 0, updatedCount: 0, skippedCount: 0, failedCount: 0, conflictCount: 0 });
    const fetched = await fetchForJob(job, cred, cfg);
    counts.totalItems = fetched.items.length;
    integrationStore.updateJob(jobId, counts);
    const ctx: SyncContext = {
      orgId,
      cred,
      projectId,
      bidirectional: Boolean(job.pendingPayload?.bidirectional ?? cfg?.bidirectional),
      policy: job.conflictPolicy,
      statusMap: job.pendingPayload?.statusMap || {},
      jobId,
      configId: job.configId,
      actorUserId: job.createdByUserId === 'scheduler' ? cred.conn.userId : job.createdByUserId,
    };

    for (const [index, item] of fetched.items.entries()) {
      const latest = integrationStore.getRawJobById(jobId);
      if (!latest || latest.status === 'cancelled' || latest.status === 'paused') return true;
      let outcome: ItemOutcome;
      try {
        outcome = item.type === 'issue' ? await syncJiraItem(ctx, item.raw as NormalizedJiraIssue) : await syncConfluencePage(ctx, item.raw as RemotePage);
      } catch (err) {
        if (err instanceof RateLimitedError || err instanceof AuthRejectedError) throw err;
        const details = (err as { details?: unknown }).details;
        outcome = { action: 'fail', status: 'failed', error: `${(err as Error).message}${details ? ` ${JSON.stringify(details).slice(0, 200)}` : ''}` };
      }
      if (outcome.action === 'create') counts.createdCount += 1;
      else if (outcome.action === 'update' || outcome.action === 'push') counts.updatedCount += 1;
      else if (outcome.action === 'conflict') counts.conflictCount += 1;
      else if (outcome.action === 'fail') counts.failedCount += 1;
      else counts.skippedCount += 1;
      counts.processedItems = index + 1;
      integrationStore.addOrUpdateJobItem({
        id: '', jobId, externalEntityType: item.type, externalEntityId: item.id, externalKey: item.key,
        localEntityType: item.type === 'issue' ? 'issue' : 'doc', localEntityId: outcome.localId, action: outcome.action, status: outcome.status,
        rowNumber: index + 1, errorMessage: outcome.error?.slice(0, 500),
      });
      integrationStore.updateJob(jobId, { ...counts, checkpointCursor: String(index + 1) });
    }

    // records that disappeared at the source are only flagged, never deleted here
    const type = job.provider === 'jira' ? 'issue' : 'page';
    const gone = [...fetched.missingIds];
    if (fetched.complete) {
      const seen = new Set(fetched.items.map(i => i.id));
      const scopes = new Set(job.pendingPayload?.sourceScopes || cfg?.sourceScopes || []);
      for (const link of integrationStore.listExternalLinks(orgId, job.provider)) {
        const container = job.provider === 'jira' ? link.externalKey.split('-')[0] : link.externalKey.split(':')[0];
        if (link.connectionId === conn.id && link.externalEntityType === type && link.localProjectId === projectId && scopes.has(container) && !seen.has(link.externalEntityId)) {
          gone.push(link.externalEntityId);
        }
      }
    }
    let flagged = 0;
    for (const id of gone) {
      const link = integrationStore.findExternalLink(orgId, job.provider as 'jira', conn.id, type, id);
      if (link && !link.missingInSource) {
        integrationStore.patchExternalLink(orgId, link.id, { missingInSource: true });
        flagged += 1;
      }
    }
    if (flagged) {
      integrationStore.appendAuditLog({
        organizationId: orgId, actorUserId: job.createdByUserId, actorRole: 'system', provider: job.provider, action: 'flag_missing_source_records',
        resourceType: 'integration_job', resourceId: jobId, status: 'warning',
        summary: `Flagged ${flagged} previously synced record(s) missing in source without deleting local data.`,
      });
    }
    return false;
  });
  if (stopped) return;
  const latest = integrationStore.getRawJobById(jobId);
  if (!latest || latest.status === 'cancelled' || latest.status === 'paused') return;

  const partial = counts.failedCount > 0 || counts.conflictCount > 0;
  const finishedAt = nowIso();
  integrationStore.updateJob(jobId, { ...counts, status: partial ? 'partial' : 'completed', finishedAt });
  integrationStore.markConnectionSynced(orgId, job.provider, finishedAt);
  if (cfg && !job.pendingPayload?.onlyExternalIds) {
    integrationStore.upsertConfig({
      ...cfg,
      // the cursor is the start of the run (nothing changed during it is lost) and stays put while items fail
      lastCheckpointCursor: counts.failedCount ? cfg.lastCheckpointCursor : startedAt,
      lastSuccessfulSyncAt: finishedAt,
    });
  }
  integrationStore.appendHistory({
    organizationId: orgId, userId: job.createdByUserId, provider: job.provider, status: partial ? 'partial' : 'success',
    sourceLabel: job.sourceLabel, targetSpaceKey: job.targetSpaceKey, createdCount: counts.createdCount, updatedCount: counts.updatedCount,
    skippedCount: counts.skippedCount,
  });
  integrationStore.appendAuditLog({
    organizationId: orgId, actorUserId: job.createdByUserId, actorRole: 'system', provider: job.provider, action: 'sync_job_finished',
    resourceType: 'integration_job', resourceId: jobId, status: partial ? 'warning' : 'success',
    summary: `Job ${jobId} (${job.provider}) finished: +${counts.createdCount} created, ~${counts.updatedCount} updated, ${counts.skippedCount} unchanged, ${counts.conflictCount} conflicts, ${counts.failedCount} failed.`,
  });
}

registerJobHandler('integration.sync', async queued => {
  const { jobId } = queued.payload as { jobId?: string };
  if (!jobId) throw new PermanentJobError('Missing sync job id.');
  try {
    await runSyncJob(jobId);
  } catch (err) {
    const job = integrationStore.getRawJobById(jobId);
    if (!job) throw err;
    const message = (err instanceof Error ? err.message : 'Sync failed.').slice(0, 400);
    const log = (summary: string) =>
      integrationStore.appendAuditLog({
        organizationId: job.organizationId, actorUserId: job.createdByUserId, actorRole: 'system', provider: job.provider,
        action: 'sync_job_error', resourceType: 'integration_job', resourceId: job.id, status: 'failed', summary,
      });
    if (err instanceof RateLimitedError) {
      integrationStore.updateJob(jobId, { status: 'queued', errorSummary: message, nextRetryAt: new Date(err.retryAtMs).toISOString() });
      enqueueSyncJob(integrationStore.getRawJobById(jobId)!, err.retryAtMs + 1000);
      return;
    }
    const permanent = err instanceof PermanentJobError || err instanceof AuthRejectedError || queued.attempts >= queued.maxAttempts;
    integrationStore.updateJob(jobId, { status: permanent ? 'failed' : 'queued', errorSummary: message, finishedAt: permanent ? nowIso() : null });
    log(message);
    if (permanent) throw new PermanentJobError(message);
    throw err;
  }
});

export function pauseSyncJob(orgId: string, jobId: string): IntegrationJobRecord | undefined {
  const job = integrationStore.getRawJobById(jobId);
  if (!job || job.organizationId !== orgId) return undefined;
  if (job.status !== 'running' && job.status !== 'queued') return job;
  return integrationStore.updateJob(jobId, { status: 'paused' });
}

export function resumeSyncJob(orgId: string, jobId: string): IntegrationJobRecord | undefined {
  const job = integrationStore.getRawJobById(jobId);
  if (!job || job.organizationId !== orgId) return undefined;
  if (job.status !== 'paused' && job.status !== 'failed') return job;
  const updated = integrationStore.updateJob(jobId, { status: 'queued', errorSummary: undefined, finishedAt: null });
  if (updated) enqueueSyncJob(updated);
  return updated;
}

export function cancelSyncJob(orgId: string, jobId: string): IntegrationJobRecord | undefined {
  const job = integrationStore.getRawJobById(jobId);
  if (!job || job.organizationId !== orgId) return undefined;
  if (job.status === 'completed' || job.status === 'cancelled') return job;
  return integrationStore.updateJob(jobId, { status: 'cancelled', finishedAt: nowIso() });
}

export function retryFailedSyncJob(orgId: string, jobId: string): IntegrationJobRecord | undefined {
  const job = integrationStore.getRawJobById(jobId);
  if (!job || job.organizationId !== orgId) return undefined;
  if (job.status === 'running' || job.status === 'queued') return job;
  const updated = integrationStore.updateJob(jobId, { status: 'queued', attemptCount: 0, errorSummary: undefined, finishedAt: null });
  if (updated) enqueueSyncJob(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

let timer: ReturnType<typeof setInterval> | null = null;

export function scheduleDueSyncs(now = Date.now()): number {
  let queued = 0;
  for (const cfg of integrationStore.listAllEnabledScheduledConfigs()) {
    if (cfg.provider !== 'jira' && cfg.provider !== 'confluence') continue;
    const conn = integrationStore.getConnection(cfg.organizationId, cfg.provider);
    if (!conn || conn.healthStatus === 'needs_reauth') continue;
    const recent = integrationStore.listJobsForConfig(cfg.organizationId, cfg.id);
    if (recent.some(j => j.status === 'queued' || j.status === 'running' || j.status === 'paused')) continue;
    // measured from the last attempt so a failing profile is not retried every minute
    const last = Math.max(cfg.lastSuccessfulSyncAt ? Date.parse(cfg.lastSuccessfulSyncAt) : 0, recent[0] ? Date.parse(recent[0].createdAt) : 0);
    if (now - last < cfg.syncIntervalMinutes * 60_000) continue;
    enqueueSyncJob(createJobForConfig(cfg, cfg.lastCheckpointCursor ? 'incremental' : 'full', `Scheduled: ${cfg.name}`));
    queued += 1;
  }
  return queued;
}

/** Re-queues sync jobs that were active when the server stopped, then starts the profile scheduler. */
export function recoverInterruptedJobsAndStartScheduler(): void {
  for (const job of integrationStore.getRecoverableJobs()) {
    integrationStore.updateJob(job.id, { status: 'queued' });
    enqueueSyncJob(job);
  }
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    try {
      scheduleDueSyncs();
    } catch (err) {
      console.error('[sync] scheduler failed:', err);
    }
  }, 60_000);
  timer.unref?.();
}
