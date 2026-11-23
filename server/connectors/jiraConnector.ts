import crypto from 'node:crypto';
import type { AuthMethod } from '../httpClient.ts';
import { buildAuthHeaders, safeExternalFetch } from '../httpClient.ts';
import type { StoredConnectionRecord } from '../store.ts';

export type DetectedColumnType = 'text' | 'number' | 'date' | 'status' | 'email' | 'list';

function extractAdfText(node: unknown): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractAdfText).join('');
  if (typeof node === 'object') {
    const obj = node as { type?: string; text?: string; content?: unknown[] };
    const inner = Array.isArray(obj.content) ? obj.content.map(extractAdfText).join('') : '';
    const text = obj.text || inner;
    if (obj.type === 'paragraph' || obj.type === 'heading' || obj.type === 'listItem') {
      return `${text}\n`;
    }
    return text;
  }
  return '';
}

export interface NormalizedJiraIssue {
  id: string;
  key: string;
  externalUrl: string;
  projectKey: string;
  projectName: string;
  type: string;
  summary: string;
  description: string;
  status: string;
  statusCategory: string;
  priority: string;
  assignee: string;
  assigneeName: string;
  reporter: string;
  storyPoints?: number;
  originalEstimateMinutes?: number;
  remainingEstimateMinutes?: number;
  startDate?: string;
  dueDate?: string;
  labels: string[];
  components: string[];
  fixVersions: string[];
  parentKey: string;
  parentSummary: string;
  sprint: string;
  created: string;
  updated: string;
  issueLinks: Array<{ type: string; targetKey: string; direction: 'inward' | 'outward' }>;
  comments: Array<{ id: string; author: string; text: string; createdAt: string }>;
  attachments: Array<{ id: string; name: string; size: string; mimeType: string; downloadUrl?: string }>;
  [customFieldKey: string]: unknown;
}

