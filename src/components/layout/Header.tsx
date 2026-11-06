import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, Search, Moon, Sun, Globe, ChevronDown, Check, Layers
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { UserAvatar } from '../common/JiraIcons';

export const Header: React.FC = () => {
  const { 
    t, language, toggleLanguage, theme, toggleTheme, 
    projects, currentProject, setCurrentProjectId, 
    openCreateModal, currentUser, searchQuery, setSearchQuery
  } = useJira();

  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Shortcut key '/' to focus search
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

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProjectDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 flex items-center justify-between gap-4 sticky top-0 z-30 select-none">
      {/* Zone 1: Brand & Project Switcher */}
      <div className="flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
            <Layers className="w-5 h-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            {t.appName}
          </span>
        </div>

        {/* Project Switcher Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setProjectDropdownOpen(prev => !prev)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors"
          >
            <span className={`w-2.5 h-2.5 rounded-xs ${currentProject.avatarColor}`}></span>
            <span className="font-semibold text-slate-900 dark:text-white">{currentProject.name}</span>
            <span className="text-xs text-slate-400 font-mono tabular-nums">({currentProject.key})</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {projectDropdownOpen && (
            <div className="absolute top-full mt-1.5 start-0 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl p-1 z-50">
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
                      isSelected ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className={`w-3 h-3 rounded-xs shrink-0 ${proj.avatarColor}`}></span>
                      <div className="truncate">
                        <div className="font-medium truncate">{language === 'fa' ? proj.nameFa : proj.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{proj.key} · {proj.category}</div>
                      </div>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                  </button>
                );
              })}
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
            onChange={(e) => setSearchQuery(e.target.value)}
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
        {/* Create Issue Primary CTA */}
        <button
          onClick={() => openCreateModal()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold shadow-xs transition-colors whitespace-nowrap active:scale-98"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>{t.createIssue}</span>
        </button>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />

        {/* Language Switcher */}
        <button
          onClick={toggleLanguage}
          title={language === 'fa' ? 'Switch to English' : 'تغییر به زبان فارسی'}
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
        >
          <Globe className="w-4 h-4" />
          <span className="font-mono text-[11px] uppercase font-bold">{language === 'fa' ? 'FA' : 'EN'}</span>
        </button>

        {/* Dark Mode Switcher */}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Current User Profile Avatar */}
        <div className="ms-1">
          <UserAvatar user={currentUser} size="sm" />
        </div>
      </div>
    </header>
  );
};
