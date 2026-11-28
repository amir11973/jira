import { db } from './db.ts';
import type { Actor } from './permissions.ts';
import type { AnyCollection } from './schemas.ts';

type Rec = Record<string, unknown>;

/**
 * Read-side access control. Most collections are visible to every authenticated user of the
 * organization; saved filters, dashboards and notifications are filtered per user.
 */
export class VisibilityContext {
  private teamCache = new Map<string, Set<string>>();
  private allTeams: Array<{ id: string; people: Set<string> }> | null = null;
  private orgId: string;

  constructor(orgId: string) {
    this.orgId = orgId;
  }

  private loadTeams(): Array<{ id: string; people: Set<string> }> {
    if (!this.allTeams) {
      const rows = db
        .prepare("SELECT id, data FROM records WHERE collection = 'teams' AND org_id = ? AND deleted = 0")
        .all(this.orgId) as unknown as Array<{ id: string; data: string }>;
      this.allTeams = rows.map(r => {
        const t = JSON.parse(r.data) as { leadId?: string; memberIds?: string[] };
        return { id: r.id, people: new Set([...(t.memberIds || []), ...(t.leadId ? [t.leadId] : [])]) };
      });
    }
    return this.allTeams;
  }

  teamsOf(userId: string): Set<string> {
    let cached = this.teamCache.get(userId);
    if (!cached) {
      cached = new Set(this.loadTeams().filter(t => t.people.has(userId)).map(t => t.id));
      this.teamCache.set(userId, cached);
    }
    return cached;
  }

  sharesTeam(a: string, b: string): boolean {
    if (a === b) return true;
    const ta = this.teamsOf(a);
    for (const id of this.teamsOf(b)) if (ta.has(id)) return true;
    return false;
  }
}

export type Scope = 'private' | 'team' | 'organization';

export function filterScope(rec: Rec): Scope {
  const s = rec.shareScope;
  return s === 'private' || s === 'team' || s === 'organization' ? s : 'organization';
}

export function dashboardViewScope(rec: Rec): Scope {
  if (rec.viewScope === 'private' || rec.viewScope === 'team' || rec.viewScope === 'organization') return rec.viewScope;
  const v = String(rec.viewers || '').toLowerCase();
  if (!v || v.includes('private')) return 'private';
  if (v.includes('organization') || v.includes('everyone') || v.includes('all ')) return 'organization';
  return 'team';
}

export function dashboardEditScope(rec: Rec): Scope {
  if (rec.editScope === 'private' || rec.editScope === 'team' || rec.editScope === 'organization') return rec.editScope;
  return 'private';
}

export function canRead(actor: Actor, collection: AnyCollection, rec: Rec, vis: VisibilityContext): boolean {
  switch (collection) {
    case 'notifications':
      return rec.userId === actor.userId;
    case 'savedFilters': {
      if (actor.role === 'admin' || rec.ownerId === actor.userId) return true;
      const scope = filterScope(rec);
      if (scope === 'organization') return true;
      if (scope === 'team') return typeof rec.ownerId === 'string' && vis.sharesTeam(rec.ownerId, actor.userId);
      return false;
    }
    case 'dashboards': {
      if (actor.role === 'admin' || rec.ownerId === actor.userId) return true;
      if (Array.isArray(rec.sharedWithUserIds) && rec.sharedWithUserIds.includes(actor.userId)) return true;
      if (Array.isArray(rec.editorUserIds) && rec.editorUserIds.includes(actor.userId)) return true;
      const scope = dashboardViewScope(rec);
      if (scope === 'organization') return true;
      if (scope === 'team') return typeof rec.ownerId === 'string' && vis.sharesTeam(rec.ownerId, actor.userId);
      return false;
    }
    default:
      return true;
  }
}

export function canEditDashboard(actor: Actor, rec: Rec, vis: VisibilityContext): boolean {
  if (actor.role === 'admin' || rec.ownerId === actor.userId) return true;
  if (Array.isArray(rec.editorUserIds) && rec.editorUserIds.includes(actor.userId)) return true;
  const scope = dashboardEditScope(rec);
  if (scope === 'organization') return true;
  if (scope === 'team') return typeof rec.ownerId === 'string' && vis.sharesTeam(rec.ownerId, actor.userId);
  return false;
}
