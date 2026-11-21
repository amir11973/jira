import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Search,
  Moon,
  Sun,
  Globe,
  ChevronDown,
  Check,
  Layers,
  LogOut,
  Users,
  X,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { UserAvatar } from '../common/JiraIcons';

export const Header: React.FC = () => {
  const {
    t,
    language,
    toggleLanguage,
    theme,
    toggleTheme,
    projects,
    currentProject,
    setCurrentProjectId,
    createProject,
    openCreateModal,
    currentUser,
    users,
    login,
    logout,
    setActiveView,
    searchQuery,
    setSearchQuery,
    toastMessage,
    clearToast,
  } = useJira();

  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [isCreateSpaceOpen, setIsCreateSpaceOpen] = useState(false);

  const [spaceKey, setSpaceKey] = useState('');
  const [spaceName, setSpaceName] = useState('');
  const [spaceNameFa, setSpaceNameFa] = useState('');
  const [spaceCategory, setSpaceCategory] = useState('Software Engineering');
  const [spaceTemplate, setSpaceTemplate] = useState<'scrum' | 'kanban' | 'business' | 'work_requests'>('scrum');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProjectDropdownOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateSpaceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!spaceKey.trim() || !spaceName.trim()) return;
    createProject({
      key: spaceKey.trim(),
      name: spaceName.trim(),
      nameFa: spaceNameFa.trim() || spaceName.trim(),
      description: `${spaceTemplate.toUpperCase()} space created for ${spaceName.trim()}.`,
      category: spaceCategory,
      template: spaceTemplate,
      avatarColor: spaceTemplate === 'kanban' ? 'bg-emerald-600' : spaceTemplate === 'business' ? 'bg-purple-600' : 'bg-blue-600',
    });
    setSpaceKey('');
    setSpaceName('');
    setSpaceNameFa('');
    setIsCreateSpaceOpen(false);
  };

  return (
    <>
      <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 flex items-center justify-between gap-4 sticky top-0 z-30 select-none">
        {/* Zone 1: Brand & Space Switcher */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
              {t.appName}
            </span>
          </div>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setProjectDropdownOpen(prev => !prev)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors"
            >
              <span className={`w-2.5 h-2.5 rounded-xs ${currentProject.avatarColor}`}></span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {language === 'fa' ? currentProject.nameFa : currentProject.name}
              </span>
              <span className="text-xs text-slate-400 font-mono tabular-nums">({currentProject.key})</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {projectDropdownOpen && (
              <div className="absolute top-full mt-1.5 start-0 w-76 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl p-1 z-50">
                <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  {t.projects}
                </div>
                {projects.map(proj => {
                  const isSelected = proj.id === currentProject.id;
                  return (
                    <button
                      key={proj.id}
                      onClick={() => {
                        setCurrentProjectId(proj.id);
                        setProjectDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-md text-start text-xs transition-colors ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className={`w-3 h-3 rounded-xs shrink-0 ${proj.avatarColor}`}></span>
                        <div className="truncate">
                          <div className="font-medium truncate">
                            {language === 'fa' ? proj.nameFa : proj.name}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {proj.key} · {proj.template || 'scrum'} · {proj.category}
                          </div>
                        </div>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                    </button>
                  );
                })}

                <div className="border-t border-slate-100 dark:border-slate-800 mt-1 pt-1">
                  <button
                    onClick={() => {
                      setProjectDropdownOpen(false);
                      setIsCreateSpaceOpen(true);
                    }}
                    className="w-full flex items-center gap-2 p-2 rounded-md text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t.createSpace}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Zone 2: Global Search Bar */}
        <div className="flex-1 max-w-md mx-2 hidden sm:block">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full h-8 ps-9 pe-10 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200/70 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 border border-transparent focus:border-blue-500 rounded-md text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none transition-all"
            />
            <kbd className="absolute end-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded">
              /
            </kbd>
          </div>
        </div>

        {/* Zone 3: Actions & Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => openCreateModal()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold shadow-xs transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>{t.createIssue}</span>
          </button>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />

          <button
            onClick={toggleLanguage}
            title={language === 'fa' ? 'Switch to English' : 'تغییر به زبان فارسی'}
            className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
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
                          {currentUser.role.replace('_', ' ')}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-0.5 py-1">
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

      {/* Create Space Modal */}
      {isCreateSpaceOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateSpaceSubmit}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t.createSpace}</h3>
              <button type="button" onClick={() => setIsCreateSpaceOpen(false)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold mb-1">{t.projectKey} *</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={spaceKey}
                  onChange={e => setSpaceKey(e.target.value.toUpperCase())}
                  placeholder="OPS"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono uppercase"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold mb-1">{t.projectName} (EN) *</label>
                <input
                  type="text"
                  required
                  value={spaceName}
                  onChange={e => setSpaceName(e.target.value)}
                  placeholder="Platform Operations"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">{t.projectName} (FA)</label>
                <input
                  type="text"
                  value={spaceNameFa}
                  onChange={e => setSpaceNameFa(e.target.value)}
                  placeholder="عملیات پلتفرم"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">{t.spaceTemplate}</label>
                <select
                  value={spaceTemplate}
                  onChange={e => setSpaceTemplate(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  <option value="scrum">Scrum (Sprints + Backlog)</option>
                  <option value="kanban">Kanban (Continuous Flow)</option>
                  <option value="business">Business Project</option>
                  <option value="work_requests">Work Requests & Forms</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1">{language === 'fa' ? 'دسته‌بندی' : 'Category'}</label>
              <input
                type="text"
                value={spaceCategory}
                onChange={e => setSpaceCategory(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onClick={() => setIsCreateSpaceOpen(false)} className="px-3 py-1.5 text-slate-500">
                {t.cancel}
              </button>
              <button type="submit" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md">
                {t.createSpace}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};
