import React from 'react';
import {
  CheckCircle2,
  Edit3,
  PlusCircle,
  CalendarClock,
  Flag,
  Activity,
  BarChart3,
  Layers,
  ShieldAlert,
  Wallet,
  Milestone,
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { formatLocalizedDateOnly } from '../../utils/jalaliDate';
import { formatLocalizedNumber } from '../../utils/i18n';
import { IssueTypeIcon, PriorityIcon, UserAvatar } from '../common/JiraIcons';
import { useReport } from '../../services/reports';
import type { GoalsReport } from '../../services/reports';

export const SummaryView: React.FC = () => {
  const {
    currentProject,
    issues,
    statuses,
    users,
    risks,
    milestones,
    updateRiskStatus,
    updateMilestoneStatus,
    setSelectedIssueId,
    setActiveView,
    language,
    t,
  } = useJira();

  const projectRisks = risks.filter(r => r.projectId === currentProject.id);
  const projectMilestones = milestones.filter(m => m.projectId === currentProject.id);
  const { data: planning } = useReport<GoalsReport>(`/api/planning/goals?projectId=${encodeURIComponent(currentProject.id)}`, 'planning');
  const milestoneViews = new Map((planning?.milestones || []).map(m => [m.id, m] as const));

  const projectIssues = issues.filter(i => i.projectId === currentProject.id && !i.archived);

  // 7-day KPI calculations (using current reference window + relative checks so demo data is informative)
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const completedCount = projectIssues.filter(i => i.status === 'done').length;
  const updatedCount = projectIssues.filter(i => now - new Date(i.updatedAt).getTime() <= sevenDaysMs || i.history?.length).length;
  const createdCount = projectIssues.length;
  const dueSoonCount = projectIssues.filter(i => i.dueDate && i.status !== 'done').length;
  const flaggedCount = projectIssues.filter(i => i.flagged).length;

  // Status Overview Donut Data
  const total = projectIssues.length || 1;
  const statusPalette: Record<string, string> = {
    todo: '#94a3b8',
    inprogress: '#3b82f6',
    review: '#8b5cf6',
    done: '#10b981',
  };

  let cumulativePercent = 0;
  const donutSegments = statuses.map((st, idx) => {
    const count = projectIssues.filter(i => i.status === st.id).length;
    const pct = (count / total) * 100;
    const offset = cumulativePercent;
    cumulativePercent += pct;
    const fallbackColors = ['#64748b', '#2563eb', '#9333ea', '#059669', '#f59e0b'];
    return {
      status: st,
      count,
      pct,
      offset,
      strokeColor: statusPalette[st.id] || fallbackColors[idx % fallbackColors.length],
    };
  });

  // Priority distribution
  const priorityOrder: ('highest' | 'high' | 'medium' | 'low' | 'lowest')[] = [
    'highest',
    'high',
    'medium',
    'low',
    'lowest',
  ];
  const priorityColors: Record<string, string> = {
    highest: 'bg-rose-500',
    high: 'bg-orange-500',
    medium: 'bg-amber-400',
    low: 'bg-emerald-500',
    lowest: 'bg-sky-500',
  };

  // Work Type distribution
  const workTypes: ('epic' | 'feature' | 'story' | 'task' | 'bug')[] = [
    'story',
    'feature',
    'task',
    'bug',
    'epic',
  ];

  // Recent Activity stream across project issues
  const recentActivities = projectIssues
    .flatMap(issue => {
      const histItems = (issue.history || []).map(h => ({
        id: h.id,
        issueId: issue.id,
        issueKey: issue.key,
        authorId: h.authorId,
        text:
          language === 'fa'
            ? `تغییر ${h.field} از "${h.fromValue || '—'}" به "${h.toValue}"`
            : `Updated ${h.field} from "${h.fromValue || '—'}" to "${h.toValue}"`,
        createdAt: h.createdAt,
      }));
      const commentItems = issue.comments.map(c => ({
        id: c.id,
        issueId: issue.id,
        issueKey: issue.key,
        authorId: c.authorId,
        text: c.content,
        createdAt: c.createdAt,
      }));
      return [...histItems, ...commentItems];
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-6">
      {/* Space Summary Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>{language === 'fa' ? currentProject.nameFa : currentProject.name}</span>
            <span className="font-mono text-xs text-slate-400">({currentProject.key})</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {language === 'fa'
              ? 'نمای خلاصه وضعیت فضا، شاخص‌های هفت روز اخیر و توزیع کارها.'
              : 'Space health overview, 7-day activity metrics, and work breakdown.'}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setActiveView('board')}
            className="px-3 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition-colors"
          >
            {t.board}
          </button>
          <button
            onClick={() => setActiveView('list')}
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors"
          >
            {t.listView}
          </button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {completedCount}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {language === 'fa' ? 'تکمیل شده' : 'Completed'}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Edit3 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {updatedCount}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {language === 'fa' ? 'به‌روز شده (۷ روز)' : 'Updated (7d)'}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <PlusCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {createdCount}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {language === 'fa' ? 'کل تسک‌های فضا' : 'Total created'}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {dueSoonCount}
              {flaggedCount > 0 && (
                <span className="text-xs text-rose-600 dark:text-rose-400 ms-2 inline-flex items-center gap-0.5">
                  <Flag className="w-3 h-3" /> {flaggedCount}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {language === 'fa' ? 'دارای سررسید / مانع' : 'Due soon / Flagged'}
            </div>
          </div>
        </div>
      </div>

      {/* Middle Grid: Status Donut + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Status Overview Donut */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {language === 'fa' ? 'نمای کلی وضعیت‌ها (Status Overview)' : 'Status Overview'}
            </h3>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              {projectIssues.length} {t.issuesCount}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6 py-2">
            <div className="relative w-36 h-36 shrink-0">
              <svg viewBox="0 0 36 36" className="w-36 h-36 -rotate-90">
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="transparent"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  className="text-slate-100 dark:text-slate-800"
                />
                {donutSegments.map(seg =>
                  seg.pct > 0 ? (
                    <circle
                      key={seg.status.id}
                      cx="18"
                      cy="18"
                      r="15.915"
                      fill="transparent"
                      stroke={seg.strokeColor}
                      strokeWidth="3.8"
                      strokeDasharray={`${seg.pct} ${100 - seg.pct}`}
                      strokeDashoffset={-seg.offset}
                    />
                  ) : null
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {projectIssues.length}
                </span>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">
                  {language === 'fa' ? 'کل' : 'Total'}
                </span>
              </div>
            </div>

            <div className="flex-1 w-full space-y-2 text-xs">
              {donutSegments.map(seg => (
                <div key={seg.status.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                      style={{ backgroundColor: seg.strokeColor }}
                    />
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {language === 'fa' ? seg.status.nameFa : seg.status.name}
                    </span>
                  </div>
                  <span className="font-mono tabular-nums text-slate-500 font-semibold">
                    {seg.count} ({Math.round(seg.pct)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              <span>{language === 'fa' ? 'فعالیت‌های اخیر فضا' : 'Recent Activity'}</span>
            </h3>
          </div>

          <div className="space-y-2.5 max-h-64 overflow-y-auto pe-1">
            {recentActivities.length === 0 ? (
              <div className="text-xs text-slate-400 italic py-6 text-center">
                {language === 'fa' ? 'فعالیتی ثبت نشده است.' : 'No recent activity recorded.'}
              </div>
            ) : (
              recentActivities.map(act => {
                const actor = users.find(u => u.id === act.authorId);
                return (
                  <div
                    key={act.id}
                    onClick={() => setSelectedIssueId(act.issueId)}
                    className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors text-xs"
                  >
                    <UserAvatar user={actor} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {actor ? (language === 'fa' ? actor.nameFa : actor.name) : 'System'}
                        </span>
                        <span className="font-mono text-[11px] font-bold text-blue-600 dark:text-blue-400">
                          {act.issueKey}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 truncate mt-0.5">
                        {act.text}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {new Date(act.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Bottom Grid: Priority Breakdown + Types of Work */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-amber-500" />
            <span>{t.priorityBreakdown}</span>
          </h3>
          <div className="space-y-3 text-xs">
            {priorityOrder.map(prio => {
              const count = projectIssues.filter(i => i.priority === prio).length;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={prio} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PriorityIcon priority={prio} className="w-3.5 h-3.5" />
                      <span className="font-medium text-slate-700 dark:text-slate-300 capitalize">
                        {t[prio]}
                      </span>
                    </div>
                    <span className="font-mono text-slate-500 tabular-nums">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${priorityColors[prio]} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-500" />
            <span>{t.typeBreakdown}</span>
          </h3>
          <div className="space-y-3 text-xs">
            {workTypes.map(wt => {
              const count = projectIssues.filter(i => i.type === wt).length;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={wt} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IssueTypeIcon type={wt} className="w-3.5 h-3.5" />
                      <span className="font-medium text-slate-700 dark:text-slate-300 capitalize">
                        {wt}
                      </span>
                    </div>
                    <span className="font-mono text-slate-500 tabular-nums">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Budget, Risks & Milestones Governance Strip (populated via Excel/Integration Center) */}
      {(currentProject.budgetAllocated || projectRisks.length > 0 || projectMilestones.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Project Budget Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-600" />
              <span>{language === 'fa' ? 'بودجه و هزینه‌کرد فضا' : 'Project Budget'}</span>
            </h3>
            {currentProject.budgetAllocated ? (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">{language === 'fa' ? 'بودجه مصوب' : 'Allocated'}</span>
                  <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                    {formatLocalizedNumber(currentProject.budgetAllocated.toLocaleString(), language)}{' '}
                    {currentProject.currency || 'USD'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{language === 'fa' ? 'مصرف‌شده' : 'Spent'}</span>
                  <span className="font-mono font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                    {formatLocalizedNumber((currentProject.budgetSpent || 0).toLocaleString(), language)}{' '}
                    {currentProject.currency || 'USD'}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(((currentProject.budgetSpent || 0) / currentProject.budgetAllocated) * 100)
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                {language === 'fa' ? 'بودجه‌ای وارد نشده است.' : 'No budget allocated yet.'}
              </p>
            )}
          </div>

          {/* Risks Register */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-500" />
                <span>{language === 'fa' ? 'فهرست ریسک‌ها' : 'Risks Register'}</span>
              </span>
              <span className="font-mono text-xs text-slate-400 tabular-nums">
                {formatLocalizedNumber(projectRisks.length, language)}
              </span>
            </h3>
            <div className="space-y-2 max-h-44 overflow-y-auto text-xs">
              {projectRisks.length === 0 ? (
                <p className="text-slate-400">{language === 'fa' ? 'ریسکی ثبت نشده است.' : 'No risks registered.'}</p>
              ) : (
                projectRisks.map(r => (
                  <div key={r.id} className="p-2 rounded border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        <span className="font-mono text-rose-600 me-1">{r.key}</span>
                        {language === 'fa' ? r.titleFa : r.title}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {r.probability}/{r.impact} · {r.category}
                      </div>
                    </div>
                    <select
                      value={r.status}
                      onChange={e => updateRiskStatus(r.id, e.target.value as typeof r.status)}
                      className="px-1.5 py-0.5 text-[10px] rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    >
                      <option value="open">open</option>
                      <option value="mitigating">mitigating</option>
                      <option value="closed">closed</option>
                    </select>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Milestones */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Milestone className="w-4 h-4 text-blue-600" />
                <span>{language === 'fa' ? 'نقاط عطف (Milestones)' : 'Milestones'}</span>
              </span>
              <span className="font-mono text-xs text-slate-400 tabular-nums">
                {formatLocalizedNumber(projectMilestones.length, language)}
              </span>
            </h3>
            <div className="space-y-2 max-h-44 overflow-y-auto text-xs">
              {projectMilestones.length === 0 ? (
                <p className="text-slate-400">{language === 'fa' ? 'نقطه عطفی ثبت نشده است.' : 'No milestones imported.'}</p>
              ) : (
                projectMilestones.map(m => (
                  <div key={m.id} className="p-2 rounded border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {language === 'fa' ? m.titleFa : m.title}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5">
                        <span>{formatLocalizedDateOnly(m.dueDate, language)}</span>
                        {milestoneViews.get(m.id) && (
                          <>
                            <span>· {milestoneViews.get(m.id)!.progress.percent}%</span>
                            {milestoneViews.get(m.id)!.overdue && (
                              <span className="text-rose-600 font-semibold">{language === 'fa' ? 'عقب‌افتاده' : 'overdue'}</span>
                            )}
                            {milestoneViews.get(m.id)!.health === 'blocked' && (
                              <span className="text-purple-600 font-semibold">{language === 'fa' ? 'مسدود' : 'blocked'}</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <select
                      value={m.status}
                      onChange={e => updateMilestoneStatus(m.id, e.target.value as typeof m.status)}
                      className="px-1.5 py-0.5 text-[10px] rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    >
                      {(['planned', 'upcoming', 'on_track', 'at_risk', 'achieved', 'completed'] as const).map(s => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
