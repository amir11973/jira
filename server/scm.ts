/**
 * Source-control integration (GitHub / GitHub Enterprise / GitLab): repositories, pull requests, branches,
 * commits, deployments and vulnerability alerts. Data comes from the provider API (full sync) or from signed
 * webhooks (incremental), is stored in scm_items, and is reflected onto work items as *verified* dev links.
 *
 * Security: API requests only ever go to the address an administrator configured on the connection, and a
 * repository record is only synced when its web host belongs to that connection, so editing a repository
 * record can never redirect the stored token somewhere else.
 */
import crypto from 'node:crypto';
import { db, transaction } from './db.ts';
import { PermanentJobError, enqueueJob, registerJobHandler } from './jobs.ts';
import { AuthRejectedError, buildAuthHeaders, RateLimitedError, safeExternalFetch } from './httpClient.ts';
import type { ExternalFetchResult } from './httpClient.ts';
import { integrationStore } from './store.ts';
import type { RepoSyncState, StoredConnectionRecord } from './store.ts';
import { withCredential } from './tokens.ts';
import type { ResolvedCredential } from './tokens.ts';
import { applyBatch, getRecord, listUsers } from './repo.ts';
import { notifyUser } from './notify.ts';
import type { Actor } from './permissions.ts';
import { stableStringify } from './cryptoVault.ts';

type Rec = Record<string, unknown>;

export type ScmProvider = 'github' | 'gitlab';
export type ScmKind = 'pr' | 'branch' | 'commit' | 'deployment' | 'vulnerability';

export interface ScmRepository {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  defaultBranch?: string;
  enabled: boolean;
  projectIds?: string[];
}

export interface ScmPullRequest {
  number: number;
  title: string;
  state: 'open' | 'merged' | 'closed';
  url: string;
  author: string;
  sourceBranch: string;
  targetBranch: string;
  headSha?: string;
  mergeSha?: string;
  createdAt?: string;
  updatedAt?: string;
  mergedAt?: string;
  draft?: boolean;
  deployedAt?: string;
  environment?: string;
}

export interface ScmBranch {
  name: string;
  sha: string;
  url: string;
  isDefault?: boolean;
  protected?: boolean;
}

export interface ScmCommit {
  sha: string;
  message: string;
  author: string;
  authoredAt?: string;
  url: string;
  onDefaultBranch?: boolean;
  deployedAt?: string;
  environment?: string;
}

export interface ScmDeployment {
  id: string;
  environment: string;
  sha: string;
  ref?: string;
  state: 'success' | 'failure' | 'pending' | 'inactive';
  createdAt?: string;
  updatedAt?: string;
  url?: string;
}

export interface ScmVulnerability {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
  state: 'open' | 'fixed' | 'dismissed';
  package: string;
  ecosystem?: string;
  summary: string;
  advisoryId?: string;
  cve?: string;
  url?: string;
  patchedVersion?: string;
  createdAt?: string;
  fixedAt?: string;
}

export interface ScmSnapshot {
  defaultBranch?: string;
  pullRequests?: ScmPullRequest[];
  branches?: ScmBranch[];
  commits?: ScmCommit[];
  deployments?: ScmDeployment[];
  vulnerabilities?: ScmVulnerability[];
}

const SYSTEM = (orgId: string): Actor => ({ userId: 'system', orgId, email: 'system@jiraflow.local', role: 'admin' });
const nowIso = () => new Date().toISOString();

const str = (v: unknown): string => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));
const obj = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const opt = (v: unknown): string | undefined => str(v) || undefined;

// ---------------------------------------------------------------------------
// Repository records & connection matching
// ---------------------------------------------------------------------------

export function listRepositories(orgId: string): ScmRepository[] {
  const rows = db
    .prepare("SELECT data FROM records WHERE collection = 'repositories' AND org_id = ? AND deleted = 0 ORDER BY created_at, rowid")
    .all(orgId) as unknown as Array<{ data: string }>;
  return rows.map(r => JSON.parse(r.data) as ScmRepository);
}

export function getRepository(orgId: string, repoId: string): ScmRepository | undefined {
  return listRepositories(orgId).find(r => r.id === repoId);
}

/** "owner/name" (or a GitLab group path) taken from the repository web URL. */
export function repoPathOf(repo: ScmRepository): string {
  const p = new URL(repo.baseUrl).pathname.replace(/\.git$/, '').replace(/^\/+|\/+$/g, '');
  return p || repo.name;
}

