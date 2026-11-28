import { S } from './validation.ts';
import type { Spec } from './validation.ts';

export const ROLES = ['admin', 'developer', 'qa', 'product_owner', 'designer'] as const;
export type Role = (typeof ROLES)[number];

/** Collections stored in the generic `records` table. */
export type CollectionName =
  | 'projects'
  | 'workflows'
  | 'epics'
  | 'sprints'
  | 'versions'
  | 'issues'
  | 'teams'
  | 'automationRules'
  | 'automationLogs'
  | 'savedFilters'
  | 'dashboards'
  | 'plans'
  | 'goals'
  | 'assets'
  | 'risks'
  | 'milestones'
  | 'notifications'
  | 'repositories'
  | 'siteConfig';

export const RECORD_COLLECTIONS: CollectionName[] = [
  'projects',
  'workflows',
  'epics',
  'sprints',
  'versions',
  'issues',
  'teams',
  'automationRules',
  'automationLogs',
  'savedFilters',
  'dashboards',
  'plans',
  'goals',
  'assets',
  'risks',
  'milestones',
  'notifications',
  'repositories',
  'siteConfig',
];

/** All collections exposed by the API (records + users). */
export const ALL_COLLECTIONS = ['users', ...RECORD_COLLECTIONS] as const;
export type AnyCollection = (typeof ALL_COLLECTIONS)[number];

export function isCollection(name: string): name is AnyCollection {
  return (ALL_COLLECTIONS as readonly string[]).includes(name);
}

const D = S.str({ max: 40 });
const REF = S.str({ max: 120 });
const TXT = S.text();
const SHORT = S.str({ max: 300 });
const STRLIST = S.arr(S.str({ max: 300 }));

const PRIORITIES = ['lowest', 'low', 'medium', 'high', 'highest'] as const;
const ISSUE_TYPES = ['epic', 'story', 'task', 'feature', 'bug', 'subtask'] as const;
const STATUS_CATEGORIES = ['todo', 'inprogress', 'done'] as const;

const statusSpec = S.obj({
  id: S.str({ req: true, max: 120 }),
  numericId: S.num(),
  name: S.str({ req: true, max: 120 }),
  nameFa: S.str({ max: 120 }),
  category: S.oneOf(STATUS_CATEGORIES, { req: true }),
  color: S.str({ max: 300 }),
});

const ruleSpec = S.obj({
  id: S.str({ req: true, max: 120 }),
  kind: S.oneOf(['restrict', 'validate', 'perform'], { req: true }),
  type: S.str({ req: true, max: 80 }),
  label: S.str({ max: 300 }),
  labelFa: S.str({ max: 300 }),
  config: S.rec(S.str({ max: 2000 })),
});

const transitionSpec = S.obj({
  id: S.str({ req: true, max: 120 }),
  numericId: S.num(),
  name: S.str({ req: true, max: 120 }),
  nameFa: S.str({ max: 120 }),
  fromStatusId: S.str({ req: true, max: 120 }),
  fromStatusIds: S.arr(S.str({ max: 120 })),
  toStatusId: S.str({ req: true, max: 120 }),
  rules: S.arr(ruleSpec),
});

const docSpec = S.obj({
  id: S.str({ req: true, max: 120 }),
  title: S.str({ req: true, max: 400 }),
  content: TXT,
  authorId: REF,
  authorName: SHORT,
  createdAt: D,
  updatedAt: D,
  parentId: S.str({ max: 120, nullable: true }),
  ancestors: S.arr(S.obj({ id: S.str({ max: 120 }), title: SHORT })),
  version: S.num(),
  sourceUrl: S.str({ max: 2000 }),
  sourceProvider: S.oneOf(['confluence', 'excel', 'local']),
  externalId: SHORT,
  labels: STRLIST,
  attachments: S.arr(
    S.obj({
      id: S.str({ max: 120 }),
      name: SHORT,
      size: S.str({ max: 40 }),
      mimeType: S.str({ max: 120 }),
      downloadUrl: S.str({ max: 2000 }),
    })
  ),
  comments: S.arr(
    S.obj({
      id: S.str({ max: 120 }),
      author: SHORT,
      authorName: SHORT,
      text: TXT,
      content: TXT,
      createdAt: D,
    })
  ),
  conversionWarnings: S.arr(S.str({ max: 1000 })),
  structuredBlocks: S.arr(S.any()),
});

