import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Project,
  User,
  Status,
  Epic,
  Sprint,
  Version,
  Issue,
  IssueType,
  ViewType,
  SpaceTabId,
  IssueLink,
  IssueAttachment,
  DevLinkItem,
  WorkflowDefinition,
  WorkflowRule,
  WorkflowTransition,
  AutomationRule,
  AutomationAuditLog,
  AutomationExecution,
  SavedFilter,
  FormSubmissionTemplate,
  HistoryEntry,
  ProjectFeatures,
  NotificationSettings,
  StatusCategory,
  DashboardConfig,
  GoalItem,
  TeamEntity,
  AssetEntity,
  AppNotification,
  SiteConfig,
  GlobalSidebarItemKey,
  PlanItem,
  QuickCreateModalType,
  IntegrationImportPayload,
  IntegrationImportResult,
  MappingTemplate,
  RecentExcelImport,
  IntegrationSyncRecord,
  SpaceDocPage,
  RiskItem,
  MilestoneItem,
} from '../types/jira';
import {
  DEFAULT_SPACE_TABS,
  initialProjects,
  initialUsers,
  initialStatuses,
  initialEpics,
  initialSprints,
  initialVersions,
  initialIssues,
  initialWorkflows,
  initialAutomationRules,
  initialFormTemplates,
  initialSavedFilters,
  initialDashboards,
  initialGoals,
  initialTeams,
  initialAssets,
  initialNotifications,
  initialSiteConfig,
} from '../data/mockData';
import { Language, translations } from '../utils/i18n';
import { runTransitionPipeline } from '../utils/workflowEngine';

export interface ToastMessage {
  id: string;
  type: 'error' | 'success' | 'info';
  text: string;
}

const ALL_SIDEBAR_SECTIONS: GlobalSidebarItemKey[] = [
  'for_you',
  'recent',
  'starred',
  'plans',
  'spaces',
  'filters',
  'dashboards',
  'assets',
  'teams',
  'integrations',
];

interface JiraContextType {
  // Localization & Theme
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  dir: 'rtl' | 'ltr';
  t: typeof translations.en;
  theme: 'light' | 'dark';
  toggleTheme: () => void;

  // Notifications / Toast
  toastMessage: ToastMessage | null;
  showToast: (type: ToastMessage['type'], text: string) => void;
  clearToast: () => void;
  appNotifications: AppNotification[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;

  // Navigation & Sidebar Customization
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  visibleSidebarSections: GlobalSidebarItemKey[];
  toggleSidebarSection: (sec: GlobalSidebarItemKey) => void;
  isSpaceFullscreen: boolean;
  setIsSpaceFullscreen: (v: boolean) => void;
  activeAdminTab: 'system' | 'work_items' | 'fields' | 'workflows' | 'automation' | 'personal';
  setActiveAdminTab: (tab: 'system' | 'work_items' | 'fields' | 'workflows' | 'automation' | 'personal') => void;
  pendingJqlQuery: string | null;
  setPendingJqlQuery: (jql: string | null) => void;
  activeQuickModal: QuickCreateModalType;
  setActiveQuickModal: (modal: QuickCreateModalType) => void;

  // Projects / Spaces
  projects: Project[];
  currentProject: Project;
  setCurrentProjectId: (id: string) => void;
  recentProjectIds: string[];
  recentIssueIds: string[];
  toggleStarProject: (id: string) => void;
  toggleSpaceTab: (projectId: string, tabId: SpaceTabId) => void;
  createSpaceDoc: (projectId: string, title: string, content: string) => void;
  updateSpaceDoc: (projectId: string, docId: string, title: string, content: string) => void;
  addSpaceShortcut: (projectId: string, title: string, url: string) => void;
  removeSpaceShortcut: (projectId: string, shortcutId: string) => void;
  toggleSpacePolicy: (projectId: string, policyId: string) => void;
  createProject: (data: {
    key: string;
    name: string;
    nameFa: string;
    description: string;
    category: string;
    template: 'scrum' | 'kanban' | 'business' | 'work_requests' | 'it_service' | 'personal';
    avatarColor: string;
  }) => Project;
  updateProject: (id: string, updates: Partial<Project>) => void;
  updateProjectFeatures: (id: string, features: Partial<ProjectFeatures>) => void;
  updateProjectNotifications: (id: string, notifications: Partial<NotificationSettings>) => void;

  // Users & Auth
  users: User[];
  currentUser: User | null;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;
  setCurrentUser: (user: User | null) => void;
  createUser: (user: Omit<User, 'id'>) => User;
  updateUser: (id: string, updates: Partial<User>) => void;
  deleteUser: (id: string) => void;
  toggleUserStatus: (id: string) => void;

  // Data
  statuses: Status[];
  workflows: WorkflowDefinition[];
  currentWorkflow: WorkflowDefinition;
  editingWorkflowId: string | null;
  setEditingWorkflowId: (id: string | null) => void;
  activeWorkflow: WorkflowDefinition;
  epics: Epic[];
  sprints: Sprint[];
  versions: Version[];
  issues: Issue[];
  automationRules: AutomationRule[];
  automationAuditLogs: AutomationAuditLog[];
  savedFilters: SavedFilter[];
  formTemplates: FormSubmissionTemplate[];
  dashboards: DashboardConfig[];
  plans: PlanItem[];
  activePlanId: string | null;
  setActivePlanId: (id: string | null) => void;
  goals: GoalItem[];
  teams: TeamEntity[];
  assets: AssetEntity[];
  risks: RiskItem[];
  milestones: MilestoneItem[];
  siteConfig: SiteConfig;
  updateSiteConfig: (updates: Partial<SiteConfig>) => void;

  // Dashboards, Plans, Goals, Teams, Assets CRUD
  createDashboard: (data: {
    name: string;
    description: string;
    projectId?: string;
    viewers?: string;
    editors?: string;
  }) => DashboardConfig;
  toggleStarDashboard: (id: string) => void;
  createPlan: (data: { name: string; description?: string; spaceIds: string[]; isDemo?: boolean }) => PlanItem;
  createGoal: (data: Omit<GoalItem, 'id'>) => GoalItem;
  updateGoalStatus: (id: string, status: GoalItem['status']) => void;
  createTeam: (data: Omit<TeamEntity, 'id'>) => TeamEntity;
  createAsset: (data: Omit<AssetEntity, 'id'>) => AssetEntity;
  createRisk: (data: Omit<RiskItem, 'id' | 'createdAt' | 'updatedAt'>) => RiskItem;
  updateRiskStatus: (id: string, status: RiskItem['status']) => void;
  createMilestone: (data: Omit<MilestoneItem, 'id'>) => MilestoneItem;
  updateMilestoneStatus: (id: string, status: MilestoneItem['status']) => void;

  // Workflow Actions & Navigation
  workflowViewerIssueId: string | null;
  setWorkflowViewerIssueId: (id: string | null) => void;
  workflowReturnIssueId: string | null;
  setWorkflowReturnIssueId: (id: string | null) => void;
  addWorkflowStatus: (
    data: {
      name: string;
      nameFa?: string;
      category: StatusCategory;
      existingStatusId?: string;
      allowFromAny?: boolean;
    },
    workflowId?: string
  ) => Status;
  removeWorkflowStatus: (statusId: string, workflowId?: string) => void;
  toggleStatusGlobalTransition: (statusId: string, enabled: boolean, workflowId?: string) => void;
  addWorkflowTransition: (
    data: {
      name: string;
      nameFa?: string;
      fromStatusId: string;
      fromStatusIds?: string[];
      toStatusId: string;
    },
    workflowId?: string
  ) => WorkflowTransition;
  updateWorkflowTransition: (
    transitionId: string,
    updates: {
      name: string;
      nameFa?: string;
      fromStatusId: string;
      fromStatusIds?: string[];
      toStatusId: string;
    },
    workflowId?: string
  ) => void;
  addWorkflowRule: (transitionId: string, rule: Omit<WorkflowRule, 'id'>, workflowId?: string) => void;
  removeWorkflowRule: (transitionId: string, ruleId: string, workflowId?: string) => void;
  removeWorkflowTransition: (transitionId: string, workflowId?: string) => void;
  createWorkflow: (data: {
    name: string;
    description?: string;
    projectId?: string;
    schemeName?: string;
    template?: 'blank' | 'software' | 'kanban';
  }) => WorkflowDefinition;
  updateWorkflowMeta: (
    workflowId: string,
    updates: Partial<Pick<WorkflowDefinition, 'name' | 'description' | 'projectId' | 'schemeName' | 'isActive'>>
  ) => void;
  cloneWorkflow: (workflowId: string) => WorkflowDefinition | null;
  deleteWorkflow: (workflowId: string) => void;

  // Automation & Filters Actions
  toggleAutomationRule: (ruleId: string) => void;
  createAutomationRule: (rule: Omit<AutomationRule, 'id' | 'executionsCount'>) => AutomationRule;
  saveFilter: (name: string, jql: string) => SavedFilter;
  deleteSavedFilter: (id: string) => void;

  // Board & Filtering
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  quickFilter: 'all' | 'my' | 'recent' | 'bugs' | 'high';
  setQuickFilter: (f: 'all' | 'my' | 'recent' | 'bugs' | 'high') => void;
  groupBy: 'none' | 'assignee' | 'epic';
  setGroupBy: (g: 'none' | 'assignee' | 'epic') => void;

  // Selection & Modals
  selectedIssueId: string | null;
  setSelectedIssueId: (id: string | null) => void;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
  createModalDefaultSprintId?: string | null;
  createModalDefaultType?: IssueType;
  openCreateModal: (defaultSprintId?: string | null, defaultType?: IssueType) => void;

  // Active Sprint
  activeSprint: Sprint | undefined;

  // Issue CRUD
  createIssue: (data: Partial<Issue>) => Issue;
  updateIssue: (id: string, updates: Partial<Issue>) => void;
  deleteIssue: (id: string) => void;
  cloneIssue: (id: string) => Issue | null;
  toggleArchiveIssue: (id: string) => void;
  addIssueAttachment: (issueId: string, attachment: Omit<IssueAttachment, 'id' | 'uploadedBy' | 'uploadedAt'>) => void;
  addIssueDevLink: (issueId: string, devLink: Omit<DevLinkItem, 'id' | 'updatedAt'>) => void;
  moveIssueStatus: (id: string, newStatus: string) => { ok: boolean; error?: string };
  moveIssueSprint: (id: string, sprintId: string | null) => void;
  toggleFlagged: (id: string) => void;
  toggleWatcher: (id: string) => void;

  // Subtasks & Comments & Worklogs
  addSubtask: (issueId: string, title: string) => void;
  toggleSubtask: (issueId: string, subtaskId: string) => void;
  deleteSubtask: (issueId: string, subtaskId: string) => void;
  addComment: (issueId: string, content: string) => void;
  addWorklog: (issueId: string, minutes: number, comment?: string) => void;
  linkIssue: (sourceIssueId: string, targetKey: string, type: IssueLink['type']) => void;

  // Sprint Actions
  createSprint: (name: string, goal: string) => Sprint;
  startSprint: (sprintId: string, durationWeeks: number, goal?: string) => void;
  completeSprint: (sprintId: string, targetSprintId: string | null) => void;
  updateSprint: (sprintId: string, updates: Partial<Sprint>) => void;

  // Epics & Releases Actions
  createEpic: (epic: Omit<Epic, 'id' | 'key' | 'projectId'> & { projectId?: string }) => Epic;
  updateEpic: (id: string, updates: Partial<Epic>) => void;
  createVersion: (ver: Omit<Version, 'id' | 'projectId'>) => Version;
  toggleReleaseVersion: (versionId: string) => void;

  // Integration Center API & Batch Upsert
  apiFetch: (url: string, init?: RequestInit) => Promise<globalThis.Response>;
  importIntegrationData: (payload: IntegrationImportPayload) => IntegrationImportResult;
  recentExcelImports: RecentExcelImport[];
  addRecentExcelImport: (rec: RecentExcelImport) => void;
  mappingTemplates: MappingTemplate[];
  saveMappingTemplate: (tpl: MappingTemplate) => void;
  deleteMappingTemplate: (id: string) => void;
  syncHistory: IntegrationSyncRecord[];
  addSyncHistoryRecord: (rec: IntegrationSyncRecord) => void;

  // Reset
  resetToDemoData: () => void;
}

const STORAGE_KEY_PREFIX = 'jiraflow_app_v3_';

const JiraContext = createContext<JiraContextType | undefined>(undefined);

function safeParse<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const JiraProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const saved =
      localStorage.getItem(`${STORAGE_KEY_PREFIX}lang`) ||
      localStorage.getItem('jiraflow_app_v2_lang') ||
      localStorage.getItem('jiraflow_app_v1_lang');
    return saved === 'fa' || saved === 'en' ? saved : 'fa';
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved =
      localStorage.getItem(`${STORAGE_KEY_PREFIX}theme`) ||
      localStorage.getItem('jiraflow_app_v2_theme') ||
      localStorage.getItem('jiraflow_app_v1_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [activeView, setActiveView] = useState<ViewType>('board');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [isSpaceFullscreen, setIsSpaceFullscreen] = useState<boolean>(false);
  const [activeAdminTab, setActiveAdminTab] = useState<
    'system' | 'work_items' | 'fields' | 'workflows' | 'automation' | 'personal'
  >('system');
  const [pendingJqlQuery, setPendingJqlQuery] = useState<string | null>(null);
  const [activeQuickModal, setActiveQuickModal] = useState<QuickCreateModalType>('none');
  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null);