export function normalizeJiraIssue(
  raw: Record<string, unknown>,
  serverUrl: string,
  customFieldNames: Record<string, string>
): NormalizedJiraIssue {
  const fields = (raw.fields || {}) as Record<string, unknown>;
  const statusObj = fields.status as { name?: string; statusCategory?: { key?: string } } | undefined;
  const priorityObj = fields.priority as { name?: string } | undefined;
  const issueTypeObj = fields.issuetype as { name?: string } | undefined;
  const assigneeObj = fields.assignee as { displayName?: string; emailAddress?: string } | undefined;
  const reporterObj = fields.reporter as { displayName?: string; emailAddress?: string } | undefined;
  const projectObj = fields.project as { key?: string; name?: string } | undefined;
  const parentObj = fields.parent as { key?: string; fields?: { summary?: string } } | undefined;

  let description = '';
  if (typeof fields.description === 'string') {
    description = fields.description;
  } else if (fields.description && typeof fields.description === 'object') {
    description = extractAdfText(fields.description).trim();
  }

  let storyPoints: number | undefined;
  for (const spKey of ['customfield_10016', 'customfield_10026', 'customfield_10004']) {
    const val = fields[spKey];
    if (typeof val === 'number') {
      storyPoints = val;
      break;
    }
  }
  if (storyPoints === undefined) {
    for (const [k, name] of Object.entries(customFieldNames)) {
      if (/story\s*point/i.test(name) && typeof fields[k] === 'number') {
        storyPoints = fields[k] as number;
        break;
      }
    }
  }

  let startDate: string | undefined =
    typeof fields.customfield_10015 === 'string' ? fields.customfield_10015 : undefined;
  if (!startDate) {
    for (const [k, name] of Object.entries(customFieldNames)) {
      if (/start\s*date/i.test(name) && typeof fields[k] === 'string') {
        startDate = fields[k] as string;
        break;
      }
    }
  }

  let epicKeyFromCustom = '';
  for (const [k, name] of Object.entries(customFieldNames)) {
    if (/epic\s*link/i.test(name) && typeof fields[k] === 'string') {
      epicKeyFromCustom = fields[k] as string;
      break;
    }
  }
  if (!epicKeyFromCustom && typeof fields.customfield_10014 === 'string') {
    epicKeyFromCustom = fields.customfield_10014;
  }

  let sprintName = '';
  const sprintCandidates = [fields.sprint, fields.customfield_10020];
  for (const cand of sprintCandidates) {
    if (Array.isArray(cand) && cand.length > 0) {
      const last = cand[cand.length - 1];
      if (typeof last === 'object' && last && 'name' in last) {
        sprintName = String((last as { name: unknown }).name);
        break;
      }
      if (typeof last === 'string') {
        const m = /name=([^,\]]+)/.exec(last);
        if (m) {
          sprintName = m[1];
          break;
        }
      }
    } else if (typeof cand === 'object' && cand && 'name' in cand) {
      sprintName = String((cand as { name: unknown }).name);
      break;
    }
  }

  const labels = Array.isArray(fields.labels)
    ? fields.labels.map(x => String(x)).filter(Boolean)
    : [];
  const components = Array.isArray(fields.components)
    ? (fields.components as Array<{ name?: string }>).map(c => c.name || '').filter(Boolean)
    : [];
  const fixVersions = Array.isArray(fields.fixVersions)
    ? (fields.fixVersions as Array<{ name?: string }>).map(v => v.name || '').filter(Boolean)
    : [];

  const issueLinks: NormalizedJiraIssue['issueLinks'] = [];
  if (Array.isArray(fields.issuelinks)) {
    for (const link of fields.issuelinks as Array<{
      type?: { name?: string; inward?: string; outward?: string };
      inwardIssue?: { key?: string };
      outwardIssue?: { key?: string };
    }>) {
      if (link.outwardIssue?.key) {
        issueLinks.push({
          type: link.type?.outward || link.type?.name || 'blocks',
          targetKey: link.outwardIssue.key,
          direction: 'outward',
        });
      }
      if (link.inwardIssue?.key) {
        issueLinks.push({
          type: link.type?.inward || link.type?.name || 'is blocked by',
          targetKey: link.inwardIssue.key,
          direction: 'inward',
        });
      }
    }
  }

  const commentContainer = fields.comment as
    | { comments?: Array<{ id?: string; author?: { displayName?: string }; body?: unknown; created?: string }> }
    | undefined;
  const comments = (commentContainer?.comments || []).slice(0, 15).map(c => ({
    id: String(c.id || crypto.randomUUID()),
    author: c.author?.displayName || 'Jira User',
    text: typeof c.body === 'string' ? c.body : extractAdfText(c.body).trim(),
    createdAt: c.created || new Date().toISOString(),
  }));

  const attachments = Array.isArray(fields.attachment)
    ? (fields.attachment as Array<{
        id?: string;
        filename?: string;
        size?: number;
        mimeType?: string;
        content?: string;
      }>)
        .slice(0, 15)
        .map(a => ({
          id: String(a.id || crypto.randomUUID()),
          name: String(a.filename || 'attachment'),
          size: a.size ? `${Math.max(1, Math.round(a.size / 1024))} KB` : '12 KB',
          mimeType: a.mimeType || 'application/octet-stream',
          downloadUrl: a.content,
        }))
    : [];

  const customFields: Record<string, unknown> = {};
  for (const k of Object.keys(customFieldNames)) {
    const v = fields[k];
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      customFields[k] = v;
    } else if (Array.isArray(v)) {
      customFields[k] = v
        .map(x =>
          typeof x === 'object' && x && 'value' in x
            ? String((x as { value: unknown }).value)
            : typeof x === 'object' && x && 'name' in x
            ? String((x as { name: unknown }).name)
            : String(x)
        )
        .join(', ');
    } else if (typeof v === 'object' && v && 'value' in v) {
      customFields[k] = String((v as { value: unknown }).value);
    } else if (typeof v === 'object' && v && 'name' in v) {
      customFields[k] = String((v as { name: unknown }).name);
    }
  }

  const key = String(raw.key || '');
  const cleanServer = serverUrl.trim().replace(/\/+$/, '');

  return {
    id: String(raw.id || ''),
    key,
    externalUrl: key ? `${cleanServer}/browse/${key}` : cleanServer,
    projectKey: projectObj?.key || '',
    projectName: projectObj?.name || '',
    type: issueTypeObj?.name || 'Task',
    summary: String(fields.summary || ''),
    description,
    status: statusObj?.name || 'To Do',
    statusCategory: statusObj?.statusCategory?.key || 'new',
    priority: priorityObj?.name || 'Medium',
    assignee: assigneeObj?.emailAddress || assigneeObj?.displayName || '',
    assigneeName: assigneeObj?.displayName || '',
    reporter: reporterObj?.emailAddress || reporterObj?.displayName || '',
    storyPoints,
    originalEstimateMinutes:
      typeof fields.timeoriginalestimate === 'number'
        ? Math.round(fields.timeoriginalestimate / 60)
        : undefined,
    remainingEstimateMinutes:
      typeof fields.timeestimate === 'number'
        ? Math.round(fields.timeestimate / 60)
        : undefined,
    startDate,
    dueDate: typeof fields.duedate === 'string' ? fields.duedate : undefined,
    labels,
    components,
    fixVersions,
    parentKey: parentObj?.key || epicKeyFromCustom || '',
    parentSummary: parentObj?.fields?.summary || '',
    sprint: sprintName,
    created: String(fields.created || ''),
    updated: String(fields.updated || ''),
    issueLinks,
    comments,
    attachments,
    ...customFields,
  };
}