/** Returns why the connection may not be used for this repository, or null when it matches. */
export function repoConnectionProblem(repo: ScmRepository, conn: StoredConnectionRecord | undefined): string | null {
  if (repo.provider !== 'github' && repo.provider !== 'gitlab') {
    return `Automatic sync is available for GitHub and GitLab repositories (this one is "${repo.provider}").`;
  }
  if (!conn) return `No ${repo.provider} account is connected. Connect it in the Integration Center.`;
  let web: URL;
  let api: URL;
  try {
    web = new URL(repo.baseUrl);
    api = new URL(conn.serverUrl);
  } catch {
    return 'The repository or connection URL is invalid.';
  }
  const webHost = web.host.toLowerCase();
  const apiHost = api.host.toLowerCase();
  const cloud = repo.provider === 'github' && apiHost === 'api.github.com' && webHost === 'github.com';
  if (!cloud && webHost !== apiHost) {
    return `Repository host "${webHost}" does not belong to the connected ${repo.provider} account (${apiHost}).`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Provider adapters
// ---------------------------------------------------------------------------

class FeatureUnavailable extends Error {}

async function api(cred: ResolvedCredential, path: string): Promise<ExternalFetchResult> {
  const headers = buildAuthHeaders(cred.conn.authMethod, cred.secret, cred.conn.email, cred.conn.username);
  if (cred.conn.provider === 'github') {
    headers.Accept = 'application/vnd.github+json';
    headers['X-GitHub-Api-Version'] = '2022-11-28';
  }
  const res = await safeExternalFetch(cred.conn.serverUrl, path, headers);
  if (res.status === 401) throw new AuthRejectedError(`${cred.conn.provider} rejected the token (HTTP 401).`);
  return res;
}

async function getJson(cred: ResolvedCredential, path: string, optional = false): Promise<unknown> {
  const res = await api(cred, path);
  if (res.ok) return res.data;
  if (optional && (res.status === 403 || res.status === 404 || res.status === 410)) {
    throw new FeatureUnavailable(`HTTP ${res.status}`);
  }
  throw new Error(`${cred.conn.provider} API returned HTTP ${res.status} for ${path.split('?')[0]}.`);
}

async function paginate(cred: ResolvedCredential, path: string, perPage: number, maxPages: number, optional = false): Promise<Rec[]> {
  const out: Rec[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await getJson(cred, `${path}${path.includes('?') ? '&' : '?'}per_page=${perPage}&page=${page}`, optional);
    if (!Array.isArray(data)) break;
    out.push(...(data as Rec[]));
    if (data.length < perPage) break;
  }
  return out;
}

export function normalizeSeverity(v: unknown): ScmVulnerability['severity'] {
  const s = str(v).toLowerCase();
  if (s === 'critical' || s === 'high' || s === 'low') return s;
  if (s === 'medium' || s === 'moderate') return 'medium';
  return 'unknown';
}

export const githubMap = {
  pr(p: Rec): ScmPullRequest {
    const merged = Boolean(p.merged_at) || p.merged === true;
    return {
      number: Number(p.number),
      title: str(p.title),
      state: merged ? 'merged' : p.state === 'closed' ? 'closed' : 'open',
      url: str(p.html_url),
      author: str(obj(p.user).login),
      sourceBranch: str(obj(p.head).ref),
      targetBranch: str(obj(p.base).ref),
      headSha: opt(obj(p.head).sha),
      mergeSha: merged ? opt(p.merge_commit_sha) : undefined,
      createdAt: opt(p.created_at),
      updatedAt: opt(p.updated_at),
      mergedAt: opt(p.merged_at),
      draft: p.draft === true,
    };
  },
  commit(c: Rec, webUrl: string): ScmCommit {
    const inner = obj(c.commit);
    const sha = str(c.sha);
    return {
      sha,
      message: str(inner.message),
      author: str(obj(c.author).login) || str(obj(inner.author).name),
      authoredAt: opt(obj(inner.author).date),
      url: str(c.html_url) || `${webUrl}/commit/${sha}`,
    };
  },
  deploymentState(s: unknown): ScmDeployment['state'] {
    const v = str(s);
    if (v === 'success') return 'success';
    if (v === 'failure' || v === 'error') return 'failure';
    if (v === 'inactive') return 'inactive';
    return 'pending';
  },
  vulnerability(a: Rec): ScmVulnerability {
    const adv = obj(a.security_advisory);
    const dep = obj(obj(a.dependency).package);
    const sv = obj(a.security_vulnerability);
    const state = str(a.state);
    return {
      id: str(a.number),
      severity: normalizeSeverity(sv.severity || adv.severity),
      state: state === 'open' ? 'open' : state === 'fixed' ? 'fixed' : 'dismissed',
      package: str(dep.name) || str(obj(sv.package).name),
      ecosystem: opt(dep.ecosystem),
      summary: str(adv.summary),
      advisoryId: opt(adv.ghsa_id),
      cve: opt(adv.cve_id),
      url: opt(a.html_url),
      patchedVersion: opt(obj(sv.first_patched_version).identifier),
      createdAt: opt(a.created_at),
      fixedAt: opt(a.fixed_at),
    };
  },
};

export const gitlabMap = {
  pr(m: Rec): ScmPullRequest {
    const state = str(m.state);
    const merged = state === 'merged';
    return {
      number: Number(m.iid),
      title: str(m.title),
      state: merged ? 'merged' : state === 'closed' ? 'closed' : 'open',
      url: str(m.web_url) || str(m.url),
      author: str(obj(m.author).username),
      sourceBranch: str(m.source_branch),
      targetBranch: str(m.target_branch),
      headSha: opt(m.sha) || opt(obj(m.last_commit).id),
      mergeSha: merged ? opt(m.merge_commit_sha) || opt(m.squash_commit_sha) || opt(m.sha) : undefined,
      createdAt: opt(m.created_at),
      updatedAt: opt(m.updated_at),
      mergedAt: opt(m.merged_at),
      draft: m.draft === true || m.work_in_progress === true,
    };
  },
  commit(c: Rec, webUrl: string): ScmCommit {
    const sha = str(c.id);
    return {
      sha,
      message: str(c.message) || str(c.title),
      author: str(c.author_name) || str(obj(c.author).name),
      authoredAt: opt(c.authored_date) || opt(c.timestamp),
      url: str(c.web_url) || str(c.url) || `${webUrl}/-/commit/${sha}`,
    };
  },
  deploymentState(s: unknown): ScmDeployment['state'] {
    const v = str(s);
    if (v === 'success') return 'success';
    if (v === 'failed' || v === 'canceled') return 'failure';
    return 'pending';
  },
};

const webBase = (repo: ScmRepository) => repo.baseUrl.replace(/\.git$/, '').replace(/\/+$/, '');

async function optionalSection<T>(name: string, unavailable: string[], fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof FeatureUnavailable) {
      unavailable.push(name);
      return undefined;
    }
    throw err;
  }
}

