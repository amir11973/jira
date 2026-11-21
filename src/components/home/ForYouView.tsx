import React, { useState } from 'react';
import {
  Home,
  Search,
  Star,
  Plus,
  Layers,
  GanttChart,
  FolderKanban,
  ArrowUpRight,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { IssueTypeIcon, PriorityIcon, UserAvatar } from '../common/JiraIcons';

export const ForYouView: React.FC = () => {
  const {
    currentUser,
    projects,
    issues,
    epics,
    users,
    setCurrentProjectId,
    setActiveView,
    setSelectedIssueId,
    toggleStarProject,
    openCreateModal,
    t,
    language,
  } = useJira();

  const [spaceSearch, setSpaceSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'assigned' | 'worked' | 'starred' | 'epics'>('assigned');

  const activeIssues = issues.filter(i => !i.archived);
  const filteredSpaces = projects.filter(
    p =>
      !spaceSearch.trim() ||
      p.name.toLowerCase().includes(spaceSearch.toLowerCase()) ||
      p.nameFa.toLowerCase().includes(spaceSearch.toLowerCase()) ||
      p.key.toLowerCase().includes(spaceSearch.toLowerCase())
  );

  const assignedToMe = activeIssues.filter(i => i.assigneeId === currentUser?.id);
  const workedOn = activeIssues
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10);
  const starredSpaces = projects.filter(p => p.starred);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-6">
      {/* Header & Quick Create Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Home className="w-5 h-5 text-blue-600" />
            <span>{t.forYou}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {language === 'fa'
              ? `خوش آمدید ${currentUser?.nameFa || ''} — دسترسی سریع به فضاها، برنامه‌ریزی‌ها، اپیک‌ها و تسک‌های شما.`
              : `Welcome back, ${currentUser?.name || 'Member'} — quick access to your spaces, plans, epics, and assigned work.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => openCreateModal(undefined, 'epic')}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{t.createEpic}</span>
          </button>
          <button
            onClick={() => openCreateModal(undefined, 'story')}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.createIssue}</span>
          </button>
          <button
            onClick={() => setActiveView('plans')}
            className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-md text-xs font-semibold flex items-center gap-1.5"
          >
            <GanttChart className="w-3.5 h-3.5 text-indigo-600" />
            <span>{t.plansView}</span>
          </button>
        </div>
      </div>

      {/* Recent / Find a Space Grid */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {language === 'fa' ? 'فضاهای کاری شما (Recent Spaces)' : 'Recent spaces'}
            </h2>
            <button
              onClick={() => setActiveView('spaces')}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold ms-2"
            >
              {language === 'fa' ? 'مشاهده همه فضاها →' : 'View all spaces →'}
            </button>
          </div>

          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={spaceSearch}
              onChange={e => setSpaceSearch(e.target.value)}
              placeholder={language === 'fa' ? 'یافتن فضای کاری...' : 'Find a space...'}
              className="w-full ps-8 pe-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {filteredSpaces.map(proj => {
            const projIssues = activeIssues.filter(i => i.projectId === proj.id);
            const openCount = projIssues.filter(i => i.status !== 'done').length;
            const doneCount = projIssues.filter(i => i.status === 'done').length;
            const lead = users.find(u => u.id === proj.leadId);

            return (
              <div
                key={proj.id}
                onClick={() => {
                  setCurrentProjectId(proj.id);
                  setActiveView('board');
                }}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 rounded-xl p-4 cursor-pointer transition-all space-y-3 group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-lg ${proj.avatarColor} text-white font-bold text-xs flex items-center justify-center shrink-0`}
                    >
                      {proj.key.slice(0, 3)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-blue-600">
                        {language === 'fa' ? proj.nameFa : proj.name}
                      </h3>
                      <div className="text-[10px] font-mono text-slate-400 uppercase">
                        {proj.key} · {proj.template || 'scrum'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      toggleStarProject(proj.id);
                    }}
                    className="p-1 text-slate-400 hover:text-amber-500"
                  >
                    <Star className={`w-3.5 h-3.5 ${proj.starred ? 'fill-amber-400 text-amber-500' : ''}`} />
                  </button>
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                  <div className="flex items-center justify-between">
                    <span>{language === 'fa' ? 'تسک‌های باز' : 'My open work items'}</span>
                    <span className="font-mono font-bold tabular-nums text-slate-700 dark:text-slate-200">{openCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{language === 'fa' ? 'تکمیل‌شده' : 'Done items'}</span>
                    <span className="font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{doneCount}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-500 truncate">
                    <UserAvatar user={lead} size="sm" />
                    <span className="truncate">{language === 'fa' ? lead?.nameFa : lead?.name}</span>
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 shrink-0" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs: Assigned to me / Worked on / Starred / All Epics */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-4 overflow-x-auto text-xs font-semibold">
          {[
            { id: 'assigned', label: language === 'fa' ? `محول‌شده به من (${assignedToMe.length})` : `Assigned to me (${assignedToMe.length})` },
            { id: 'worked', label: language === 'fa' ? `کارهای اخیر (${workedOn.length})` : `Worked on (${workedOn.length})` },
            { id: 'epics', label: language === 'fa' ? `اپیک‌های فعال (${epics.length})` : `Active Epics (${epics.length})` },
            { id: 'starred', label: language === 'fa' ? `فضاهای ستاره‌دار (${starredSpaces.length})` : `Starred spaces (${starredSpaces.length})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-2.5 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
          {(activeTab === 'assigned' || activeTab === 'worked') &&
            (activeTab === 'assigned' ? assignedToMe : workedOn).map(iss => {
              const proj = projects.find(p => p.id === iss.projectId);
              return (
                <div
                  key={iss.id}
                  onClick={() => setSelectedIssueId(iss.id)}
                  className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <IssueTypeIcon type={iss.type} className="w-4 h-4 shrink-0" />
                    <span className="font-mono font-semibold text-blue-600 dark:text-blue-400 shrink-0">{iss.key}</span>
                    <span className="truncate font-medium text-slate-800 dark:text-slate-200">{iss.summary}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] text-slate-400 hidden sm:inline">
                      {proj ? (language === 'fa' ? proj.nameFa : proj.name) : ''}
                    </span>
                    <PriorityIcon priority={iss.priority} className="w-3.5 h-3.5" />
                    <span className="font-mono text-[11px] uppercase font-semibold text-slate-500 w-24 text-end">
                      {iss.status}
                    </span>
                  </div>
                </div>
              );
            })}

          {activeTab === 'epics' &&
            epics.map(ep => {
              const proj = projects.find(p => p.id === ep.projectId);
              const children = activeIssues.filter(i => i.epicId === ep.id);
              const done = children.filter(i => i.status === 'done').length;
              return (
                <div
                  key={ep.id}
                  onClick={() => {
                    setCurrentProjectId(ep.projectId);
                    setActiveView('roadmap');
                  }}
                  className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="w-3 h-3 rounded-xs shrink-0" style={{ backgroundColor: ep.color }} />
                    <span className="font-mono font-semibold text-purple-600 dark:text-purple-400 shrink-0">{ep.key}</span>
                    <span className="truncate font-semibold text-slate-800 dark:text-slate-200">
                      {language === 'fa' ? ep.nameFa : ep.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 font-mono text-[11px] tabular-nums text-slate-500">
                    <span>{proj?.key}</span>
                    <span>
                      {done}/{children.length} done
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {ep.dueDate}
                    </span>
                  </div>
                </div>
              );
            })}

          {activeTab === 'starred' &&
            starredSpaces.map(sp => (
              <div
                key={sp.id}
                onClick={() => {
                  setCurrentProjectId(sp.id);
                  setActiveView('board');
                }}
                className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span className={`w-6 h-6 rounded ${sp.avatarColor} text-white font-bold text-[10px] flex items-center justify-center`}>
                    {sp.key.slice(0, 2)}
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {language === 'fa' ? sp.nameFa : sp.name}
                  </span>
                  <span className="font-mono text-slate-400">{sp.key}</span>
                </div>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