export const RECORD_SCHEMAS: Record<CollectionName, Spec> = {
  projects: S.obj({
    id: S.id({ req: true }),
    key: S.str({ req: true, max: 10, pattern: /^[A-Z0-9]{1,10}$/ }),
    name: S.str({ req: true, max: 200 }),
    nameFa: S.str({ max: 200 }),
    description: S.str({ max: 5000 }),
    leadId: S.str({ req: true, max: 120 }),
    avatarColor: S.str({ max: 120 }),
    category: S.str({ max: 120 }),
    template: S.oneOf(['scrum', 'kanban', 'business', 'work_requests', 'it_service', 'personal']),
    starred: S.bool(),
    budgetAllocated: S.num({ min: 0 }),
    budgetSpent: S.num({ min: 0 }),
    currency: S.str({ max: 12 }),
    enabledTabs: S.arr(S.str({ max: 40 })),
    shortcuts: S.arr(S.obj({ id: S.str({ max: 120 }), title: SHORT, url: S.str({ max: 2000 }) })),
    docs: S.arr(docSpec),
    policies: S.arr(
      S.obj({
        id: S.str({ max: 120 }),
        title: SHORT,
        titleFa: SHORT,
        description: S.str({ max: 2000 }),
        enabled: S.bool(),
      })
    ),
    features: S.obj({
      sprints: S.bool(),
      estimation: S.bool(),
      standups: S.bool(),
      forms: S.bool(),
      releases: S.bool(),
    }),
    notifications: S.obj({
      onCreated: S.bool(),
      onTransitioned: S.bool(),
      onCommented: S.bool(),
      onAssigned: S.bool(),
      senderName: SHORT,
    }),
  }),

  workflows: S.obj({
    id: S.id({ req: true }),
    projectId: S.str({ max: 120 }),
    name: S.str({ req: true, max: 200 }),
    description: S.str({ max: 2000 }),
    isActive: S.bool(),
    schemeName: SHORT,
    updatedAt: D,
    statuses: S.arr(statusSpec, { req: true, max: 100 }),
    transitions: S.arr(transitionSpec, { req: true, max: 500 }),
  }),

  epics: S.obj({
    id: S.id({ req: true }),
    key: S.str({ req: true, max: 60 }),
    projectId: S.id({ req: true }),
    name: S.str({ req: true, max: 300 }),
    nameFa: SHORT,
    summary: S.str({ max: 5000 }),
    color: S.str({ max: 40 }),
    status: S.oneOf(STATUS_CATEGORIES, { req: true }),
    startDate: D,
    dueDate: D,
  }),

  sprints: S.obj({
    id: S.id({ req: true }),
    projectId: S.id({ req: true }),
    name: S.str({ req: true, max: 200 }),
    goal: S.str({ max: 2000 }),
    startDate: D,
    endDate: D,
    status: S.oneOf(['planned', 'active', 'completed'], { req: true }),
    completedAt: D,
  }),

  versions: S.obj({
    id: S.id({ req: true }),
    projectId: S.id({ req: true }),
    name: S.str({ req: true, max: 200 }),
    description: S.str({ max: 5000 }),
    releaseDate: D,
    startDate: D,
    isReleased: S.bool({ req: true }),
  }),

  issues: S.obj({
    id: S.id({ req: true }),
    key: S.str({ req: true, max: 40 }),
    projectId: S.id({ req: true }),
    sprintId: S.str({ max: 120, nullable: true }),
    epicId: S.str({ max: 120, nullable: true }),
    parentIssueId: S.str({ max: 120, nullable: true }),
    type: S.oneOf(ISSUE_TYPES, { req: true }),
    summary: S.str({ req: true, max: 500 }),
    description: TXT,
    status: S.str({ req: true, max: 120 }),
    priority: S.oneOf(PRIORITIES, { req: true }),
    resolution: S.str({ max: 80, nullable: true }),
    assigneeId: S.str({ max: 120, nullable: true }),
    reporterId: S.str({ req: true, max: 120 }),
    storyPoints: S.num({ min: 0, max: 10_000 }),
    originalEstimateMinutes: S.num({ min: 0 }),
    remainingEstimateMinutes: S.num({ min: 0 }),
    securityLevel: S.str({ max: 120 }),
    flagged: S.bool(),
    archived: S.bool(),
    issueColor: S.str({ max: 40 }),
    rank: S.str({ max: 120 }),
    startDate: D,
    dueDate: D,
    team: S.str({ max: 200 }),
    watchers: S.arr(S.str({ max: 120 })),
    labels: S.arr(S.str({ max: 120 })),
    components: S.arr(S.str({ max: 120 })),
    fixVersionIds: S.arr(S.str({ max: 120 })),
    subtasks: S.arr(
      S.obj({
        id: S.str({ req: true, max: 120 }),
        parentId: S.str({ max: 120 }),
        key: S.str({ max: 60 }),
        title: S.str({ req: true, max: 500 }),
        isCompleted: S.bool(),
        status: S.str({ max: 120 }),
      })
    ),
    // Normalized into dedicated tables by the server:
    comments: S.arr(
      S.obj({
        id: S.id({ req: true }),
        authorId: S.str({ req: true, max: 120 }),
        content: S.text({ req: true }),
        createdAt: D,
      })
    ),
    worklogs: S.arr(
      S.obj({
        id: S.id({ req: true }),
        authorId: S.str({ req: true, max: 120 }),
        timeSpentMinutes: S.num({ req: true, min: 0, max: 1_000_000, int: true }),
        startedAt: D,
        comment: S.text(),
      })
    ),
    attachments: S.arr(
      S.obj({
        id: S.id({ req: true }),
        name: S.str({ req: true, max: 400 }),
        size: S.str({ max: 40 }),
        mimeType: S.str({ max: 160 }),
        uploadedBy: S.str({ max: 120 }),
        uploadedAt: D,
        downloadUrl: S.str({ max: 300 }),
        sizeBytes: S.num({ min: 0 }),
      })
    ),
    links: S.arr(
      S.obj({
        id: S.str({ req: true, max: 120 }),
        type: S.oneOf(['blocks', 'is_blocked_by', 'cloners', 'duplicates', 'relates_to'], { req: true }),
        targetIssueKey: S.str({ req: true, max: 60 }),
      })
    ),
    devLinks: S.arr(
      S.obj({
        id: S.str({ req: true, max: 120 }),
        type: S.oneOf(['pr', 'branch', 'commit'], { req: true }),
        title: SHORT,
        status: S.oneOf(['open', 'merged', 'deployed', 'closed']),
        repo: SHORT,
        url: S.str({ max: 2000 }),
        updatedAt: D,
        // Written only by the source-control integration (server/scm.ts):
        verified: S.bool(),
        externalId: S.str({ max: 400 }),
        author: S.str({ max: 200 }),
        sha: S.str({ max: 64 }),
        mergedAt: D,
        deployedAt: D,
        environment: S.str({ max: 120 }),
      })
    ),
    history: S.arr(
      S.obj({
        id: S.str({ req: true, max: 160 }),
        authorId: S.str({ max: 120 }),
        field: S.str({ max: 120 }),
        fromValue: S.str({ max: 2000 }),
        toValue: S.str({ max: 2000 }),
        createdAt: D,
      }),
      { max: 2000 }
    ),
    automationExecutions: S.arr(
      S.obj({
        id: S.str({ max: 160 }),
        ruleId: S.str({ max: 120 }),
        ruleName: SHORT,
        status: S.oneOf(['success', 'skipped']),
        message: S.str({ max: 2000 }),
        executedAt: D,
      }),
      { max: 500 }
    ),
    wbsCode: S.str({ max: 80 }),
    estimatedCost: S.num({ min: 0 }),
    actualCost: S.num({ min: 0 }),
    isMilestone: S.bool(),
    externalKey: S.str({ max: 120 }),
    externalUrl: S.str({ max: 2000 }),
    customFields: S.rec(S.any()),
    createdAt: D,
    updatedAt: D,
  }),

  teams: S.obj({
    id: S.id({ req: true }),
    name: S.str({ req: true, max: 200 }),
    nameFa: SHORT,
    description: S.str({ max: 5000 }),
    leadId: S.str({ req: true, max: 120 }),
    memberIds: S.arr(S.str({ max: 120 })),
  }),

  automationRules: S.obj({
    id: S.id({ req: true }),
    projectId: S.id({ req: true }),
    name: S.str({ req: true, max: 300 }),
    nameFa: SHORT,
    description: S.str({ max: 2000 }),
    descriptionFa: S.str({ max: 2000 }),
    trigger: S.oneOf(['issue_transitioned', 'issue_created', 'subtasks_all_done'], { req: true }),
    triggerTargetStatus: S.str({ max: 120 }),
    action: S.oneOf(
      [
        'close_parent',
        'auto_assign_mover',
        'set_resolution_done',
        'unflag_issue',
        'add_watcher_lead',
        'notify_assignee',
        'send_webhook',
      ],
      { req: true }
    ),
    actionConfig: S.rec(S.str({ max: 2000 })),
    enabled: S.bool({ req: true }),
    executionsCount: S.num({ min: 0 }),
  }),

  automationLogs: S.obj({
    id: S.id({ req: true }),
    projectId: S.str({ max: 120 }),
    ruleId: S.str({ max: 120 }),
    ruleName: SHORT,
    issueKey: S.str({ max: 60 }),
    status: S.oneOf(['success', 'skipped', 'failed', 'retrying'], { req: true }),
    details: S.str({ max: 2000 }),
    timestamp: D,
    jobId: S.num(),
    attempts: S.num(),
  }),

  savedFilters: S.obj({
    id: S.id({ req: true }),
    name: S.str({ req: true, max: 200 }),
    jql: S.str({ max: 5000 }),
    ownerId: S.str({ req: true, max: 120 }),
    shareScope: S.oneOf(['private', 'team', 'organization']),
    createdAt: D,
  }),

  dashboards: S.obj({
    id: S.id({ req: true }),
    name: S.str({ req: true, max: 200 }),
    description: S.str({ max: 2000 }),
    ownerId: S.str({ req: true, max: 120 }),
    projectId: S.str({ max: 120 }),
    viewers: S.str({ max: 200 }),
    editors: S.str({ max: 200 }),
    viewScope: S.oneOf(['private', 'team', 'organization']),
    editScope: S.oneOf(['private', 'team', 'organization']),
    sharedWithUserIds: S.arr(S.str({ max: 120 }), { max: 200 }),
    editorUserIds: S.arr(S.str({ max: 120 }), { max: 200 }),
    starred: S.bool(),
    gadgets: S.arr(
      S.obj({
        id: S.str({ req: true, max: 120 }),
        type: S.oneOf(
          ['assigned_to_me', 'issue_stats', 'priority_breakdown', 'created_vs_resolved', 'activity_stream'],
          { req: true }
        ),
        title: SHORT,
        titleFa: SHORT,
      }),
      { max: 50 }
    ),
  }),

  plans: S.obj({
    id: S.id({ req: true }),
    name: S.str({ req: true, max: 200 }),
    description: S.str({ max: 2000 }),
    spaceIds: S.arr(S.str({ max: 120 })),
    ownerId: S.str({ req: true, max: 120 }),
    isDemo: S.bool(),
    createdAt: D,
  }),

  goals: S.obj({
    id: S.id({ req: true }),
    projectId: S.str({ max: 120 }),
    title: S.str({ req: true, max: 300 }),
    titleFa: SHORT,
    ownerId: S.str({ req: true, max: 120 }),
    description: S.str({ max: 5000 }),
    startDate: D,
    targetDate: D,
    status: S.oneOf(['on_track', 'at_risk', 'completed'], { req: true }),
    linkedEpicIds: S.arr(S.str({ max: 120 })),
    // P2: explicit work-item links, dependencies and how progress is determined.
    linkedIssueIds: S.arr(S.str({ max: 120 }), { max: 500 }),
    linkedMilestoneIds: S.arr(S.str({ max: 120 }), { max: 200 }),
    dependsOnGoalIds: S.arr(S.str({ max: 120 }), { max: 50 }),
    progressMode: S.oneOf(['auto', 'manual']),
    manualProgress: S.num({ min: 0, max: 100 }),
    /** Server-controlled: set when the status becomes completed. */
    completedAt: D,
  }),

  assets: S.obj({
    id: S.id({ req: true }),
    key: S.str({ req: true, max: 80 }),
    name: S.str({ req: true, max: 300 }),
    schema: S.oneOf(['Services', 'Servers', 'Databases', 'Cloud Clusters'], { req: true }),
    status: S.oneOf(['Active', 'Maintenance', 'Deprecated'], { req: true }),
    ownerId: S.str({ req: true, max: 120 }),
    environment: S.oneOf(['Production', 'Staging', 'Dev'], { req: true }),
    linkedIssueKeys: S.arr(S.str({ max: 60 })),
  }),

  risks: S.obj({
    id: S.id({ req: true }),
    projectId: S.id({ req: true }),
    key: S.str({ max: 80 }),
    title: S.str({ req: true, max: 300 }),
    titleFa: SHORT,
    description: S.str({ max: 5000 }),
    category: S.str({ max: 120 }),
    probability: S.oneOf(['low', 'medium', 'high', 'critical'], { req: true }),
    impact: S.oneOf(['low', 'medium', 'high', 'critical'], { req: true }),
    score: S.num(),
    status: S.oneOf(['open', 'mitigating', 'closed'], { req: true }),
    ownerId: S.str({ req: true, max: 120 }),
    mitigationPlan: S.str({ max: 5000 }),
    dueDate: D,
    costImpact: S.num(),
    linkedIssueKey: S.str({ max: 60 }),
    externalId: S.str({ max: 120 }),
    createdAt: D,
    updatedAt: D,
  }),

  milestones: S.obj({
    id: S.id({ req: true }),
    projectId: S.id({ req: true }),
    title: S.str({ req: true, max: 300 }),
    titleFa: SHORT,
    description: S.str({ max: 5000 }),
    startDate: D,
    dueDate: D,
    status: S.oneOf(['planned', 'on_track', 'at_risk', 'achieved', 'upcoming', 'completed'], { req: true }),
    ownerId: S.str({ req: true, max: 120 }),
    epicId: S.str({ max: 120 }),
    wbsCode: S.str({ max: 80 }),
    externalId: S.str({ max: 120 }),
    // P2: explicit work-item links and dependencies between milestones.
    linkedIssueIds: S.arr(S.str({ max: 120 }), { max: 500 }),
    dependsOnMilestoneIds: S.arr(S.str({ max: 120 }), { max: 50 }),
    /** Server-controlled: set when the milestone is achieved / completed. */
    completedAt: D,
  }),

  notifications: S.obj({
    id: S.id({ req: true }),
    userId: S.str({ req: true, max: 120 }),
    kind: S.oneOf(['created', 'assigned', 'transitioned', 'commented', 'automation', 'system']),
    title: S.str({ req: true, max: 400 }),
    titleFa: S.str({ max: 400 }),
    message: S.str({ max: 5000 }),
    issueKey: S.str({ max: 60 }),
    issueId: S.str({ max: 120 }),
    actorId: S.str({ max: 120 }),
    createdAt: D,
    read: S.bool({ req: true }),
  }),

  repositories: S.obj({
    id: S.id({ req: true }),
    name: S.str({ req: true, max: 200, pattern: /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)+$/ }),
    provider: S.oneOf(['github', 'gitlab', 'bitbucket', 'generic'], { req: true }),
    baseUrl: S.str({ req: true, max: 500, pattern: /^https?:\/\/[^\s]+$/ }),
    defaultBranch: S.str({ max: 120 }),
    description: S.str({ max: 1000 }),
    enabled: S.bool({ req: true }),
    projectIds: S.arr(S.str({ max: 120 }), { max: 200 }),
    connectedBy: S.str({ max: 120 }),
    connectedAt: D,
  }),

  siteConfig: S.obj({
    id: S.id({ req: true }),
    siteTitle: S.str({ req: true, max: 200 }),
    timezone: S.str({ max: 120 }),
    defaultLanguage: S.oneOf(['fa', 'en']),
    announcementBanner: S.str({ max: 2000 }),
    announcementEnabled: S.bool(),
    emailDigestEnabled: S.bool(),
    desktopAlertsEnabled: S.bool(),
  }),
};

/** Public profile fields of a user (credentials are never part of this). */
export const USER_PROFILE_SCHEMA: Spec = S.obj({
  id: S.id({ req: true }),
  name: S.str({ req: true, max: 200 }),
  nameFa: S.str({ max: 200 }),
  email: S.str({ req: true, max: 254, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }),
  avatar: S.str({ max: 8 }),
  avatarColor: S.str({ max: 120 }),
  role: S.oneOf(ROLES, { req: true }),
  department: S.str({ max: 200 }),
  status: S.oneOf(['active', 'inactive']),
  joinedDate: D,
});