async function fetchGithub(cred: ResolvedCredential, repo: ScmRepository, unavailable: string[]): Promise<ScmSnapshot> {
  const base = `/repos/${repoPathOf(repo).split('/').map(encodeURIComponent).join('/')}`;
  const info = obj(await getJson(cred, base));
  const defaultBranch = str(info.default_branch) || repo.defaultBranch || 'main';

  const pullRequests = (await paginate(cred, `${base}/pulls?state=all&sort=updated&direction=desc`, 50, 4)).map(githubMap.pr);
  const branches = (await paginate(cred, `${base}/branches`, 100, 3)).map(b => ({
    name: str(b.name),
    sha: str(obj(b.commit).sha),
    url: `${webBase(repo)}/tree/${str(b.name)}`,
    isDefault: str(b.name) === defaultBranch,
    protected: b.protected === true,
  }));
  const commits = (await paginate(cred, `${base}/commits?sha=${encodeURIComponent(defaultBranch)}`, 100, 2)).map(c => ({
    ...githubMap.commit(c, webBase(repo)),
    onDefaultBranch: true,
  }));

  const deployments = await optionalSection('deployments', unavailable, async () => {
    const list = await paginate(cred, `${base}/deployments`, 30, 1, true);
    const out: ScmDeployment[] = [];
    for (const d of list) {
      const statuses = await paginate(cred, `${base}/deployments/${encodeURIComponent(str(d.id))}/statuses`, 10, 1, true);
      // GitHub marks superseded deployments "inactive"; one that ever succeeded did ship.
      const succeeded = statuses.find(s => s.state === 'success');
      const latest = succeeded || statuses[0];
      out.push({
        id: str(d.id),
        environment: str(d.environment),
        sha: str(d.sha),
        ref: opt(d.ref),
        state: githubMap.deploymentState(latest?.state),
        createdAt: opt(d.created_at),
        updatedAt: opt(latest?.created_at) || opt(d.updated_at),
        url: opt(latest?.environment_url) || opt(latest?.log_url),
      });
    }
    return out;
  });

  const vulnerabilities = await optionalSection('vulnerabilities', unavailable, async () =>
    (await paginate(cred, `${base}/dependabot/alerts`, 100, 3, true)).map(githubMap.vulnerability)
  );

  return { defaultBranch, pullRequests, branches, commits, deployments, vulnerabilities };
}

async function fetchGitlab(cred: ResolvedCredential, repo: ScmRepository, unavailable: string[]): Promise<ScmSnapshot> {
  const apiPrefix = new URL(cred.conn.serverUrl).pathname.includes('/api/v4') ? '' : '/api/v4';
  const base = `${apiPrefix}/projects/${encodeURIComponent(repoPathOf(repo))}`;
  const info = obj(await getJson(cred, base));
  const defaultBranch = str(info.default_branch) || repo.defaultBranch || 'main';

  const pullRequests = (await paginate(cred, `${base}/merge_requests?state=all&order_by=updated_at`, 50, 4)).map(gitlabMap.pr);
  const branches = (await paginate(cred, `${base}/repository/branches`, 100, 3)).map(b => ({
    name: str(b.name),
    sha: str(obj(b.commit).id),
    url: str(b.web_url) || `${webBase(repo)}/-/tree/${str(b.name)}`,
    isDefault: b.default === true || str(b.name) === defaultBranch,
    protected: b.protected === true,
  }));
  const commits = (await paginate(cred, `${base}/repository/commits?ref_name=${encodeURIComponent(defaultBranch)}`, 100, 2)).map(c => ({
    ...gitlabMap.commit(c, webBase(repo)),
    onDefaultBranch: true,
  }));
  const deployments = await optionalSection('deployments', unavailable, async () =>
    (await paginate(cred, `${base}/deployments?order_by=created_at&sort=desc`, 40, 1, true)).map(d => ({
      id: str(d.id),
      environment: str(obj(d.environment).name),
      sha: str(d.sha),
      ref: opt(d.ref),
      state: gitlabMap.deploymentState(d.status),
      createdAt: opt(d.created_at),
      updatedAt: opt(d.updated_at),
      url: opt(obj(d.environment).external_url),
    }))
  );
  const vulnerabilities = await optionalSection('vulnerabilities', unavailable, async () =>
    (await paginate(cred, `${base}/vulnerability_findings?scope=all`, 100, 3, true)).map(v => {
      const dep = obj(obj(v.location).dependency);
      const ids = Array.isArray(v.identifiers) ? (v.identifiers as Rec[]) : [];
      const cve = ids.find(i => str(i.external_type) === 'cve');
      const state = str(v.state);
      return {
        id: str(v.uuid) || str(v.id),
        severity: normalizeSeverity(v.severity),
        state: state === 'resolved' ? ('fixed' as const) : state === 'dismissed' ? ('dismissed' as const) : ('open' as const),
        package: str(obj(dep.package).name) || str(obj(v.location).file),
        summary: str(v.name),
        cve: cve ? str(cve.name) : undefined,
        createdAt: opt(v.created_at),
      };
    })
  );
  return { defaultBranch, pullRequests, branches, commits, deployments, vulnerabilities };
}

