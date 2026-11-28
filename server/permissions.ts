import type { AnyCollection, Role } from './schemas.ts';

export interface Actor {
  userId: string;
  orgId: string;
  email: string;
  role: Role;
}

export type Operation = 'create' | 'update' | 'delete';

type Rec = Record<string, unknown>;

export interface PermissionHelpers {
  /** leadId of the given project (undefined when the project does not exist). */
  projectLead(projectId: string | undefined | null): string | undefined;
  /** True when the actor may edit the given dashboard (owner, explicit editor, or edit scope). */
  canEditDashboard?(dashboard: Rec): boolean;
}

export function changedKeys(before: Rec | null, after: Rec | null): string[] {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const out: string[] = [];
  for (const k of keys) {
    if (JSON.stringify((before || {})[k]) !== JSON.stringify((after || {})[k])) out.push(k);
  }
  return out;
}

const isAdmin = (a: Actor) => a.role === 'admin';
const isManager = (a: Actor) => a.role === 'admin' || a.role === 'product_owner';

/**
 * Central authorization matrix. Returns null when allowed, otherwise a human readable denial reason.
 * `existing`/`incoming` are the stored and proposed records (null when not applicable).
 */
export function authorize(
  actor: Actor,
  collection: AnyCollection,
  op: Operation,
  existing: Rec | null,
  incoming: Rec | null,
  helpers: PermissionHelpers
): string | null {
  const subject = existing || incoming || {};
  const projectId = typeof subject.projectId === 'string' ? subject.projectId : undefined;
  const isLead = (pid: string | undefined | null) => Boolean(pid) && helpers.projectLead(pid) === actor.userId;
  const deny = (what: string) => `Role "${actor.role}" is not allowed to ${what}.`;

  switch (collection) {
    case 'users': {
      if (isAdmin(actor)) return null;
      if (op === 'update' && existing && existing.id === actor.userId) {
        const changed = changedKeys(existing, incoming).filter(k => k !== 'password');
        const allowed = new Set(['name', 'nameFa', 'avatar', 'avatarColor', 'department']);
        const forbidden = changed.filter(k => !allowed.has(k));
        return forbidden.length ? deny(`change your own ${forbidden.join(', ')}`) : null;
      }
      return deny(`${op} users (administrator only)`);
    }

    case 'projects': {
      if (op === 'create') return isManager(actor) ? null : deny('create spaces');
      if (op === 'delete') return isAdmin(actor) ? null : deny('delete spaces');
      if (isManager(actor) || (existing && existing.leadId === actor.userId)) {
        if (existing && incoming && existing.leadId !== incoming.leadId && !isManager(actor)) {
          return deny('change the space lead');
        }
        return null;
      }
      const changed = changedKeys(existing, incoming);
      const allowed = new Set(['starred', 'docs', 'shortcuts']);
      return changed.every(k => allowed.has(k)) ? null : deny('modify space settings');
    }

    case 'workflows': {
      if (isManager(actor) || isLead(projectId)) return null;
      return deny(`${op} workflows`);
    }

    case 'epics': {
      if (op === 'delete') return isManager(actor) || isLead(projectId) ? null : deny('delete epics');
      return null;
    }

    case 'versions':
    case 'sprints':
    case 'automationRules': {
      return isManager(actor) || isLead(projectId) ? null : deny(`${op} ${collection}`);
    }

    case 'issues': {
      if (op === 'delete') {
        if (isManager(actor) || isLead(projectId) || existing?.reporterId === actor.userId) return null;
        return deny('delete work items you did not report');
      }
      return null;
    }

    case 'teams': {
      if (isManager(actor)) return null;
      if (op === 'update' && existing && existing.leadId === actor.userId) return null;
      return deny(`${op} teams`);
    }

    case 'automationLogs': {
      if (op === 'create') return null;
      return isAdmin(actor) ? null : deny(`${op} automation logs`);
    }

    case 'savedFilters':
    case 'plans': {
      if (op === 'create') {
        if (!isAdmin(actor) && incoming?.ownerId !== actor.userId) return 'You can only create items owned by yourself.';
        return null;
      }
      if (isAdmin(actor) || existing?.ownerId === actor.userId) return null;
      if (collection === 'plans' && isManager(actor)) return null;
      return deny(`${op} items owned by someone else`);
    }

    case 'dashboards': {
      if (op === 'create') {
        if (!isAdmin(actor) && incoming?.ownerId !== actor.userId) return 'You can only create dashboards owned by yourself.';
        return null;
      }
      if (isAdmin(actor) || existing?.ownerId === actor.userId) return null;
      if (op === 'update' && changedKeys(existing, incoming).every(k => k === 'starred')) return null;
      if (op === 'update' && existing && helpers.canEditDashboard?.(existing)) {
        // Shared editors may change content but never ownership or sharing settings.
        const sharing = new Set(['ownerId', 'viewScope', 'editScope', 'sharedWithUserIds', 'editorUserIds', 'viewers', 'editors']);
        return changedKeys(existing, incoming).some(k => sharing.has(k)) ? deny('change dashboard ownership or sharing') : null;
      }
      return deny(`${op} dashboards owned by someone else`);
    }

    case 'goals': {
      if (isManager(actor) || isLead(projectId) || existing?.ownerId === actor.userId) return null;
      return deny(`${op} goals`);
    }

    case 'assets': {
      return isManager(actor) || actor.role === 'developer' ? null : deny(`${op} assets`);
    }

    case 'risks':
    case 'milestones': {
      if (isManager(actor) || isLead(projectId)) return null;
      if (op === 'create') return actor.role === 'developer' || actor.role === 'qa' ? null : deny(`create ${collection}`);
      if (op === 'update' && existing?.ownerId === actor.userId) return null;
      return deny(`${op} ${collection}`);
    }

    case 'repositories': {
      return isManager(actor) ? null : deny(`${op} repositories`);
    }

    case 'notifications': {
      // Notifications are produced by the server; users can only mark their own as read or delete them.
      if (op === 'create') return deny('create notifications');
      if (existing?.userId !== actor.userId && !isAdmin(actor)) return deny('modify notifications of other users');
      if (op === 'update' && changedKeys(existing, incoming).some(k => k !== 'read')) {
        return deny('modify notification content');
      }
      return null;
    }

    case 'siteConfig': {
      return isAdmin(actor) ? null : deny('change site configuration (administrator only)');
    }
  }
  return deny(`${op} ${collection}`);
}