export async function connectJira(params: {
  serverUrl: string;
  authMethod: AuthMethod;
  email?: string;
  username?: string;
  secret: string;
}) {
  const { serverUrl, authMethod, email, username, secret } = params;
  const headers = buildAuthHeaders(authMethod, secret, email, username);

  let myselfRes = await safeExternalFetch(serverUrl, '/rest/api/3/myself', headers);
  let apiVersion: '3' | '2' = '3';
  if (myselfRes.status === 404) {
    myselfRes = await safeExternalFetch(serverUrl, '/rest/api/2/myself', headers);
    apiVersion = '2';
  }

  if (!myselfRes.ok) {
    const status = myselfRes.status === 401 || myselfRes.status === 403 ? 401 : 502;
    const message =
      status === 401
        ? 'Jira authentication failed. Verify your email/username and API token or PAT.'
        : `Jira server returned HTTP ${myselfRes.status}.`;
    return { ok: false as const, status, error: message };
  }

  const myself = (myselfRes.data || {}) as {
    accountId?: string;
    key?: string;
    name?: string;
    displayName?: string;
    emailAddress?: string;
    avatarUrls?: Record<string, string>;
  };

  // Paginated Jira Project Fetch
  const rawProjects: Array<{
    id?: string;
    key?: string;
    name?: string;
    projectTypeKey?: string;
    description?: string;
  }> = [];

  if (apiVersion === '3') {
    for (let startAt = 0; startAt < 250; startAt += 50) {
      const projRes = await safeExternalFetch(
        serverUrl,
        `/rest/api/3/project/search?startAt=${startAt}&maxResults=50`,
        headers
      );
      if (!projRes.ok) break;
      const body = projRes.data as { values?: typeof rawProjects; isLast?: boolean } | null;
      if (body && Array.isArray(body.values)) {
        rawProjects.push(...body.values);
        if (body.isLast || body.values.length < 50) break;
      } else {
        break;
      }
    }
  }

  if (rawProjects.length === 0) {
    const v2Proj = await safeExternalFetch(serverUrl, '/rest/api/2/project', headers);
    if (v2Proj.ok && Array.isArray(v2Proj.data)) {
      rawProjects.push(...(v2Proj.data as typeof rawProjects));
    }
  }

  const projectsOrSpaces = rawProjects
    .filter(p => p.key && p.name)
    .map(p => ({
      id: String(p.id || p.key),
      key: String(p.key),
      name: String(p.name),
      type: p.projectTypeKey || 'software',
      description: p.description || '',
    }));

  return {
    ok: true as const,
    account: {
      accountId: String(myself.accountId || myself.key || myself.name || 'jira-user'),
      displayName: String(myself.displayName || myself.name || email || 'Jira User'),
      email: String(myself.emailAddress || email || ''),
      avatarUrl: myself.avatarUrls?.['48x48'],
    },
    projectsOrSpaces,
  };
}

