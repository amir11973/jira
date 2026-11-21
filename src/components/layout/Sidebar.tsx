import React from 'react';
import {
  LayoutDashboard,
  Kanban,
  Table,
  ListTodo,
  CalendarRange,
  FileSpreadsheet,
  Filter,
  Package,
  BarChart3,
  Zap,
  GitBranch,
  Settings,
  ChevronLeft,
  ChevronRight,
  Users,
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { ViewType } from '../../types/jira';

export const Sidebar: React.FC = () => {
  const {
    t,
    activeView,
    setActiveView,
    sidebarCollapsed,
    setSidebarCollapsed,
    currentProject,
    issues,
    sprints,
    users,
    language,
  } = useJira();

  const features = currentProject.features || {
    sprints: true,
    estimation: true,
    standups: true,
    forms: true,
    releases: true,
  };

  const activeSprintIssues = issues.filter(
    i =>
      i.projectId === currentProject.id &&
      (features.sprints
        ? i.sprintId && sprints.find(s => s.id === i.sprintId && s.status === 'active')
        : true)
  );
  const backlogIssues = issues.filter(i => i.projectId === currentProject.id && !i.sprintId);

  const spaceNavItems: {
    id: ViewType;
    label: string;
    icon: React.FC<{ className?: string }>;
    count?: number;
    visible?: boolean;
  }[] = [
    { id: 'summary', label: t.summaryView, icon: LayoutDashboard, visible: true },
    { id: 'board', label: t.board, icon: Kanban, count: activeSprintIssues.length, visible: true },
    { id: 'list', label: t.listView, icon: Table, visible: true },
    { id: 'backlog', label: t.backlog, icon: ListTodo, count: backlogIssues.length, visible: features.sprints },
    { id: 'roadmap', label: t.roadmap, icon: CalendarRange, visible: true },
    { id: 'forms', label: t.formsView, icon: FileSpreadsheet, visible: features.forms },
    { id: 'issues', label: t.issuesAndFilters, icon: Filter, visible: true },
    { id: 'releases', label: t.releases, icon: Package, visible: features.releases },
    { id: 'reports', label: t.reports, icon: BarChart3, visible: true },
    { id: 'automation', label: t.automationView, icon: Zap, visible: true },
    { id: 'workflow', label: t.workflowView, icon: GitBranch, visible: true },
  ];

  const adminNavItems: {
    id: ViewType;
    label: string;
    icon: React.FC<{ className?: string }>;
    count?: number;
  }[] = [
    { id: 'users', label: t.userManagement, icon: Users, count: users.length },
    { id: 'settings', label: t.projectSettings, icon: Settings },
  ];

  return (
    <aside
      className={`border-e border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-col transition-all duration-200 select-none ${
        sidebarCollapsed ? 'w-14' : 'w-60'
      }`}
    >
      {/* Space Banner */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 overflow-hidden">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 rounded-md shrink-0 flex items-center justify-center font-bold text-white text-xs ${currentProject.avatarColor}`}
          >
            {currentProject.key.slice(0, 2)}
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <h2 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {language === 'fa' ? currentProject.nameFa : currentProject.name}
              </h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate uppercase font-mono">
                {currentProject.template || 'scrum'} · {currentProject.key}
              </p>
            </div>
          )}
        </div>
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors shrink-0"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? (
            language === 'fa' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
          ) : language === 'fa' ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Navigation Menu */}
      <nav className="p-2 space-y-0.5 flex-1 overflow-y-auto">
        {!sidebarCollapsed && (
          <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1 tracking-wider">
            {language === 'fa' ? 'نمای فضای کاری' : 'SPACE VIEWS'}
          </div>
        )}

        {spaceNavItems
          .filter(item => item.visible !== false)
          .map(item => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-100/70 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
                  }`}
                />
                {!sidebarCollapsed && (
                  <>
                    <span className="truncate flex-1 text-start">{item.label}</span>
                    {item.count !== undefined && item.count > 0 && (
                      <span className="font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                        {item.count}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}

        {!sidebarCollapsed && (
          <div className="text-[10px] uppercase font-bold text-slate-400 px-2 pt-3 pb-1 tracking-wider">
            {language === 'fa' ? 'مدیریت و تنظیمات' : 'ADMINISTRATION'}
          </div>
        )}

        {adminNavItems.map(item => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              title={sidebarCollapsed ? item.label : undefined}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-blue-100/70 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
                }`}
              />
              {!sidebarCollapsed && (
                <>
                  <span className="truncate flex-1 text-start">{item.label}</span>
                  {item.count !== undefined && item.count > 0 && (
                    <span className="font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                      {item.count}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {!sidebarCollapsed && (
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span className="font-mono">{currentProject.key}</span>
          <span className="font-mono text-[10px]">Workflow v3</span>
        </div>
      )}
    </aside>
  );
};
