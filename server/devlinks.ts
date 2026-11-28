import { db } from './db.ts';

type Rec = Record<string, unknown>;

interface RepositoryRecord {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  enabled: boolean;
  projectIds?: string[];
}

export interface DevLinkProblem {
  linkId: string;
  message: string;
}

function loadRepositories(orgId: string): RepositoryRecord[] {
  const rows = db
    .prepare("SELECT data FROM records WHERE collection = 'repositories' AND org_id = ? AND deleted = 0")
    .all(orgId) as unknown as Array<{ data: string }>;
  return rows.map(r => JSON.parse(r.data) as RepositoryRecord);
}

// Path forms accepted for each link type (an optional GitLab "/-/" segment is tolerated).
const PATTERNS: Record<string, RegExp> = {
  pr: /^\/(?:-\/)?(?:pull|pulls|merge_requests|pull-requests)\/\d+(?:\/.*)?$/,
  branch: /^\/(?:-\/)?(?:tree|branch|branches)\/[^\s?#]+$/,
  commit: /^\/(?:-\/)?(?:commit|commits)\/[0-9a-fA-F]{7,40}$/,
};

function stripTrailingSlash(p: string): string {
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

/**
 * Validates one development link against the organization's connected repositories:
 *  - the repository must be connected, enabled and available to the issue's space
 *  - the URL must live on the repository's host under its base path and match the link type
 */
export function validateDevLink(orgId: string, projectId: string, link: Rec, repos?: RepositoryRecord[]): string | null {
  const repositories = repos || loadRepositories(orgId);
  const repoName = String(link.repo || '').trim().toLowerCase();
  const repo = repositories.find(r => r.name.toLowerCase() === repoName);
  if (!repo) return `Repository "${link.repo}" is not connected. Connect it under Development > Repositories first.`;
  if (!repo.enabled) return `Repository "${repo.name}" is disabled.`;
  if (repo.projectIds && repo.projectIds.length > 0 && !repo.projectIds.includes(projectId)) {
    return `Repository "${repo.name}" is not enabled for this space.`;
  }

  let url: URL;
  let base: URL;
  try {
    url = new URL(String(link.url));
    base = new URL(repo.baseUrl);
  } catch {
    return 'The development link URL is not a valid absolute URL.';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'Only http(s) links are allowed.';
  if (url.host.toLowerCase() !== base.host.toLowerCase()) {
    return `The URL host "${url.host}" does not match the connected repository host "${base.host}".`;
  }
  const basePath = stripTrailingSlash(base.pathname);
  if (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) {
    return `The URL does not belong to repository "${repo.name}" (${repo.baseUrl}).`;
  }
  const rest = url.pathname.slice(basePath.length) || '/';
  const pattern = PATTERNS[String(link.type)];
  if (!pattern || !pattern.test(rest)) {
    return `The URL path "${rest}" is not a valid ${String(link.type)} reference for this repository.`;
  }
  return null;
}

/**
 * Validates only the dev links that are new or changed compared with what is stored, so existing
 * links never block unrelated edits. Non-privileged users cannot claim merged/deployed states:
 * those can only come from the source-control integration (or an administrator).
 */
export function validateChangedDevLinks(
  orgId: string,
  projectId: string,
  before: Rec[] | undefined,
  after: Rec[] | undefined,
  canSetState: boolean
): DevLinkProblem[] {
  if (!after || after.length === 0) return [];
  const prior = new Map((before || []).map(l => [l.id as string, l]));
  const repos = loadRepositories(orgId);
  const problems: DevLinkProblem[] = [];
  for (const link of after) {
    const old = prior.get(link.id as string);
    const changed =
      !old ||
      old.repo !== link.repo ||
      old.url !== link.url ||
      old.type !== link.type ||
      (old.status ?? 'open') !== (link.status ?? 'open');
    if (!changed) continue;
    if (!canSetState) {
      const newStatus = (link.status as string) ?? 'open';
      if (!old && newStatus !== 'open') {
        problems.push({ linkId: link.id as string, message: 'New development links must start in the "open" state.' });
        continue;
      }
      if (old && newStatus !== ((old.status as string) ?? 'open')) {
        problems.push({
          linkId: link.id as string,
          message: 'Only the source-control integration or an administrator can mark links as merged or deployed.',
        });
        continue;
      }
    }
    const msg = validateDevLink(orgId, projectId, link, repos);
    if (msg) problems.push({ linkId: link.id as string, message: msg });
  }
  return problems;
}
