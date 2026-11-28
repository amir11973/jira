import crypto from 'node:crypto';
import { DEFAULT_ORG_ID, db, getMeta, setMeta, transaction } from './db.ts';
import { writeAudit } from './audit.ts';
import { applyBatch } from './repo.ts';
import type { BatchOp } from './repo.ts';
import { generateTemporaryPassword } from './auth.ts';
import type { Actor } from './permissions.ts';
import { deleteStoredFiles } from './files.ts';
import { backfillHistory } from './history.ts';
import {
  initialAssets,
  initialAutomationRules,
  initialDashboards,
  initialEpics,
  initialGoals,
  initialIssues,
  initialNotifications,
  initialProjects,
  initialSavedFilters,
  initialSiteConfig,
  initialSprints,
  initialTeams,
  initialUsers,
  initialVersions,
  initialWorkflows,
} from '../src/data/mockData.ts';

const SYSTEM_ACTOR: Actor = {
  userId: 'system',
  orgId: DEFAULT_ORG_ID,
  email: 'system@jiraflow.local',
  role: 'admin',
};

export const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Demo mode == non-production with the well-known demo password. It enables the quick-login
 * shortcuts on the sign-in page and must never be on in production.
 */
export function isDemoMode(): boolean {
  return !isProduction() && !process.env.SEED_DEFAULT_PASSWORD && getMeta('demo_mode') === '1';
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function demoPlans() {
  return [
    {
      id: 'plan-1',
      name: 'Q4 Core & Billing Delivery Plan',
      description: 'Unified cross-space delivery roadmap for Core Platform & Billing.',
      spaceIds: ['proj-1', 'proj-4'],
      ownerId: 'user-1',
      createdAt: '2026-11-01T10:00:00Z',
    },
  ];
}

/** A few finished items of the completed Sprint 23 so the demo workspace has velocity history. */
function demoHistoricIssues() {
  const mk = (n: number, type: string, summary: string, points: number, assigneeId: string, createdAt: string, doneAt: string) => ({
    id: `iss-09${n}`,
    key: `ENG-09${n}`,
    projectId: 'proj-1',
    sprintId: 'sprint-23',
    epicId: null,
    type,
    summary,
    description: '',
    status: 'done',
    priority: 'medium',
    resolution: 'done',
    assigneeId,
    reporterId: 'user-1',
    storyPoints: points,
    labels: [] as string[],
    components: [] as string[],
    fixVersionIds: ['ver-1'],
    subtasks: [],
    comments: [],
    worklogs: [],
    links: [],
    attachments: [],
    devLinks: [],
    history: [],
    automationExecutions: [],
    createdAt,
    updatedAt: doneAt,
  });
  return [
    mk(1, 'story', 'Migrate session store to a Redis cluster', 5, 'user-2', '2026-10-10T09:00:00Z', '2026-10-21T15:00:00Z'),
    mk(2, 'task', 'Add build cache to the monorepo CI pipeline', 3, 'user-3', '2026-10-10T09:30:00Z', '2026-10-17T12:00:00Z'),
    mk(3, 'bug', 'Fix pagination off-by-one on the audit endpoint', 2, 'user-5', '2026-10-15T10:00:00Z', '2026-10-24T10:00:00Z'),
    mk(4, 'story', 'Database replication failover runbook', 5, 'user-6', '2026-10-10T10:00:00Z', '2026-10-27T17:00:00Z'),
  ];
}

function demoAutomationLogs() {
  return [
    {
      id: 'alog-init-1',
      projectId: 'proj-1',
      ruleId: 'auto-2',
      ruleName: 'Set Resolution to Done & clear Flagged on Done',
      issueKey: 'ENG-101',
      status: 'success',
      details: 'Resolution set to Done; Flagged cleared.',
      timestamp: '2026-11-08T16:00:00Z',
    },
    {
      id: 'alog-init-2',
      projectId: 'proj-1',
      ruleId: 'auto-1',
      ruleName: 'Auto-assign work item on In Progress',
      issueKey: 'ENG-104',
      status: 'success',
      details: 'Assigned automatically on transition to In Progress.',
      timestamp: '2026-11-09T11:30:00Z',
    },
  ];
}

function demoRepositories() {
  const now = '2026-11-01T09:00:00Z';
  const repo = (id: string, name: string, path: string, branch = 'main') => ({
    id,
    name,
    provider: 'gitlab',
    baseUrl: `https://git.nexus-tech.io/${path}`,
    defaultBranch: branch,
    description: '',
    enabled: true,
    projectIds: [] as string[],
    connectedBy: 'user-6',
    connectedAt: now,
  });
  return [
    repo('repo-auth-gateway', 'nexus/auth-gateway', 'auth-gateway'),
    repo('repo-api-gateway', 'nexus/api-gateway', 'api-gateway'),
    repo('repo-streaming-engine', 'nexus/streaming-engine', 'streaming'),
    repo('repo-mobile-app', 'nexus/mobile-app', 'mobile'),
    repo('repo-event-bus', 'nexus/event-bus', 'event-bus'),
    repo('repo-core-platform', 'nexus/core-platform', 'core-platform'),
  ];
}

interface SeedCredentials {
  demo: boolean;
  adminTemporaryPassword?: string;
}

async function seedAll(): Promise<SeedCredentials> {
  const configured = process.env.SEED_DEFAULT_PASSWORD;
  const demo = !isProduction() && !configured;
  const sharedPassword = configured || (demo ? 'password123' : undefined);
  let adminTemporaryPassword: string | undefined;

  const ops: BatchOp[] = [];
  for (const u of initialUsers) {
    let password = sharedPassword;
    if (!password && u.role === 'admin') {
      adminTemporaryPassword = generateTemporaryPassword();
      password = adminTemporaryPassword;
    }
    ops.push({ collection: 'users', op: 'upsert', id: u.id, data: { ...u, ...(password ? { password } : {}) } });
  }
  const add = (collection: string, items: Array<{ id: string }>) => {
    for (const item of items) ops.push({ collection, op: 'upsert', id: item.id, data: item });
  };
  add('projects', initialProjects);
  add('workflows', initialWorkflows);
  add('epics', initialEpics);
  add('sprints', initialSprints);
  add('versions', initialVersions);
  add(
    'issues',
    [
      ...initialIssues.map(i => (i.status === ('backlog' as string) ? { ...i, status: 'todo' } : i)),
      ...demoHistoricIssues(),
    ]
  );
  add('teams', initialTeams);
  add('automationRules', initialAutomationRules);
  add('automationLogs', demoAutomationLogs());
  add('savedFilters', initialSavedFilters);
  add('dashboards', initialDashboards);
  add('plans', demoPlans());
  add('goals', initialGoals);
  add('assets', initialAssets);
  add('repositories', demoRepositories());
  add(
    'notifications',
    initialNotifications.map(n => ({ ...n, userId: 'user-1', kind: 'system' }))
  );
  add('siteConfig', [{ ...initialSiteConfig, id: 'site' } as { id: string }]);

  for (const part of chunk(ops, 400)) {
    await applyBatch(SYSTEM_ACTOR, part, { system: true, skipHistory: true });
  }
  // Report history for the seeded sprints / issues is reconstructed from their dates (marked "estimated").
  backfillHistory();
  setMeta('p2_history_backfilled_at', new Date().toISOString());

  setMeta('demo_mode', demo ? '1' : '0');
  if (!demo) {
    db.prepare('UPDATE users SET must_change_password = 1').run();
  }
  return { demo, adminTemporaryPassword };
}

/** Seeds the database with the demo workspace the first time the server starts. */
export async function seedIfEmpty(): Promise<void> {
  if (getMeta('seeded_at')) return;
  const result = await seedAll();
  setMeta('seeded_at', new Date().toISOString());
  setMeta('epoch', '1');
  writeAudit({
    orgId: DEFAULT_ORG_ID,
    actorId: 'system',
    actorRole: 'system',
    action: 'system.seed',
    summary: 'Seeded initial workspace data.',
  });
  if (result.demo) {
    console.log('[seed] Demo workspace created. Demo password for every seeded user: "password123" (non-production only).');
  } else if (result.adminTemporaryPassword) {
    const adminEmail = initialUsers.find(u => u.role === 'admin')?.email;
    console.log('[seed] ------------------------------------------------------------');
    console.log(`[seed] Initial administrator: ${adminEmail}`);
    console.log(`[seed] One-time temporary password: ${result.adminTemporaryPassword}`);
    console.log('[seed] Change it after first sign-in. Other seeded users cannot sign in until an admin sets a password.');
    console.log('[seed] ------------------------------------------------------------');
  } else {
    console.log('[seed] Workspace seeded using SEED_DEFAULT_PASSWORD. Users must change it on first sign-in.');
  }
}

export function currentEpoch(): number {
  return Number(getMeta('epoch') || '1');
}

/** Admin action: wipes all workspace data and re-seeds the demo workspace. All sessions are revoked. */
export async function resetToDemoWorkspace(actor: Actor, ip?: string | null): Promise<void> {
  transaction(() => {
    const stored = db.prepare('SELECT storage_key FROM issue_attachments WHERE storage_key IS NOT NULL').all() as unknown as Array<{ storage_key: string }>;
    deleteStoredFiles(stored.map(r => r.storage_key));
    db.exec(`
      DELETE FROM jobs;
      -- synced data refers to records that are about to be replaced (connections and settings are kept)
      DELETE FROM integ_links;
      DELETE FROM integ_events;
      DELETE FROM scm_items;
      DELETE FROM integ_docs WHERE kind IN ('job', 'jobitem', 'conflict', 'reposync', 'history');
      DELETE FROM issue_comments;
      DELETE FROM issue_worklogs;
      DELETE FROM issue_attachments;
      DELETE FROM issue_events;
      DELETE FROM sprint_events;
      DELETE FROM records;
      DELETE FROM sessions;
      DELETE FROM users;
    `);
  });
  await seedAll();
  setMeta('epoch', String(currentEpoch() + 1));
  db.prepare('INSERT INTO changes (collection, id, org_id, op, ts) VALUES (?, ?, ?, ?, ?)').run(
    '*',
    crypto.randomUUID(),
    DEFAULT_ORG_ID,
    'reset',
    new Date().toISOString()
  );
  writeAudit({
    orgId: DEFAULT_ORG_ID,
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: 'system.reset_demo',
    summary: 'Workspace was reset to demo data.',
    ip,
  });
}

/**
 * P2 migration: databases created before report history existed get reconstructed (estimated) history so
 * burndown / velocity work for existing sprints. From then on the server records real history on every write.
 */
export function migrateP2Data(): void {
  if (getMeta('p2_history_backfilled_at')) return;
  const result = backfillHistory();
  setMeta('p2_history_backfilled_at', new Date().toISOString());
  if (result.issues || result.sprints) {
    console.log(`[p2] Reconstructed report history for ${result.issues} work item(s) and ${result.sprints} sprint(s).`);
  }
}

/**
 * Idempotent data migration for databases created before P1: connect the demo repositories and give
 * legacy (ownerless) notifications a recipient.
 */
export async function migrateP1Data(): Promise<void> {
  if (getMeta('p1_migrated_at')) return;
  const ops: BatchOp[] = [];
  const repoCount = db.prepare("SELECT COUNT(*) AS c FROM records WHERE collection = 'repositories' AND deleted = 0").get() as { c: number };
  if (repoCount.c === 0 && getMeta('demo_mode') !== undefined) {
    for (const r of demoRepositories()) ops.push({ collection: 'repositories', op: 'upsert', id: r.id, data: r });
  }
  const orphans = db
    .prepare("SELECT id, data FROM records WHERE collection = 'notifications' AND deleted = 0 AND json_extract(data, '$.userId') IS NULL")
    .all() as unknown as Array<{ id: string; data: string }>;
  const firstUser = db.prepare('SELECT id FROM users ORDER BY created_at, id LIMIT 1').get() as { id: string } | undefined;
  if (firstUser) {
    for (const o of orphans) {
      ops.push({ collection: 'notifications', op: 'upsert', id: o.id, data: { ...JSON.parse(o.data), userId: firstUser.id, kind: 'system' } });
    }
  }
  if (ops.length > 0) await applyBatch(SYSTEM_ACTOR, ops, { system: true });
  setMeta('p1_migrated_at', new Date().toISOString());
}
