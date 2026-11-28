import type { RepositoryConnection } from '../types/jira';

export type DevLinkType = 'pr' | 'branch' | 'commit';

/** Builds the canonical URL for a pull request / branch / commit on the repository's provider. */
export function buildDevLinkUrl(repo: RepositoryConnection, type: DevLinkType, ref: string): string {
  const base = repo.baseUrl.replace(/\/+$/, '');
  const r = ref.trim().replace(/^#/, '');
  switch (repo.provider) {
    case 'gitlab':
      return type === 'pr'
        ? `${base}/-/merge_requests/${r}`
        : type === 'branch'
        ? `${base}/-/tree/${encodeURI(r)}`
        : `${base}/-/commit/${r}`;
    case 'bitbucket':
      return type === 'pr' ? `${base}/pull-requests/${r}` : type === 'branch' ? `${base}/branch/${encodeURI(r)}` : `${base}/commits/${r}`;
    default:
      return type === 'pr' ? `${base}/pull/${r}` : type === 'branch' ? `${base}/tree/${encodeURI(r)}` : `${base}/commit/${r}`;
  }
}

/** Connected, enabled repositories that may be linked from the given space. */
export function reposForProject(repos: RepositoryConnection[], projectId: string): RepositoryConnection[] {
  return repos.filter(r => r.enabled && (!r.projectIds || r.projectIds.length === 0 || r.projectIds.includes(projectId)));
}

export function refLabel(type: DevLinkType): string {
  return type === 'pr' ? 'PR number' : type === 'branch' ? 'Branch name' : 'Commit SHA';
}

export function isValidRef(type: DevLinkType, ref: string): boolean {
  const r = ref.trim().replace(/^#/, '');
  if (type === 'pr') return /^\d+$/.test(r);
  if (type === 'commit') return /^[0-9a-fA-F]{7,40}$/.test(r);
  return r.length > 0 && !/\s/.test(r);
}
