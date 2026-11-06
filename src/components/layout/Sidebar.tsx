import { 
  Kanban, ListTodo, CalendarRange, Filter, 
  Package, BarChart3, Settings, ChevronLeft, ChevronRight, Users
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { ViewType } from '../../types/jira';

export const Sidebar: React.FC = () => {
  const { 
    t, activeView, setActiveView, sidebarCollapsed, 
    setSidebarCollapsed, currentProject, issues, sprints, users, language 
  } = useJira();

  const activeSprintIssues = issues.filter(
    i => i.projectId === currentProject.id && i.sprintId && sprints.find(s => s.id === i.sprintId && s.status === 'active')
  );
  const backlogIssues = issues.filter(
    i => i.projectId === currentProject.id && !i.sprintId
  );

  const navItems: { id: ViewType; label: string; icon: React.FC<{ className?: string }>; count?: number }[] = [
    { id: 'board', label: t.board, icon: Kanban, count: activeSprintIssues.length },
    { id: 'backlog', label: t.backlog, icon: ListTodo, count: backlogIssues.length },
    { id: 'roadmap', label: t.roadmap, icon: CalendarRange },
    { id: 'issues', label: t.issuesAndFilters, icon: Filter },
    { id: 'releases', label: t.releases, icon: Package },
    { id: 'reports', label: t.reports, icon: BarChart3 },
    { id: 'users', label: t.userManagement, icon: Users, count: users.length },
    { id: 'settings', label: t.projectSettings, icon: Settings },
  ];

  return (
    <aside 
      className={`border-e border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-col transition-all duration-200 select-none ${
        sidebarCollapsed ? 'w-14' : 'w-60'
      }`}
    >
      {/* Project Banner */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 overflow-hidden">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-md shrink-0 flex items-center justify-center font-bold text-white text-xs ${currentProject.avatarColor}`}>
            {currentProject.key.slice(0, 2)}
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <h2 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {language === 'fa' ? currentProject.nameFa : currentProject.name}
              </h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {t.softwareProject}
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
          ) : (
            language === 'fa' ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Navigation Menu */}
      <nav className="p-2 space-y-0.5 flex-1 overflow-y-auto">
        <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1 tracking-wider">
          {!sidebarCollapsed && (language === 'fa' ? 'امکانات چابک و اسکرام' : 'PLANNING')}
        </div>

        {navItems.map((item) => {
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
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`} />
              {!sidebarCollapsed && (
                <>
                  <span className="truncate flex-1 text-start">{item.label}</span>
                  {item.count !== undefined && item.count > 0 && (
                    <span className="font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400 px-1.5 py-0.2 rounded bg-slate-200/60 dark:bg-slate-800">
                      {item.count}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Sidebar Footer info */}
      {!sidebarCollapsed && (
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span>{currentProject.key}</span>
          <span className="font-mono text-[10px]">Agile v2.4</span>
        </div>
      )}
    </aside>
  );
};
