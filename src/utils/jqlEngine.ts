import { Issue, Project, User } from '../types/jira';

const PRIORITY_WEIGHT: Record<string, number> = {
  lowest: 1,
  low: 2,
  medium: 3,
  high: 4,
  highest: 5,
};

export interface JqlParseResult {
  issues: Issue[];
  error?: string;
}

function stripQuotes(s: string): string {
  const trimmed = s.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function executeJqlQuery(
  rawJql: string,
  allIssues: Issue[],
  projects: Project[],
  users: User[],
  currentUser: User | null
): JqlParseResult {
  const trimmed = rawJql.trim();
  if (!trimmed) {
    return { issues: allIssues };
  }

  let wherePart = trimmed;
  let orderByField = '';
  let orderDir: 'asc' | 'desc' = 'desc';

  const orderMatch = trimmed.match(/\s+ORDER\s+BY\s+([a-zA-Z_]+)(?:\s+(ASC|DESC))?$/i);
  if (orderMatch) {
    wherePart = trimmed.slice(0, orderMatch.index).trim();
    orderByField = orderMatch[1].toLowerCase();
    orderDir = (orderMatch[2]?.toLowerCase() as 'asc' | 'desc') || 'asc';
  }

  // Split by AND (case-insensitive)
  const clauses = wherePart ? wherePart.split(/\s+AND\s+/i).map(c => c.trim()).filter(Boolean) : [];

  let filtered = [...allIssues];

  for (const clause of clauses) {
    const m = clause.match(/^([a-zA-Z_]+)\s*(!=|!~|=|~)\s*(.+)$/);
    if (!m) {
      return {
        issues: allIssues,
        error: `Syntax error in JQL near "${clause}". Expected format: field = value`,
      };
    }

    const field = m[1].toLowerCase();
    const op = m[2];
    let val = stripQuotes(m[3]).toLowerCase();

    if (val === 'currentuser()') {
      val = currentUser?.id.toLowerCase() || '';
    }

    filtered = filtered.filter(issue => {
      let actual = '';

      switch (field) {
        case 'project': {
          const proj = projects.find(p => p.id === issue.projectId);
          actual = (proj?.key || '').toLowerCase();
          break;
        }
        case 'status':
          actual = issue.status.toLowerCase();
          break;
        case 'type':
        case 'issuetype':
          actual = issue.type.toLowerCase();
          break;
        case 'priority':
          actual = issue.priority.toLowerCase();
          break;
        case 'assignee': {
          if (val === 'unassigned' || val === 'empty' || val === 'null') {
            actual = issue.assigneeId ? 'assigned' : val;
          } else if (currentUser && val === currentUser.id.toLowerCase()) {
            actual = (issue.assigneeId || '').toLowerCase();
          } else {
            const u = users.find(usr => usr.id === issue.assigneeId);
            actual = (u?.name || u?.email || issue.assigneeId || '').toLowerCase();
          }
          break;
        }
        case 'reporter': {
          if (currentUser && val === currentUser.id.toLowerCase()) {
            actual = issue.reporterId.toLowerCase();
          } else {
            const u = users.find(usr => usr.id === issue.reporterId);
            actual = (u?.name || u?.email || issue.reporterId).toLowerCase();
          }
          break;
        }
        case 'flagged':
          actual = String(Boolean(issue.flagged));
          break;
        case 'resolution':
          actual = (issue.resolution || 'unresolved').toLowerCase();
          break;
        case 'summary':
        case 'text':
          actual = `${issue.key} ${issue.summary} ${issue.description}`.toLowerCase();
          break;
        case 'labels':
        case 'label':
          actual = issue.labels.join(',').toLowerCase();
          break;
        case 'key':
          actual = issue.key.toLowerCase();
          break;
        default:
          return true;
      }

      if (op === '=') {
        if (field === 'labels' || field === 'label') {
          return issue.labels.some(l => l.toLowerCase() === val);
        }
        return actual === val || (field === 'status' && actual.replace(/\s+/g, '') === val.replace(/\s+/g, ''));
      }
      if (op === '!=') {
        if (field === 'labels' || field === 'label') {
          return !issue.labels.some(l => l.toLowerCase() === val);
        }
        return actual !== val && !(field === 'status' && actual.replace(/\s+/g, '') === val.replace(/\s+/g, ''));
      }
      if (op === '~') {
        return actual.includes(val);
      }
      if (op === '!~') {
        return !actual.includes(val);
      }
      return true;
    });
  }

  if (orderByField) {
    filtered.sort((a, b) => {
      let cmp = 0;
      if (orderByField === 'priority') {
        cmp = (PRIORITY_WEIGHT[a.priority] || 0) - (PRIORITY_WEIGHT[b.priority] || 0);
      } else if (orderByField === 'created' || orderByField === 'createdat') {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (orderByField === 'updated' || orderByField === 'updatedat') {
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      } else if (orderByField === 'key') {
        cmp = a.key.localeCompare(b.key);
      } else if (orderByField === 'status') {
        cmp = a.status.localeCompare(b.status);
      }
      return orderDir === 'asc' ? cmp : -cmp;
    });
  }

  return { issues: filtered };
}
