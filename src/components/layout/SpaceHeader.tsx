import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  Table,
  Kanban,
  Code2,
  FileSpreadsheet,
  CalendarRange,
  FileText,
  BarChart3,
  ListTodo,
  Calendar,
  Target,
  Package,
  Archive,
  Paperclip,
  Bookmark,
  Zap,
  GitBranch,
  Settings,
  Star,
  Share2,
  Maximize2,
  Minimize2,
  Plus,
  Layers,
  Check,
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { DEFAULT_SPACE_TABS } from '../../data/mockData';
import { SpaceTabId, ViewType } from '../../types/jira';
import { UserAvatar } from '../common/JiraIcons';

export const SpaceHeader: React.FC = () => {
  const {
    currentProject,
    toggleStarProject,
    toggleSpaceTab,
    activeView,
    setActiveView,
    isSpaceFullscreen,
    setIsSpaceFullscreen,
    users,
    openCreateModal,
    showToast,
    t,
    language,
  } = useJira();

  const [addTabMenuOpen, setAddTabMenuOpen] = useState(false);
  const addTabRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (addTabRef.current && !addTabRef.current.contains(e.target as Node)) {
        setAddTabMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const enabledTabs: SpaceTabId[] = currentProject.enabledTabs || DEFAULT_SPACE_TABS;

  const allTabDefs: {
    id: SpaceTabId;
    label: string;
    icon: React.FC<{ className?: string }>;
    requiresSprints?: boolean;
  }[] = [
    { id: 'summary', label: t.summaryView, icon: LayoutDashboard },
    { id: 'list', label: t.listView, icon: Table },
    { id: 'board', label: t.board, icon: Kanban },
    { id: 'backlog', label: t.backlog, icon: ListTodo, requiresSprints: true },
    { id: 'development', label: t.developmentView, icon: Code2 },
    { id: 'forms', label: t.formsView, icon: FileSpreadsheet },
    { id: 'roadmap', label: t.roadmap, icon: CalendarRange },
    { id: 'calendar', label: t.calendarView, icon: Calendar },
    { id: 'goals', label: t.goalsView, icon: Target },
    { id: 'docs', label: t.docsView, icon: FileText },
    { id: 'releases', label: t.releases, icon: Package },
    { id: 'reports', label: t.reports, icon: BarChart3 },
    { id: 'archived', label: t.archivedView, icon: Archive },
    { id: 'attachments', label: t.attachmentsView, icon: Paperclip },
    { id: 'shortcuts', label: t.shortcutsView, icon: Bookmark },
  ];

  const visibleTabs = allTabDefs.filter(tab => {
    if (tab.id === 'backlog' && currentProject.features?.sprints === false) return false;
    return enabledTabs.includes(tab.id);
  });

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/?space=${currentProject.key}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).catch(() => {});
    }
    showToast(
      'success',
      language === 'fa' ? `لینک فضای ${currentProject.key} کپی شد.` : `Space link (${currentProject.key}) copied to clipboard.`
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 pt-2.5 shrink-0 select-none">
      {/* Top Row: Breadcrumb, Space Title, Members, Quick Create Epic/Story, Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-7 h-7 rounded-md shrink-0 flex items-center justify-center font-bold text-white text-[11px] ${currentProject.avatarColor}`}>
            {currentProject.key.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <button onClick={() => setActiveView('spaces')} className="hover:text-blue-600 hover:underline">
                {t.spacesDirectory}
              </button>
              <span>/</span>
              <span className="font-mono">{currentProject.key}</span>
              <span>·</span>
              <span className="uppercase">{currentProject.template || 'scrum'}</span>
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {language === 'fa' ? currentProject.nameFa : currentProject.name}
              </h2>
              <button
                onClick={() => toggleStarProject(currentProject.id)}
                className="text-slate-400 hover:text-amber-500 transition-colors"
                title={language === 'fa' ? 'نشان کردن فضا' : 'Star space'}
              >
                <Star className={`w-3.5 h-3.5 ${currentProject.starred ? 'fill-amber-400 text-amber-500' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Creation Shortcuts right inside Space Header */}
          <button
            onClick={() => openCreateModal(undefined, 'epic')}
            className="px-2.5 py-1 rounded-md border border-purple-200 dark:border-purple-800 bg-purple-50/70 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap"
          >
            <Layers className="w-3 h-3" />
            <span>+ {t.epicType}</span>
          </button>
          <button
            onClick={() => openCreateModal(undefined, 'story')}
            className="px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap"
          >
            <Plus className="w-3 h-3" />
            <span>+ {t.storyType}</span>
          </button>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />

          {/* Member Avatars */}
          <div className="hidden md:flex items-center -space-x-1.5">
            {users.slice(0, 4).map(u => (
              <UserAvatar key={u.id} user={u} size="sm" className="ring-2 ring-white dark:ring-slate-900" />
            ))}
          </div>

          <button
            onClick={handleShare}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            title={language === 'fa' ? 'اشتراک‌گذاری فضا' : 'Share space'}
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setActiveView('automation')}
            className={`p-1.5 rounded-md transition-colors ${
              activeView === 'automation'
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600'
                : 'text-slate-500 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title={t.automationView}
          >
            <Zap className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setActiveView('workflow')}
            className={`p-1.5 rounded-md transition-colors ${
              activeView === 'workflow'
                ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-600'
                : 'text-slate-500 hover:text-purple-600 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title={t.workflowView}
          >
            <GitBranch className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setIsSpaceFullscreen(!isSpaceFullscreen)}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            title={isSpaceFullscreen ? 'Exit full screen' : 'Full screen'}
          >
            {isSpaceFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => setActiveView('settings')}
            className={`p-1.5 rounded-md transition-colors ${
              activeView === 'settings'
                ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-600'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title={t.projectSettings}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom Row: Configurable Space Views Tab Strip + '+' Menu (F09, F27) */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        {visibleTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id as ViewType)}
              className={`flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-semibold'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}

        {/* Direct Space Automation / Workflow / Settings quick tabs */}
        <button
          onClick={() => setActiveView('automation')}
          className={`flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
            activeView === 'automation'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-semibold'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Zap className="w-3.5 h-3.5 shrink-0" />
          <span>{t.automationView}</span>
        </button>

        <button
          onClick={() => setActiveView('workflow')}
          className={`flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
            activeView === 'workflow'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-semibold'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <GitBranch className="w-3.5 h-3.5 shrink-0" />
          <span>{t.workflowView}</span>
        </button>

        {/* + Add / Remove Space Views Button */}
        <div className="relative" ref={addTabRef}>
          <button
            onClick={() => setAddTabMenuOpen(prev => !prev)}
            className="flex items-center gap-1 px-2.5 py-2 text-xs font-semibold text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-t-md transition-colors whitespace-nowrap shrink-0"
            title={language === 'fa' ? 'افزودن یا حذف تب‌های فضا' : 'Add or toggle space views'}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {addTabMenuOpen && (
            <div className="fixed mt-1 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-2 z-50 text-xs max-h-80 overflow-y-auto">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {language === 'fa' ? 'نمای قابل افزودن به فضا' : 'CONFIGURE SPACE VIEWS'}
              </div>
              {allTabDefs.map(tab => {
                const Icon = tab.icon;
                const enabled = enabledTabs.includes(tab.id);
                return (
                  <button
                    key={tab.id}
                    onClick={() => toggleSpaceTab(currentProject.id, tab.id)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-start"
                  >
                    <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                      <Icon className="w-3.5 h-3.5 text-slate-500" />
                      <span>{tab.label}</span>
                    </div>
                    {enabled && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
