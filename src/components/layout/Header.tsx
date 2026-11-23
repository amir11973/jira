import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Search,
  Moon,
  Sun,
  Globe,
  Layers,
  LogOut,
  Users,
  X,
  AlertCircle,
  CheckCircle2,
  Grid3X3,
  Bell,
  Settings,
  Sliders,
  GitBranch,
  Database,
  LayoutDashboard,
  GanttChart,
  Megaphone,
  UserCog,
  Plug,
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { IssueTypeIcon, UserAvatar } from '../common/JiraIcons';

export const Header: React.FC = () => {
  const {
    t,
    language,
    toggleLanguage,
    theme,
    toggleTheme,
    projects,
    epics,
    issues,
    setCurrentProjectId,
    openCreateModal,
    currentUser,
    users,
    login,
    logout,
    setActiveView,
    setActiveAdminTab,
    setSelectedIssueId,
    searchQuery,
    setSearchQuery,
    toastMessage,
    clearToast,
    appNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    siteConfig,
  } = useJira();

  const [appSwitcherOpen, setAppSwitcherOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [gearMenuOpen, setGearMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [searchPopoverOpen, setSearchPopoverOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const appSwitcherRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const gearRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchPopoverOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (appSwitcherRef.current && !appSwitcherRef.current.contains(target)) setAppSwitcherOpen(false);
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (gearRef.current && !gearRef.current.contains(target)) setGearMenuOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(target)) setUserDropdownOpen(false);
      if (searchWrapRef.current && !searchWrapRef.current.contains(target)) setSearchPopoverOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = appNotifications.filter(n => !n.read).length;

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const matchedIssues = trimmedQuery
    ? issues
        .filter(
          i =>
            !i.archived &&
            (i.key.toLowerCase().includes(trimmedQuery) ||
              i.summary.toLowerCase().includes(trimmedQuery) ||
              i.type.toLowerCase().includes(trimmedQuery))
        )
        .slice(0, 6)
    : [];
  const matchedEpics = trimmedQuery
    ? epics
        .filter(
          e =>
            e.key.toLowerCase().includes(trimmedQuery) ||
            e.name.toLowerCase().includes(trimmedQuery) ||
            e.nameFa.toLowerCase().includes(trimmedQuery)
        )
        .slice(0, 3)
    : [];
  const matchedSpaces = trimmedQuery
    ? projects
        .filter(
          p =>
            p.key.toLowerCase().includes(trimmedQuery) ||
            p.name.toLowerCase().includes(trimmedQuery) ||
            p.nameFa.toLowerCase().includes(trimmedQuery)
        )
        .slice(0, 3)
    : [];

  return (
    <>
      {siteConfig.announcementEnabled && siteConfig.announcementBanner.trim() && (
        <div className="bg-amber-500 text-slate-950 px-4 py-1.5 text-xs font-semibold flex items-center justify-center gap-2 shrink-0 z-40">
          <Megaphone className="w-3.5 h-3.5 shrink-0" />
          <span>{siteConfig.announcementBanner}</span>
        </div>
      )}

      <header className="h-13 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 sm:px-4 flex items-center justify-between gap-3 sticky top-0 z-30 select-none shrink-0">
        {/* Left: App Switcher + Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative" ref={appSwitcherRef}>
            <button
              onClick={() => setAppSwitcherOpen(prev => !prev)}
              className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={language === 'fa' ? 'تغییر ابزار (App Switcher)' : 'App Switcher'}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>

            {appSwitcherOpen && (
              <div className="absolute top-full mt-1.5 start-0 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-2 z-50 text-xs">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {language === 'fa' ? 'ابزارهای فضای کاری' : 'WORKSPACE APPS'}
                </div>
                {[
                  { id: 'for_you' as const, label: 'Jira Home (For you)', labelFa: 'خانه جیرا (For you)', icon: Layers, color: 'bg-blue-600' },
                  { id: 'plans' as const, label: 'Plans & Roadmaps', labelFa: 'برنامه‌ریزی کلان (Plans)', icon: GanttChart, color: 'bg-indigo-600' },
                  { id: 'dashboards' as const, label: 'Analytics & Dashboards', labelFa: 'داشبوردها و تحلیل', icon: LayoutDashboard, color: 'bg-emerald-600' },
                  { id: 'assets' as const, label: 'Assets & CMDB', labelFa: 'دارایی‌ها (Assets)', icon: Database, color: 'bg-amber-600' },
                  { id: 'teams' as const, label: 'Teams Directory', labelFa: 'تیم‌ها و اعضا', icon: Users, color: 'bg-purple-600' },
                  { id: 'integrations' as const, label: 'Integration Center', labelFa: 'مرکز یکپارچه‌سازی', icon: Plug, color: 'bg-cyan-600' },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveView(item.id);
                        setAppSwitcherOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-start transition-colors"
                    >
                      <div className={`w-7 h-7 rounded-md ${item.color} text-white flex items-center justify-center shrink-0`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {language === 'fa' ? item.labelFa : item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={() => setActiveView('for_you')}
            className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <Layers className="w-4 h-4" />
            </div>
            <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
              {t.appName}
            </span>
          </button>
        </div>

        {/* Center: Global Search + Create Button */}
        <div className="flex-1 max-w-2xl flex items-center gap-2 mx-2" ref={searchWrapRef}>
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onFocus={() => setSearchPopoverOpen(true)}
              onChange={e => {
                setSearchQuery(e.target.value);
                setSearchPopoverOpen(true);
              }}
              placeholder={t.searchPlaceholder}
              className="w-full h-8 ps-9 pe-10 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200/70 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 focus:border-blue-500 rounded-md text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none transition-all"
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <kbd className="absolute end-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded">
                /
              </kbd>
            )}

            {searchPopoverOpen && (trimmedQuery || searchPopoverOpen) && (trimmedQuery.length > 0) && (
              <div className="absolute top-full mt-1.5 start-0 end-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-2 z-50 text-xs max-h-96 overflow-y-auto space-y-2">
                {matchedIssues.length > 0 && (
                  <div>
                    <div className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400">
                      {language === 'fa' ? 'تسک‌ها و استوری‌ها' : 'WORK ITEMS'}
                    </div>
                    {matchedIssues.map(iss => (
                      <button
                        key={iss.id}
                        onClick={() => {
                          setSelectedIssueId(iss.id);
                          setSearchPopoverOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-start"
                      >
                        <IssueTypeIcon type={iss.type} className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-mono font-semibold text-blue-600 dark:text-blue-400 shrink-0">{iss.key}</span>
                        <span className="truncate text-slate-800 dark:text-slate-200 flex-1">{iss.summary}</span>
                        <span className="text-[10px] font-mono text-slate-400 uppercase">{iss.status}</span>
                      </button>
                    ))}
                  </div>
                )}

                {matchedEpics.length > 0 && (
                  <div>
                    <div className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400">
                      {t.epics}
                    </div>
                    {matchedEpics.map(ep => (
                      <button
                        key={ep.id}
                        onClick={() => {
                          setCurrentProjectId(ep.projectId);
                          setActiveView('roadmap');
                          setSearchPopoverOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-start"
                      >
                        <span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{ backgroundColor: ep.color }} />
                        <span className="font-mono font-semibold text-purple-600 shrink-0">{ep.key}</span>
                        <span className="truncate text-slate-800 dark:text-slate-200">
                          {language === 'fa' ? ep.nameFa : ep.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {matchedSpaces.length > 0 && (
                  <div>
                    <div className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400">
                      {t.projects}
                    </div>
                    {matchedSpaces.map(sp => (
                      <button
                        key={sp.id}
                        onClick={() => {
                          setCurrentProjectId(sp.id);
                          setActiveView('board');
                          setSearchPopoverOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-start"
                      >
                        <span className={`w-4 h-4 rounded text-[9px] text-white font-bold flex items-center justify-center ${sp.avatarColor}`}>
                          {sp.key.slice(0, 2)}
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {language === 'fa' ? sp.nameFa : sp.name}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">{sp.key}</span>
                      </button>
                    ))}
                  </div>
                )}

                {matchedIssues.length === 0 && matchedEpics.length === 0 && matchedSpaces.length === 0 && (
                  <div className="p-3 text-center text-slate-400">
                    {t.noMatchingIssues}
                  </div>
                )}

                <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5 flex items-center justify-between px-2">
                  <button
                    onClick={() => {
                      setActiveView('issues');
                      setSearchPopoverOpen(false);
                    }}
                    className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                  >
                    {language === 'fa' ? 'مشاهده همه در جستجوی پیشرفته JQL →' : 'Go to All work (JQL) →'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => openCreateModal()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold shadow-xs transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>{language === 'fa' ? 'ایجاد' : 'Create'}</span>
          </button>
        </div>

        {/* Right: Notifications, Gear Admin Menu, Lang/Theme, Profile */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Notifications Bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen(prev => !prev)}
              className="relative p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
              title={language === 'fa' ? 'اعلان‌ها' : 'Notifications'}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -end-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-mono font-bold tabular-nums flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute top-full mt-2 end-0 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-2 z-50 text-xs">
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="font-bold text-slate-900 dark:text-white">
                    {language === 'fa' ? 'اعلان‌ها' : 'Notifications'}
                  </span>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllNotificationsRead}
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      {language === 'fa' ? 'خوانده‌شدن همه' : 'Mark all read'}
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
                  {appNotifications.map(n => (
                    <button
                      key={n.id}
                      onClick={() => {
                        markNotificationRead(n.id);
                        if (n.issueKey) {
                          const found = issues.find(i => i.key === n.issueKey);
                          if (found) setSelectedIssueId(found.id);
                        }
                        setNotifOpen(false);
                      }}
                      className={`w-full text-start p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors space-y-0.5 ${
                        !n.read ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                      }`}
                    >
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {language === 'fa' ? n.titleFa : n.title}
                      </div>
                      <div className="text-[11px] text-slate-500 line-clamp-2">{n.message}</div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {new Date(n.createdAt).toLocaleString()}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Settings Gear Menu (Jira Admin Console) */}
          <div className="relative" ref={gearRef}>
            <button
              onClick={() => setGearMenuOpen(prev => !prev)}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
              title={t.jiraAdmin}
            >
              <Settings className="w-4 h-4" />
            </button>

            {gearMenuOpen && (
              <div className="absolute top-full mt-2 end-0 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-2 z-50 text-xs space-y-1">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {language === 'fa' ? 'مدیریت کل سامانه (Jira Admin)' : 'JIRA ADMINISTRATION'}
                </div>
                {[
                  { tab: 'system' as const, label: 'System & General Config', labelFa: 'تنظیمات سیستم و بنر اعلانات', icon: Sliders },
                  { tab: 'work_items' as const, label: 'Work Items & Hierarchy', labelFa: 'انواع کار و سلسله‌مراتب', icon: Layers },
                  { tab: 'fields' as const, label: 'Global Fields (Catalog)', labelFa: 'مدیریت فیلدهای سراسری', icon: Database },
                  { tab: 'workflows' as const, label: 'Workflows & Schemes', labelFa: 'گردش‌کارهای سازمانی', icon: GitBranch },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.tab}
                      onClick={() => {
                        setActiveAdminTab(item.tab);
                        setActiveView('jira_admin');
                        setGearMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-start text-slate-700 dark:text-slate-200 font-medium"
                    >
                      <Icon className="w-3.5 h-3.5 text-blue-600" />
                      <span>{language === 'fa' ? item.labelFa : item.label}</span>
                    </button>
                  );
                })}
                <div className="border-t border-slate-100 dark:border-slate-800 pt-1">
                  <button
                    onClick={() => {
                      setActiveView('spaces');
                      setGearMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-start text-slate-700 dark:text-slate-200 font-medium"
                  >
                    <Layers className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{t.spacesDirectory}</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveView('users');
                      setGearMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-start text-slate-700 dark:text-slate-200 font-medium"
                  >
                    <Users className="w-3.5 h-3.5 text-purple-600" />
                    <span>{t.userManagement}</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveView('integrations');
                      setGearMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-start text-slate-700 dark:text-slate-200 font-medium"
                  >
                    <Plug className="w-3.5 h-3.5 text-cyan-600" />
                    <span>{t.integrationsView}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={toggleLanguage}
            title={language === 'fa' ? 'Switch to English' : 'تغییر به زبان فارسی'}
            className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          >
            <Globe className="w-4 h-4" />
            <span className="font-mono text-[11px] uppercase font-bold">{language === 'fa' ? 'FA' : 'EN'}</span>
          </button>

          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <div className="relative ms-1" ref={userMenuRef}>
            <button
              onClick={() => setUserDropdownOpen(prev => !prev)}
              className="focus:outline-none ring-2 ring-transparent focus:ring-blue-500 rounded-full transition-all cursor-pointer"
              title={currentUser ? (language === 'fa' ? currentUser.nameFa : currentUser.name) : 'User Profile'}
            >
              <UserAvatar user={currentUser} size="sm" />
            </button>

            {userDropdownOpen && (
              <div className="absolute top-full mt-2 end-0 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-2 z-50 text-xs">
                {currentUser && (
                  <div className="p-2 border-b border-slate-100 dark:border-slate-800/80 mb-1">
                    <div className="flex items-center gap-2.5">
                      <UserAvatar user={currentUser} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          {language === 'fa' ? currentUser.nameFa : currentUser.name}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate font-mono">{currentUser.email}</div>
                        <div className="mt-0.5 text-[10px] uppercase font-semibold text-slate-500">
                          {currentUser.role.replace('_', ' ')} · {siteConfig.timezone}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-0.5 py-1">
                  <button
                    onClick={() => {
                      setActiveAdminTab('personal');
                      setActiveView('jira_admin');
                      setUserDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-start text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors font-medium"
                  >
                    <UserCog className="w-4 h-4 text-emerald-600" />
                    <span>{t.personalSettings}</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveView('users');
                      setUserDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-start text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors font-medium"
                  >
                    <Users className="w-4 h-4 text-blue-600" />
                    <span>{t.userManagement}</span>
                  </button>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-1.5 pb-1">
                  <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    {t.switchUser}
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-0.5">
                    {users
                      .filter(u => u.id !== currentUser?.id)
                      .slice(0, 4)
                      .map(u => (
                        <button
                          key={u.id}
                          onClick={() => {
                            login(u);
                            setUserDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-start hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                        >
                          <UserAvatar user={u} size="sm" />
                          <div className="truncate flex-1">
                            <div className="font-medium truncate text-slate-800 dark:text-slate-200">
                              {language === 'fa' ? u.nameFa : u.name}
                            </div>
                            <div className="text-[10px] text-slate-400 capitalize">{u.role.replace('_', ' ')}</div>
                          </div>
                        </button>
                      ))}
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-1">
                  <button
                    onClick={() => {
                      logout();
                      setUserDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-start text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors font-medium"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{t.logout}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Toast Notification Banner */}
      {toastMessage && (
        <div
          className={`fixed bottom-4 end-4 z-[60] max-w-md px-4 py-3 rounded-xl shadow-xl border flex items-center gap-3 text-xs font-medium ${
            toastMessage.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              : 'bg-emerald-50 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
          }`}
        >
          {toastMessage.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          )}
          <span className="flex-1 leading-snug">{toastMessage.text}</span>
          <button onClick={clearToast} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
};
