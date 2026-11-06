import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  Project, User, Status, Epic, Sprint, Version, Issue, 
  ViewType, Priority, IssueType, IssueLink 
} from '../types/jira';
import { 
  initialProjects, initialUsers, initialStatuses, 
  initialEpics, initialSprints, initialVersions, initialIssues 
} from '../data/mockData';
import { Language, translations } from '../utils/i18n';

interface JiraContextType {
  // Localization & Theme
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  dir: 'rtl' | 'ltr';
  t: typeof translations.en;
  theme: 'light' | 'dark';
  toggleTheme: () => void;

  // Navigation
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;

  // Projects
  projects: Project[];
  currentProject: Project;
  setCurrentProjectId: (id: string) => void;

  // Data
  users: User[];
  currentUser: User;
  statuses: Status[];
  epics: Epic[];
  sprints: Sprint[];
  versions: Version[];
  issues: Issue[];

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
  moveIssueStatus: (id: string, newStatus: string) => void;
  moveIssueSprint: (id: string, sprintId: string | null) => void;

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

const STORAGE_KEY_PREFIX = 'jiraflow_app_v1_';

const JiraContext = createContext<JiraContextType | undefined>(undefined);

export const JiraProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Preferences
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}lang`);
    return (saved === 'fa' || saved === 'en') ? saved : 'fa'; // Default to Persian as requested
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}theme`);
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [activeView, setActiveView] = useState<ViewType>('board');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  // Entities
  const [projects] = useState<Project[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}projects`);
    return saved ? JSON.parse(saved) : initialProjects;
  });

  const [currentProjectId, setCurrentProjectId] = useState<string>(() => {
    return localStorage.getItem(`${STORAGE_KEY_PREFIX}cur_proj`) || initialProjects[0].id;
  });

  const [users] = useState<User[]>(initialUsers);
  const [currentUser] = useState<User>(initialUsers[0]);
  const [statuses] = useState<Status[]>(initialStatuses);

  const [epics, setEpics] = useState<Epic[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}epics`);
    return saved ? JSON.parse(saved) : initialEpics;
  });

  const [sprints, setSprints] = useState<Sprint[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}sprints`);
    return saved ? JSON.parse(saved) : initialSprints;
  });

  const [versions, setVersions] = useState<Version[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}versions`);
    return saved ? JSON.parse(saved) : initialVersions;
  });

  const [issues, setIssues] = useState<Issue[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}issues`);
    return saved ? JSON.parse(saved) : initialIssues;
  });

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'my' | 'recent' | 'bugs' | 'high'>('all');
  const [groupBy, setGroupBy] = useState<'none' | 'assignee' | 'epic'>('none');

  // Modals & Selection
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [createModalDefaultSprintId, setCreateModalDefaultSprintId] = useState<string | null | undefined>(undefined);

  // Save changes to localStorage
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

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'fa' ? 'en' : 'fa');
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const currentProject = projects.find(p => p.id === currentProjectId) || projects[0];
  const activeSprint = sprints.find(s => s.projectId === currentProject.id && s.status === 'active');
  const dir = language === 'fa' ? 'rtl' : 'ltr';
  const t = translations[language];

  const openCreateModal = (defaultSprintId?: string | null) => {
    setCreateModalDefaultSprintId(defaultSprintId);
    setIsCreateModalOpen(true);
  };

  // Issue Operations
  const createIssue = (data: Partial<Issue>): Issue => {
    const projectIssues = issues.filter(i => i.projectId === currentProject.id);
    const nextNum = 100 + projectIssues.length + 1;
    const issueKey = `${currentProject.key}-${nextNum}`;

    const newIssue: Issue = {
      id: `iss-${Date.now()}`,
      key: issueKey,
      projectId: currentProject.id,
      sprintId: data.sprintId ?? (activeSprint ? activeSprint.id : null),
      epicId: data.epicId || null,
      type: data.type || 'story',
      summary: data.summary || 'Untitled issue',
      description: data.description || '',
      status: data.status || (data.sprintId ? 'todo' : 'backlog'),
      priority: data.priority || 'medium',
      assigneeId: data.assigneeId || null,
      reporterId: currentUser.id,
      storyPoints: data.storyPoints ?? 3,
      originalEstimateMinutes: data.originalEstimateMinutes ?? 240,
      remainingEstimateMinutes: data.remainingEstimateMinutes ?? 240,
      labels: data.labels || [],
      components: data.components || [],
      fixVersionIds: data.fixVersionIds || [],
      subtasks: [],
      comments: [],
      worklogs: [],
      links: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setIssues(prev => [newIssue, ...prev]);
    return newIssue;
  };

  const updateIssue = (id: string, updates: Partial<Issue>) => {
    setIssues(prev => prev.map(issue => {
      if (issue.id === id) {
        return {
          ...issue,
          ...updates,
          updatedAt: new Date().toISOString()
        };
      }
      return issue;
    }));
  };

  const deleteIssue = (id: string) => {
    setIssues(prev => prev.filter(issue => issue.id !== id));
    if (selectedIssueId === id) {
      setSelectedIssueId(null);
    }
  };

  const moveIssueStatus = (id: string, newStatus: string) => {
    setIssues(prev => prev.map(issue => {
      if (issue.id === id) {
        return {
          ...issue,
          status: newStatus,
          updatedAt: new Date().toISOString()
        };
      }
      return issue;
    }));
  };

  const moveIssueSprint = (id: string, sprintId: string | null) => {
    setIssues(prev => prev.map(issue => {
      if (issue.id === id) {
        return {
          ...issue,
          sprintId,
          status: sprintId === null ? 'backlog' : (issue.status === 'backlog' ? 'todo' : issue.status),
          updatedAt: new Date().toISOString()
        };
      }
      return issue;
    }));
  };

  // Subtasks
  const addSubtask = (issueId: string, title: string) => {
    setIssues(prev => prev.map(issue => {
      if (issue.id === issueId) {
        const subtaskNum = issue.subtasks.length + 1;
        const newSub: Issue['subtasks'][0] = {
          id: `sub-${Date.now()}`,
          parentId: issueId,
          key: `${issue.key}-${subtaskNum}`,
          title,
          isCompleted: false,
          status: 'todo'
        };
        return {
          ...issue,
          subtasks: [...issue.subtasks, newSub],
          updatedAt: new Date().toISOString()
        };
      }
      return issue;
    }));
  };

  const toggleSubtask = (issueId: string, subtaskId: string) => {
    setIssues(prev => prev.map(issue => {
      if (issue.id === issueId) {
        return {
          ...issue,
          subtasks: issue.subtasks.map(sub => {
            if (sub.id === subtaskId) {
              const nextCompleted = !sub.isCompleted;
              return {
                ...sub,
                isCompleted: nextCompleted,
                status: nextCompleted ? 'done' : 'todo'
              };
            }
            return sub;
          }),
          updatedAt: new Date().toISOString()
        };
      }
      return issue;
    }));
  };

  const deleteSubtask = (issueId: string, subtaskId: string) => {
    setIssues(prev => prev.map(issue => {
      if (issue.id === issueId) {
        return {
          ...issue,
          subtasks: issue.subtasks.filter(sub => sub.id !== subtaskId),
          updatedAt: new Date().toISOString()
        };
      }
      return issue;
    }));
  };

  // Comments
  const addComment = (issueId: string, content: string) => {
    setIssues(prev => prev.map(issue => {
      if (issue.id === issueId) {
        const newComment = {
          id: `c-${Date.now()}`,
          authorId: currentUser.id,
          content,
          createdAt: new Date().toISOString()
        };
        return {
          ...issue,
          comments: [newComment, ...issue.comments],
          updatedAt: new Date().toISOString()
        };
      }
      return issue;
    }));
  };

  // Worklogs
  const addWorklog = (issueId: string, minutes: number, comment?: string) => {
    setIssues(prev => prev.map(issue => {
      if (issue.id === issueId) {
        const newWorklog = {
          id: `w-${Date.now()}`,
          authorId: currentUser.id,
          timeSpentMinutes: minutes,
          startedAt: new Date().toISOString(),
          comment
        };
        const currentRemaining = issue.remainingEstimateMinutes ?? 0;
        const newRemaining = Math.max(0, currentRemaining - minutes);
        return {
          ...issue,
          worklogs: [newWorklog, ...issue.worklogs],
          remainingEstimateMinutes: newRemaining,
          updatedAt: new Date().toISOString()
        };
      }
      return issue;
    }));
  };

  const linkIssue = (sourceIssueId: string, targetKey: string, type: IssueLink['type']) => {
    setIssues(prev => prev.map(issue => {
      if (issue.id === sourceIssueId) {
        const newLink: IssueLink = {
          id: `link-${Date.now()}`,
          type,
          targetIssueKey: targetKey
        };
        return {
          ...issue,
          links: [...issue.links, newLink],
          updatedAt: new Date().toISOString()
        };
      }
      return issue;
    }));
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
      status: 'planned'
    };
    setSprints(prev => [...prev, newSprint]);
    return newSprint;
  };

  const startSprint = (sprintId: string, durationWeeks: number, goal?: string) => {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + (durationWeeks * 7));

    setSprints(prev => prev.map(s => {
      if (s.id === sprintId) {
        return {
          ...s,
          status: 'active',
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          goal: goal ?? s.goal
        };
      }
      // If another was active, we keep it or can allow 1 active sprint per project
      return s;
    }));
  };

  const completeSprint = (sprintId: string, targetSprintId: string | null) => {
    // 1. Mark sprint as completed
    setSprints(prev => prev.map(s => {
      if (s.id === sprintId) {
        return {
          ...s,
          status: 'completed',
          completedAt: new Date().toISOString()
        };
      }
      return s;
    }));

    // 2. Move uncompleted issues to target sprint or backlog
    setIssues(prev => prev.map(issue => {
      if (issue.sprintId === sprintId && issue.status !== 'done') {
        return {
          ...issue,
          sprintId: targetSprintId,
          status: targetSprintId === null ? 'backlog' : issue.status,
          updatedAt: new Date().toISOString()
        };
      }
      return issue;
    }));
  };

  const updateSprint = (sprintId: string, updates: Partial<Sprint>) => {
    setSprints(prev => prev.map(s => s.id === sprintId ? { ...s, ...updates } : s));
  };

  // Epics & Releases
  const createEpic = (data: Omit<Epic, 'id' | 'key' | 'projectId'>): Epic => {
    const count = epics.filter(e => e.projectId === currentProject.id).length + 1;
    const newEpic: Epic = {
      ...data,
      id: `epic-${Date.now()}`,
      key: `${currentProject.key}-EPIC-${count}`,
      projectId: currentProject.id
    };
    setEpics(prev => [...prev, newEpic]);
    return newEpic;
  };

  const updateEpic = (id: string, updates: Partial<Epic>) => {
    setEpics(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const createVersion = (data: Omit<Version, 'id' | 'projectId'>): Version => {
    const newVersion: Version = {
      ...data,
      id: `ver-${Date.now()}`,
      projectId: currentProject.id
    };
    setVersions(prev => [...prev, newVersion]);
    return newVersion;
  };

  const toggleReleaseVersion = (versionId: string) => {
    setVersions(prev => prev.map(v => {
      if (v.id === versionId) {
        return {
          ...v,
          isReleased: !v.isReleased,
          releaseDate: !v.isReleased ? new Date().toISOString().split('T')[0] : v.releaseDate
        };
      }
      return v;
    }));
  };

  const resetToDemoData = () => {
    setIssues(initialIssues);
    setSprints(initialSprints);
    setEpics(initialEpics);
    setVersions(initialVersions);
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}issues`);
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}sprints`);
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}epics`);
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}versions`);
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

        activeView,
        setActiveView,
        sidebarCollapsed,
        setSidebarCollapsed,

        projects,
        currentProject,
        setCurrentProjectId,

        users,
        currentUser,
        statuses,
        epics,
        sprints,
        versions,
        issues,

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