/** True when `ancestor` is contained in `descendant` according to the provider (null = could not tell). */
async function isAncestor(cred: ResolvedCredential, repo: ScmRepository, ancestor: string, descendant: string): Promise<boolean | null> {
  if (ancestor === descendant) return true;
  if (cred.conn.provider === 'github') {
    const base = `/repos/${repoPathOf(repo).split('/').map(encodeURIComponent).join('/')}`;
    const res = await api(cred, `${base}/compare/${encodeURIComponent(ancestor)}...${encodeURIComponent(descendant)}`);
    if (!res.ok) return null;
    const status = str(obj(res.data).status);
    return status === 'ahead' || status === 'identical';
  }
  const apiPrefix = new URL(cred.conn.serverUrl).pathname.includes('/api/v4') ? '' : '/api/v4';
  const res = await api(
    cred,
    `${apiPrefix}/projects/${encodeURIComponent(repoPathOf(repo))}/repository/merge_base?refs[]=${encodeURIComponent(ancestor)}&refs[]=${encodeURIComponent(descendant)}`
  );
  if (!res.ok) return null;
  return str(obj(res.data).id) === ancestor;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export interface ScmItemRow<T = Rec> {
  kind: ScmKind;
  repoId: string;
  extId: string;
  state: string | null;
  issueKeys: string[];
  data: T;
  syncedAt: string;
}

interface RawItemRow {
  kind: ScmKind;
  repo_id: string;
  ext_id: string;
  state: string | null;
  issue_keys: string;
  data: string;
  synced_at: string;
}

const toItem = <T>(r: RawItemRow): ScmItemRow<T> => ({
  kind: r.kind,
  repoId: r.repo_id,
  extId: r.ext_id,
  state: r.state,
  issueKeys: JSON.parse(r.issue_keys) as string[],
  data: JSON.parse(r.data) as T,
  syncedAt: r.synced_at,
});

export function listScmItems(
  orgId: string,
  filter: { kind?: string; repoId?: string; state?: string; issueKey?: string; limit?: number } = {}
): ScmItemRow[] {
  const where = ['org_id = ?'];
  const params: Array<string | number> = [orgId];
  if (filter.kind) {
    where.push('kind = ?');
    params.push(filter.kind);
  }
  if (filter.repoId) {
    where.push('repo_id = ?');
    params.push(filter.repoId);
  }
  if (filter.state) {
    where.push('state = ?');
    params.push(filter.state);
  }
  if (filter.issueKey) {
    where.push('EXISTS (SELECT 1 FROM json_each(scm_items.issue_keys) WHERE json_each.value = ?)');
    params.push(filter.issueKey.toUpperCase());
  }
  const limit = Math.min(Math.max(1, filter.limit || 200), 2000);
  return (
    db
      .prepare(`SELECT * FROM scm_items WHERE ${where.join(' AND ')} ORDER BY COALESCE(ext_updated_at, synced_at) DESC LIMIT ${limit}`)
      .all(...params) as unknown as RawItemRow[]
  ).map(r => toItem<Rec>(r));
}

function getItem<T>(kind: ScmKind, repoId: string, extId: string): ScmItemRow<T> | undefined {
  const r = db.prepare('SELECT * FROM scm_items WHERE kind = ? AND repo_id = ? AND ext_id = ?').get(kind, repoId, extId) as RawItemRow | undefined;
  return r ? toItem<T>(r) : undefined;
}

function putItem(orgId: string, kind: ScmKind, repoId: string, extId: string, state: string, keys: string[], data: object, updatedAt?: string): void {
  db.prepare(
    `INSERT INTO scm_items (kind, repo_id, ext_id, org_id, state, issue_keys, data, ext_updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(kind, repo_id, ext_id) DO UPDATE SET state = excluded.state, issue_keys = excluded.issue_keys,
       data = excluded.data, ext_updated_at = excluded.ext_updated_at, synced_at = excluded.synced_at`
  ).run(kind, repoId, extId, orgId, state, JSON.stringify(keys), JSON.stringify(data), updatedAt ?? null, nowIso());
}

export function removeRepositoryData(repoId: string): void {
  db.prepare('DELETE FROM scm_items WHERE repo_id = ?').run(repoId);
}

const KEY_PATTERN = /(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]{1,9}-\d{1,7})(?![A-Za-z0-9])/g;

export function extractIssueKeys(...texts: Array<string | undefined>): string[] {
  const found = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(KEY_PATTERN)) found.add(m[1].toUpperCase());
  }
  return [...found].slice(0, 20);
}

interface IssueRef {
  id: string;
  projectId: string;
}

function findIssuesByKeys(orgId: string, keys: string[]): Map<string, IssueRef> {
  const out = new Map<string, IssueRef>();
  const stmt = db.prepare(
    "SELECT id, project_id FROM records WHERE collection = 'issues' AND org_id = ? AND deleted = 0 AND json_extract(data, '$.key') = ?"
  );
  for (const k of keys) {
    const row = stmt.get(orgId, k) as { id: string; project_id: string } | undefined;
    if (row) out.set(k, { id: row.id, projectId: row.project_id });
  }
  return out;
}

export interface IngestResult {
  affectedKeys: Set<string>;
  newVulnerabilities: ScmVulnerability[];
}

/**
 * Upserts provider data. With `complete` the snapshot is the whole branch list, so branches that vanished are
 * removed. Older data never overwrites newer data (webhooks can arrive out of order).
 */