  const showToast = useCallback((type: ToastMessage['type'], text: string) => {
    const id = `toast-${Date.now()}`;
    setToastMessage({ id, type, text });
    setTimeout(() => {
      setToastMessage(prev => (prev?.id === id ? null : prev));
    }, 4500);
  }, []);

  const clearToast = useCallback(() => setToastMessage(null), []);

  // Core Entities
  const [projects, setProjects] = useState<Project[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}projects`, initialProjects)
  );
  const [currentProjectId, setCurrentProjectIdState] = useState<string>(
    () => localStorage.getItem(`${STORAGE_KEY_PREFIX}cur_proj`) || initialProjects[0].id
  );
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}recent_projs`, ['proj-1', 'proj-2', 'proj-4'])
  );
  const [recentIssueIds, setRecentIssueIds] = useState<string[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}recent_issues`, ['iss-402', 'iss-101', 'iss-103'])
  );
  const [visibleSidebarSections, setVisibleSidebarSections] = useState<GlobalSidebarItemKey[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}sidebar_sections`, ALL_SIDEBAR_SECTIONS)
  );

  const setCurrentProjectId = useCallback((id: string) => {
    setCurrentProjectIdState(id);
    setRecentProjectIds(prev => [id, ...prev.filter(x => x !== id)].slice(0, 6));
  }, []);

  const [users, setUsers] = useState<User[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}users`, initialUsers)
  );
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}current_user`);
    if (saved !== null) {
      try {
        return JSON.parse(saved);
      } catch {
        return initialUsers[0];
      }
    }
    return initialUsers[0];
  });

  // In-memory only Bearer session token (never stored in localStorage/sessionStorage)
  const [apiSessionToken, setApiSessionToken] = useState<string | null>(null);
  const [recentExcelImports, setRecentExcelImports] = useState<RecentExcelImport[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}excel_imports`, [])
  );
  const [mappingTemplates, setMappingTemplates] = useState<MappingTemplate[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}mapping_templates`, [])
  );
  const [syncHistory, setSyncHistory] = useState<IntegrationSyncRecord[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}sync_history`, [])
  );

  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}workflows`, initialWorkflows)
  );
  const [epics, setEpics] = useState<Epic[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}epics`, initialEpics)
  );
  const [sprints, setSprints] = useState<Sprint[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}sprints`, initialSprints)
  );
  const [versions, setVersions] = useState<Version[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}versions`, initialVersions)
  );
  const [issues, setIssues] = useState<Issue[]>(() => {
    const loaded = safeParse<Issue[]>(`${STORAGE_KEY_PREFIX}issues`, initialIssues);
    return loaded.map(iss => (iss.status === 'backlog' ? { ...iss, status: 'todo' } : iss));
  });
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}automation_rules`, initialAutomationRules)
  );
  const [automationAuditLogs, setAutomationAuditLogs] = useState<AutomationAuditLog[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}automation_logs`, [
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
    ])
  );
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}saved_filters`, initialSavedFilters)
  );
  const [formTemplates] = useState<FormSubmissionTemplate[]>(initialFormTemplates);

  const [dashboards, setDashboards] = useState<DashboardConfig[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}dashboards`, initialDashboards)
  );
  const [plans, setPlans] = useState<PlanItem[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}plans`, [
      {
        id: 'plan-1',
        name: 'Q4 Core & Billing Delivery Plan',
        description: 'Unified cross-space delivery roadmap for Core Platform & Billing.',
        spaceIds: ['proj-1', 'proj-4'],
        ownerId: 'user-1',
        createdAt: '2026-11-01T10:00:00Z',
      },
    ])
  );
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [goals, setGoals] = useState<GoalItem[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}goals`, initialGoals)
  );
  const [teams, setTeams] = useState<TeamEntity[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}teams`, initialTeams)
  );
  const [assets, setAssets] = useState<AssetEntity[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}assets`, initialAssets)
  );
  const [risks, setRisks] = useState<RiskItem[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}risks`, [])
  );
  const [milestones, setMilestones] = useState<MilestoneItem[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}milestones`, [])
  );
  const [appNotifications, setAppNotifications] = useState<AppNotification[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}notifications`, initialNotifications)
  );
  const [siteConfig, setSiteConfig] = useState<SiteConfig>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}site_config`, initialSiteConfig)
  );

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'my' | 'recent' | 'bugs' | 'high'>('all');
  const [groupBy, setGroupBy] = useState<'none' | 'assignee' | 'epic'>('none');

  // Modals & Workflow Overlay Navigation
  const [selectedIssueId, setSelectedIssueIdState] = useState<string | null>(null);
  const setSelectedIssueId = useCallback((id: string | null) => {
    setSelectedIssueIdState(id);
    if (id) {
      setRecentIssueIds(prev => [id, ...prev.filter(x => x !== id)].slice(0, 12));
    }
  }, []);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [createModalDefaultSprintId, setCreateModalDefaultSprintId] = useState<string | null | undefined>(undefined);
  const [createModalDefaultType, setCreateModalDefaultType] = useState<IssueType | undefined>(undefined);
  const [workflowViewerIssueId, setWorkflowViewerIssueId] = useState<string | null>(null);
  const [workflowReturnIssueId, setWorkflowReturnIssueId] = useState<string | null>(null);
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);

  // Persist Preferences & Data
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}lang`, language);
    document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}theme`, theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}cur_proj`, currentProjectId);
  }, [currentProjectId]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}recent_projs`, JSON.stringify(recentProjectIds));
  }, [recentProjectIds]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}recent_issues`, JSON.stringify(recentIssueIds));
  }, [recentIssueIds]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}plans`, JSON.stringify(plans));
  }, [plans]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}sidebar_sections`, JSON.stringify(visibleSidebarSections));
  }, [visibleSidebarSections]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}projects`, JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}workflows`, JSON.stringify(workflows));
  }, [workflows]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}issues`, JSON.stringify(issues));
  }, [issues]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}sprints`, JSON.stringify(sprints));
  }, [sprints]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}epics`, JSON.stringify(epics));
  }, [epics]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}versions`, JSON.stringify(versions));
  }, [versions]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}users`, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}automation_rules`, JSON.stringify(automationRules));
  }, [automationRules]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}automation_logs`, JSON.stringify(automationAuditLogs));
  }, [automationAuditLogs]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}saved_filters`, JSON.stringify(savedFilters));
  }, [savedFilters]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}dashboards`, JSON.stringify(dashboards));
  }, [dashboards]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}goals`, JSON.stringify(goals));
  }, [goals]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}teams`, JSON.stringify(teams));
  }, [teams]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}assets`, JSON.stringify(assets));
  }, [assets]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}risks`, JSON.stringify(risks));
  }, [risks]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}milestones`, JSON.stringify(milestones));
  }, [milestones]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}notifications`, JSON.stringify(appNotifications));
  }, [appNotifications]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}site_config`, JSON.stringify(siteConfig));
  }, [siteConfig]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}current_user`, JSON.stringify(currentUser));
    } else {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}current_user`, JSON.stringify(null));
      setApiSessionToken(null);
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}excel_imports`, JSON.stringify(recentExcelImports));
  }, [recentExcelImports]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}mapping_templates`, JSON.stringify(mappingTemplates));
  }, [mappingTemplates]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}sync_history`, JSON.stringify(syncHistory));
  }, [syncHistory]);

  const fetchSessionToken = useCallback(async (usr: User): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usr.id, email: usr.email, role: usr.role }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { token?: string };
      if (data.token) {
        setApiSessionToken(data.token);
        return data.token;
      }
    } catch {
      return null;
    }
    return null;
  }, []);

  useEffect(() => {
    if (currentUser) {
      void fetchSessionToken(currentUser);
    }
  }, [currentUser, fetchSessionToken]);

  const apiFetch = useCallback(
    async (url: string, init?: RequestInit): Promise<globalThis.Response> => {
      let token = apiSessionToken;
      if (!token && currentUser) {
        token = await fetchSessionToken(currentUser);
      }
      const headers = new Headers(init?.headers || {});
      if (token) headers.set('Authorization', `Bearer ${token}`);
      let res = await fetch(url, { ...init, headers });
      if (res.status === 401 && currentUser) {
        const refreshed = await fetchSessionToken(currentUser);
        if (refreshed) {
          headers.set('Authorization', `Bearer ${refreshed}`);
          res = await fetch(url, { ...init, headers });
        }
      }
      return res;
    },
    [apiSessionToken, currentUser, fetchSessionToken]
  );

  const toggleLanguage = () => setLanguage(prev => (prev === 'fa' ? 'en' : 'fa'));
  const toggleTheme = () => setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  const login = (user: User) => setCurrentUser(user);
  const logout = () => {
    setApiSessionToken(null);
    setCurrentUser(null);
  };

  const toggleSidebarSection = (sec: GlobalSidebarItemKey) => {
    setVisibleSidebarSections(prev =>
      prev.includes(sec) ? prev.filter(s => s !== sec) : [...prev, sec]
    );
  };

  const markNotificationRead = (id: string) => {
    setAppNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllNotificationsRead = () => {
    setAppNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const updateSiteConfig = (updates: Partial<SiteConfig>) => {
    setSiteConfig(prev => ({ ...prev, ...updates }));
  };

  const createUser = (data: Omit<User, 'id'>): User => {
    const newUser: User = {
      ...data,
      id: `user-${Date.now()}`,
      status: data.status || 'active',
      joinedDate: data.joinedDate || new Date().toISOString().split('T')[0],
    };
    setUsers(prev => [...prev, newUser]);
    return newUser;
  };

  const updateUser = (id: string, updates: Partial<User>) => {
    setUsers(prev =>
      prev.map(u => {
        if (u.id === id) {
          const updated = { ...u, ...updates };
          if (currentUser?.id === id) setCurrentUser(updated);
          return updated;
        }
        return u;
      })
    );
  };

  const deleteUser = (id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    if (currentUser?.id === id) setCurrentUser(null);
  };

  const toggleUserStatus = (id: string) => {
    setUsers(prev =>
      prev.map(u => {
        if (u.id === id) {
          const nextStatus = u.status === 'inactive' ? 'active' : 'inactive';
          const updated = { ...u, status: nextStatus as 'active' | 'inactive' };
          if (currentUser?.id === id) setCurrentUser(updated);
          return updated;
        }
        return u;
      })
    );
  };

  const currentProject = projects.find(p => p.id === currentProjectId) || projects[0];
  const currentWorkflow =
    workflows.find(w => w.projectId === currentProject.id) ||
    workflows[0] || {
      id: `wf-${currentProject.id}`,
      projectId: currentProject.id,
      name: `${currentProject.key} Default Workflow`,
      statuses: initialStatuses,
      transitions: initialWorkflows[0].transitions,
    };
  const activeWorkflow =
    (editingWorkflowId && workflows.find(w => w.id === editingWorkflowId)) || currentWorkflow;
  const statuses = currentWorkflow.statuses;
  const activeSprint = sprints.find(s => s.projectId === currentProject.id && s.status === 'active');
  const dir = language === 'fa' ? 'rtl' : 'ltr';
  const t = translations[language];

  // Space / Project CRUD
  const createProject = (data: {
    key: string;
    name: string;
    nameFa: string;
    description: string;
    category: string;
    template: 'scrum' | 'kanban' | 'business' | 'work_requests' | 'it_service' | 'personal';
    avatarColor: string;
  }): Project => {
    const cleanKey = data.key.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'NEW';
    const newId = `proj-${Date.now()}`;
    const isScrum = data.template === 'scrum';
    const defaultTabs: SpaceTabId[] = isScrum
      ? [...DEFAULT_SPACE_TABS, 'backlog', 'releases']
      : [...DEFAULT_SPACE_TABS];

    const newProject: Project = {
      id: newId,
      key: cleanKey,
      name: data.name,
      nameFa: data.nameFa || data.name,
      description: data.description,
      leadId: currentUser?.id || users[0]?.id || 'user-1',
      avatarColor: data.avatarColor || 'bg-blue-600',
      category: data.category || 'Software',
      template: data.template,
      starred: false,
      enabledTabs: defaultTabs,
      shortcuts: [],
      docs: [],
      policies: [],
      features: {
        sprints: isScrum,
        estimation: isScrum || data.template === 'kanban',
        standups: true,
        forms: true,
        releases: isScrum || data.template === 'kanban',
      },
      notifications: {
        onCreated: true,
        onTransitioned: true,
        onCommented: true,
        onAssigned: true,
        senderName: `JiraFlow Bot (${cleanKey})`,
      },
    };

    const newWorkflow: WorkflowDefinition = {
      id: `wf-${newId}`,
      projectId: newId,
      name: `${cleanKey} Team-Managed Workflow`,
      statuses: [...initialStatuses],
      transitions: initialWorkflows[0].transitions.map(tr => ({
        ...tr,
        id: `${tr.id}-${newId}`,
        rules: [...tr.rules],
      })),
    };

    setProjects(prev => [...prev, newProject]);
    setWorkflows(prev => [...prev, newWorkflow]);
    setCurrentProjectId(newId);
    setActiveView('summary');
    showToast(
      'success',
      language === 'fa' ? `فضای کاری ${newProject.nameFa} با موفقیت ایجاد شد.` : `Space "${newProject.name}" created.`
    );
    return newProject;
  };

  const updateProject = (id: string, updates: Partial<Project>) => {
    setProjects(prev => prev.map(p => (p.id === id ? { ...p, ...updates } : p)));
  };

  const toggleStarProject = (id: string) => {
    setProjects(prev => prev.map(p => (p.id === id ? { ...p, starred: !p.starred } : p)));
  };

  const toggleSpaceTab = (projectId: string, tabId: SpaceTabId) => {
    setProjects(prev =>
      prev.map(p => {
        if (p.id !== projectId) return p;
        const cur = p.enabledTabs || DEFAULT_SPACE_TABS;
        const exists = cur.includes(tabId);
        return {
          ...p,
          enabledTabs: exists ? cur.filter(t => t !== tabId) : [...cur, tabId],
        };
      })
    );
  };

  const createSpaceDoc = (projectId: string, title: string, content: string) => {
    const doc = {
      id: `doc-${Date.now()}`,
      title,
      content,
      authorId: currentUser?.id || 'user-1',
      updatedAt: new Date().toISOString(),
    };
    setProjects(prev =>
      prev.map(p => (p.id === projectId ? { ...p, docs: [doc, ...(p.docs || [])] } : p))
    );
  };

  const updateSpaceDoc = (projectId: string, docId: string, title: string, content: string) => {
    setProjects(prev =>
      prev.map(p =>
        p.id === projectId
          ? {
              ...p,
              docs: (p.docs || []).map(d =>
                d.id === docId ? { ...d, title, content, updatedAt: new Date().toISOString() } : d
              ),
            }
          : p
      )
    );
  };

  const addSpaceShortcut = (projectId: string, title: string, url: string) => {
    const sc = { id: `sc-${Date.now()}`, title, url };
    setProjects(prev =>
      prev.map(p => (p.id === projectId ? { ...p, shortcuts: [...(p.shortcuts || []), sc] } : p))
    );
  };

  const removeSpaceShortcut = (projectId: string, shortcutId: string) => {
    setProjects(prev =>
      prev.map(p =>
        p.id === projectId
          ? { ...p, shortcuts: (p.shortcuts || []).filter(s => s.id !== shortcutId) }
          : p
      )
    );
  };

  const toggleSpacePolicy = (projectId: string, policyId: string) => {
    setProjects(prev =>
      prev.map(p =>
        p.id === projectId
          ? {
              ...p,
              policies: (p.policies || []).map(pol =>
                pol.id === policyId ? { ...pol, enabled: !pol.enabled } : pol
              ),
            }
          : p
      )
    );
  };

  const updateProjectFeatures = (id: string, features: Partial<ProjectFeatures>) => {
    setProjects(prev =>
      prev.map(p => {
        if (p.id !== id) return p;
        const nextFeatures = {
          sprints: true,
          estimation: true,
          standups: true,
          forms: true,
          releases: true,
          ...p.features,
          ...features,
        };
        let nextTabs = p.enabledTabs || [...DEFAULT_SPACE_TABS];
        if (features.sprints === true && !nextTabs.includes('backlog')) {
          nextTabs = [...nextTabs, 'backlog'];
        }
        return {
          ...p,
          features: nextFeatures,
          enabledTabs: nextTabs,
        };
      })
    );
  };

  const updateProjectNotifications = (id: string, notifications: Partial<NotificationSettings>) => {
    setProjects(prev =>
      prev.map(p =>
        p.id === id
          ? {
              ...p,
              notifications: {
                onCreated: true,
                onTransitioned: true,
                onCommented: true,
                onAssigned: true,
                senderName: `JiraFlow Bot (${p.key})`,
                ...p.notifications,
                ...notifications,
              },
            }
          : p
      )
    );
  };

  // Dashboards, Plans, Goals, Teams, Assets
  const createDashboard = (data: {
    name: string;
    description: string;
    projectId?: string;
    viewers?: string;
    editors?: string;
  }): DashboardConfig => {
    const d: DashboardConfig = {
      id: `dash-${Date.now()}`,
      name: data.name,
      description: data.description,
      ownerId: currentUser?.id || 'user-1',
      projectId: data.projectId,
      viewers: data.viewers || 'Private',
      editors: data.editors || 'Private',
      starred: false,
      gadgets: [
        { id: `g-${Date.now()}-1`, type: 'assigned_to_me', title: 'Assigned to Me', titleFa: 'تسک‌های من' },
        { id: `g-${Date.now()}-2`, type: 'issue_stats', title: 'Status Breakdown', titleFa: 'آمار وضعیت‌ها' },
      ],
    };
    setDashboards(prev => [d, ...prev]);
    return d;
  };

  const createPlan = (data: {
    name: string;
    description?: string;
    spaceIds: string[];
    isDemo?: boolean;
  }): PlanItem => {
    const p: PlanItem = {
      id: `plan-${Date.now()}`,
      name: data.name,
      description: data.description || 'Cross-space release & epic timeline plan.',
      spaceIds: data.spaceIds.length > 0 ? data.spaceIds : projects.map(pr => pr.id),
      ownerId: currentUser?.id || 'user-1',
      isDemo: data.isDemo,
      createdAt: new Date().toISOString(),
    };
    setPlans(prev => [p, ...prev]);
    setActivePlanId(p.id);
    return p;
  };

  const toggleStarDashboard = (id: string) => {
    setDashboards(prev => prev.map(d => (d.id === id ? { ...d, starred: !d.starred } : d)));
  };

  const createGoal = (data: Omit<GoalItem, 'id'>): GoalItem => {
    const g: GoalItem = { ...data, id: `goal-${Date.now()}` };
    setGoals(prev => [g, ...prev]);
    return g;
  };

  const updateGoalStatus = (id: string, status: GoalItem['status']) => {
    setGoals(prev => prev.map(g => (g.id === id ? { ...g, status } : g)));
  };

  const createTeam = (data: Omit<TeamEntity, 'id'>): TeamEntity => {
    const tm: TeamEntity = { ...data, id: `team-${Date.now()}` };
    setTeams(prev => [...prev, tm]);
    return tm;
  };

  const createAsset = (data: Omit<AssetEntity, 'id'>): AssetEntity => {
    const ast: AssetEntity = { ...data, id: `ast-${Date.now()}` };
    setAssets(prev => [ast, ...prev]);
    return ast;
  };

  // Workflow Editing Actions
  const addWorkflowStatus = (
    data: {
      name: string;
      nameFa?: string;
      category: StatusCategory;
      existingStatusId?: string;
      allowFromAny?: boolean;
    },
    workflowId?: string
  ): Status => {
    const targetWfId = workflowId || activeWorkflow.id;
    const targetWf = workflows.find(w => w.id === targetWfId) || activeWorkflow;
    const allowAny = data.allowFromAny ?? true;

    const existingInPool = data.existingStatusId
      ? workflows.flatMap(w => w.statuses).find(s => s.id === data.existingStatusId) ||
        initialStatuses.find(s => s.id === data.existingStatusId)
      : undefined;

    const alreadyInTarget = existingInPool
      ? targetWf.statuses.find(s => s.id === existingInPool.id)
      : targetWf.statuses.find(s => s.name.toLowerCase() === data.name.trim().toLowerCase());

    if (alreadyInTarget) {
      if (allowAny) {
        toggleStatusGlobalTransition(alreadyInTarget.id, true, targetWf.id);
      }
      return alreadyInTarget;
    }

    const slug =
      data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') || `status_${Date.now()}`;
    const colorMap: Record<StatusCategory, string> = {
      todo: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      inprogress: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
      done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    };
    const newStatus: Status = existingInPool
      ? { ...existingInPool }
      : {
          id: `${slug}_${Date.now().toString().slice(-3)}`,
          numericId: 10010 + targetWf.statuses.length,
          name: data.name.trim(),
          nameFa: (data.nameFa || data.name).trim(),
          category: data.category,
          color: colorMap[data.category],
        };

    const newTransition: WorkflowTransition | null = allowAny
      ? {
          id: `tr-${Date.now()}`,
          numericId: (targetWf.transitions.length + 1) * 10 + 1,
          name: newStatus.name,
          nameFa: newStatus.nameFa || newStatus.name,
          fromStatusId: 'any',
          fromStatusIds: ['any'],
          toStatusId: newStatus.id,
          rules: [],
        }
      : null;

    const now = new Date().toISOString();
    setWorkflows(prev =>
      prev.map(w =>
        w.id === targetWf.id
          ? {
              ...w,
              updatedAt: now,
              statuses: [...w.statuses, newStatus],
              transitions: newTransition ? [...w.transitions, newTransition] : w.transitions,
            }
          : w
      )
    );
    return newStatus;
  };

  const removeWorkflowStatus = (statusId: string, workflowId?: string) => {
    const targetWfId = workflowId || activeWorkflow.id;
    const now = new Date().toISOString();
    setWorkflows(prev =>
      prev.map(w =>
        w.id === targetWfId
          ? {
              ...w,
              updatedAt: now,
              statuses: w.statuses.filter(s => s.id !== statusId),
              transitions: w.transitions.filter(
                tr => tr.toStatusId !== statusId && tr.fromStatusId !== statusId
              ),
            }
          : w
      )
    );
  };

  const toggleStatusGlobalTransition = (statusId: string, enabled: boolean, workflowId?: string) => {
    const targetWfId = workflowId || activeWorkflow.id;
    const now = new Date().toISOString();
    setWorkflows(prev =>
      prev.map(w => {
        if (w.id !== targetWfId) return w;
        const st = w.statuses.find(s => s.id === statusId);
        if (!st) return w;
        const hasGlobal = w.transitions.some(
          tr =>
            tr.toStatusId === statusId &&
            (tr.fromStatusId === 'any' || tr.fromStatusIds?.includes('any'))
        );
        if (enabled && !hasGlobal) {
          const newTr: WorkflowTransition = {
            id: `tr-any-${statusId}-${Date.now().toString().slice(-4)}`,
            numericId: (w.transitions.length + 1) * 10 + 1,
            name: st.name,
            nameFa: st.nameFa || st.name,
            fromStatusId: 'any',
            fromStatusIds: ['any'],
            toStatusId: statusId,
            rules: [],
          };
          return { ...w, updatedAt: now, transitions: [...w.transitions, newTr] };
        }
        if (!enabled && hasGlobal) {
          return {
            ...w,
            updatedAt: now,
            transitions: w.transitions.filter(
              tr =>
                !(
                  tr.toStatusId === statusId &&
                  (tr.fromStatusId === 'any' || tr.fromStatusIds?.includes('any'))
                )
            ),
          };
        }
        return w;
      })
    );
  };

  const addWorkflowTransition = (
    data: {
      name: string;
      nameFa?: string;
      fromStatusId: string;
      fromStatusIds?: string[];
      toStatusId: string;
    },
    workflowId?: string
  ): WorkflowTransition => {
    const targetWfId = workflowId || activeWorkflow.id;
    const targetWf = workflows.find(w => w.id === targetWfId) || activeWorkflow;
    const fromIds =
      data.fromStatusIds && data.fromStatusIds.length > 0 ? data.fromStatusIds : [data.fromStatusId];
    const primaryFrom = fromIds.includes('any') ? 'any' : fromIds[0] || data.fromStatusId;
    const newTr: WorkflowTransition = {
      id: `tr-${Date.now()}`,
      numericId: (targetWf.transitions.length + 1) * 10 + 1,
      name: data.name,
      nameFa: data.nameFa || data.name,
      fromStatusId: primaryFrom,
      fromStatusIds: fromIds,
      toStatusId: data.toStatusId,
      rules: [],
    };
    const now = new Date().toISOString();
    setWorkflows(prev =>
      prev.map(w =>
        w.id === targetWfId ? { ...w, updatedAt: now, transitions: [...w.transitions, newTr] } : w
      )
    );
    return newTr;
  };

  const updateWorkflowTransition = (
    transitionId: string,
    updates: {
      name: string;
      nameFa?: string;
      fromStatusId: string;
      fromStatusIds?: string[];
      toStatusId: string;
    },
    workflowId?: string
  ) => {
    const targetWfId = workflowId || activeWorkflow.id;
    const fromIds =
      updates.fromStatusIds && updates.fromStatusIds.length > 0
        ? updates.fromStatusIds
        : [updates.fromStatusId];
    const primaryFrom = fromIds.includes('any') ? 'any' : fromIds[0] || updates.fromStatusId;
    const now = new Date().toISOString();
    setWorkflows(prev =>
      prev.map(w =>
        w.id === targetWfId
          ? {
              ...w,
              updatedAt: now,
              transitions: w.transitions.map(tr =>
                tr.id === transitionId
                  ? {
                      ...tr,
                      name: updates.name,
                      nameFa: updates.nameFa || updates.name,
                      fromStatusId: primaryFrom,
                      fromStatusIds: fromIds,
                      toStatusId: updates.toStatusId,
                    }
                  : tr
              ),
            }
          : w
      )
    );
  };

  const addWorkflowRule = (transitionId: string, rule: Omit<WorkflowRule, 'id'>, workflowId?: string) => {
    const targetWfId = workflowId || activeWorkflow.id;
    const newRule: WorkflowRule = { ...rule, id: `rule-${Date.now()}` };
    const now = new Date().toISOString();
    setWorkflows(prev =>
      prev.map(w =>
        w.id === targetWfId
          ? {
              ...w,
              updatedAt: now,
              transitions: w.transitions.map(tr =>
                tr.id === transitionId ? { ...tr, rules: [...tr.rules, newRule] } : tr
              ),
            }
          : w
      )
    );
  };

  const removeWorkflowRule = (transitionId: string, ruleId: string, workflowId?: string) => {
    const targetWfId = workflowId || activeWorkflow.id;
    const now = new Date().toISOString();
    setWorkflows(prev =>
      prev.map(w =>
        w.id === targetWfId
          ? {
              ...w,
              updatedAt: now,
              transitions: w.transitions.map(tr =>
                tr.id === transitionId ? { ...tr, rules: tr.rules.filter(r => r.id !== ruleId) } : tr
              ),
            }
          : w
      )
    );
  };

  const removeWorkflowTransition = (transitionId: string, workflowId?: string) => {
    const targetWfId = workflowId || activeWorkflow.id;
    const now = new Date().toISOString();
    setWorkflows(prev =>
      prev.map(w =>
        w.id === targetWfId
          ? { ...w, updatedAt: now, transitions: w.transitions.filter(tr => tr.id !== transitionId) }
          : w
      )
    );
  };

  const createWorkflow = (data: {
    name: string;
    description?: string;
    projectId?: string;
    schemeName?: string;
    template?: 'blank' | 'software' | 'kanban';
  }): WorkflowDefinition => {
    const now = new Date().toISOString();
    const templateStatuses =
      data.template === 'blank'
        ? [initialStatuses[0], initialStatuses[3]]
        : initialStatuses.map(s => ({ ...s }));
    const templateTransitions: WorkflowTransition[] =
      data.template === 'blank'
        ? [
            { id: `tr-${Date.now()}-1`, numericId: 1, name: 'Create', nameFa: 'ایجاد', fromStatusId: 'start', toStatusId: 'todo', rules: [] },
            { id: `tr-${Date.now()}-2`, numericId: 11, name: 'Complete', nameFa: 'تکمیل', fromStatusId: 'todo', fromStatusIds: ['todo'], toStatusId: 'done', rules: [] },
          ]
        : [
            { id: `tr-${Date.now()}-1`, numericId: 1, name: 'Create', nameFa: 'ایجاد', fromStatusId: 'start', toStatusId: 'todo', rules: [] },
            { id: `tr-${Date.now()}-11`, numericId: 11, name: 'To Do', nameFa: 'برای انجام', fromStatusId: 'any', fromStatusIds: ['any'], toStatusId: 'todo', rules: [] },
            { id: `tr-${Date.now()}-21`, numericId: 21, name: 'Start work', nameFa: 'شروع کار', fromStatusId: 'any', fromStatusIds: ['any'], toStatusId: 'inprogress', rules: [] },
            { id: `tr-${Date.now()}-31`, numericId: 31, name: 'In Review', nameFa: 'بررسی کد', fromStatusId: 'any', fromStatusIds: ['any'], toStatusId: 'review', rules: [] },
            { id: `tr-${Date.now()}-41`, numericId: 41, name: 'Done', nameFa: 'تکمیل شد', fromStatusId: 'any', fromStatusIds: ['any'], toStatusId: 'done', rules: [] },
          ];
    const proj = projects.find(p => p.id === data.projectId);
    const created: WorkflowDefinition = {
      id: `wf-${Date.now()}`,
      projectId: data.projectId || '',
      name: data.name.trim(),
      description: data.description?.trim() || '',
      isActive: Boolean(data.projectId),
      schemeName: data.schemeName || (proj ? `${proj.key}: Simplified Workflow Scheme` : 'Unassigned'),
      updatedAt: now,
      statuses: templateStatuses,
      transitions: templateTransitions,
    };
    setWorkflows(prev => [created, ...prev]);
    return created;
  };

  const updateWorkflowMeta = (
    workflowId: string,
    updates: Partial<Pick<WorkflowDefinition, 'name' | 'description' | 'projectId' | 'schemeName' | 'isActive'>>
  ) => {
    const now = new Date().toISOString();
    setWorkflows(prev => prev.map(w => (w.id === workflowId ? { ...w, ...updates, updatedAt: now } : w)));
  };

  const cloneWorkflow = (workflowId: string): WorkflowDefinition | null => {
    const src = workflows.find(w => w.id === workflowId);
    if (!src) return null;
    const now = new Date().toISOString();
    const cloned: WorkflowDefinition = {
      ...src,
      id: `wf-copy-${Date.now()}`,
      projectId: '',
      name: `Copy of ${src.name}`,
      isActive: false,
      schemeName: 'Unassigned',
      updatedAt: now,
      statuses: src.statuses.map(s => ({ ...s })),
      transitions: src.transitions.map(tr => ({
        ...tr,
        id: `${tr.id}-copy-${Date.now().toString().slice(-4)}`,
        fromStatusIds: tr.fromStatusIds ? [...tr.fromStatusIds] : [tr.fromStatusId],
        rules: tr.rules.map(r => ({ ...r, config: { ...r.config } })),
      })),
    };
    setWorkflows(prev => [cloned, ...prev]);
    return cloned;
  };

  const deleteWorkflow = (workflowId: string) => {
    setWorkflows(prev => prev.filter(w => w.id !== workflowId));
    if (editingWorkflowId === workflowId) {
      setEditingWorkflowId(null);
    }
  };

  // Automation & Saved Filters
  const toggleAutomationRule = (ruleId: string) => {
    setAutomationRules(prev => prev.map(r => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r)));
  };

  const createAutomationRule = (rule: Omit<AutomationRule, 'id' | 'executionsCount'>): AutomationRule => {
    const created: AutomationRule = {
      ...rule,
      id: `auto-${Date.now()}`,
      executionsCount: 0,
    };
    setAutomationRules(prev => [created, ...prev]);
    return created;
  };

  const saveFilter = (name: string, jql: string): SavedFilter => {
    const sf: SavedFilter = {
      id: `sf-${Date.now()}`,
      name,
      jql,
      ownerId: currentUser?.id || 'user-1',
      shareScope: 'team',
      createdAt: new Date().toISOString(),
    };
    setSavedFilters(prev => [sf, ...prev]);
    return sf;
  };

  const deleteSavedFilter = (id: string) => {
    setSavedFilters(prev => prev.filter(f => f.id !== id));
  };

  const openCreateModal = (defaultSprintId?: string | null, defaultType?: IssueType) => {
    setCreateModalDefaultSprintId(defaultSprintId);
    setCreateModalDefaultType(defaultType);
    setIsCreateModalOpen(true);
  };

  // Epics
  const createEpic = (data: Omit<Epic, 'id' | 'key' | 'projectId'> & { projectId?: string }): Epic => {
    const targetProjectId = data.projectId || currentProject.id;
    const targetProject = projects.find(p => p.id === targetProjectId) || currentProject;
    const count = epics.filter(e => e.projectId === targetProjectId).length + 1;
    const newEpic: Epic = {
      id: `epic-${Date.now()}`,
      key: `${targetProject.key}-EPIC-${count}`,
      projectId: targetProjectId,
      name: data.name,
      nameFa: data.nameFa || data.name,
      summary: data.summary || data.name,
      color: data.color || '#8b5cf6',
      status: data.status || 'inprogress',
      startDate: data.startDate || new Date().toISOString().split('T')[0],
      dueDate: data.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    };
    setEpics(prev => [...prev, newEpic]);
    return newEpic;
  };

  const updateEpic = (id: string, updates: Partial<Epic>) => {
    setEpics(prev => prev.map(e => (e.id === id ? { ...e, ...updates } : e)));
  };

  // Issue Operations
  const createIssue = (data: Partial<Issue>): Issue => {
    const targetProjId = data.projectId || currentProject.id;
    const targetProj = projects.find(p => p.id === targetProjId) || currentProject;
    const targetWf = workflows.find(w => w.projectId === targetProjId) || currentWorkflow;
    const projectIssues = issues.filter(i => i.projectId === targetProjId);
    const nextNum = 101 + projectIssues.length;
    const issueKey = `${targetProj.key}-${nextNum}`;
    const firstStatus = targetWf.statuses[0]?.id || 'todo';
    const reporterId = currentUser?.id || users[0]?.id || 'user-1';
    const projActiveSprint = sprints.find(s => s.projectId === targetProjId && s.status === 'active');

    let linkedEpicId = data.epicId || null;
    if (data.type === 'epic' && data.summary) {
      const createdEpic = createEpic({
        projectId: targetProjId,
        name: data.summary,
        nameFa: data.summary,
        summary: data.description || data.summary,
        color: data.issueColor || '#8b5cf6',
        status: 'inprogress',
        startDate: data.startDate || new Date().toISOString().split('T')[0],
        dueDate: data.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      });
      linkedEpicId = createdEpic.id;
    }

    const resolvedAssigneeId =
      data.assigneeId === 'AUTOMATIC' ? targetProj.leadId : data.assigneeId || null;

    const newIssue: Issue = {
      id: `iss-${Date.now()}`,
      key: issueKey,
      projectId: targetProjId,
      sprintId:
        targetProj.features?.sprints === false || data.type === 'epic'
          ? null
          : data.sprintId !== undefined
          ? data.sprintId
          : projActiveSprint
          ? projActiveSprint.id
          : null,
      epicId: linkedEpicId,
      parentIssueId: data.parentIssueId || null,
      type: data.type || 'story',
      summary: data.summary || 'Untitled work item',
      description: data.description || '',
      status: data.status && data.status !== 'backlog' ? data.status : firstStatus,
      priority: data.priority || 'medium',
      resolution: null,
      assigneeId: resolvedAssigneeId,
      reporterId,
      storyPoints: data.storyPoints ?? 3,
      originalEstimateMinutes: data.originalEstimateMinutes ?? 240,
      remainingEstimateMinutes: data.remainingEstimateMinutes ?? 240,
      flagged: data.flagged ?? false,
      archived: false,
      startDate: data.startDate,
      dueDate: data.dueDate,
      team: data.team,
      watchers: [reporterId],
      labels: data.labels || [],
      components: data.components || [],
      fixVersionIds: data.fixVersionIds || [],
      subtasks: [],
      comments: [],
      worklogs: [],
      links: [],
      attachments: [],
      devLinks: [],
      history: [
        {
          id: `hist-${Date.now()}`,
          authorId: reporterId,
          field: 'created',
          fromValue: '',
          toValue: issueKey,
          createdAt: new Date().toISOString(),
        },
      ],
      automationExecutions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setIssues(prev => [newIssue, ...prev]);
    setAppNotifications(prev => [
      {
        id: `notif-${Date.now()}`,
        title: `${issueKey} created`,
        titleFa: `تسک جدید ${issueKey} ایجاد شد`,
        message: newIssue.summary,
        issueKey,
        createdAt: new Date().toISOString(),
        read: false,
      },
      ...prev,
    ]);
    return newIssue;
  };

  const updateIssue = (id: string, updates: Partial<Issue>) => {
    setIssues(prev =>
      prev.map(issue => {
        if (issue.id !== id) return issue;
        const actorId = currentUser?.id || users[0]?.id || 'user-1';
        const now = new Date().toISOString();
        const newEntries: HistoryEntry[] = [];

        const trackedFields: (keyof Issue)[] = [
          'priority',
          'assigneeId',
          'resolution',
          'flagged',
          'archived',
          'summary',
          'dueDate',
          'team',
        ];
        for (const f of trackedFields) {
          if (updates[f] !== undefined && updates[f] !== issue[f]) {
            newEntries.push({
              id: `hist-${Date.now()}-${f}`,
              authorId: actorId,
              field: String(f),
              fromValue: String(issue[f] ?? ''),
              toValue: String(updates[f] ?? ''),
              createdAt: now,
            });
          }
        }

        return {
          ...issue,
          ...updates,
          history: [...newEntries, ...(issue.history || [])],
          updatedAt: now,
        };
      })
    );
  };

  const deleteIssue = (id: string) => {
    setIssues(prev => prev.filter(issue => issue.id !== id));
    if (selectedIssueId === id) {
      setSelectedIssueId(null);
    }
  };

  const cloneIssue = (id: string): Issue | null => {
    const src = issues.find(i => i.id === id);
    if (!src) return null;
    const cloned = createIssue({
      ...src,
      summary: `${src.summary} (Clone)`,
      status: 'todo',
    });
    linkIssue(cloned.id, src.key, 'cloners');
    showToast('success', language === 'fa' ? `تسک با کلید ${cloned.key} تکثیر شد.` : `Cloned to ${cloned.key}`);
    return cloned;
  };

  const toggleArchiveIssue = (id: string) => {
    const iss = issues.find(i => i.id === id);
    if (!iss) return;
    const nextArchived = !iss.archived;
    updateIssue(id, { archived: nextArchived });
    showToast(
      'info',
      nextArchived
        ? language === 'fa'
          ? `${iss.key} به آرشیو منتقل شد.`
          : `${iss.key} archived.`
        : language === 'fa'
        ? `${iss.key} از آرشیو بازیابی شد.`
        : `${iss.key} restored from archive.`
    );
  };

  const addIssueAttachment = (
    issueId: string,
    attachment: Omit<IssueAttachment, 'id' | 'uploadedBy' | 'uploadedAt'>
  ) => {
    const att: IssueAttachment = {
      ...attachment,
      id: `att-${Date.now()}`,
      uploadedBy: currentUser?.id || 'user-1',
      uploadedAt: new Date().toISOString(),
    };
    setIssues(prev =>
      prev.map(i =>
        i.id === issueId
          ? { ...i, attachments: [...(i.attachments || []), att], updatedAt: new Date().toISOString() }
          : i
      )
    );
  };

  const addIssueDevLink = (issueId: string, devLink: Omit<DevLinkItem, 'id' | 'updatedAt'>) => {
    const dl: DevLinkItem = {
      ...devLink,
      id: `dev-${Date.now()}`,
      updatedAt: new Date().toISOString(),
    };
    setIssues(prev =>
      prev.map(i =>
        i.id === issueId
          ? { ...i, devLinks: [...(i.devLinks || []), dl], updatedAt: new Date().toISOString() }
          : i
      )
    );
  };

  const moveIssueStatus = (id: string, newStatus: string): { ok: boolean; error?: string } => {
    const issue = issues.find(i => i.id === id);
    if (!issue) return { ok: false, error: 'Issue not found' };
    if (issue.status === newStatus) return { ok: true };

    const wf = workflows.find(w => w.projectId === issue.projectId) || currentWorkflow;
    const result = runTransitionPipeline({
      issue,
      targetStatusId: newStatus,
      user: currentUser,
      workflow: wf,
      epics,
      language,
    });

    if (!result.ok) {
      showToast('error', result.error || 'Transition blocked by workflow rule.');
      return { ok: false, error: result.error };
    }

    const now = new Date().toISOString();
    const targetStatusObj = wf.statuses.find(s => s.id === newStatus);
    const updates: Partial<Issue> = { ...(result.updates || {}) };
    const newExecutions: AutomationExecution[] = (result.automationNotes || []).map((note, idx) => ({
      id: `wf-exec-${Date.now()}-${idx}`,
      ruleId: note.ruleId,
      ruleName: note.ruleName,
      status: note.status,
      message: note.message,
      executedAt: now,
    }));
    const newAuditLogs: AutomationAuditLog[] = (result.automationNotes || []).map((note, idx) => ({
      id: `wf-alog-${Date.now()}-${idx}`,
      projectId: issue.projectId,
      ruleId: note.ruleId,
      ruleName: note.ruleName,
      issueKey: issue.key,
      status: note.status,
      details: note.message,
      timestamp: now,
    }));
    const executedRuleIds: string[] = [];

    const activeRules = automationRules.filter(r => r.projectId === issue.projectId && r.enabled);
    for (const rule of activeRules) {
      if (rule.trigger === 'issue_transitioned' && rule.triggerTargetStatus === newStatus) {
        if (rule.action === 'auto_assign_mover' && !issue.assigneeId && currentUser) {
          updates.assigneeId = currentUser.id;
          executedRuleIds.push(rule.id);
          const msg =
            language === 'fa'
              ? `تخصیص خودکار به ${currentUser.nameFa}`
              : `Auto-assigned to ${currentUser.name}`;
          newExecutions.push({
            id: `exec-${Date.now()}-${rule.id}`,
            ruleId: rule.id,
            ruleName: language === 'fa' ? rule.nameFa : rule.name,
            status: 'success',
            message: msg,
            executedAt: now,
          });
          newAuditLogs.push({
            id: `alog-${Date.now()}-${rule.id}`,
            projectId: issue.projectId,
            ruleId: rule.id,
            ruleName: rule.name,
            issueKey: issue.key,
            status: 'success',
            details: msg,
            timestamp: now,
          });
        } else if (rule.action === 'unflag_issue' && (targetStatusObj?.category === 'done' || newStatus === 'done')) {
          updates.flagged = false;
          if (!updates.resolution) updates.resolution = 'Done';
          executedRuleIds.push(rule.id);
          const msg =
            language === 'fa'
              ? 'نتیجه روی Done تنظیم و پرچم مانع پاک شد'
              : 'Resolution set to Done and Flagged cleared';
          newExecutions.push({
            id: `exec-${Date.now()}-${rule.id}`,
            ruleId: rule.id,
            ruleName: language === 'fa' ? rule.nameFa : rule.name,
            status: 'success',
            message: msg,
            executedAt: now,
          });
          newAuditLogs.push({
            id: `alog-${Date.now()}-${rule.id}`,
            projectId: issue.projectId,
            ruleId: rule.id,
            ruleName: rule.name,
            issueKey: issue.key,
            status: 'success',
            details: msg,
            timestamp: now,
          });
        }
      }
    }

    if ((targetStatusObj?.category === 'done' || newStatus === 'done') && issue.epicId) {
      const closeEpicRule = activeRules.find(r => r.action === 'close_parent');
      if (closeEpicRule) {
        const siblings = issues.filter(i => i.epicId === issue.epicId && i.id !== issue.id);
        const allSiblingsDone = siblings.length === 0 || siblings.every(s => s.status === 'done');
        if (allSiblingsDone) {
          setEpics(prev => prev.map(e => (e.id === issue.epicId ? { ...e, status: 'done' } : e)));
          executedRuleIds.push(closeEpicRule.id);
          const parentEpic = epics.find(e => e.id === issue.epicId);
          const msg =
            language === 'fa'
              ? `اپیک والد (${parentEpic?.key || issue.epicId}) به صورت خودکار تکمیل شد.`
              : `Parent Epic (${parentEpic?.key || issue.epicId}) automatically marked Done.`;
          newExecutions.push({
            id: `exec-${Date.now()}-epic`,
            ruleId: closeEpicRule.id,
            ruleName: language === 'fa' ? closeEpicRule.nameFa : closeEpicRule.name,
            status: 'success',
            message: msg,
            executedAt: now,
          });
          newAuditLogs.push({
            id: `alog-${Date.now()}-epic`,
            projectId: issue.projectId,
            ruleId: closeEpicRule.id,
            ruleName: closeEpicRule.name,
            issueKey: issue.key,
            status: 'success',
            details: msg,
            timestamp: now,
          });
        }
      }
    }

    setIssues(prev =>
      prev.map(item =>
        item.id === id
          ? {
              ...item,
              ...updates,
              history: result.historyEntry ? [result.historyEntry, ...(item.history || [])] : item.history,
              automationExecutions: [...newExecutions, ...(item.automationExecutions || [])],
              updatedAt: now,
            }
          : item
      )
    );

    if (executedRuleIds.length > 0) {
      setAutomationRules(prev =>
        prev.map(r => (executedRuleIds.includes(r.id) ? { ...r, executionsCount: r.executionsCount + 1 } : r))
      );
      setAutomationAuditLogs(prev => [...newAuditLogs, ...prev]);
    }

    return { ok: true };
  };

  const moveIssueSprint = (id: string, sprintId: string | null) => {
    setIssues(prev =>
      prev.map(issue => {
        if (issue.id === id) {
          return {
            ...issue,
            sprintId,
            status: issue.status === 'backlog' ? 'todo' : issue.status,
            updatedAt: new Date().toISOString(),
          };
        }
        return issue;
      })
    );
  };

  const toggleFlagged = (id: string) => {
    const issue = issues.find(i => i.id === id);
    if (!issue) return;
    updateIssue(id, { flagged: !issue.flagged });
  };

  const toggleWatcher = (id: string) => {
    if (!currentUser) return;
    setIssues(prev =>
      prev.map(issue => {
        if (issue.id !== id) return issue;
        const currentWatchers = issue.watchers || [];
        const isWatching = currentWatchers.includes(currentUser.id);
        return {
          ...issue,
          watchers: isWatching
            ? currentWatchers.filter(w => w !== currentUser.id)
            : [...currentWatchers, currentUser.id],
        };
      })
    );
  };

  // Subtasks
  const addSubtask = (issueId: string, title: string) => {
    setIssues(prev =>
      prev.map(issue => {
        if (issue.id === issueId) {
          const subtaskNum = issue.subtasks.length + 1;
          const newSub: Issue['subtasks'][0] = {
            id: `sub-${Date.now()}`,
            parentId: issueId,
            key: `${issue.key}-${subtaskNum}`,
            title,
            isCompleted: false,
            status: 'todo',
          };
          return {
            ...issue,
            subtasks: [...issue.subtasks, newSub],
            updatedAt: new Date().toISOString(),
          };
        }
        return issue;
      })
    );
  };

  const toggleSubtask = (issueId: string, subtaskId: string) => {
    setIssues(prev =>
      prev.map(issue => {
        if (issue.id === issueId) {
          return {
            ...issue,
            subtasks: issue.subtasks.map(sub => {
              if (sub.id === subtaskId) {
                const nextCompleted = !sub.isCompleted;
                return {
                  ...sub,
                  isCompleted: nextCompleted,
                  status: nextCompleted ? 'done' : 'todo',
                };
              }
              return sub;
            }),
            updatedAt: new Date().toISOString(),
          };
        }
        return issue;
      })
    );
  };

  const deleteSubtask = (issueId: string, subtaskId: string) => {
    setIssues(prev =>
      prev.map(issue => {
        if (issue.id === issueId) {
          return {
            ...issue,
            subtasks: issue.subtasks.filter(sub => sub.id !== subtaskId),
            updatedAt: new Date().toISOString(),
          };
        }
        return issue;
      })
    );
  };

  // Comments
  const addComment = (issueId: string, content: string) => {
    setIssues(prev =>
      prev.map(issue => {
        if (issue.id === issueId) {
          const newComment = {
            id: `c-${Date.now()}`,
            authorId: currentUser?.id || users[0]?.id || 'user-1',
            content,
            createdAt: new Date().toISOString(),
          };
          return {
            ...issue,
            comments: [newComment, ...issue.comments],
            updatedAt: new Date().toISOString(),
          };
        }
        return issue;
      })
    );
  };

  // Worklogs
  const addWorklog = (issueId: string, minutes: number, comment?: string) => {
    setIssues(prev =>
      prev.map(issue => {
        if (issue.id === issueId) {
          const newWorklog = {
            id: `w-${Date.now()}`,
            authorId: currentUser?.id || users[0]?.id || 'user-1',
            timeSpentMinutes: minutes,
            startedAt: new Date().toISOString(),
            comment,
          };
          const currentRemaining = issue.remainingEstimateMinutes ?? 0;
          const newRemaining = Math.max(0, currentRemaining - minutes);
          return {
            ...issue,
            worklogs: [newWorklog, ...issue.worklogs],
            remainingEstimateMinutes: newRemaining,
            updatedAt: new Date().toISOString(),
          };
        }
        return issue;
      })
    );
  };

  const linkIssue = (sourceIssueId: string, targetKey: string, type: IssueLink['type']) => {
    setIssues(prev =>
      prev.map(issue => {
        if (issue.id === sourceIssueId) {
          const newLink: IssueLink = {
            id: `link-${Date.now()}`,
            type,
            targetIssueKey: targetKey,
          };
          return {
            ...issue,
            links: [...issue.links, newLink],
            updatedAt: new Date().toISOString(),
          };
        }
        return issue;
      })
    );
  };

  // Sprint Management
  const createSprint = (name: string, goal: string): Sprint => {
    const projectSprints = sprints.filter(s => s.projectId === currentProject.id);
    const sprintNum = projectSprints.length + 23;
    const newSprint: Sprint = {
      id: `sprint-${Date.now()}`,
      projectId: currentProject.id,
      name: name || `${currentProject.key} Sprint ${sprintNum}`,
      goal: goal || '',
      status: 'planned',
    };
    setSprints(prev => [...prev, newSprint]);
    return newSprint;
  };

  const startSprint = (sprintId: string, durationWeeks: number, goal?: string) => {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + durationWeeks * 7);

    setSprints(prev =>
      prev.map(s =>
        s.id === sprintId
          ? {
              ...s,
              status: 'active',
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
              goal: goal ?? s.goal,
            }
          : s
      )
    );
  };

  const completeSprint = (sprintId: string, targetSprintId: string | null) => {
    setSprints(prev =>
      prev.map(s =>
        s.id === sprintId ? { ...s, status: 'completed', completedAt: new Date().toISOString() } : s
      )
    );

    setIssues(prev =>
      prev.map(issue => {
        if (issue.sprintId === sprintId && issue.status !== 'done') {
          return {
            ...issue,
            sprintId: targetSprintId,
            updatedAt: new Date().toISOString(),
          };
        }
        return issue;
      })
    );
  };

  const updateSprint = (sprintId: string, updates: Partial<Sprint>) => {
    setSprints(prev => prev.map(s => (s.id === sprintId ? { ...s, ...updates } : s)));
  };

  const createVersion = (data: Omit<Version, 'id' | 'projectId'>): Version => {
    const newVersion: Version = {
      ...data,
      id: `ver-${Date.now()}`,
      projectId: currentProject.id,
    };
    setVersions(prev => [...prev, newVersion]);
    return newVersion;
  };

  const toggleReleaseVersion = (versionId: string) => {
    setVersions(prev =>
      prev.map(v => {
        if (v.id === versionId) {
          return {
            ...v,
            isReleased: !v.isReleased,
            releaseDate: !v.isReleased ? new Date().toISOString().split('T')[0] : v.releaseDate,
          };
        }
        return v;
      })
    );
  };

  const resetToDemoData = () => {
    setProjects(initialProjects);
    setWorkflows(initialWorkflows);
    setIssues(initialIssues);
    setSprints(initialSprints);
    setEpics(initialEpics);
    setVersions(initialVersions);
    setUsers(initialUsers);
    setAutomationRules(initialAutomationRules);
    setSavedFilters(initialSavedFilters);
    setDashboards(initialDashboards);
    setGoals(initialGoals);
    setTeams(initialTeams);
    setAssets(initialAssets);
    setRisks([]);
    setMilestones([]);
    setAppNotifications(initialNotifications);
    setSiteConfig(initialSiteConfig);
    setVisibleSidebarSections(ALL_SIDEBAR_SECTIONS);
    setCurrentUser(initialUsers[0]);
    setCurrentProjectIdState(initialProjects[0].id);

    const keys = [
      'projects',
      'workflows',
      'issues',
      'sprints',
      'epics',
      'versions',
      'users',
      'automation_rules',
      'automation_logs',
      'saved_filters',
      'dashboards',
      'goals',
      'teams',
      'assets',
      'risks',
      'milestones',
      'notifications',
      'site_config',
      'sidebar_sections',
      'recent_projs',
      'current_user',
      'cur_proj',
    ];
    keys.forEach(k => localStorage.removeItem(`${STORAGE_KEY_PREFIX}${k}`));
  };

  const createRisk = (data: Omit<RiskItem, 'id' | 'createdAt' | 'updatedAt'>): RiskItem => {
    const nowIso = new Date().toISOString();
    const rec: RiskItem = {
      ...data,
      id: `risk-${Date.now()}`,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setRisks(prev => [rec, ...prev]);
    return rec;
  };

  const updateRiskStatus = (id: string, status: RiskItem['status']) => {
    const nowIso = new Date().toISOString();
    setRisks(prev => prev.map(r => (r.id === id ? { ...r, status, updatedAt: nowIso } : r)));
  };

  const createMilestone = (data: Omit<MilestoneItem, 'id'>): MilestoneItem => {
    const rec: MilestoneItem = {
      ...data,
      id: `ms-${Date.now()}`,
    };
    setMilestones(prev => [rec, ...prev]);
    return rec;
  };

  const updateMilestoneStatus = (id: string, status: MilestoneItem['status']) => {
    setMilestones(prev => prev.map(m => (m.id === id ? { ...m, status } : m)));
  };

  const addRecentExcelImport = (rec: RecentExcelImport) => {
    setRecentExcelImports(prev => [rec, ...prev].slice(0, 20));
  };

  const saveMappingTemplate = (tpl: MappingTemplate) => {
    setMappingTemplates(prev => {
      const idx = prev.findIndex(t => t.id === tpl.id || t.name.toLowerCase() === tpl.name.toLowerCase());
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = tpl;
        return copy;
      }
      return [tpl, ...prev].slice(0, 30);
    });
  };

  const deleteMappingTemplate = (id: string) => {
    setMappingTemplates(prev => prev.filter(t => t.id !== id));
  };

  const addSyncHistoryRecord = (rec: IntegrationSyncRecord) => {
    setSyncHistory(prev => [rec, ...prev].slice(0, 50));
  };

  const importIntegrationData = (payload: IntegrationImportPayload): IntegrationImportResult => {
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const warnings: string[] = [];
    const importedLinks: NonNullable<IntegrationImportResult['importedLinks']> = [];
    const now = new Date().toISOString();
    const actorId = currentUser?.id || users[0]?.id || 'user-1';
    const policy = payload.conflictPolicy || 'source_wins';

    // 1. Resolve or create target project/space synchronously
    let nextProjects = [...projects];
    let nextWorkflows = [...workflows];
    let targetProj = nextProjects.find(p => p.id === payload.targetProjectId) || currentProject;

    const createWorkflowForProj = (projId: string, projKey: string): WorkflowDefinition => ({
      id: `wf-${projId}`,
      projectId: projId,
      name: `${projKey} Imported Workflow`,
      statuses: [...initialStatuses],
      transitions: initialWorkflows[0].transitions.map(tr => ({
        ...tr,
        id: `${tr.id}-${projId}`,
        rules: [...tr.rules],
      })),
    });

    if (payload.createNewSpace && payload.createNewSpace.key && payload.createNewSpace.name) {
      const cleanKey =
        payload.createNewSpace.key.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'IMP';
      const existingByKey = nextProjects.find(p => p.key.toUpperCase() === cleanKey);
      if (existingByKey) {
        targetProj = existingByKey;
      } else {
        const newId = `proj-imp-${Date.now()}`;
        const tpl = payload.createNewSpace.template || 'scrum';
        const createdProj: Project = {
          id: newId,
          key: cleanKey,
          name: payload.createNewSpace.name,
          nameFa: payload.createNewSpace.nameFa || payload.createNewSpace.name,
          description: payload.createNewSpace.description || `Imported from ${payload.source}`,
          leadId: actorId,
          avatarColor: payload.source === 'confluence' ? 'bg-indigo-600' : 'bg-blue-600',
          category: 'Imported Space',
          template: tpl,
          starred: false,
          enabledTabs:
            tpl === 'scrum'
              ? [...DEFAULT_SPACE_TABS, 'backlog', 'releases']
              : [...DEFAULT_SPACE_TABS],
          shortcuts: [],
          docs: [],
          policies: [],
          features: {
            sprints: tpl === 'scrum',
            estimation: true,
            standups: true,
            forms: true,
            releases: true,
          },
          notifications: {
            onCreated: true,
            onTransitioned: true,
            onCommented: true,
            onAssigned: true,
            senderName: `JiraFlow (${cleanKey})`,
          },
        };
        nextProjects = [...nextProjects, createdProj];
        nextWorkflows = [...nextWorkflows, createWorkflowForProj(newId, cleanKey)];
        targetProj = createdProj;
        createdCount++;
      }
    }

    // 2. Upsert Projects if destinationModule === 'projects'
    if (payload.projects && payload.projects.length > 0) {
      for (const pData of payload.projects) {
        const cleanKey = pData.key.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
        if (!cleanKey) {
          skippedCount++;
          continue;
        }
        const idx = nextProjects.findIndex(p => p.key.toUpperCase() === cleanKey);
        if (idx >= 0) {
          nextProjects[idx] = {
            ...nextProjects[idx],
            name: pData.name || nextProjects[idx].name,
            nameFa: pData.nameFa || nextProjects[idx].nameFa,
            description: pData.description ?? nextProjects[idx].description,
            category: pData.category || nextProjects[idx].category,
            budgetAllocated: pData.budgetAllocated ?? nextProjects[idx].budgetAllocated,
            budgetSpent: pData.budgetSpent ?? nextProjects[idx].budgetSpent,
            currency: pData.currency || nextProjects[idx].currency,
          };
          updatedCount++;
        } else {
          const npId = `proj-imp-${Date.now()}-${cleanKey}`;
          const tpl = pData.template || 'scrum';
          nextProjects.push({
            id: npId,
            key: cleanKey,
            name: pData.name,
            nameFa: pData.nameFa || pData.name,
            description: pData.description || '',
            leadId: pData.leadId || actorId,
            avatarColor: 'bg-blue-600',
            category: pData.category || 'Software',
            template: tpl,
            starred: false,
            budgetAllocated: pData.budgetAllocated,
            budgetSpent: pData.budgetSpent,
            currency: pData.currency || 'USD',
            enabledTabs: [...DEFAULT_SPACE_TABS, 'backlog', 'releases'],
            shortcuts: [],
            docs: [],
            policies: [],
            features: { sprints: tpl === 'scrum', estimation: true, standups: true, forms: true, releases: true },
          });
          nextWorkflows.push(createWorkflowForProj(npId, cleanKey));
          createdCount++;
        }
      }
    }

    // 2b. Apply project budget imports
    if (payload.budgets && payload.budgets.length > 0) {
      for (const b of payload.budgets) {
        const cleanKey = (b.projectKey || targetProj.key).toUpperCase().replace(/[^A-Z0-9]/g, '');
        const idx = nextProjects.findIndex(p => p.key.toUpperCase() === cleanKey);
        if (idx >= 0) {
          nextProjects[idx] = {
            ...nextProjects[idx],
            budgetAllocated: b.allocated ?? nextProjects[idx].budgetAllocated,
            budgetSpent: b.spent ?? nextProjects[idx].budgetSpent,
            currency: b.currency || nextProjects[idx].currency || 'USD',
          };
          if (targetProj.id === nextProjects[idx].id) targetProj = nextProjects[idx];
          updatedCount++;
        } else {
          warnings.push(`Budget row skipped: Project "${cleanKey}" not found.`);
          skippedCount++;
        }
      }
    }

    // 3. Apply missing workflow statuses requested during mapping
    if (payload.missingStatusesToAdd && payload.missingStatusesToAdd.length > 0) {
      nextWorkflows = nextWorkflows.map(wf => {
        if (wf.projectId !== targetProj.id) return wf;
        const addedStatuses: Status[] = [];
        const addedTransitions: WorkflowTransition[] = [];
        for (const ms of payload.missingStatusesToAdd!) {
          if (wf.statuses.some(s => s.id === ms.id || s.name.toLowerCase() === ms.name.toLowerCase())) {
            continue;
          }
          const color =
            ms.category === 'done'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
              : ms.category === 'inprogress'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
              : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
          addedStatuses.push({
            id: ms.id,
            numericId: 10050 + wf.statuses.length + addedStatuses.length,
            name: ms.name,
            nameFa: ms.nameFa || ms.name,
            category: ms.category,
            color,
          });
          addedTransitions.push({
            id: `tr-imp-${ms.id}-${Date.now()}`,
            numericId: (wf.transitions.length + addedTransitions.length + 1) * 10,
            name: ms.name,
            nameFa: ms.nameFa || ms.name,
            fromStatusId: 'any',
            toStatusId: ms.id,
            rules: [],
          });
        }
        return {
          ...wf,
          statuses: [...wf.statuses, ...addedStatuses],
          transitions: [...wf.transitions, ...addedTransitions],
        };
      });
    }
    setWorkflows(nextWorkflows);

    // 4. Upsert Versions (fixVersions + discovered project versions)
    const nextVersions = [...versions];
    const versionIdByName = new Map<string, string>();
    nextVersions
      .filter(v => v.projectId === targetProj.id)
      .forEach(v => versionIdByName.set(v.name.toLowerCase(), v.id));

    const versionNamesToEnsure = new Map<string, { description?: string; releaseDate?: string; isReleased?: boolean }>();
    for (const v of payload.versions || []) {
      if (v.name) versionNamesToEnsure.set(v.name.trim(), v);
    }
    for (const iss of payload.issues || []) {
      for (const vn of iss._versionNamesHint || []) {
        if (vn.trim() && !versionNamesToEnsure.has(vn.trim())) {
          versionNamesToEnsure.set(vn.trim(), {});
        }
      }
    }
    versionNamesToEnsure.forEach((meta, vName) => {
      if (!versionIdByName.has(vName.toLowerCase())) {
        const verId = `ver-imp-${Date.now()}-${nextVersions.length + 1}`;
        nextVersions.push({
          id: verId,
          projectId: targetProj.id,
          name: vName,
          description: meta.description || '',
          releaseDate: meta.releaseDate,
          isReleased: Boolean(meta.isReleased),
        });
        versionIdByName.set(vName.toLowerCase(), verId);
      }
    });
    setVersions(nextVersions);

    // 5. Upsert Epics
    const nextEpics = [...epics];
    const epicLookupByKeyOrName = new Map<string, string>();
    nextEpics
      .filter(e => e.projectId === targetProj.id)
      .forEach(e => {
        epicLookupByKeyOrName.set(e.key.toLowerCase(), e.id);
        epicLookupByKeyOrName.set(e.name.toLowerCase(), e.id);
      });

    if (payload.epics && payload.epics.length > 0) {
      let localCounter = nextEpics.filter(e => e.projectId === targetProj.id).length + 1;
      for (const epData of payload.epics) {
        const idx = nextEpics.findIndex(
          e =>
            e.projectId === targetProj.id &&
            ((epData.key && e.key.toLowerCase() === epData.key.toLowerCase()) ||
              e.name.toLowerCase() === epData.name.toLowerCase())
        );
        if (idx >= 0) {
          nextEpics[idx] = {
            ...nextEpics[idx],
            summary: epData.summary || nextEpics[idx].summary,
            status: epData.status || nextEpics[idx].status,
            startDate: epData.startDate || nextEpics[idx].startDate,
            dueDate: epData.dueDate || nextEpics[idx].dueDate,
          };
          epicLookupByKeyOrName.set(nextEpics[idx].key.toLowerCase(), nextEpics[idx].id);
          epicLookupByKeyOrName.set(nextEpics[idx].name.toLowerCase(), nextEpics[idx].id);
          updatedCount++;
        } else {
          const newEpicId = `epic-imp-${Date.now()}-${localCounter}`;
          const key = epData.key || `${targetProj.key}-EPIC-${localCounter++}`;
          const newEp: Epic = {
            id: newEpicId,
            key,
            projectId: targetProj.id,
            name: epData.name,
            nameFa: epData.nameFa || epData.name,
            summary: epData.summary || epData.name,
            color: epData.color || '#8b5cf6',
            status: epData.status || 'inprogress',
            startDate: epData.startDate || now.split('T')[0],
            dueDate: epData.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          };
          nextEpics.push(newEp);
          epicLookupByKeyOrName.set(newEp.key.toLowerCase(), newEp.id);
          epicLookupByKeyOrName.set(newEp.name.toLowerCase(), newEp.id);
          createdCount++;
        }
      }
      setEpics(nextEpics);
    }

    // 6. Upsert Sprints / Schedules
    const nextSprints = [...sprints];
    const sprintLookupByName = new Map<string, string>();
    nextSprints
      .filter(s => s.projectId === targetProj.id)
      .forEach(s => sprintLookupByName.set(s.name.toLowerCase(), s.id));

    if (payload.sprints && payload.sprints.length > 0) {
      payload.sprints.forEach((spData, idx) => {
        const existingIdx = nextSprints.findIndex(
          s => s.projectId === targetProj.id && s.name.toLowerCase() === spData.name.toLowerCase()
        );
        if (existingIdx >= 0) {
          nextSprints[existingIdx] = {
            ...nextSprints[existingIdx],
            goal: spData.goal ?? nextSprints[existingIdx].goal,
            status: spData.status || nextSprints[existingIdx].status,
            startDate: spData.startDate || nextSprints[existingIdx].startDate,
            endDate: spData.endDate || nextSprints[existingIdx].endDate,
          };
          sprintLookupByName.set(nextSprints[existingIdx].name.toLowerCase(), nextSprints[existingIdx].id);
          if (payload.destinationModule === 'schedules') updatedCount++;
        } else {
          const spId = `sprint-imp-${Date.now()}-${idx}`;
          const newSp: Sprint = {
            id: spId,
            projectId: targetProj.id,
            name: spData.name,
            goal: spData.goal || '',
            status: spData.status || 'planned',
            startDate: spData.startDate,
            endDate: spData.endDate,
          };
          nextSprints.push(newSp);
          sprintLookupByName.set(newSp.name.toLowerCase(), spId);
          if (payload.destinationModule === 'schedules') createdCount++;
        }
      });
      setSprints(nextSprints);
    }

    // 7. Upsert Work Items (Issues) preserving Project -> Epic -> Story/Task -> Subtask & Dependencies
    if (payload.issues && payload.issues.length > 0) {
      const nextIssues = [...issues];
      let nextNum = 101 + nextIssues.filter(i => i.projectId === targetProj.id).length;

      const issueIdByKey = new Map<string, string>();
      nextIssues
        .filter(i => i.projectId === targetProj.id)
        .forEach(i => {
          issueIdByKey.set(i.key.toLowerCase(), i.id);
          if (i.externalKey) issueIdByKey.set(i.externalKey.toLowerCase(), i.id);
        });

      const pendingParentLinks: Array<{ childId: string; parentKey: string }> = [];

      payload.issues.forEach((issData, idx) => {
        const resolvedSprintId = issData._sprintHint
          ? sprintLookupByName.get(issData._sprintHint.toLowerCase()) || null
          : issData.sprintId ?? null;
        const resolvedEpicId = issData._epicHint
          ? epicLookupByKeyOrName.get(issData._epicHint.toLowerCase()) || null
          : issData._parentKeyHint && epicLookupByKeyOrName.has(issData._parentKeyHint.toLowerCase())
          ? epicLookupByKeyOrName.get(issData._parentKeyHint.toLowerCase()) || null
          : issData.epicId ?? null;

        const resolvedFixVersionIds = (issData._versionNamesHint || [])
          .map(vn => versionIdByName.get(vn.toLowerCase()))
          .filter((v): v is string => Boolean(v));

        const existingIdx = nextIssues.findIndex(
          i =>
            i.projectId === targetProj.id &&
            ((issData.key && (i.key.toLowerCase() === issData.key.toLowerCase() || i.externalKey?.toLowerCase() === issData.key.toLowerCase())) ||
              (!issData.key && i.summary.toLowerCase() === issData.summary.toLowerCase()))
        );

        const extraLinks: IssueLink[] = issData._dependencyHint
          ? [
              {
                id: `lnk-imp-${Date.now()}-${idx}`,
                type: 'blocks',
                targetIssueKey: issData._dependencyHint,
              },
            ]
          : [];

        if (existingIdx >= 0) {
          if (policy === 'destination_wins') {
            skippedCount++;
            return;
          }
          const existing = nextIssues[existingIdx];
          const mergedLinks = [...existing.links];
          for (const nl of extraLinks) {
            if (!mergedLinks.some(el => el.targetIssueKey.toLowerCase() === nl.targetIssueKey.toLowerCase())) {
              mergedLinks.push(nl);
            }
          }

          nextIssues[existingIdx] = {
            ...existing,
            description: issData.description || existing.description,
            status: issData.status || existing.status,
            priority: issData.priority || existing.priority,
            type: issData.type || existing.type,
            assigneeId: issData.assigneeId !== undefined ? issData.assigneeId : existing.assigneeId,
            storyPoints: issData.storyPoints ?? existing.storyPoints,
            originalEstimateMinutes: issData.originalEstimateMinutes ?? existing.originalEstimateMinutes,
            remainingEstimateMinutes: issData.remainingEstimateMinutes ?? existing.remainingEstimateMinutes,
            startDate: issData.startDate || existing.startDate,
            dueDate: issData.dueDate || existing.dueDate,
            team: issData.team || existing.team,
            wbsCode: issData.wbsCode || existing.wbsCode,
            estimatedCost: issData.estimatedCost ?? existing.estimatedCost,
            actualCost: issData.actualCost ?? existing.actualCost,
            isMilestone: issData.isMilestone ?? existing.isMilestone,
            externalKey: issData.externalKey || existing.externalKey,
            externalUrl: issData.externalUrl || existing.externalUrl,
            customFields: issData.customFields ? { ...(existing.customFields || {}), ...issData.customFields } : existing.customFields,
            epicId: resolvedEpicId || existing.epicId,
            sprintId: resolvedSprintId !== null ? resolvedSprintId : existing.sprintId,
            fixVersionIds:
              resolvedFixVersionIds.length > 0
                ? Array.from(new Set([...existing.fixVersionIds, ...resolvedFixVersionIds]))
                : existing.fixVersionIds,
            links: mergedLinks,
            labels:
              issData.labels && issData.labels.length > 0
                ? Array.from(new Set([...existing.labels, ...issData.labels]))
                : existing.labels,
            components:
              issData.components && issData.components.length > 0
                ? Array.from(new Set([...existing.components, ...issData.components]))
                : existing.components,
            attachments: issData.attachments && issData.attachments.length > 0 ? issData.attachments : existing.attachments,
            comments: issData.comments && issData.comments.length > 0 ? issData.comments : existing.comments,
            updatedAt: now,
          };
          issueIdByKey.set(nextIssues[existingIdx].key.toLowerCase(), nextIssues[existingIdx].id);
          if (issData._parentKeyHint && !epicLookupByKeyOrName.has(issData._parentKeyHint.toLowerCase())) {
            pendingParentLinks.push({ childId: nextIssues[existingIdx].id, parentKey: issData._parentKeyHint });
          }
          importedLinks.push({
            externalEntityType: 'issue',
            externalEntityId: issData._externalId || issData.key || nextIssues[existingIdx].key,
            externalKey: issData.key || nextIssues[existingIdx].key,
            externalUrl: issData.externalUrl,
            localEntityType: 'issue',
            localEntityId: nextIssues[existingIdx].id,
            syncHash: `${issData.summary}:${issData.status}:${issData.updatedAt || now}`,
            sourceUpdatedAt: now,
          });
          updatedCount++;
        } else {
          const key = issData.key || `${targetProj.key}-${nextNum++}`;
          const newId = `iss-imp-${Date.now()}-${idx}`;
          const newIssue: Issue = {
            id: newId,
            key,
            projectId: targetProj.id,
            sprintId: resolvedSprintId,
            epicId: resolvedEpicId,
            parentIssueId: null,
            type: issData.type || 'task',
            summary: issData.summary,
            description: issData.description || '',
            status: issData.status || 'todo',
            priority: issData.priority || 'medium',
            resolution: issData.status === 'done' ? 'Done' : null,
            assigneeId: issData.assigneeId ?? null,
            reporterId: issData.reporterId || actorId,
            storyPoints: issData.storyPoints ?? 3,
            originalEstimateMinutes: issData.originalEstimateMinutes ?? 240,
            remainingEstimateMinutes:
              issData.remainingEstimateMinutes ?? issData.originalEstimateMinutes ?? 240,
            flagged: false,
            archived: false,
            startDate: issData.startDate,
            dueDate: issData.dueDate,
            team: issData.team,
            wbsCode: issData.wbsCode,
            estimatedCost: issData.estimatedCost,
            actualCost: issData.actualCost,
            isMilestone: issData.isMilestone,
            externalKey: issData.externalKey || key,
            externalUrl: issData.externalUrl,
            customFields: issData.customFields,
            watchers: [actorId],
            labels: issData.labels || [],
            components: issData.components || [],
            fixVersionIds: resolvedFixVersionIds,
            subtasks: [],
            comments: issData.comments || [],
            worklogs: [],
            links: extraLinks,
            attachments: issData.attachments || [],
            devLinks: [],
            history: [
              {
                id: `hist-imp-${Date.now()}-${idx}`,
                authorId: actorId,
                field: 'imported',
                fromValue: payload.source,
                toValue: key,
                createdAt: now,
              },
            ],
            automationExecutions: [],
            createdAt: now,
            updatedAt: now,
          };
          nextIssues.unshift(newIssue);
          issueIdByKey.set(key.toLowerCase(), newId);
          if (issData._parentKeyHint && !epicLookupByKeyOrName.has(issData._parentKeyHint.toLowerCase())) {
            pendingParentLinks.push({ childId: newId, parentKey: issData._parentKeyHint });
          }
          importedLinks.push({
            externalEntityType: 'issue',
            externalEntityId: issData._externalId || key,
            externalKey: key,
            externalUrl: issData.externalUrl,
            localEntityType: 'issue',
            localEntityId: newId,
            syncHash: `${issData.summary}:${issData.status}:${now}`,
            sourceUpdatedAt: now,
          });
          createdCount++;
        }
      });

      // Second pass: resolve parentIssueId links across newly created + existing items
      for (const pl of pendingParentLinks) {
        const parentId = issueIdByKey.get(pl.parentKey.toLowerCase());
        if (parentId && parentId !== pl.childId) {
          const child = nextIssues.find(i => i.id === pl.childId);
          if (child) child.parentIssueId = parentId;
        }
      }

      setIssues(nextIssues);
    }

    // 8. Upsert Confluence / Excel Documents into Target Space Docs with hierarchy & structured blocks
    if (payload.docs && payload.docs.length > 0) {
      nextProjects = nextProjects.map(p => {
        if (p.id !== targetProj.id) return p;
        const nextDocs: SpaceDocPage[] = [...(p.docs || [])];
        payload.docs!.forEach((d, idx) => {
          const foundIdx = nextDocs.findIndex(
            existing =>
              (d.externalId && existing.externalId === d.externalId) ||
              (d.id && existing.id === d.id) ||
              existing.title.toLowerCase() === d.title.toLowerCase()
          );
          if (foundIdx >= 0) {
            if (policy === 'destination_wins') {
              skippedCount++;
              return;
            }
            nextDocs[foundIdx] = {
              ...nextDocs[foundIdx],
              content: d.content || nextDocs[foundIdx].content,
              structuredBlocks: d.structuredBlocks || nextDocs[foundIdx].structuredBlocks,
              conversionWarnings: d.conversionWarnings || nextDocs[foundIdx].conversionWarnings,
              parentId: d.parentId ?? nextDocs[foundIdx].parentId,
              ancestors: d.ancestors || nextDocs[foundIdx].ancestors,
              version: d.version ?? nextDocs[foundIdx].version,
              sourceUrl: d.sourceUrl || nextDocs[foundIdx].sourceUrl,
              sourceProvider: d.sourceProvider || nextDocs[foundIdx].sourceProvider,
              externalId: d.externalId || nextDocs[foundIdx].externalId,
              labels: d.labels || nextDocs[foundIdx].labels,
              attachments: d.attachments || nextDocs[foundIdx].attachments,
              comments: d.comments || nextDocs[foundIdx].comments,
              updatedAt: d.updatedAt || now,
            };
            importedLinks.push({
              externalEntityType: 'page',
              externalEntityId: d.externalId || nextDocs[foundIdx].id,
              externalKey: d.title,
              externalUrl: d.sourceUrl,
              localEntityType: 'document',
              localEntityId: nextDocs[foundIdx].id,
              syncHash: `${d.title}:v${d.version || 1}`,
              sourceUpdatedAt: d.updatedAt || now,
            });
            updatedCount++;
          } else {
            const newDocId = d.id || `doc-imp-${Date.now()}-${idx}`;
            nextDocs.unshift({
              id: newDocId,
              title: d.title,
              content: d.content,
              authorId: actorId,
              createdAt: d.createdAt || d.updatedAt || now,
              updatedAt: d.updatedAt || now,
              parentId: d.parentId,
              ancestors: d.ancestors,
              version: d.version || 1,
              sourceUrl: d.sourceUrl,
              sourceProvider: d.sourceProvider,
              externalId: d.externalId,
              labels: d.labels,
              attachments: d.attachments,
              comments: d.comments,
              conversionWarnings: d.conversionWarnings,
              structuredBlocks: d.structuredBlocks,
            });
            importedLinks.push({
              externalEntityType: 'page',
              externalEntityId: d.externalId || newDocId,
              externalKey: d.title,
              externalUrl: d.sourceUrl,
              localEntityType: 'document',
              localEntityId: newDocId,
              syncHash: `${d.title}:v${d.version || 1}`,
              sourceUpdatedAt: d.updatedAt || now,
            });
            createdCount++;
          }
        });
        return { ...p, docs: nextDocs };
      });
    }

    setProjects(nextProjects);

    // 9. Upsert Risks & Milestones
    if (payload.risks && payload.risks.length > 0) {
      const nextRisks = [...risks];
      payload.risks.forEach((rData, idx) => {
        const existingIdx = nextRisks.findIndex(
          r =>
            r.projectId === targetProj.id &&
            ((rData.key && r.key.toLowerCase() === rData.key.toLowerCase()) ||
              r.title.toLowerCase() === rData.title.toLowerCase())
        );
        if (existingIdx >= 0) {
          nextRisks[existingIdx] = {
            ...nextRisks[existingIdx],
            description: rData.description || nextRisks[existingIdx].description,
            probability: rData.probability || nextRisks[existingIdx].probability,
            impact: rData.impact || nextRisks[existingIdx].impact,
            status: rData.status || nextRisks[existingIdx].status,
            mitigationPlan: rData.mitigationPlan || nextRisks[existingIdx].mitigationPlan,
            dueDate: rData.dueDate || nextRisks[existingIdx].dueDate,
            updatedAt: now,
          };
          updatedCount++;
        } else {
          nextRisks.unshift({
            id: `risk-imp-${Date.now()}-${idx}`,
            projectId: targetProj.id,
            key: rData.key || `RSK-${nextRisks.length + 1}`,
            title: rData.title,
            titleFa: rData.titleFa || rData.title,
            description: rData.description || '',
            category: rData.category || 'Technical',
            probability: rData.probability || 'medium',
            impact: rData.impact || 'medium',
            status: rData.status || 'open',
            ownerId: rData.ownerId || actorId,
            mitigationPlan: rData.mitigationPlan,
            dueDate: rData.dueDate,
            createdAt: now,
            updatedAt: now,
          });
          createdCount++;
        }
      });
      setRisks(nextRisks);
    }

    if (payload.milestones && payload.milestones.length > 0) {
      const nextMilestones = [...milestones];
      payload.milestones.forEach((mData, idx) => {
        const existingIdx = nextMilestones.findIndex(
          m => m.projectId === targetProj.id && m.title.toLowerCase() === mData.title.toLowerCase()
        );
        if (existingIdx >= 0) {
          nextMilestones[existingIdx] = {
            ...nextMilestones[existingIdx],
            description: mData.description || nextMilestones[existingIdx].description,
            dueDate: mData.dueDate || nextMilestones[existingIdx].dueDate,
            status: mData.status || nextMilestones[existingIdx].status,
          };
          updatedCount++;
        } else {
          nextMilestones.unshift({
            id: `ms-imp-${Date.now()}-${idx}`,
            projectId: targetProj.id,
            title: mData.title,
            titleFa: mData.titleFa || mData.title,
            description: mData.description,
            dueDate: mData.dueDate || now.split('T')[0],
            status: mData.status || 'upcoming',
            ownerId: mData.ownerId || actorId,
          });
          createdCount++;
        }
      });
      setMilestones(nextMilestones);
    }

    // 10. Upsert Resources (Users / Teams / Assets)
    if (payload.users && payload.users.length > 0) {
      const nextUsers = [...users];
      payload.users.forEach((uData, idx) => {
        const existingIdx = nextUsers.findIndex(
          u => u.email.toLowerCase() === uData.email.toLowerCase()
        );
        if (existingIdx >= 0) {
          nextUsers[existingIdx] = {
            ...nextUsers[existingIdx],
            name: uData.name || nextUsers[existingIdx].name,
            nameFa: uData.nameFa || nextUsers[existingIdx].nameFa,
            department: uData.department || nextUsers[existingIdx].department,
            role: uData.role || nextUsers[existingIdx].role,
          };
          updatedCount++;
        } else {
          const initials =
            uData.name
              .split(/\s+/)
              .map(s => s[0])
              .join('')
              .toUpperCase()
              .slice(0, 2) || 'UR';
          nextUsers.push({
            id: `user-imp-${Date.now()}-${idx}`,
            name: uData.name,
            nameFa: uData.nameFa || uData.name,
            email: uData.email,
            avatar: initials,
            avatarColor: 'bg-indigo-600',
            role: uData.role || 'developer',
            department: uData.department || 'Engineering',
            status: 'active',
            joinedDate: now.split('T')[0],
          });
          createdCount++;
        }
      });
      setUsers(nextUsers);
    }

    if (payload.teams && payload.teams.length > 0) {
      const nextTeams = [...teams];
      payload.teams.forEach((tm, idx) => {
        const existingIdx = nextTeams.findIndex(
          t => t.name.toLowerCase() === tm.name.toLowerCase()
        );
        if (existingIdx >= 0) {
          nextTeams[existingIdx] = {
            ...nextTeams[existingIdx],
            description: tm.description || nextTeams[existingIdx].description,
          };
          updatedCount++;
        } else {
          nextTeams.push({
            id: `team-imp-${Date.now()}-${idx}`,
            name: tm.name,
            nameFa: tm.nameFa || tm.name,
            description: tm.description || 'Imported team',
            leadId: actorId,
            memberIds: [actorId],
          });
          createdCount++;
        }
      });
      setTeams(nextTeams);
    }

    if (payload.assets && payload.assets.length > 0) {
      const nextAssets = [...assets];
      payload.assets.forEach((ast, idx) => {
        const existingIdx = nextAssets.findIndex(
          a => a.name.toLowerCase() === ast.name.toLowerCase()
        );
        if (existingIdx >= 0) {
          nextAssets[existingIdx] = {
            ...nextAssets[existingIdx],
            environment: ast.environment || nextAssets[existingIdx].environment,
          };
          updatedCount++;
        } else {
          nextAssets.push({
            id: `ast-imp-${Date.now()}-${idx}`,
            key: `AST-${nextAssets.length + 101}`,
            name: ast.name,
            schema: ast.schema || 'Services',
            status: 'Active',
            ownerId: actorId,
            environment: ast.environment || 'Production',
            linkedIssueKeys: [],
          });
          createdCount++;
        }
      });
      setAssets(nextAssets);
    }

    setCurrentProjectId(targetProj.id);
    setAppNotifications(prev => [
      {
        id: `notif-imp-${Date.now()}`,
        title: `Integration sync (${payload.source.toUpperCase()})`,
        titleFa: `همگام‌سازی یکپارچه‌سازی (${payload.source.toUpperCase()})`,
        message: `${createdCount} created, ${updatedCount} updated in ${targetProj.key}`,
        createdAt: now,
        read: false,
      },
      ...prev,
    ]);

    return {
      targetProjectId: targetProj.id,
      targetProjectKey: targetProj.key,
      createdCount,
      updatedCount,
      skippedCount,
      warnings,
      importedLinks,
    };
  };

  return (
    <JiraContext.Provider
      value={{
        language,
        setLanguage,
        toggleLanguage,
        dir,
        t,
        theme,
        toggleTheme,

        toastMessage,
        showToast,
        clearToast,
        appNotifications,
        markNotificationRead,
        markAllNotificationsRead,

        activeView,
        setActiveView,
        sidebarCollapsed,
        setSidebarCollapsed,
        visibleSidebarSections,
        toggleSidebarSection,
        isSpaceFullscreen,
        setIsSpaceFullscreen,
        activeAdminTab,
        setActiveAdminTab,
        pendingJqlQuery,
        setPendingJqlQuery,
        activeQuickModal,
        setActiveQuickModal,

        projects,
        currentProject,
        setCurrentProjectId,
        recentProjectIds,
        recentIssueIds,
        toggleStarProject,
        toggleSpaceTab,
        createSpaceDoc,
        updateSpaceDoc,
        addSpaceShortcut,
        removeSpaceShortcut,
        toggleSpacePolicy,
        createProject,
        updateProject,
        updateProjectFeatures,
        updateProjectNotifications,

        users,
        currentUser,
        isAuthenticated: Boolean(currentUser),
        login,
        logout,
        setCurrentUser,
        createUser,
        updateUser,
        deleteUser,
        toggleUserStatus,

        statuses,
        workflows,
        currentWorkflow,
        editingWorkflowId,
        setEditingWorkflowId,
        activeWorkflow,
        epics,
        sprints,
        versions,
        issues,
        automationRules,
        automationAuditLogs,
        savedFilters,
        formTemplates,
        dashboards,
        plans,
        activePlanId,
        setActivePlanId,
        goals,
        teams,
        assets,
        risks,
        milestones,
        siteConfig,
        updateSiteConfig,

        createDashboard,
        toggleStarDashboard,
        createPlan,
        createGoal,
        updateGoalStatus,
        createTeam,
        createAsset,
        createRisk,
        updateRiskStatus,
        createMilestone,
        updateMilestoneStatus,

        workflowViewerIssueId,
        setWorkflowViewerIssueId,
        workflowReturnIssueId,
        setWorkflowReturnIssueId,
        addWorkflowStatus,
        removeWorkflowStatus,
        toggleStatusGlobalTransition,
        addWorkflowTransition,
        updateWorkflowTransition,
        addWorkflowRule,
        removeWorkflowRule,
        removeWorkflowTransition,
        createWorkflow,
        updateWorkflowMeta,
        cloneWorkflow,
        deleteWorkflow,

        toggleAutomationRule,
        createAutomationRule,
        saveFilter,
        deleteSavedFilter,

        searchQuery,
        setSearchQuery,
        quickFilter,
        setQuickFilter,
        groupBy,
        setGroupBy,

        selectedIssueId,
        setSelectedIssueId,
        isCreateModalOpen,
        setIsCreateModalOpen,
        createModalDefaultSprintId,
        createModalDefaultType,
        openCreateModal,

        activeSprint,

        createIssue,
        updateIssue,
        deleteIssue,
        cloneIssue,
        toggleArchiveIssue,
        addIssueAttachment,
        addIssueDevLink,
        moveIssueStatus,
        moveIssueSprint,
        toggleFlagged,
        toggleWatcher,

        addSubtask,
        toggleSubtask,
        deleteSubtask,
        addComment,
        addWorklog,
        linkIssue,

        createSprint,
        startSprint,
        completeSprint,
        updateSprint,

        createEpic,
        updateEpic,
        createVersion,
        toggleReleaseVersion,

        apiFetch,
        importIntegrationData,
        recentExcelImports,
        addRecentExcelImport,
        mappingTemplates,
        saveMappingTemplate,
        deleteMappingTemplate,
        syncHistory,
        addSyncHistoryRecord,

        resetToDemoData,
      }}
    >
      {children}
    </JiraContext.Provider>
  );
};

export const useJira = (): JiraContextType => {
  const ctx = useContext(JiraContext);
  if (!ctx) throw new Error('useJira must be used within JiraProvider');
  return ctx;
};
