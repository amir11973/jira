import React, { useState } from 'react';
import {
  GanttChart,
  ChevronDown,
  ChevronRight,
  Plus,
  Layers,
  Link2,
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { IssueTypeIcon, PriorityIcon, UserAvatar } from '../common/JiraIcons';

export const PlansView: React.FC = () => {
  const {
    projects,
    epics,
    issues,
    users,
    plans,
    activePlanId,
    setActivePlanId,
    setActiveQuickModal,
    setCurrentProjectId,
    setSelectedIssueId,
    openCreateModal,
    t,
    language,
  } = useJira();

  const activePlan = plans.find(p => p.id === activePlanId) || null;
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedEpics, setExpandedEpics] = useState<Record<string, boolean>>({
    'epic-1': true,
    'epic-2': true,
    'epic-3': true,
    'epic-mob-1': true,
    'epic-sam-1': true,
  });

  const timelineMonths = [
    { key: 'oct26', label: 'Oct 2026', labelFa: 'مهر' },
    { key: 'nov26', label: 'Nov 2026', labelFa: 'آبان' },
    { key: 'dec26', label: 'Dec 2026', labelFa: 'آذر' },
    { key: 'jan27', label: 'Jan 2027', labelFa: 'دی' },
    { key: 'feb27', label: 'Feb 2027', labelFa: 'بهمن' },
    { key: 'mar27', label: 'Mar 2027', labelFa: 'اسفند' },
  ];

  const timelineStart = new Date('2026-10-01T00:00:00Z').getTime();
  const timelineEnd = new Date('2027-03-31T23:59:59Z').getTime();
  const totalDuration = timelineEnd - timelineStart;

  const getBarPos = (startStr: string, endStr: string) => {
    const start = new Date(startStr).getTime();
    const end = new Date(endStr).getTime();
    const clampedStart = Math.max(timelineStart, Math.min(timelineEnd, start));
    const clampedEnd = Math.max(clampedStart + 86400000 * 4, Math.min(timelineEnd, end));
    const leftPercent = ((clampedStart - timelineStart) / totalDuration) * 100;
    const widthPercent = Math.max(4, ((clampedEnd - clampedStart) / totalDuration) * 100);
    return { leftPercent, widthPercent: Math.min(100 - leftPercent, widthPercent) };
  };

  const activeIssues = issues.filter(i => !i.archived);
  const inPlanScope = (projectId: string) => {
    if (selectedSpaceId !== 'all') return projectId === selectedSpaceId;
    if (activePlan && activePlan.spaceIds.length > 0) return activePlan.spaceIds.includes(projectId);
    return true;
  };

  const visibleEpics = epics.filter(ep => {
    if (!inPlanScope(ep.projectId)) return false;
    if (statusFilter !== 'all' && ep.status !== statusFilter) return false;
    return true;
  });

  const orphanItems = activeIssues.filter(i => {
    if (!inPlanScope(i.projectId)) return false;
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    return !i.epicId;
  });

  const totalPoints = activeIssues
    .filter(i => inPlanScope(i.projectId))
    .reduce((acc, i) => acc + (i.storyPoints || 0), 0);
  const donePoints = activeIssues
    .filter(i => inPlanScope(i.projectId) && i.status === 'done')
    .reduce((acc, i) => acc + (i.storyPoints || 0), 0);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/50 dark:bg-slate-950">
      {/* Top Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <GanttChart className="w-5 h-5 text-indigo-600" />
            <span>{activePlan ? activePlan.name : t.plansView}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {activePlan?.description ||
              (language === 'fa'
                ? 'برنامه‌ریزی کلان چندپروژه‌ای: اپیک‌ها، استوری‌ها، وابستگی‌ها و تخمین امتیاز در تمام فضاها.'
                : 'Cross-space portfolio planning rolling up Epics, Features, Stories, dependencies, and capacity across all spaces.')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={activePlanId || ''}
            onChange={e => setActivePlanId(e.target.value || null)}
            className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md font-medium"
          >
            <option value="">{language === 'fa' ? 'همه برنامه‌ها (All Plans)' : 'All Plans'}</option>
            {plans.map(pl => (
              <option key={pl.id} value={pl.id}>
                {pl.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setActiveQuickModal('create_plan')}
            className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md font-semibold flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{language === 'fa' ? 'برنامه جدید' : 'Create plan'}</span>
          </button>

          <select
            value={selectedSpaceId}
            onChange={e => setSelectedSpaceId(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md font-medium"
          >
            <option value="all">{language === 'fa' ? 'همه فضاهای کاری' : 'All Spaces (Portfolio)'}</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.key} — {language === 'fa' ? p.nameFa : p.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md font-medium"
          >
            <option value="all">{language === 'fa' ? 'همه وضعیت‌ها' : 'All Statuses'}</option>
            <option value="todo">To Do</option>
            <option value="inprogress">In Progress</option>
            <option value="done">Done</option>
          </select>

          <div className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-md font-mono tabular-nums text-[11px] font-semibold">
            {donePoints}/{totalPoints} {t.pointsCount}
          </div>

          <button
            onClick={() => {
              if (selectedSpaceId !== 'all') setCurrentProjectId(selectedSpaceId);
              openCreateModal(null, 'epic');
            }}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-md font-semibold flex items-center gap-1"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>+ {t.epicType}</span>
          </button>

          <button
            onClick={() => {
              if (selectedSpaceId !== 'all') setCurrentProjectId(selectedSpaceId);
              openCreateModal(null, 'story');
            }}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ {t.storyType}</span>
          </button>
        </div>
      </div>

      {/* Hierarchical Portfolio Table + Timeline */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-[1120px] flex flex-col">
          {/* Header Row */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-20 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <div className="w-[460px] p-3 border-e border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-between">
              <span>{language === 'fa' ? 'سلسله‌مراتب (فضا / اپیک / استوری)' : 'SCOPE (SPACE / EPIC / STORY)'}</span>
              <span className="font-mono">{visibleEpics.length} Epics</span>
            </div>
            <div className="w-24 p-3 border-e border-slate-200 dark:border-slate-800 shrink-0 text-center">
              {t.status}
            </div>
            <div className="w-24 p-3 border-e border-slate-200 dark:border-slate-800 shrink-0 text-center">
              {t.assignee}
            </div>
            <div dir="ltr" className="flex-1 grid grid-cols-6 divide-x divide-slate-200 dark:divide-slate-800">
              {timelineMonths.map(m => (
                <div key={m.key} className="p-3 text-center">
                  {language === 'fa' ? m.labelFa : m.label}
                </div>
              ))}
            </div>
          </div>

          {/* Epic Rows + Child Stories/Tasks/Bugs */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {visibleEpics.map(ep => {
              const proj = projects.find(p => p.id === ep.projectId);
              const children = activeIssues.filter(i => i.epicId === ep.id);
              const doneCount = children.filter(i => i.status === 'done').length;
              const pct = children.length > 0 ? Math.round((doneCount / children.length) * 100) : ep.status === 'done' ? 100 : 0;
              const expanded = expandedEpics[ep.id] ?? true;
              const { leftPercent, widthPercent } = getBarPos(ep.startDate, ep.dueDate);

              return (
                <div key={ep.id}>
                  {/* Epic Portfolio Row */}
                  <div className="flex items-stretch bg-white/80 dark:bg-slate-900/60 hover:bg-slate-100/70 dark:hover:bg-slate-900 transition-colors">
                    <div className="w-[460px] p-2.5 border-e border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          onClick={() => setExpandedEpics(prev => ({ ...prev, [ep.id]: !expanded }))}
                          className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        >
                          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                        <IssueTypeIcon type="epic" className="w-4 h-4 shrink-0" />
                        <span className="font-mono text-[11px] font-bold text-slate-500 shrink-0">{ep.key}</span>
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {language === 'fa' ? ep.nameFa : ep.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[10px] text-slate-400">{proj?.key}</span>
                        <span className="font-mono text-[10px] font-bold tabular-nums text-slate-600 dark:text-slate-300">
                          {pct}%
                        </span>
                      </div>
                    </div>

                    <div className="w-24 p-2.5 border-e border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-center">
                      <span className="font-mono text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300">
                        {ep.status}
                      </span>
                    </div>

                    <div className="w-24 p-2.5 border-e border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-center text-[10px] font-mono text-slate-400">
                      {children.length} {t.issuesCount}
                    </div>

                    <div dir="ltr" className="flex-1 relative min-h-[44px] flex items-center">
                      <div className="absolute inset-0 grid grid-cols-6 divide-x divide-slate-100 dark:divide-slate-800/40 pointer-events-none" />
                      <div
                        className="absolute h-6 rounded-md flex items-center px-2.5 text-white text-[10px] font-mono font-bold shadow-xs overflow-hidden"
                        style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, backgroundColor: ep.color }}
                      >
                        <div className="absolute inset-y-0 start-0 bg-black/20" style={{ width: `${pct}%` }} />
                        <span className="relative z-10 truncate">
                          {ep.startDate} → {ep.dueDate}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Child Stories / Features / Tasks / Bugs */}
                  {expanded &&
                    children.map((ch, idx) => {
                      const assignee = users.find(u => u.id === ch.assigneeId);
                      const childLeft =
                        ch.startDate && ch.dueDate
                          ? getBarPos(ch.startDate, ch.dueDate).leftPercent
                          : Math.min(88, leftPercent + idx * 4);
                      const childWidth =
                        ch.startDate && ch.dueDate ? getBarPos(ch.startDate, ch.dueDate).widthPercent : 11;

                      return (
                        <div
                          key={ch.id}
                          onClick={() => setSelectedIssueId(ch.id)}
                          className="flex items-stretch bg-white dark:bg-slate-950 hover:bg-blue-50/40 dark:hover:bg-slate-900/70 cursor-pointer border-t border-slate-100 dark:border-slate-800/60 text-xs"
                        >
                          <div className="w-[460px] ps-9 pe-3 py-2 border-e border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <IssueTypeIcon type={ch.type} className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-mono font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                                {ch.key}
                              </span>
                              <span className="truncate text-slate-700 dark:text-slate-300 font-medium">
                                {ch.summary}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {ch.links.length > 0 && (
                                <span title={`${ch.links.length} dependencies`} className="text-amber-600 flex items-center gap-0.5 font-mono text-[10px]">
                                  <Link2 className="w-3 h-3" />
                                  {ch.links.length}
                                </span>
                              )}
                              <PriorityIcon priority={ch.priority} className="w-3 h-3" />
                            </div>
                          </div>

                          <div className="w-24 p-2 border-e border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-center font-mono text-[10px] uppercase text-slate-500">
                            {ch.status}
                          </div>

                          <div className="w-24 p-2 border-e border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-center">
                            <UserAvatar user={assignee} size="sm" />
                          </div>

                          <div dir="ltr" className="flex-1 relative min-h-[36px] flex items-center">
                            <div className="absolute inset-0 grid grid-cols-6 divide-x divide-slate-100 dark:divide-slate-800/40 pointer-events-none" />
                            <div
                              className={`absolute h-4 rounded px-2 text-[10px] font-mono flex items-center truncate border ${
                                ch.status === 'done'
                                  ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                                  : ch.status === 'inprogress'
                                  ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                                  : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                              }`}
                              style={{ left: `${childLeft}%`, width: `${childWidth}%`, minWidth: '58px' }}
                            >
                              {ch.key}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              );
            })}

            {/* Unassigned / Standalone Work Items without Epic */}
            {orphanItems.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-slate-100/70 dark:bg-slate-900 text-[11px] font-bold uppercase text-slate-500">
                  {language === 'fa' ? 'تسک‌های بدون اپیک (Standalone Work Items)' : 'Items without parent Epic'} ({orphanItems.length})
                </div>
                {orphanItems.map(ch => {
                  const assignee = users.find(u => u.id === ch.assigneeId);
                  return (
                    <div
                      key={ch.id}
                      onClick={() => setSelectedIssueId(ch.id)}
                      className="flex items-stretch bg-white dark:bg-slate-950 hover:bg-blue-50/40 dark:hover:bg-slate-900/70 cursor-pointer border-t border-slate-100 dark:border-slate-800/60 text-xs"
                    >
                      <div className="w-[460px] ps-6 pe-3 py-2 border-e border-slate-200 dark:border-slate-800 shrink-0 flex items-center gap-2">
                        <IssueTypeIcon type={ch.type} className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-mono font-semibold text-blue-600 dark:text-blue-400 shrink-0">{ch.key}</span>
                        <span className="truncate text-slate-700 dark:text-slate-300 font-medium">{ch.summary}</span>
                      </div>
                      <div className="w-24 p-2 border-e border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-center font-mono text-[10px] uppercase text-slate-500">
                        {ch.status}
                      </div>
                      <div className="w-24 p-2 border-e border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-center">
                        <UserAvatar user={assignee} size="sm" />
                      </div>
                      <div className="flex-1 px-4 py-2 text-[11px] font-mono text-slate-400">
                        {ch.dueDate ? `Due ${ch.dueDate}` : 'Unscheduled'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
