import React, { useState } from 'react';
import {
  User as UserIcon,
  Clock,
  Star,
  GanttChart,
  FolderKanban,
  Filter,
  LayoutDashboard,
  Database,
  Users,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Plus,
  MoreHorizontal,
  ShieldCheck,
  X,
  Search,
  Settings,
  AlignLeft,
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { GlobalSidebarItemKey } from '../../types/jira';
import { IssueTypeIcon } from '../common/JiraIcons';

export const Sidebar: React.FC = () => {
  const {
    t,
    language,
    activeView,
    setActiveView,
    sidebarCollapsed,
    setSidebarCollapsed,
    visibleSidebarSections,
    toggleSidebarSection,
    isSpaceFullscreen,
    projects,
    currentProject,
    setCurrentProjectId,
    recentProjectIds,
    recentIssueIds,
    issues,
    plans,
    dashboards,
    toggleStarProject,
    toggleStarDashboard,
    createPlan,
    setActivePlanId,
    setSelectedIssueId,
    setPendingJqlQuery,
    users,
    setActiveAdminTab,
    setActiveQuickModal,
  } = useJira();

  const [plansExpanded, setPlansExpanded] = useState(true);
  const [spacesExpanded, setSpacesExpanded] = useState(true);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [dashboardsExpanded, setDashboardsExpanded] = useState(true);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // Floating popovers matching Screenshots 3–9
  const [activePopover, setActivePopover] = useState<'none' | 'recent' | 'starred' | 'more_spaces'>('none');
  const [popoverSearch, setPopoverSearch] = useState('');
  const [openMenuGroup, setOpenMenuGroup] = useState<'none' | 'plans' | 'spaces'>('none');

  if (isSpaceFullscreen) return null;

  const starredProjects = projects.filter(p => p.starred);
  const starredDashboards = dashboards.filter(d => d.starred);
  const recentProjects = recentProjectIds
    .map(id => projects.find(p => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const recentIssues = recentIssueIds
    .map(id => issues.find(i => i.id === id))
    .filter((i): i is NonNullable<typeof i> => Boolean(i));

  const isVisible = (key: GlobalSidebarItemKey) => visibleSidebarSections.includes(key);

  const spaceViewsSet = new Set([
    'summary',
    'board',
    'list',
    'backlog',
    'roadmap',
    'development',
    'forms',
    'docs',
    'calendar',
    'goals',
    'releases',
    'reports',
    'archived',
    'attachments',
    'shortcuts',
    'automation',
    'workflow',
    'settings',
  ]);
  const isInSpaceView = spaceViewsSet.has(activeView);

  const sidebarItemsConfig: { key: GlobalSidebarItemKey; label: string }[] = [
    { key: 'for_you', label: t.forYou },
    { key: 'recent', label: t.recent },
    { key: 'starred', label: t.starred },
    { key: 'plans', label: t.plansView },
    { key: 'spaces', label: t.spacesDirectory },
    { key: 'filters', label: t.filtersDirectory },
    { key: 'dashboards', label: t.dashboardsView },
    { key: 'assets', label: t.assetsView },
    { key: 'teams', label: t.teamsView },
  ];

  const defaultFiltersList = [
    { label: language === 'fa' ? 'موارد باز من' : 'My open work items', jql: 'assignee = currentUser() AND status != done' },
    { label: language === 'fa' ? 'گزارش‌شده توسط من' : 'Reported by me', jql: 'reporter = currentUser()' },
    { label: language === 'fa' ? 'همه موارد' : 'All work items', jql: 'ORDER BY updated DESC' },
    { label: language === 'fa' ? 'موارد باز' : 'Open work items', jql: 'status != done ORDER BY priority DESC' },
    { label: language === 'fa' ? 'تکمیل‌شده' : 'Done work items', jql: 'status = done ORDER BY updated DESC' },
    { label: language === 'fa' ? 'مشاهده‌شده اخیراً' : 'Viewed recently', jql: 'ORDER BY updated DESC' },
    { label: language === 'fa' ? 'ایجادشده اخیراً' : 'Created recently', jql: 'ORDER BY created DESC' },
    { label: language === 'fa' ? 'حل‌شده اخیراً' : 'Resolved recently', jql: 'status = done ORDER BY updated DESC' },
    { label: language === 'fa' ? 'به‌روزشده اخیراً' : 'Updated recently', jql: 'ORDER BY updated DESC' },
  ];

  const openQuickFilter = (jql: string) => {
    setPendingJqlQuery(jql);
    setActiveView('issues');
    setActivePopover('none');
  };

  return (
    <>
      <aside
        className={`relative border-e border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-col transition-all duration-200 select-none shrink-0 z-30 ${
          sidebarCollapsed ? 'w-14' : 'w-64'
        }`}
      >
        {/* Top Collapse Control */}
        <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          {!sidebarCollapsed && (
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {language === 'fa' ? 'منوی جیرا' : 'WORKSPACE'}
            </span>
          )}
          <button
            onClick={() => {
              setSidebarCollapsed(!sidebarCollapsed);
              setActivePopover('none');
            }}
            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors ms-auto"
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

        {/* Main Navigation */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5 text-xs">
          {/* For you */}
          {isVisible('for_you') && (
            <button
              onClick={() => {
                setActivePopover('none');
                setActiveView('for_you');
              }}
              title={t.forYou}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md font-medium transition-colors ${
                activeView === 'for_you'
                  ? 'bg-blue-100/70 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
            >
              <UserIcon className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span className="truncate flex-1 text-start">{t.forYou}</span>}
            </button>
          )}

          {/* Recent -> Flyout Popover */}
          {isVisible('recent') && (
            <button
              onClick={() => {
                setPopoverSearch('');
                setActivePopover(prev => (prev === 'recent' ? 'none' : 'recent'));
              }}
              title={t.recent}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md font-medium transition-colors ${
                activePopover === 'recent'
                  ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-900 dark:text-white'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
            >
              <Clock className="w-4 h-4 shrink-0 text-slate-500" />
              {!sidebarCollapsed && (
                <>
                  <span className="truncate flex-1 text-start">{t.recent}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </>
              )}
            </button>
          )}

          {/* Starred -> Flyout Popover */}
          {isVisible('starred') && (
            <button
              onClick={() => {
                setPopoverSearch('');
                setActivePopover(prev => (prev === 'starred' ? 'none' : 'starred'));
              }}
              title={t.starred}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md font-medium transition-colors ${
                activePopover === 'starred'
                  ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-900 dark:text-white'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
            >
              <Star className="w-4 h-4 shrink-0 text-slate-500" />
              {!sidebarCollapsed && (
                <>
                  <span className="truncate flex-1 text-start">{t.starred}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </>
              )}
            </button>
          )}

          {/* Plans Section with + (Create plan) & ... (Create demo plan / Admin config) */}
          {isVisible('plans') && (
            <div className="pt-1 relative">
              <div className="group flex items-center gap-0.5">
                <button
                  onClick={() => (sidebarCollapsed ? setActiveView('plans') : setPlansExpanded(prev => !prev))}
                  title={t.plansView}
                  className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md font-medium transition-colors ${
                    activeView === 'plans'
                      ? 'bg-blue-100/70 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                  } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
                >
                  {!sidebarCollapsed && (
                    plansExpanded ? <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" /> : <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                  )}
                  <GanttChart className="w-4 h-4 shrink-0 text-indigo-500" />
                  {!sidebarCollapsed && <span className="truncate flex-1 text-start">{t.plansView}</span>}
                </button>
                {!sidebarCollapsed && (
                  <div className="flex items-center">
                    <button
                      onClick={() => setActiveQuickModal('create_plan')}
                      title={language === 'fa' ? 'ایجاد برنامه (Create plan)' : 'Create plan'}
                      className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setOpenMenuGroup(prev => (prev === 'plans' ? 'none' : 'plans'))}
                      title="Plan options"
                      className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {openMenuGroup === 'plans' && !sidebarCollapsed && (
                <div className="absolute end-1 top-8 z-50 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-1 text-xs">
                  <button
                    onClick={() => {
                      createPlan({
                        name: `Demo Plan (${new Date().toLocaleDateString()})`,
                        description: 'Sample cross-space delivery roadmap.',
                        spaceIds: projects.map(p => p.id),
                        isDemo: true,
                      });
                      setOpenMenuGroup('none');
                      setActiveView('plans');
                    }}
                    className="w-full text-start px-2.5 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 text-slate-700 dark:text-slate-200"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{language === 'fa' ? 'ایجاد برنامه دمو' : 'Create demo plan'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setOpenMenuGroup('none');
                      setActiveAdminTab('system');
                      setActiveView('jira_admin');
                    }}
                    className="w-full text-start px-2.5 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 text-slate-700 dark:text-slate-200"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>{language === 'fa' ? 'تنظیمات مدیریت' : 'Admin configuration'}</span>
                  </button>
                </div>
              )}

              {!sidebarCollapsed && plansExpanded && (
                <div className="ps-6 pe-1 py-0.5 space-y-0.5">
                  {plans.slice(0, 3).map(pl => (
                    <button
                      key={pl.id}
                      onClick={() => {
                        setActivePlanId(pl.id);
                        setActiveView('plans');
                      }}
                      className="w-full text-start px-2 py-1 rounded text-[11px] text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 truncate flex items-center gap-1.5"
                    >
                      <GanttChart className="w-3 h-3 shrink-0 text-indigo-400" />
                      <span className="truncate">{pl.name}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setActivePlanId(null);
                      setActiveView('plans');
                    }}
                    className="w-full text-start px-2 py-1 rounded text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 flex items-center gap-1.5"
                  >
                    <AlignLeft className="w-3 h-3 shrink-0" />
                    <span>{language === 'fa' ? 'مشاهده همه برنامه‌ها' : 'View all plans'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Spaces Section with + (Space Templates Modal) & ... (Manage spaces) */}
          {isVisible('spaces') && (
            <div className="pt-1 relative">
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => (sidebarCollapsed ? setActiveView('spaces') : setSpacesExpanded(prev => !prev))}
                  title={t.spacesDirectory}
                  className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md font-medium transition-colors ${
                    activeView === 'spaces'
                      ? 'bg-blue-100/70 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                  } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
                >
                  {!sidebarCollapsed && (
                    spacesExpanded ? <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" /> : <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                  )}
                  <FolderKanban className="w-4 h-4 shrink-0 text-blue-600" />
                  {!sidebarCollapsed && <span className="truncate flex-1 text-start">{t.spacesDirectory}</span>}
                </button>
                {!sidebarCollapsed && (
                  <div className="flex items-center">
                    <button
                      onClick={() => setActiveQuickModal('create_space')}
                      title={language === 'fa' ? 'ایجاد فضا (Create space)' : 'Create space'}
                      className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setOpenMenuGroup(prev => (prev === 'spaces' ? 'none' : 'spaces'))}
                      title="Space menu"
                      className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {openMenuGroup === 'spaces' && !sidebarCollapsed && (
                <div className="absolute end-1 top-8 z-50 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-1 text-xs">
                  <button
                    onClick={() => {
                      setOpenMenuGroup('none');
                      setActiveView('spaces');
                    }}
                    className="w-full text-start px-2.5 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 text-slate-700 dark:text-slate-200"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>{language === 'fa' ? 'مدیریت فضاها' : 'Manage spaces'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setOpenMenuGroup('none');
                      setActiveView('board');
                    }}
                    className="w-full text-start px-2.5 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 text-slate-700 dark:text-slate-200"
                  >
                    <AlignLeft className="w-3.5 h-3.5" />
                    <span>{language === 'fa' ? 'تغییر نما' : 'Change view'}</span>
                  </button>
                </div>
              )}

              {!sidebarCollapsed && spacesExpanded && (
                <div className="ps-3 pe-1 py-1 space-y-1">
                  {starredProjects.length > 0 && (
                    <div>
                      <div className="px-2 py-0.5 text-[10px] font-bold text-slate-400 uppercase">
                        {t.starred}
                      </div>
                      {starredProjects.map(proj => {
                        const selected = proj.id === currentProject.id && isInSpaceView;
                        return (
                          <div
                            key={proj.id}
                            onClick={() => {
                              setCurrentProjectId(proj.id);
                              setActiveView('board');
                            }}
                            className={`group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                              selected
                                ? 'bg-blue-100/80 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                            }`}
                          >
                            <span className={`w-5 h-5 rounded text-[9px] font-bold text-white flex items-center justify-center shrink-0 ${proj.avatarColor}`}>
                              {proj.key.slice(0, 2)}
                            </span>
                            <span className="truncate text-xs flex-1">
                              {language === 'fa' ? proj.nameFa : proj.name}
                            </span>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                toggleStarProject(proj.id);
                              }}
                              className="text-amber-500 p-0.5"
                            >
                              <Star className="w-3 h-3 fill-amber-400" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div>
                    <div className="px-2 py-0.5 text-[10px] font-bold text-slate-400 uppercase">
                      {t.recent}
                    </div>
                    {projects
                      .filter(p => !p.starred)
                      .map(proj => {
                        const selected = proj.id === currentProject.id && isInSpaceView;
                        return (
                          <div
                            key={proj.id}
                            onClick={() => {
                              setCurrentProjectId(proj.id);
                              setActiveView('board');
                            }}
                            className={`group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                              selected
                                ? 'bg-blue-100/80 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                            }`}
                          >
                            <span className={`w-5 h-5 rounded text-[9px] font-bold text-white flex items-center justify-center shrink-0 ${proj.avatarColor}`}>
                              {proj.key.slice(0, 2)}
                            </span>
                            <span className="truncate text-xs flex-1">
                              {language === 'fa' ? proj.nameFa : proj.name}
                            </span>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                toggleStarProject(proj.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-amber-500 p-0.5"
                            >
                              <Star className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                  </div>

                  <button
                    onClick={() => setActiveView('spaces')}
                    className="w-full flex items-center justify-between px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-md"
                  >
                    <span className="flex items-center gap-1.5">
                      <AlignLeft className="w-3 h-3" />
                      <span>{language === 'fa' ? 'فضاهای بیشتر' : 'More spaces'}</span>
                    </span>
                    <ChevronRight className="w-3 h-3 text-slate-400" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Filters Section (Search work items + Default filters expandable + View all filters) */}
          {isVisible('filters') && (
            <div className="pt-1">
              <div className="flex items-center">
                <button
                  onClick={() => (sidebarCollapsed ? setActiveView('filters') : setFiltersExpanded(prev => !prev))}
                  title={t.filtersDirectory}
                  className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md font-medium transition-colors ${
                    activeView === 'filters' || activeView === 'issues'
                      ? 'bg-blue-100/70 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                  } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
                >
                  {!sidebarCollapsed && (
                    filtersExpanded ? <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" /> : <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                  )}
                  <Filter className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && <span className="truncate flex-1 text-start">{t.filtersDirectory}</span>}
                </button>
              </div>

              {!sidebarCollapsed && (
                <div className="ps-5 pe-1 py-0.5 space-y-0.5">
                  <button
                    onClick={() => {
                      setPendingJqlQuery(null);
                      setActiveView('issues');
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] font-medium transition-colors ${
                      activeView === 'issues'
                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Search className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{language === 'fa' ? 'جستجوی تسک‌ها' : 'Search work items'}</span>
                  </button>

                  {filtersExpanded && (
                    <div className="space-y-0.5 pt-1">
                      <div className="px-2 py-0.5 text-[10px] font-bold text-slate-400 uppercase">
                        {language === 'fa' ? 'فیلترهای پیش‌فرض' : 'Default filters'}
                      </div>
                      {defaultFiltersList.map(df => (
                        <button
                          key={df.label}
                          onClick={() => openQuickFilter(df.jql)}
                          className="w-full text-start px-2 py-1 rounded text-[11px] text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 truncate flex items-center gap-2"
                        >
                          <AlignLeft className="w-3 h-3 shrink-0 text-slate-400" />
                          <span className="truncate">{df.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => setActiveView('filters')}
                    className="w-full text-start px-2 py-1 rounded text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 flex items-center gap-1.5"
                  >
                    <AlignLeft className="w-3 h-3 shrink-0" />
                    <span>{language === 'fa' ? 'مشاهده همه فیلترها' : 'View all filters'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Dashboards with direct + (Create dashboard modal) */}
          {isVisible('dashboards') && (
            <div className="pt-1">
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() =>
                    sidebarCollapsed ? setActiveView('dashboards') : setDashboardsExpanded(prev => !prev)
                  }
                  title={t.dashboardsView}
                  className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md font-medium transition-colors ${
                    activeView === 'dashboards'
                      ? 'bg-blue-100/70 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                  } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
                >
                  {!sidebarCollapsed && (
                    dashboardsExpanded ? <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" /> : <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                  )}
                  <LayoutDashboard className="w-4 h-4 shrink-0 text-emerald-600" />
                  {!sidebarCollapsed && <span className="truncate flex-1 text-start">{t.dashboardsView}</span>}
                </button>
                {!sidebarCollapsed && (
                  <button
                    onClick={() => setActiveQuickModal('create_dashboard')}
                    title={language === 'fa' ? 'ایجاد داشبورد' : 'Create dashboard'}
                    className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {!sidebarCollapsed && dashboardsExpanded && (
                <div className="ps-6 pe-1 py-0.5 space-y-0.5">
                  {dashboards.slice(0, 2).map(d => (
                    <button
                      key={d.id}
                      onClick={() => setActiveView('dashboards')}
                      className="w-full text-start px-2 py-1 rounded text-[11px] text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 truncate flex items-center gap-1.5"
                    >
                      <LayoutDashboard className="w-3 h-3 shrink-0 text-emerald-500" />
                      <span className="truncate">{d.name}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => setActiveView('dashboards')}
                    className="w-full text-start px-2 py-1 rounded text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 flex items-center gap-1.5"
                  >
                    <AlignLeft className="w-3 h-3 shrink-0" />
                    <span>{language === 'fa' ? 'مشاهده همه داشبوردها' : 'View all dashboards'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Assets */}
          {isVisible('assets') && (
            <button
              onClick={() => {
                setActivePopover('none');
                setActiveView('assets');
              }}
              title={t.assetsView}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md font-medium transition-colors ${
                activeView === 'assets'
                  ? 'bg-blue-100/70 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
            >
              <Database className="w-4 h-4 shrink-0 text-amber-600" />
              {!sidebarCollapsed && <span className="truncate flex-1 text-start">{t.assetsView}</span>}
            </button>
          )}

          {/* Teams with direct + (Create team modal) */}
          {isVisible('teams') && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => {
                  setActivePopover('none');
                  setActiveView('teams');
                }}
                title={t.teamsView}
                className={`flex-1 flex items-center gap-2.5 px-2.5 py-2 rounded-md font-medium transition-colors ${
                  activeView === 'teams'
                    ? 'bg-blue-100/70 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
              >
                <Users className="w-4 h-4 shrink-0 text-purple-600" />
                {!sidebarCollapsed && <span className="truncate flex-1 text-start">{t.teamsView}</span>}
              </button>
              {!sidebarCollapsed && (
                <button
                  onClick={() => setActiveQuickModal('create_team')}
                  title={language === 'fa' ? 'ایجاد تیم' : 'Create team'}
                  className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Administration Shortcuts */}
          <div className="pt-3 mt-2 border-t border-slate-200 dark:border-slate-800 space-y-0.5">
            {!sidebarCollapsed && (
              <div className="text-[10px] uppercase font-bold text-slate-400 px-2 pb-1 tracking-wider">
                {language === 'fa' ? 'مدیریت سامانه' : 'ADMINISTRATION'}
              </div>
            )}
            <button
              onClick={() => setActiveView('users')}
              title={t.userManagement}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md font-medium transition-colors ${
                activeView === 'users'
                  ? 'bg-blue-100/70 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
            >
              <Users className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && (
                <>
                  <span className="truncate flex-1 text-start">{t.userManagement}</span>
                  <span className="font-mono text-[10px] text-slate-400 tabular-nums">{users.length}</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                setActiveAdminTab('system');
                setActiveView('jira_admin');
              }}
              title={t.jiraAdmin}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md font-medium transition-colors ${
                activeView === 'jira_admin'
                  ? 'bg-blue-100/70 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
            >
              <ShieldCheck className="w-4 h-4 shrink-0 text-blue-600" />
              {!sidebarCollapsed && <span className="truncate flex-1 text-start">{t.jiraAdmin}</span>}
            </button>
          </div>
        </nav>

        {/* Bottom Customize Sidebar */}
        <div className="p-2 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setCustomizeOpen(true)}
            title={t.customizeSidebar}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors ${
              sidebarCollapsed ? 'justify-center px-0' : ''
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            {!sidebarCollapsed && <span>{t.customizeSidebar}</span>}
          </button>
        </div>

        {/* Floating Recent / Starred Popover (Exact match to Screenshots 3 & 4) */}
        {activePopover !== 'none' && (
          <div className="absolute top-12 start-full ms-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden text-xs">
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  {activePopover === 'recent' ? t.recent : t.starred}
                </h4>
                <button
                  onClick={() => setActivePopover('none')}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={popoverSearch}
                  onChange={e => setPopoverSearch(e.target.value)}
                  placeholder={
                    activePopover === 'recent'
                      ? language === 'fa'
                        ? 'جستجو در موارد اخیر...'
                        : 'Search recent items'
                      : language === 'fa'
                      ? 'جستجو در ستاره‌دارها...'
                      : 'Search starred items'
                  }
                  className="w-full ps-8 pe-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto p-2 space-y-3">
              {activePopover === 'recent' ? (
                <>
                  <div className="space-y-1">
                    <div className="px-2 text-[10px] font-bold uppercase text-slate-400">
                      {language === 'fa' ? 'امروز' : 'Today'}
                    </div>
                    {recentIssues
                      .filter(i =>
                        !popoverSearch.trim()
                          ? true
                          : i.summary.toLowerCase().includes(popoverSearch.toLowerCase()) ||
                            i.key.toLowerCase().includes(popoverSearch.toLowerCase())
                      )
                      .map(iss => (
                        <button
                          key={iss.id}
                          onClick={() => {
                            setSelectedIssueId(iss.id);
                            setActivePopover('none');
                          }}
                          className="w-full text-start p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 flex items-start gap-2.5"
                        >
                          <IssueTypeIcon type={iss.type} className="w-4 h-4 mt-0.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-900 dark:text-white truncate">{iss.summary}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{iss.key} · Recently viewed</div>
                          </div>
                        </button>
                      ))}
                  </div>

                  <div className="space-y-1">
                    <div className="px-2 text-[10px] font-bold uppercase text-slate-400">
                      {language === 'fa' ? 'فضاهای اخیر' : 'Recent Spaces'}
                    </div>
                    {recentProjects
                      .filter(p =>
                        !popoverSearch.trim()
                          ? true
                          : p.name.toLowerCase().includes(popoverSearch.toLowerCase()) ||
                            p.key.toLowerCase().includes(popoverSearch.toLowerCase())
                      )
                      .map(p => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setCurrentProjectId(p.id);
                            setActiveView('board');
                            setActivePopover('none');
                          }}
                          className="w-full text-start p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5"
                        >
                          <span className={`w-5 h-5 rounded text-[9px] font-bold text-white flex items-center justify-center shrink-0 ${p.avatarColor}`}>
                            {p.key.slice(0, 2)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-900 dark:text-white truncate">
                              {language === 'fa' ? p.nameFa : p.name}
                            </div>
                            <div className="text-[11px] text-slate-400">{p.key} board</div>
                          </div>
                        </button>
                      ))}
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  {starredProjects
                    .filter(p =>
                      !popoverSearch.trim() ? true : p.name.toLowerCase().includes(popoverSearch.toLowerCase())
                    )
                    .map(p => (
                      <div
                        key={p.id}
                        className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-2"
                      >
                        <button
                          onClick={() => {
                            setCurrentProjectId(p.id);
                            setActiveView('board');
                            setActivePopover('none');
                          }}
                          className="flex items-center gap-2.5 min-w-0 flex-1 text-start"
                        >
                          <span className={`w-5 h-5 rounded text-[9px] font-bold text-white flex items-center justify-center shrink-0 ${p.avatarColor}`}>
                            {p.key.slice(0, 2)}
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-white truncate">
                            {language === 'fa' ? p.nameFa : p.name}
                          </span>
                        </button>
                        <button onClick={() => toggleStarProject(p.id)} className="text-amber-500 p-1">
                          <Star className="w-3.5 h-3.5 fill-amber-400" />
                        </button>
                      </div>
                    ))}
                  {starredDashboards.map(d => (
                    <div
                      key={d.id}
                      className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-2"
                    >
                      <button
                        onClick={() => {
                          setActiveView('dashboards');
                          setActivePopover('none');
                        }}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-start"
                      >
                        <LayoutDashboard className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className="font-semibold text-slate-900 dark:text-white truncate">{d.name}</span>
                      </button>
                      <button onClick={() => toggleStarDashboard(d.id)} className="text-amber-500 p-1">
                        <Star className="w-3.5 h-3.5 fill-amber-400" />
                      </button>
                    </div>
                  ))}
                  {starredProjects.length === 0 && starredDashboards.length === 0 && (
                    <div className="p-4 text-center text-slate-400 italic">
                      {language === 'fa' ? 'مورد ستاره‌داری یافت نشد.' : 'No starred items.'}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
              <button
                onClick={() => {
                  setActivePopover('none');
                  setActiveView(activePopover === 'recent' ? 'for_you' : 'spaces');
                }}
                className="w-full text-start px-2 py-1 text-slate-700 dark:text-slate-300 hover:text-blue-600 font-semibold flex items-center gap-2"
              >
                <AlignLeft className="w-3.5 h-3.5" />
                <span>
                  {activePopover === 'recent'
                    ? language === 'fa'
                      ? 'مشاهده همه موارد اخیر'
                      : 'View all recent items'
                    : language === 'fa'
                    ? 'مشاهده همه ستاره‌دارها'
                    : 'View all starred items'}
                </span>
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Customize Sidebar Modal */}
      {customizeOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">{t.customizeSidebar}</h3>
              <button onClick={() => setCustomizeOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-slate-500">
              {language === 'fa'
                ? 'بخش‌های دلخواه برای نمایش در منوی کناری را انتخاب کنید:'
                : 'Choose which sections appear in your global left sidebar:'}
            </p>
            <div className="space-y-1.5">
              {sidebarItemsConfig.map(item => (
                <label
                  key={item.key}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <span className="font-medium text-slate-800 dark:text-slate-200">{item.label}</span>
                  <input
                    type="checkbox"
                    checked={visibleSidebarSections.includes(item.key)}
                    onChange={() => toggleSidebarSection(item.key)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                </label>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setCustomizeOpen(false)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md"
              >
                {t.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