export function ingestScmData(orgId: string, repo: ScmRepository, snap: ScmSnapshot, opts: { complete?: boolean } = {}): IngestResult {
  const affected = new Set<string>();
  const newVulns: ScmVulnerability[] = [];
  const touch = (...lists: string[][]) => lists.forEach(l => l.forEach(k => affected.add(k)));

  transaction(() => {
    for (const pr of snap.pullRequests || []) {
      const extId = String(pr.number);
      const old = getItem<ScmPullRequest>('pr', repo.id, extId);
      if (old?.data.updatedAt && pr.updatedAt && Date.parse(pr.updatedAt) < Date.parse(old.data.updatedAt)) continue;
      // A merged pull request can never become un-merged; keep deployment evidence once established.
      const data: ScmPullRequest = {
        ...pr,
        state: old?.data.state === 'merged' ? 'merged' : pr.state,
        mergeSha: pr.mergeSha || old?.data.mergeSha,
        mergedAt: pr.mergedAt || old?.data.mergedAt,
        deployedAt: old?.data.deployedAt,
        environment: old?.data.environment,
      };
      const keys = extractIssueKeys(pr.title, pr.sourceBranch);
      touch(keys, old?.issueKeys || []);
      putItem(orgId, 'pr', repo.id, extId, data.state, keys, data, pr.updatedAt);
    }

    for (const b of snap.branches || []) {
      const keys = b.isDefault ? [] : extractIssueKeys(b.name);
      const old = getItem<ScmBranch>('branch', repo.id, b.name);
      touch(keys, old?.issueKeys || []);
      putItem(orgId, 'branch', repo.id, b.name, 'active', keys, b);
    }
    if (opts.complete && snap.branches) {
      const present = new Set(snap.branches.map(b => b.name));
      for (const item of listScmItems(orgId, { kind: 'branch', repoId: repo.id, limit: 2000 })) {
        if (!present.has(item.extId)) {
          touch(item.issueKeys);
          db.prepare("DELETE FROM scm_items WHERE kind = 'branch' AND repo_id = ? AND ext_id = ?").run(repo.id, item.extId);
        }
      }
    }

    for (const c of snap.commits || []) {
      const old = getItem<ScmCommit>('commit', repo.id, c.sha);
      const data: ScmCommit = {
        ...c,
        onDefaultBranch: Boolean(c.onDefaultBranch || old?.data.onDefaultBranch),
        deployedAt: old?.data.deployedAt,
        environment: old?.data.environment,
      };
      const keys = extractIssueKeys(c.message);
      touch(keys, old?.issueKeys || []);
      putItem(orgId, 'commit', repo.id, c.sha, data.onDefaultBranch ? 'merged' : 'open', keys, data, c.authoredAt);
    }

    for (const d of snap.deployments || []) {
      const old = getItem<ScmDeployment>('deployment', repo.id, d.id);
      // success is evidence that it shipped; a later "inactive" status must not erase it
      const state = old?.data.state === 'success' && d.state === 'inactive' ? 'success' : d.state;
      putItem(orgId, 'deployment', repo.id, d.id, state, [], { ...d, state }, d.updatedAt || d.createdAt);
    }

    for (const v of snap.vulnerabilities || []) {
      const old = getItem<ScmVulnerability>('vulnerability', repo.id, v.id);
      if (!old && v.state === 'open' && (v.severity === 'critical' || v.severity === 'high')) newVulns.push(v);
      putItem(orgId, 'vulnerability', repo.id, v.id, v.state, [], v, v.fixedAt || v.createdAt);
    }
  });

  return { affectedKeys: affected, newVulnerabilities: newVulns };
}

export function productionPattern(): RegExp {
  const custom = process.env.SCM_PRODUCTION_ENVIRONMENTS?.trim();
  if (custom) {
    const names = custom.split(',').map(s => s.trim()).filter(Boolean);
    return new RegExp(`^(${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`, 'i');
  }
  return /^(prod|production|live)([-_/ ].*)?$/i;
}

/**
 * Marks merged pull requests / default-branch commits as deployed when a successful production deployment
 * contains them (same sha, or the provider confirms ancestry). The evidence is stored, so it is checked once.
 */
export async function evaluateDeployments(orgId: string, repo: ScmRepository, cred: ResolvedCredential): Promise<Set<string>> {
  const affected = new Set<string>();
  const prod = productionPattern();
  const shipped = listScmItems(orgId, { kind: 'deployment', repoId: repo.id, state: 'success', limit: 100 })
    .map(i => i.data as unknown as ScmDeployment)
    .filter(d => prod.test(d.environment))
    .sort((a, b) => str(b.createdAt).localeCompare(str(a.createdAt)));
  if (shipped.length === 0) return affected;
  const newest = shipped[0];

  const candidates = [
    ...listScmItems(orgId, { kind: 'pr', repoId: repo.id, state: 'merged', limit: 300 }),
    ...listScmItems(orgId, { kind: 'commit', repoId: repo.id, state: 'merged', limit: 300 }),
  ].filter(i => i.issueKeys.length > 0 && !(i.data as Rec).deployedAt);

  let compares = 0;
  for (const item of candidates) {
    const sha = str(item.kind === 'pr' ? (item.data as Rec).mergeSha : (item.data as Rec).sha);
    if (!sha) continue;
    let by = shipped.find(d => d.sha === sha);
    if (!by && compares < 60) {
      compares += 1;
      if ((await isAncestor(cred, repo, sha, newest.sha)) === true) by = newest;
    }
    if (!by) continue;
    const data = { ...item.data, deployedAt: by.updatedAt || by.createdAt || nowIso(), environment: by.environment };
    putItem(orgId, item.kind, repo.id, item.extId, item.state || 'merged', item.issueKeys, data, str((item.data as Rec).updatedAt) || undefined);
    item.issueKeys.forEach(k => affected.add(k));
  }
  return affected;
}

// ---------------------------------------------------------------------------
// Reflect source control onto work items
// ---------------------------------------------------------------------------

const shortHash = (s: string) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const normUrl = (u: unknown) => str(u).replace(/\/+$/, '').replace('/-/', '/').toLowerCase();

interface DesiredLink extends Rec {
  id: string;
  type: 'pr' | 'branch' | 'commit';
  url: string;
}