export async function checkJiraHealth(conn: StoredConnectionRecord, secret: string) {
  const headers = buildAuthHeaders(conn.authMethod, secret, conn.email, conn.username);
  let res = await safeExternalFetch(conn.serverUrl, '/rest/api/3/myself', headers).catch(() => null);
  if (!res || res.status === 404) {
    res = await safeExternalFetch(conn.serverUrl, '/rest/api/2/myself', headers).catch(() => null);
  }
  if (!res) {
    return { healthStatus: 'unreachable' as const, healthMessage: 'Jira host did not respond within timeout.' };
  }
  if (res.status === 401 || res.status === 403) {
    return { healthStatus: 'needs_reauth' as const, healthMessage: 'Jira credentials were rejected (HTTP 401/403).' };
  }
  if (!res.ok) {
    return { healthStatus: 'degraded' as const, healthMessage: `Jira returned HTTP ${res.status}.` };
  }
  return { healthStatus: 'healthy' as const, healthMessage: 'Jira REST API reachable and authenticated.' };
}

export async function discoverJiraData(params: {
  conn: StoredConnectionRecord;
  secret: string;
  projectKeys?: string[];
  jql?: string;
  maxResults?: number;
  updatedSince?: string;
}) {
  const { conn, secret, projectKeys = [], jql = '', maxResults = 200, updatedSince } = params;
  const headers = buildAuthHeaders(conn.authMethod, secret, conn.email, conn.username);

  // 1. Custom field catalog
  const fieldsRes = await safeExternalFetch(conn.serverUrl, '/rest/api/3/field', headers).then(r =>
    r.status === 404 ? safeExternalFetch(conn.serverUrl, '/rest/api/2/field', headers) : r
  );
  const customFieldNames: Record<string, string> = {};
  const customFieldMeta: Array<{ key: string; label: string; type: DetectedColumnType }> = [];

  if (fieldsRes.ok && Array.isArray(fieldsRes.data)) {
    for (const f of fieldsRes.data as Array<{ id?: string; name?: string; schema?: { type?: string } }>) {
      if (f.id && f.name && f.id.startsWith('customfield_')) {
        customFieldNames[f.id] = f.name;
        const sType = f.schema?.type || 'string';
        const inferred: DetectedColumnType =
          sType === 'number'
            ? 'number'
            : sType === 'date' || sType === 'datetime'
            ? 'date'
            : sType === 'array'
            ? 'list'
            : 'text';
        customFieldMeta.push({ key: f.id, label: `${f.name} (${f.id})`, type: inferred });
      }
    }
  }

  // 2. Build JQL with optional incremental updatedSince cursor
  const safeKeys = projectKeys
    .map(k => String(k).replace(/[^A-Za-z0-9_-]/g, ''))
    .filter(Boolean);

  let effectiveJql = jql.trim();
  if (!effectiveJql) {
    const clauses: string[] = [];
    if (safeKeys.length > 0) clauses.push(`project in (${safeKeys.join(',')})`);
    if (updatedSince) {
      const safeTs = updatedSince.replace('T', ' ').slice(0, 16);
      clauses.push(`updated >= "${safeTs}"`);
    }
    effectiveJql = clauses.length > 0 ? `${clauses.join(' AND ')} ORDER BY updated DESC` : 'ORDER BY updated DESC';
  }

  const targetTotal = Math.min(500, Math.max(10, Number(maxResults || 200)));
  const pageSize = 100;
  const searchFields = [
    'summary',
    'description',
    'status',
    'priority',
    'issuetype',
    'assignee',
    'reporter',
    'project',
    'parent',
    'labels',
    'components',
    'fixVersions',
    'duedate',
    'timeoriginalestimate',
    'timeestimate',
    'issuelinks',
    'comment',
    'attachment',
    'created',
    'updated',
    ...Object.keys(customFieldNames).slice(0, 30),
  ];

  // 3. Paginated search (supports Jira Cloud /search/jql nextPageToken and standard startAt)
  const rawIssues: Array<Record<string, unknown>> = [];
  let nextPageToken: string | undefined;
  let startAt = 0;
  let useLegacySearch = false;

  for (let page = 0; page < 6 && rawIssues.length < targetTotal; page++) {
    const batchLimit = Math.min(pageSize, targetTotal - rawIssues.length);
    let searchRes;

    if (!useLegacySearch) {
      searchRes = await safeExternalFetch(
        conn.serverUrl,
        '/rest/api/3/search/jql',
        headers,
        'POST',
        {
          jql: effectiveJql,
          maxResults: batchLimit,
          fields: searchFields,
          ...(nextPageToken ? { nextPageToken } : {}),
        }
      );
      if (searchRes.status === 404 || searchRes.status === 405) {
        useLegacySearch = true;
      }
    }

    if (useLegacySearch) {
      searchRes = await safeExternalFetch(
        conn.serverUrl,
        '/rest/api/3/search',
        headers,
        'POST',
        { jql: effectiveJql, startAt, maxResults: batchLimit, fields: searchFields }
      );
      if (searchRes.status === 404) {
        searchRes = await safeExternalFetch(
          conn.serverUrl,
          `/rest/api/2/search?jql=${encodeURIComponent(effectiveJql)}&startAt=${startAt}&maxResults=${batchLimit}`,
          headers
        );
      }
    }

    if (!searchRes || !searchRes.ok) {
      if (page === 0) {
        throw new Error(
          `Jira issue query failed (HTTP ${searchRes?.status ?? 502}). Check project permissions or JQL syntax.`
        );
      }
      break;
    }

    const dataObj = (searchRes.data && typeof searchRes.data === 'object' ? searchRes.data : {}) as {
      issues?: Array<Record<string, unknown>>;
      nextPageToken?: string;
      total?: number;
      isLast?: boolean;
    };

    const batch = Array.isArray(dataObj.issues) ? dataObj.issues : [];
    rawIssues.push(...batch);

    if (!useLegacySearch) {
      if (!dataObj.nextPageToken || dataObj.isLast || batch.length === 0) break;
      nextPageToken = dataObj.nextPageToken;
    } else {
      startAt += batch.length;
      if (batch.length < batchLimit || (typeof dataObj.total === 'number' && startAt >= dataObj.total)) {
        break;
      }
    }
  }

  const normalizedIssues = rawIssues.map(item =>
    normalizeJiraIssue(item, conn.serverUrl, customFieldNames)
  );

  // 4. Fetch Project Versions & Agile Sprints (paginated best-effort)
  const versions: Array<{
    id: string;
    name: string;
    description?: string;
    releaseDate?: string;
    isReleased: boolean;
    projectKey: string;
  }> = [];

  const sprints: Array<{
    id: string;
    name: string;
    goal: string;
    state: string;
    startDate?: string;
    endDate?: string;
    projectKey?: string;
  }> = [];

  for (const pk of safeKeys.slice(0, 5)) {
    const verRes = await safeExternalFetch(
      conn.serverUrl,
      `/rest/api/3/project/${encodeURIComponent(pk)}/versions`,
      headers
    )
      .then(r =>
        r.status === 404
          ? safeExternalFetch(conn.serverUrl, `/rest/api/2/project/${encodeURIComponent(pk)}/versions`, headers)
          : r
      )
      .catch(() => null);
    if (verRes?.ok && Array.isArray(verRes.data)) {
      for (const v of verRes.data as Array<{
        id?: string;
        name?: string;
        description?: string;
        releaseDate?: string;
        released?: boolean;
      }>) {
        if (v.name) {
          versions.push({
            id: String(v.id || v.name),
            name: v.name,
            description: v.description || '',
            releaseDate: v.releaseDate,
            isReleased: Boolean(v.released),
            projectKey: pk,
          });
        }
      }
    }

    const boardRes = await safeExternalFetch(
      conn.serverUrl,
      `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(pk)}&maxResults=10`,
      headers
    ).catch(() => null);
    if (boardRes?.ok && boardRes.data && typeof boardRes.data === 'object' && 'values' in boardRes.data) {
      const boards = (boardRes.data as { values: Array<{ id: number }> }).values || [];
      for (const b of boards.slice(0, 3)) {
        for (let sStart = 0; sStart < 100; sStart += 50) {
          const spRes = await safeExternalFetch(
            conn.serverUrl,
            `/rest/agile/1.0/board/${b.id}/sprint?startAt=${sStart}&maxResults=50`,
            headers
          ).catch(() => null);
          if (!spRes?.ok || !spRes.data || typeof spRes.data !== 'object' || !('values' in spRes.data)) {
            break;
          }
          const spData = spRes.data as {
            isLast?: boolean;
            values: Array<{
              id: number;
              name: string;
              goal?: string;
              state: string;
              startDate?: string;
              endDate?: string;
            }>;
          };
          for (const s of spData.values || []) {
            if (!sprints.some(ex => ex.id === String(s.id))) {
              sprints.push({
                id: String(s.id),
                name: s.name,
                goal: s.goal || '',
                state: s.state || 'future',
                startDate: s.startDate?.split('T')[0],
                endDate: s.endDate?.split('T')[0],
                projectKey: pk,
              });
            }
          }
          if (spData.isLast || (spData.values || []).length < 50) break;
        }
      }
    }
  }

  const standardFields: Array<{ key: string; label: string; type: DetectedColumnType }> = [
    { key: 'key', label: 'Issue Key', type: 'text' },
    { key: 'summary', label: 'Summary', type: 'text' },
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'type', label: 'Issue Type', type: 'text' },
    { key: 'status', label: 'Status', type: 'status' },
    { key: 'priority', label: 'Priority', type: 'text' },
    { key: 'assignee', label: 'Assignee', type: 'email' },
    { key: 'reporter', label: 'Reporter', type: 'email' },
    { key: 'storyPoints', label: 'Story Points', type: 'number' },
    { key: 'originalEstimateMinutes', label: 'Original Estimate (min)', type: 'number' },
    { key: 'remainingEstimateMinutes', label: 'Remaining Estimate (min)', type: 'number' },
    { key: 'startDate', label: 'Start Date', type: 'date' },
    { key: 'dueDate', label: 'Due Date', type: 'date' },
    { key: 'labels', label: 'Labels', type: 'list' },
    { key: 'components', label: 'Components', type: 'list' },
    { key: 'fixVersions', label: 'Fix Versions', type: 'list' },
    { key: 'parentKey', label: 'Parent / Epic Key', type: 'text' },
    { key: 'sprint', label: 'Sprint', type: 'text' },
    { key: 'projectKey', label: 'Project Key', type: 'text' },
  ];

  const activeCustomFields = customFieldMeta.filter(cf =>
    normalizedIssues.some(row => row[cf.key] !== undefined)
  );
  const distinctStatuses = Array.from(new Set(normalizedIssues.map(i => i.status).filter(Boolean)));

  return {
    sourceFields: [...standardFields, ...activeCustomFields],
    distinctStatuses,
    projects: conn.projectsOrSpaces.filter(p => safeKeys.length === 0 || safeKeys.includes(p.key)),
    sprints,
    versions,
    issues: normalizedIssues,
    totalCount: normalizedIssues.length,
  };
}
