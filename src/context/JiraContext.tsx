import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Project,
  User,
  Status,
  Epic,
  Sprint,
  Version,
  Issue,
  ViewType,
  IssueLink,
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
} from '../types/jira';
import {
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
} from '../data/mockData';
import { Language, translations } from '../utils/i18n';
import { runTransitionPipeline } from '../utils/workflowEngine';

export interface ToastMessage {
  id: string;
  type: 'error' | 'success' | 'info';
  text: string;
}

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

  // Navigation
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;

  // Projects / Spaces
  projects: Project[];
  currentProject: Project;
  setCurrentProjectId: (id: string) => void;
  createProject: (data: {
    key: string;
    name: string;
    nameFa: string;
    description: string;
    category: string;
    template: 'scrum' | 'kanban' | 'business' | 'work_requests';
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
  epics: Epic[];
  sprints: Sprint[];
  versions: Version[];
  issues: Issue[];
  automationRules: AutomationRule[];
  automationAuditLogs: AutomationAuditLog[];
  savedFilters: SavedFilter[];
  formTemplates: FormSubmissionTemplate[];

  // Workflow Actions & Navigation
  workflowViewerIssueId: string | null;
  setWorkflowViewerIssueId: (id: string | null) => void;
  workflowReturnIssueId: string | null;
  setWorkflowReturnIssueId: (id: string | null) => void;
  addWorkflowStatus: (data: { name: string; nameFa: string; category: StatusCategory }) => Status;
  addWorkflowTransition: (data: { name: string; nameFa: string; fromStatusId: string; toStatusId: string }) => WorkflowTransition;
  addWorkflowRule: (transitionId: string, rule: Omit<WorkflowRule, 'id'>) => void;
  removeWorkflowRule: (transitionId: string, ruleId: string) => void;
  removeWorkflowTransition: (transitionId: string) => void;

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
  openCreateModal: (defaultSprintId?: string | null) => void;

  // Active Sprint
  activeSprint: Sprint | undefined;

  // Issue CRUD
  createIssue: (data: Partial<Issue>) => Issue;
  updateIssue: (id: string, updates: Partial<Issue>) => void;
  deleteIssue: (id: string) => void;
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
  createEpic: (epic: Omit<Epic, 'id' | 'key' | 'projectId'>) => Epic;
  updateEpic: (id: string, updates: Partial<Epic>) => void;
  createVersion: (ver: Omit<Version, 'id' | 'projectId'>) => Version;
  toggleReleaseVersion: (versionId: string) => void;

  // Reset
  resetToDemoData: () => void;
}

const STORAGE_KEY_PREFIX = 'jiraflow_app_v2_';

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
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}lang`) || localStorage.getItem('jiraflow_app_v1_lang');
    return saved === 'fa' || saved === 'en' ? saved : 'fa';
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}theme`) || localStorage.getItem('jiraflow_app_v1_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [activeView, setActiveView] = useState<ViewType>('board');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
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
  const [currentProjectId, setCurrentProjectId] = useState<string>(
    () => localStorage.getItem(`${STORAGE_KEY_PREFIX}cur_proj`) || initialProjects[0].id
  );
  const [users, setUsers] = useState<User[]>(() =>
    safeParse(`${STORAGE_KEY_PREFIX}users`, initialUsers)
  );
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const savedV2 = localStorage.getItem(`${STORAGE_KEY_PREFIX}current_user`);
    if (savedV2 !== null) {
      try {
        return JSON.parse(savedV2);
      } catch {
        return initialUsers[0];
      }
    }
    return initialUsers[0];
  });

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

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'my' | 'recent' | 'bugs' | 'high'>('all');
  const [groupBy, setGroupBy] = useState<'none' | 'assignee' | 'epic'>('none');

  // Modals & Workflow Overlay Navigation
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [createModalDefaultSprintId, setCreateModalDefaultSprintId] = useState<string | null | undefined>(undefined);
  const [workflowViewerIssueId, setWorkflowViewerIssueId] = useState<string | null>(null);
  const [workflowReturnIssueId, setWorkflowReturnIssueId] = useState<string | null>(null);

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
    if (currentUser) {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}current_user`, JSON.stringify(currentUser));
    } else {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}current_user`, JSON.stringify(null));
    }
  }, [currentUser]);

  const toggleLanguage = () => setLanguage(prev => (prev === 'fa' ? 'en' : 'fa'));
  const toggleTheme = () => setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  const login = (user: User) => setCurrentUser(user);
  const logout = () => setCurrentUser(null);

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
    template: 'scrum' | 'kanban' | 'business' | 'work_requests';
    avatarColor: string;
  }): Project => {
    const cleanKey = data.key.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'NEW';
    const newId = `proj-${Date.now()}`;
    const isScrum = data.template === 'scrum';
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
      features: {
        sprints: isScrum,
        estimation: isScrum || data.template === 'kanban',
        standups: true,
        forms: data.template === 'work_requests' || true,
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

  const updateProjectFeatures = (id: string, features: Partial<ProjectFeatures>) => {
    setProjects(prev =>
      prev.map(p =>
        p.id === id
          ? {
              ...p,
              features: {
                sprints: true,
                estimation: true,
                standups: true,
                forms: true,
                releases: true,
                ...p.features,
                ...features,
              },
            }
          : p
      )
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

  // Workflow Editing Actions
  const addWorkflowStatus = (data: { name: string; nameFa: string; category: StatusCategory }): Status => {
    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || `status_${Date.now()}`;
    const colorMap: Record<StatusCategory, string> = {
      todo: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      inprogress: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
      done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    };
    const newStatus: Status = {
      id: `${slug}_${Date.now().toString().slice(-3)}`,
      numericId: 10010 + currentWorkflow.statuses.length,
      name: data.name,
      nameFa: data.nameFa || data.name,
      category: data.category,
      color: colorMap[data.category],
    };

    const newTransition: WorkflowTransition = {
      id: `tr-${Date.now()}`,
      numericId: (currentWorkflow.transitions.length + 1) * 10 + 1,
      name: data.name,
      nameFa: data.nameFa || data.name,
      fromStatusId: 'any',
      toStatusId: newStatus.id,
      rules: [],
    };

    setWorkflows(prev =>
      prev.map(w =>
        w.id === currentWorkflow.id
          ? { ...w, statuses: [...w.statuses, newStatus], transitions: [...w.transitions, newTransition] }
          : w
      )
    );
    return newStatus;
  };

  const addWorkflowTransition = (data: {
    name: string;
    nameFa: string;
    fromStatusId: string;
    toStatusId: string;
  }): WorkflowTransition => {
    const newTr: WorkflowTransition = {
      id: `tr-${Date.now()}`,
      numericId: (currentWorkflow.transitions.length + 1) * 10 + 1,
      name: data.name,
      nameFa: data.nameFa || data.name,
      fromStatusId: data.fromStatusId,
      toStatusId: data.toStatusId,
      rules: [],
    };
    setWorkflows(prev =>
      prev.map(w => (w.id === currentWorkflow.id ? { ...w, transitions: [...w.transitions, newTr] } : w))
    );
    return newTr;
  };

  const addWorkflowRule = (transitionId: string, rule: Omit<WorkflowRule, 'id'>) => {
    const newRule: WorkflowRule = { ...rule, id: `rule-${Date.now()}` };
    setWorkflows(prev =>
      prev.map(w =>
        w.id === currentWorkflow.id
          ? {
              ...w,
              transitions: w.transitions.map(tr =>
                tr.id === transitionId ? { ...tr, rules: [...tr.rules, newRule] } : tr
              ),
            }
          : w
      )
    );
  };

  const removeWorkflowRule = (transitionId: string, ruleId: string) => {
    setWorkflows(prev =>
      prev.map(w =>
        w.id === currentWorkflow.id
          ? {
              ...w,
              transitions: w.transitions.map(tr =>
                tr.id === transitionId ? { ...tr, rules: tr.rules.filter(r => r.id !== ruleId) } : tr
              ),
            }
          : w
      )
    );
  };

  const removeWorkflowTransition = (transitionId: string) => {
    setWorkflows(prev =>
      prev.map(w =>
        w.id === currentWorkflow.id
          ? { ...w, transitions: w.transitions.filter(tr => tr.id !== transitionId) }
          : w
      )
    );
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
      createdAt: new Date().toISOString(),
    };
    setSavedFilters(prev => [sf, ...prev]);
    return sf;
  };

  const deleteSavedFilter = (id: string) => {
    setSavedFilters(prev => prev.filter(f => f.id !== id));
  };

  const openCreateModal = (defaultSprintId?: string | null) => {
    setCreateModalDefaultSprintId(defaultSprintId);
    setIsCreateModalOpen(true);
  };

  // Issue Operations
  const createIssue = (data: Partial<Issue>): Issue => {
    const projectIssues = issues.filter(i => i.projectId === currentProject.id);
    const nextNum = 101 + projectIssues.length;
    const issueKey = `${currentProject.key}-${nextNum}`;
    const firstStatus = currentWorkflow.statuses[0]?.id || 'todo';
    const reporterId = currentUser?.id || users[0]?.id || 'user-1';

    const newIssue: Issue = {
      id: `iss-${Date.now()}`,
      key: issueKey,
      projectId: currentProject.id,
      sprintId:
        currentProject.features?.sprints === false
          ? null
          : data.sprintId !== undefined
          ? data.sprintId
          : activeSprint
          ? activeSprint.id
          : null,
      epicId: data.epicId || null,
      type: data.type || 'story',
      summary: data.summary || 'Untitled issue',
      description: data.description || '',
      status: data.status && data.status !== 'backlog' ? data.status : firstStatus,
      priority: data.priority || 'medium',
      resolution: null,
      assigneeId: data.assigneeId || null,
      reporterId,
      storyPoints: data.storyPoints ?? 3,
      originalEstimateMinutes: data.originalEstimateMinutes ?? 240,
      remainingEstimateMinutes: data.remainingEstimateMinutes ?? 240,
      flagged: data.flagged ?? false,
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
    const newExecutions: AutomationExecution[] = [];
    const newAuditLogs: AutomationAuditLog[] = [];
    const executedRuleIds: string[] = [];

    // Execute matching Automation Rules (Stage 6)
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

    // Check Epic roll-up automation when moving a child item to Done
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

  // Epics & Releases
  const createEpic = (data: Omit<Epic, 'id' | 'key' | 'projectId'>): Epic => {
    const count = epics.filter(e => e.projectId === currentProject.id).length + 1;
    const newEpic: Epic = {
      ...data,
      id: `epic-${Date.now()}`,
      key: `${currentProject.key}-EPIC-${count}`,
      projectId: currentProject.id,
    };
    setEpics(prev => [...prev, newEpic]);
    return newEpic;
  };

  const updateEpic = (id: string, updates: Partial<Epic>) => {
    setEpics(prev => prev.map(e => (e.id === id ? { ...e, ...updates } : e)));
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
    setCurrentUser(initialUsers[0]);
    setCurrentProjectId(initialProjects[0].id);

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
      'current_user',
      'cur_proj',
    ];
    keys.forEach(k => localStorage.removeItem(`${STORAGE_KEY_PREFIX}${k}`));
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

        activeView,
        setActiveView,
        sidebarCollapsed,
        setSidebarCollapsed,

        projects,
        currentProject,
        setCurrentProjectId,
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
        epics,
        sprints,
        versions,
        issues,
        automationRules,
        automationAuditLogs,
        savedFilters,
        formTemplates,

        workflowViewerIssueId,
        setWorkflowViewerIssueId,
        workflowReturnIssueId,
        setWorkflowReturnIssueId,
        addWorkflowStatus,
        addWorkflowTransition,
        addWorkflowRule,
        removeWorkflowRule,
        removeWorkflowTransition,

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
        openCreateModal,

        activeSprint,

        createIssue,
        updateIssue,
        deleteIssue,
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

        resetToDemoData,
      }}
    >
      {children}
    </JiraContext.Provider>
  );
};

export const useJira = () => {
  const context = useContext(JiraContext);
  if (!context) {
    throw new Error('useJira must be used within a JiraProvider');
  }
  return context;
};