function desiredLinksFor(orgId: string, repo: ScmRepository, issueKey: string): DesiredLink[] {
  const items = listScmItems(orgId, { repoId: repo.id, issueKey, limit: 200 });
  const links: DesiredLink[] = [];
  let commits = 0;
  for (const item of items) {
    if (item.kind === 'pr') {
      const pr = item.data as unknown as ScmPullRequest;
      links.push({
        id: `scm-pr-${repo.id}-${pr.number}`.slice(0, 120),
        type: 'pr',
        title: `#${pr.number} ${pr.title}`.slice(0, 190),
        status: pr.deployedAt ? 'deployed' : pr.state,
        repo: repo.name,
        url: pr.url,
        updatedAt: pr.updatedAt || item.syncedAt,
        verified: true,
        externalId: `pr:${pr.number}`,
        author: pr.author || undefined,
        sha: pr.mergeSha || pr.headSha,
        mergedAt: pr.mergedAt,
        deployedAt: pr.deployedAt,
        environment: pr.environment,
      });
    } else if (item.kind === 'branch') {
      const b = item.data as unknown as ScmBranch;
      links.push({
        id: `scm-br-${repo.id}-${shortHash(b.name)}`.slice(0, 120),
        type: 'branch',
        title: b.name.slice(0, 190),
        status: 'open',
        repo: repo.name,
        url: b.url,
        updatedAt: item.syncedAt.slice(0, 10),
        verified: true,
        externalId: `branch:${b.name}`.slice(0, 390),
        sha: b.sha,
      });
    } else if (item.kind === 'commit' && commits < 10) {
      commits += 1;
      const c = item.data as unknown as ScmCommit;
      links.push({
        id: `scm-cm-${repo.id}-${c.sha.slice(0, 12)}`.slice(0, 120),
        type: 'commit',
        title: `${c.sha.slice(0, 7)} ${c.message.split('\n')[0]}`.slice(0, 190),
        status: c.deployedAt ? 'deployed' : c.onDefaultBranch ? 'merged' : 'open',
        repo: repo.name,
        url: c.url,
        updatedAt: c.authoredAt || item.syncedAt,
        verified: true,
        externalId: `commit:${c.sha}`,
        author: c.author || undefined,
        sha: c.sha,
        deployedAt: c.deployedAt,
        environment: c.environment,
      });
    }
  }
  return links.map(l => {
    for (const k of Object.keys(l)) if (l[k] === undefined) delete l[k];
    return l;
  });
}

/** Does the provider data confirm a link a person added by hand? */
function verifyManualLink(link: Rec, desired: DesiredLink[]): DesiredLink | undefined {
  const url = normUrl(link.url);
  return desired.find(d => {
    if (d.type !== link.type) return false;
    if (normUrl(d.url) === url) return true;
    if (d.type === 'commit') {
      const sha = url.split('/').pop() || '';
      return sha.length >= 7 && str(d.sha).toLowerCase().startsWith(sha);
    }
    return false;
  });
}

/** Rebuilds the source-control owned dev links of the given work items. */
export async function reconcileDevLinks(orgId: string, repo: ScmRepository, issueKeys: Iterable<string>): Promise<{ updated: number; linked: number }> {
  const keys = [...new Set([...issueKeys].map(k => k.toUpperCase()))];
  const issues = findIssuesByKeys(orgId, keys);
  const scmPrefix = new RegExp(`^scm-(pr|br|cm)-${repo.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-`);
  let updated = 0;
  let linked = 0;

  for (const [key, ref] of issues) {
    const allowed = !repo.projectIds || repo.projectIds.length === 0 || repo.projectIds.includes(ref.projectId);
    for (let attempt = 0; attempt < 4; attempt++) {
      const found = getRecord(orgId, 'issues', ref.id);
      if (!found) break;
      const current = ((found.record.devLinks as Rec[] | undefined) || []).map(l => ({ ...l }));
      const desired = allowed ? desiredLinksFor(orgId, repo, key) : [];
      const claimed = new Set<string>();
      const next: Rec[] = [];
      for (const link of current) {
        if (scmPrefix.test(str(link.id))) continue; // rebuilt below
        if (str(link.repo).toLowerCase() === repo.name.toLowerCase()) {
          const match = verifyManualLink(link, desired);
          if (match) {
            claimed.add(match.id);
            const { id: _id, title: _title, url: _url, repo: _repo, ...evidence } = match;
            void _id;
            void _title;
            void _url;
            void _repo;
            next.push({ ...link, ...evidence });
            continue;
          }
        }
        next.push(link);
      }
      next.push(...desired.filter(d => !claimed.has(d.id)));
      linked += desired.length;
      if (stableStringify(current) === stableStringify(next)) break;
      try {
        await applyBatch(
          SYSTEM(orgId),
          [{ collection: 'issues', op: 'upsert', id: ref.id, data: { ...found.record, devLinks: next }, baseVersion: found.version }],
          { system: true, audit: true, suppressEvents: true }
        );
        updated += 1;
        break;
      } catch (err) {
        // someone saved the item between our read and write: retry with the fresh copy
        if ((err as { code?: string }).code !== 'CONFLICT' || attempt === 3) throw err;
      }
    }
  }
  return { updated, linked };
}

/** Keys of work items that currently carry links owned by this repository (so stale ones can be removed). */
function keysWithLinks(orgId: string, repo: ScmRepository): string[] {
  const rows = db
    .prepare(
      `SELECT json_extract(data, '$.key') AS k FROM records
        WHERE collection = 'issues' AND org_id = ? AND deleted = 0
          AND EXISTS (SELECT 1 FROM json_each(records.data, '$.devLinks')
                       WHERE LOWER(json_extract(json_each.value, '$.repo')) = LOWER(?))`
    )
    .all(orgId, repo.name) as Array<{ k: string }>;
  return rows.map(r => r.k);
}

export async function alertNewVulnerabilities(orgId: string, repo: ScmRepository, vulns: ScmVulnerability[]): Promise<void> {
  if (vulns.length === 0) return;
  const admins = listUsers(orgId)
    .map(u => u.record as { id?: string; role?: string; status?: string })
    .filter(u => u.id && (u.role === 'admin' || u.role === 'product_owner') && (u.status || 'active') === 'active');
  const critical = vulns.filter(v => v.severity === 'critical').length;
  const title = `${vulns.length} new ${critical ? 'critical/high' : 'high'} vulnerabilit${vulns.length === 1 ? 'y' : 'ies'} in ${repo.name}`;
  const message = vulns
    .slice(0, 5)
    .map(v => `[${v.severity}] ${v.package}: ${v.summary}`)
    .join('\n')
    .slice(0, 900);
  const stamp = shortHash(`${repo.id}:${vulns.map(v => v.id).sort().join(',')}`);
  for (const u of admins) {
    await notifyUser(orgId, String(u.id), { id: `ntf-vuln-${stamp}-${u.id}`.slice(0, 120), kind: 'system', title, message });
  }
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export async function syncRepository(orgId: string, repoId: string): Promise<RepoSyncState> {
  const repo = getRepository(orgId, repoId);
  if (!repo) throw new PermanentJobError('Repository no longer exists.');
  if (!repo.enabled) throw new PermanentJobError(`Repository "${repo.name}" is disabled.`);
  const conn = repo.provider === 'github' || repo.provider === 'gitlab' ? integrationStore.getConnection(orgId, repo.provider) : undefined;
  const problem = repoConnectionProblem(repo, conn);
  if (problem) {
    integrationStore.setRepoSyncState(orgId, repoId, { status: 'error', error: problem, lastAttemptAt: nowIso() });
    throw new PermanentJobError(problem);
  }

  integrationStore.setRepoSyncState(orgId, repoId, { status: 'running', lastAttemptAt: nowIso(), error: null });
  try {
    const unavailable: string[] = [];
    const { snapshot, deployedKeys, ingest } = await withCredential(orgId, conn!.id, async cred => {
      unavailable.length = 0;
      const snapshot = repo.provider === 'github' ? await fetchGithub(cred, repo, unavailable) : await fetchGitlab(cred, repo, unavailable);
      const ingest = ingestScmData(orgId, repo, snapshot, { complete: true });
      const deployedKeys = await evaluateDeployments(orgId, repo, cred);
      return { snapshot, deployedKeys, ingest };
    });

    const keys = new Set<string>([...ingest.affectedKeys, ...deployedKeys, ...keysWithLinks(orgId, repo)]);
    const reconciled = await reconcileDevLinks(orgId, repo, keys);
    await alertNewVulnerabilities(orgId, repo, ingest.newVulnerabilities);

    const state = integrationStore.setRepoSyncState(orgId, repoId, {
      status: 'ok',
      lastSyncedAt: nowIso(),
      error: null,
      unavailable,
      defaultBranch: snapshot.defaultBranch,
      counts: {
        pullRequests: snapshot.pullRequests?.length || 0,
        branches: snapshot.branches?.length || 0,
        commits: snapshot.commits?.length || 0,
        deployments: snapshot.deployments?.length || 0,
        vulnerabilities: snapshot.vulnerabilities?.length || 0,
        workItemsUpdated: reconciled.updated,
      },
    });
    integrationStore.markConnectionSynced(orgId, repo.provider as ScmProvider, state.lastSyncedAt!);
    integrationStore.appendAuditLog({
      organizationId: orgId,
      actorUserId: 'system',
      actorRole: 'system',
      provider: repo.provider as ScmProvider,
      action: 'scm_sync',
      resourceType: 'repository',
      resourceId: repo.id,
      status: unavailable.length ? 'warning' : 'success',
      summary: `Synced ${repo.name}: ${state.counts!.pullRequests} PRs, ${state.counts!.commits} commits, ${state.counts!.deployments} deployments, ${state.counts!.vulnerabilities} alerts; ${reconciled.updated} work item(s) updated.${unavailable.length ? ` Not accessible: ${unavailable.join(', ')}.` : ''}`,
    });
    return state;
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    integrationStore.setRepoSyncState(orgId, repoId, { status: 'error', error: message });
    integrationStore.appendAuditLog({
      organizationId: orgId,
      actorUserId: 'system',
      actorRole: 'system',
      provider: repo.provider as ScmProvider,
      action: 'scm_sync',
      resourceType: 'repository',
      resourceId: repo.id,
      status: 'failed',
      summary: `Sync of ${repo.name} failed: ${message}`,
    });
    if (err instanceof AuthRejectedError) throw new PermanentJobError(message);
    throw err;
  }
}

/** Queues a sync (deduplicated while one is pending for the same bucket). */
export function queueRepositorySync(orgId: string, repoId: string, opts: { runAt?: number; bucket?: string } = {}): number | null {
  const bucket = opts.bucket ?? crypto.randomUUID();
  return enqueueJob(orgId, 'scm.sync', { repoId }, { maxAttempts: 4, runAt: opts.runAt, dedupeKey: `scm-${repoId}-${bucket}` });
}

registerJobHandler('scm.sync', async job => {
  const { repoId } = job.payload as { repoId?: string };
  if (!repoId) throw new PermanentJobError('Missing repository id.');
  try {
    await syncRepository(job.orgId, repoId);
  } catch (err) {
    if (err instanceof RateLimitedError) {
      // not a failure: run again once the provider allows it, without spending this job's retry budget
      queueRepositorySync(job.orgId, repoId, { runAt: err.retryAtMs + 1000, bucket: `rl-${Math.floor(err.retryAtMs / 1000)}` });
      return;
    }
    throw err;
  }
});

export async function connectScm(provider: ScmProvider, apiUrl: string, token: string, authMethod: 'pat' | 'oauth_bearer' = 'pat') {
  const headers = buildAuthHeaders(authMethod, token);
  const apiPrefix = provider === 'gitlab' && !new URL(apiUrl).pathname.includes('/api/v4') ? '/api/v4' : '';
  const me = await safeExternalFetch(apiUrl, `${apiPrefix}/user`, headers);
  if (!me.ok) {
    const status = me.status === 401 || me.status === 403 ? 401 : 502;
    return {
      ok: false as const,
      status,
      error: status === 401 ? `The ${provider} token was rejected.` : `${provider} returned HTTP ${me.status}.`,
    };
  }
  const user = obj(me.data);
  const listPath =
    provider === 'github' ? '/user/repos?per_page=100&sort=updated' : `${apiPrefix}/projects?membership=true&per_page=100&order_by=last_activity_at`;
  const repos = await safeExternalFetch(apiUrl, listPath, headers).catch(() => null);
  const projectsOrSpaces = (repos?.ok && Array.isArray(repos.data) ? (repos.data as Rec[]) : []).map(r => ({
    id: str(r.id),
    key: str(r.full_name) || str(r.path_with_namespace),
    name: str(r.name),
    type: 'repository',
    description: str(r.description).slice(0, 200),
  }));
  return {
    ok: true as const,
    account: {
      accountId: str(user.id) || str(user.login),
      displayName: str(user.name) || str(user.login) || str(user.username),
      email: str(user.email) || str(user.public_email),
      avatarUrl: opt(user.avatar_url),
    },
    projectsOrSpaces,
  };
}

export function vulnerabilitySummary(orgId: string) {
  const items = listScmItems(orgId, { kind: 'vulnerability', limit: 2000 });
  const bySeverity: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  const byRepo: Record<string, number> = {};
  for (const i of items) {
    if (i.state !== 'open') continue;
    const v = i.data as unknown as ScmVulnerability;
    bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;
    byRepo[i.repoId] = (byRepo[i.repoId] || 0) + 1;
  }
  return { open: Object.values(bySeverity).reduce((a, b) => a + b, 0), total: items.length, bySeverity, byRepo };
}

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const hoursBetween = (from?: string, to?: string): number | null => {
  const h = (Date.parse(str(to)) - Date.parse(str(from))) / 3_600_000;
  return Number.isFinite(h) && h >= 0 ? h : null;
};

/**
 * Delivery figures for one space, computed only from synced provider data (null = not enough data):
 *  - cycle time: median hours from opening a pull request to merging it
 *  - lead time: median hours from opening a pull request to it running in production
 *  - deploy frequency: successful production deployments per week over the last 28 days
 */
export function deliveryMetrics(orgId: string, projectId: string, now = Date.now()) {
  const repos = listRepositories(orgId).filter(r => !r.projectIds?.length || r.projectIds.includes(projectId));
  const synced = repos.filter(r => integrationStore.getRepoSyncState(r.id)?.lastSyncedAt);
  const cycle: number[] = [];
  const lead: number[] = [];
  const prod = productionPattern();
  const since = now - 28 * 86_400_000;
  let deployments = 0;
  const vulnerabilities: Array<ScmVulnerability & { repo: string }> = [];
  for (const repo of repos) {
    for (const item of listScmItems(orgId, { kind: 'pr', repoId: repo.id, state: 'merged', limit: 500 })) {
      const pr = item.data as unknown as ScmPullRequest;
      const c = hoursBetween(pr.createdAt, pr.mergedAt);
      if (c !== null) cycle.push(c);
      const l = hoursBetween(pr.createdAt, pr.deployedAt);
      if (l !== null) lead.push(l);
    }
    for (const item of listScmItems(orgId, { kind: 'deployment', repoId: repo.id, state: 'success', limit: 500 })) {
      const d = item.data as unknown as ScmDeployment;
      if (prod.test(d.environment) && Date.parse(str(d.updatedAt || d.createdAt)) >= since) deployments += 1;
    }
    for (const item of listScmItems(orgId, { kind: 'vulnerability', repoId: repo.id, state: 'open', limit: 500 })) {
      vulnerabilities.push({ ...(item.data as unknown as ScmVulnerability), repo: repo.name });
    }
  }
  const rank = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };
  vulnerabilities.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return {
    syncedRepositories: synced.length,
    cycleTimeHours: median(cycle),
    leadTimeHours: median(lead),
    mergedPullRequests: cycle.length,
    deploymentsPerWeek: synced.length ? Math.round((deployments / 4) * 10) / 10 : null,
    vulnerabilities: vulnerabilities.slice(0, 200),
    /** Repositories whose token or plan cannot read alerts: "no alerts" does not mean "safe" for these. */
    alertsUnavailable: synced.filter(r => integrationStore.getRepoSyncState(r.id)?.unavailable?.includes('vulnerabilities')).map(r => r.name),
  };
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

let timer: ReturnType<typeof setInterval> | null = null;

export function scheduleDueRepositorySyncs(now = Date.now()): number {
  const every = Math.max(1, Number(process.env.SCM_SYNC_INTERVAL_MINUTES || 15)) * 60_000;
  let queued = 0;
  const orgs = new Set(integrationStore.listAllConnections().filter(c => c.provider === 'github' || c.provider === 'gitlab').map(c => c.organizationId));
  for (const orgId of orgs) {
    for (const repo of listRepositories(orgId)) {
      if (!repo.enabled || (repo.provider !== 'github' && repo.provider !== 'gitlab')) continue;
      const conn = integrationStore.getConnection(orgId, repo.provider);
      if (repoConnectionProblem(repo, conn) || conn!.healthStatus === 'needs_reauth') continue;
      const last = integrationStore.getRepoSyncState(repo.id)?.lastAttemptAt;
      if (last && now - Date.parse(last) < every) continue;
      if (queueRepositorySync(orgId, repo.id, { bucket: `t${Math.floor(now / every)}` }) !== null) queued += 1;
    }
  }
  return queued;
}

export function startScmScheduler(): void {
  if (timer) return;
  timer = setInterval(() => {
    try {
      scheduleDueRepositorySyncs();
    } catch (err) {
      console.error('[scm] scheduler failed:', err);
    }
  }, 60_000);
  timer.unref?.();
}
