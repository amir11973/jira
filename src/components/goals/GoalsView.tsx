import React, { useState } from 'react';
import { Target, Plus, Pencil, Trash2, Link2, Flag, AlertTriangle, CheckCircle2, Lock, Clock, Loader2 } from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { UserAvatar } from '../common/JiraIcons';
import { useReport } from '../../services/reports';
import type { GoalsReport, GoalView, Health, MilestoneView, Progress } from '../../services/reports';
import type { GoalItem, MilestoneItem } from '../../types/jira';

const HEALTH: Record<Health, { en: string; fa: string; cls: string; bar: string }> = {
  completed: { en: 'Completed', fa: 'تکمیل شده', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', bar: 'bg-emerald-500' },
  on_track: { en: 'On track', fa: 'مطابق برنامه', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300', bar: 'bg-blue-500' },
  at_risk: { en: 'At risk', fa: 'در معرض ریسک', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300', bar: 'bg-amber-500' },
  overdue: { en: 'Overdue', fa: 'عقب‌افتاده', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300', bar: 'bg-rose-500' },
  blocked: { en: 'Blocked', fa: 'مسدود', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300', bar: 'bg-purple-500' },
  not_started: { en: 'Not started', fa: 'شروع نشده', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', bar: 'bg-slate-400' },
};

const input = 'w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-xs';

function progressText(p: Progress, fa: boolean): string {
  if (p.basis === 'manual') return fa ? 'برآورد دستی' : 'manual estimate';
  if (p.basis === 'points') return `${p.donePoints} / ${p.totalPoints} ${fa ? 'امتیاز' : 'pts'}`;
  if (p.basis === 'count') return `${p.done} / ${p.total} ${fa ? 'تسک' : 'items'}`;
  return fa ? 'کاری متصل نیست' : 'no linked work';
}

function dueText(daysRemaining: number | null, fa: boolean): string | null {
  if (daysRemaining === null) return null;
  if (daysRemaining < 0) return fa ? `${-daysRemaining} روز عقب‌افتاده` : `${-daysRemaining} day(s) overdue`;
  if (daysRemaining === 0) return fa ? 'امروز' : 'due today';
  return fa ? `${daysRemaining} روز مانده` : `${daysRemaining} day(s) left`;
}

const Badge: React.FC<{ health: Health; fa: boolean }> = ({ health, fa }) => (
  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${HEALTH[health].cls}`}>{fa ? HEALTH[health].fa : HEALTH[health].en}</span>
);

const ProgressBar: React.FC<{ progress: Progress; health: Health; fa: boolean }> = ({ progress, health, fa }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-[11px] font-mono tabular-nums">
      <span className="text-slate-500">{progressText(progress, fa)}</span>
      <span className="font-bold text-slate-800 dark:text-slate-200">{progress.percent}%</span>
    </div>
    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${HEALTH[health].bar}`} style={{ width: `${Math.min(100, progress.percent)}%` }} />
    </div>
  </div>
);

/** Checkbox list used to pick several linked records. */
const MultiPick: React.FC<{
  label: string;
  options: Array<{ id: string; label: string }>;
  value: string[];
  onChange: (v: string[]) => void;
  empty: string;
}> = ({ label, options, value, onChange, empty }) => (
  <div>
    <label className="block font-semibold mb-1">{label}</label>
    <div className="max-h-28 overflow-y-auto border border-slate-300 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-800 p-1.5 space-y-1">
      {options.length === 0 && <div className="text-slate-400 px-1">{empty}</div>}
      {options.map(o => (
        <label key={o.id} className="flex items-center gap-2 px-1 cursor-pointer">
          <input
            type="checkbox"
            checked={value.includes(o.id)}
            onChange={e => onChange(e.target.checked ? [...value, o.id] : value.filter(x => x !== o.id))}
          />
          <span className="truncate">{o.label}</span>
        </label>
      ))}
    </div>
  </div>
);

interface GoalDraft {
  id?: string;
  title: string;
  description: string;
  startDate: string;
  targetDate: string;
  ownerId: string;
  linkedEpicIds: string[];
  linkedMilestoneIds: string[];
  dependsOnGoalIds: string[];
  progressMode: 'auto' | 'manual';
  manualProgress: number;
}

interface MilestoneDraft {
  id?: string;
  title: string;
  startDate: string;
  dueDate: string;
  ownerId: string;
  epicId: string;
  dependsOnMilestoneIds: string[];
}

export const GoalsView: React.FC = () => {
  const {
    currentProject,
    goals,
    milestones,
    epics,
    users,
    currentUser,
    createGoal,
    updateGoal,
    deleteGoal,
    createMilestone,
    updateMilestone,
    deleteMilestone,
    t,
    language,
  } = useJira();
  const fa = language === 'fa';
  const { data, loading, error } = useReport<GoalsReport>(`/api/planning/goals?projectId=${encodeURIComponent(currentProject.id)}`, 'planning');

  const projGoals = goals.filter(g => g.projectId === currentProject.id);
  const projMilestones = milestones.filter(m => m.projectId === currentProject.id);
  const projEpics = epics.filter(e => e.projectId === currentProject.id);
  const goalViews = new Map((data?.goals || []).map(g => [g.id, g] as const));
  const milestoneViews = new Map((data?.milestones || []).map(m => [m.id, m] as const));

  const blankGoal = (): GoalDraft => ({
    title: '',
    description: '',
    startDate: new Date().toISOString().slice(0, 10),
    targetDate: '',
    ownerId: currentUser?.id || users[0]?.id || '',
    linkedEpicIds: [],
    linkedMilestoneIds: [],
    dependsOnGoalIds: [],
    progressMode: 'auto',
    manualProgress: 0,
  });
  const blankMilestone = (): MilestoneDraft => ({
    title: '',
    startDate: '',
    dueDate: '',
    ownerId: currentUser?.id || users[0]?.id || '',
    epicId: '',
    dependsOnMilestoneIds: [],
  });

  const [goalDraft, setGoalDraft] = useState<GoalDraft | null>(null);
  const [msDraft, setMsDraft] = useState<MilestoneDraft | null>(null);

  const editGoal = (g: GoalItem) =>
    setGoalDraft({
      id: g.id,
      title: g.title,
      description: g.description || '',
      startDate: g.startDate || '',
      targetDate: g.targetDate || '',
      ownerId: g.ownerId,
      linkedEpicIds: g.linkedEpicIds || [],
      linkedMilestoneIds: g.linkedMilestoneIds || [],
      dependsOnGoalIds: g.dependsOnGoalIds || [],
      progressMode: g.progressMode || 'auto',
      manualProgress: g.manualProgress ?? 0,
    });

  const saveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalDraft || !goalDraft.title.trim()) return;
    if (goalDraft.startDate && goalDraft.targetDate && goalDraft.targetDate < goalDraft.startDate) return;
    const fields = {
      title: goalDraft.title.trim(),
      titleFa: goalDraft.title.trim(),
      description: goalDraft.description.trim() || undefined,
      startDate: goalDraft.startDate || undefined,
      targetDate: goalDraft.targetDate,
      ownerId: goalDraft.ownerId,
      linkedEpicIds: goalDraft.linkedEpicIds,
      linkedMilestoneIds: goalDraft.linkedMilestoneIds,
      dependsOnGoalIds: goalDraft.dependsOnGoalIds,
      progressMode: goalDraft.progressMode,
      manualProgress: goalDraft.progressMode === 'manual' ? goalDraft.manualProgress : undefined,
    };
    if (goalDraft.id) updateGoal(goalDraft.id, fields);
    else createGoal({ projectId: currentProject.id, status: 'on_track', ...fields } as Omit<GoalItem, 'id'>);
    setGoalDraft(null);
  };

  const editMilestone = (m: MilestoneItem) =>
    setMsDraft({
      id: m.id,
      title: m.title,
      startDate: m.startDate || '',
      dueDate: m.dueDate || '',
      ownerId: m.ownerId,
      epicId: m.epicId || '',
      dependsOnMilestoneIds: m.dependsOnMilestoneIds || [],
    });

  const saveMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msDraft || !msDraft.title.trim() || !msDraft.dueDate) return;
    if (msDraft.startDate && msDraft.dueDate < msDraft.startDate) return;
    const fields = {
      title: msDraft.title.trim(),
      titleFa: msDraft.title.trim(),
      startDate: msDraft.startDate || undefined,
      dueDate: msDraft.dueDate,
      ownerId: msDraft.ownerId,
      epicId: msDraft.epicId || undefined,
      dependsOnMilestoneIds: msDraft.dependsOnMilestoneIds,
    };
    if (msDraft.id) updateMilestone(msDraft.id, fields);
    else createMilestone({ projectId: currentProject.id, status: 'planned', ...fields } as Omit<MilestoneItem, 'id'>);
    setMsDraft(null);
  };

  const dateError = (start: string, end: string) => (start && end && end < start ? (fa ? 'تاریخ پایان قبل از شروع است' : 'Target date is before the start date') : null);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-emerald-600" />
            <span>{t.goalsView}</span>
            {loading && !data && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {fa
              ? 'اهداف و نقاط عطف؛ پیشرفت از وضعیت واقعی تسک‌های متصل محاسبه می‌شود و تاریخ‌ها و وابستگی‌ها کنترل می‌شوند.'
              : 'Goals and milestones: progress is computed from the live status of linked work; dates and dependencies are enforced.'}
          </p>
        </div>
        <button
          onClick={() => setGoalDraft(blankGoal())}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold flex items-center gap-1 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{fa ? 'افزودن هدف' : 'New goal'}</span>
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {goalDraft && (
        <form onSubmit={saveGoal} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{goalDraft.id ? (fa ? 'ویرایش هدف' : 'Edit goal') : fa ? 'هدف جدید' : 'New goal'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block font-semibold mb-1">{fa ? 'عنوان هدف' : 'Goal title'} *</label>
              <input required className={input} value={goalDraft.title} onChange={e => setGoalDraft({ ...goalDraft, title: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="block font-semibold mb-1">{t.description}</label>
              <textarea rows={2} className={`${input} resize-none`} value={goalDraft.description} onChange={e => setGoalDraft({ ...goalDraft, description: e.target.value })} />
            </div>
            <div>
              <label className="block font-semibold mb-1">{fa ? 'تاریخ شروع' : 'Start date'}</label>
              <input type="date" className={`${input} font-mono`} value={goalDraft.startDate} onChange={e => setGoalDraft({ ...goalDraft, startDate: e.target.value })} />
            </div>
            <div>
              <label className="block font-semibold mb-1">{fa ? 'تاریخ هدف' : 'Target date'} *</label>
              <input required type="date" className={`${input} font-mono`} value={goalDraft.targetDate} onChange={e => setGoalDraft({ ...goalDraft, targetDate: e.target.value })} />
              {dateError(goalDraft.startDate, goalDraft.targetDate) && <div className="text-rose-600 mt-1">{dateError(goalDraft.startDate, goalDraft.targetDate)}</div>}
            </div>
            <div>
              <label className="block font-semibold mb-1">{fa ? 'مسئول' : 'Owner'}</label>
              <select className={input} value={goalDraft.ownerId} onChange={e => setGoalDraft({ ...goalDraft, ownerId: e.target.value })}>
                {users.map(u => <option key={u.id} value={u.id}>{fa ? u.nameFa : u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">{fa ? 'روش محاسبه پیشرفت' : 'Progress'}</label>
              <div className="flex items-center gap-3">
                <select className={input} value={goalDraft.progressMode} onChange={e => setGoalDraft({ ...goalDraft, progressMode: e.target.value as 'auto' | 'manual' })}>
                  <option value="auto">{fa ? 'خودکار از تسک‌های متصل' : 'Automatic (from linked work)'}</option>
                  <option value="manual">{fa ? 'دستی' : 'Manual'}</option>
                </select>
                {goalDraft.progressMode === 'manual' && (
                  <input type="number" min={0} max={100} className={`${input} w-20 font-mono`} value={goalDraft.manualProgress} onChange={e => setGoalDraft({ ...goalDraft, manualProgress: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
                )}
              </div>
            </div>
            <MultiPick
              label={fa ? 'اپیک‌های متصل' : 'Linked epics'}
              options={projEpics.map(e => ({ id: e.id, label: `${e.key} · ${fa ? e.nameFa : e.name}` }))}
              value={goalDraft.linkedEpicIds}
              onChange={v => setGoalDraft({ ...goalDraft, linkedEpicIds: v })}
              empty={fa ? 'اپیکی وجود ندارد' : 'No epics in this space'}
            />
            <MultiPick
              label={fa ? 'نقاط عطف متصل' : 'Linked milestones'}
              options={projMilestones.map(m => ({ id: m.id, label: m.title }))}
              value={goalDraft.linkedMilestoneIds}
              onChange={v => setGoalDraft({ ...goalDraft, linkedMilestoneIds: v })}
              empty={fa ? 'نقطه عطفی وجود ندارد' : 'No milestones yet'}
            />
            <div className="md:col-span-2">
              <MultiPick
                label={fa ? 'وابسته به اهداف (باید پیش از تکمیل این هدف تمام شوند)' : 'Depends on goals (must finish before this goal can be completed)'}
                options={projGoals.filter(g => g.id !== goalDraft.id).map(g => ({ id: g.id, label: g.title }))}
                value={goalDraft.dependsOnGoalIds}
                onChange={v => setGoalDraft({ ...goalDraft, dependsOnGoalIds: v })}
                empty={fa ? 'هدف دیگری وجود ندارد' : 'No other goals'}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-1.5 bg-emerald-600 text-white font-semibold rounded-md">{t.save}</button>
            <button type="button" onClick={() => setGoalDraft(null)} className="px-3 py-1.5 text-slate-500">{t.cancel}</button>
          </div>
        </form>
      )}

      {/* goals */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {projGoals.length === 0 && (
          <div className="xl:col-span-2 p-10 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
            {fa ? 'هنوز هدفی تعریف نشده است.' : 'No goals yet. Create one and link epics or milestones to track real progress.'}
          </div>
        )}
        {projGoals.map(goal => {
          const view: GoalView | undefined = goalViews.get(goal.id);
          const owner = users.find(u => u.id === goal.ownerId);
          const health: Health = view?.health || (goal.status === 'completed' ? 'completed' : goal.status === 'at_risk' ? 'at_risk' : 'on_track');
          const due = view ? dueText(view.daysRemaining, fa) : null;
          return (
            <div key={goal.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">{fa ? goal.titleFa : goal.title}</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge health={health} fa={fa} />
                    {view?.readyToComplete && (
                      <button onClick={() => updateGoal(goal.id, { status: 'completed' })} className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-600 text-white flex items-center gap-1" title={fa ? 'همه تسک‌های متصل انجام شده‌اند' : 'All linked work is done'}>
                        <CheckCircle2 className="w-3 h-3" />
                        {fa ? 'علامت‌گذاری به‌عنوان تکمیل' : 'Mark completed'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <select
                    value={goal.status}
                    onChange={e => updateGoal(goal.id, { status: e.target.value as GoalItem['status'] })}
                    className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 font-semibold text-[11px]"
                    aria-label="Declared status"
                  >
                    <option value="on_track">{fa ? 'مطابق برنامه' : 'On track'}</option>
                    <option value="at_risk">{fa ? 'در معرض ریسک' : 'At risk'}</option>
                    <option value="completed">{fa ? 'تکمیل شده' : 'Completed'}</option>
                  </select>
                  <button onClick={() => editGoal(goal)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500" title={fa ? 'ویرایش' : 'Edit'}><Pencil className="w-3.5 h-3.5" /></button>
                  <button
                    onClick={() => window.confirm(fa ? 'این هدف حذف شود؟' : 'Delete this goal?') && deleteGoal(goal.id)}
                    className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600"
                    title={fa ? 'حذف' : 'Delete'}
                  ><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              {goal.description && <p className="text-slate-500 dark:text-slate-400">{goal.description}</p>}

              {view ? <ProgressBar progress={view.progress} health={health} fa={fa} /> : <div className="h-8 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />}

              {view && (view.blockedBy.length > 0 || view.blocks.length > 0) && (
                <div className="space-y-1">
                  {view.blockedBy.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-purple-700 dark:text-purple-300">
                      <Lock className="w-3 h-3" />
                      <span className="font-semibold">{fa ? 'منتظر:' : 'Waiting on:'}</span>
                      {view.blockedBy.map(b => <span key={b.id} className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/50">{b.title}</span>)}
                    </div>
                  )}
                  {view.blocks.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-slate-500">
                      <Link2 className="w-3 h-3" />
                      <span className="font-semibold">{fa ? 'مسدودکننده:' : 'Blocks:'}</span>
                      {view.blocks.map(b => <span key={b.id} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">{b.title}</span>)}
                    </div>
                  )}
                </div>
              )}

              {(goal.linkedEpicIds.length > 0 || (view?.milestones.length ?? 0) > 0) && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {goal.linkedEpicIds.map(id => {
                    const ep = epics.find(e => e.id === id);
                    return ep ? <span key={id} className="px-1.5 py-0.5 rounded font-mono text-white" style={{ backgroundColor: ep.color }}>{ep.key}</span> : null;
                  })}
                  {view?.milestones.map(m => (
                    <span key={m.id} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 flex items-center gap-1"><Flag className="w-3 h-3" />{m.title} · {m.percent}%</span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5">
                  <UserAvatar user={owner} size="sm" />
                  <span>{owner ? (fa ? owner.nameFa : owner.name) : ''}</span>
                </div>
                <div className="text-end font-mono">
                  <div>{goal.startDate ? `${goal.startDate} → ` : ''}{goal.targetDate}</div>
                  {due && <div className={`flex items-center gap-1 justify-end ${view?.overdue ? 'text-rose-600 font-semibold' : ''}`}><Clock className="w-3 h-3" />{due}</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* milestones */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><Flag className="w-4 h-4 text-purple-600" />{fa ? 'نقاط عطف' : 'Milestones'}</h2>
          <button onClick={() => setMsDraft(blankMilestone())} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-xs font-semibold flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" />{fa ? 'نقطه عطف جدید' : 'New milestone'}
          </button>
        </div>

        {msDraft && (
          <form onSubmit={saveMilestone} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block font-semibold mb-1">{fa ? 'عنوان' : 'Title'} *</label>
                <input required className={input} value={msDraft.title} onChange={e => setMsDraft({ ...msDraft, title: e.target.value })} />
              </div>
              <div>
                <label className="block font-semibold mb-1">{fa ? 'تاریخ شروع' : 'Start date'}</label>
                <input type="date" className={`${input} font-mono`} value={msDraft.startDate} onChange={e => setMsDraft({ ...msDraft, startDate: e.target.value })} />
              </div>
              <div>
                <label className="block font-semibold mb-1">{fa ? 'سررسید' : 'Due date'} *</label>
                <input required type="date" className={`${input} font-mono`} value={msDraft.dueDate} onChange={e => setMsDraft({ ...msDraft, dueDate: e.target.value })} />
                {dateError(msDraft.startDate, msDraft.dueDate) && <div className="text-rose-600 mt-1">{dateError(msDraft.startDate, msDraft.dueDate)}</div>}
              </div>
              <div>
                <label className="block font-semibold mb-1">{fa ? 'اپیک مرتبط (پیشرفت از آن محاسبه می‌شود)' : 'Epic (progress is computed from its work)'}</label>
                <select className={input} value={msDraft.epicId} onChange={e => setMsDraft({ ...msDraft, epicId: e.target.value })}>
                  <option value="">{fa ? 'بدون اپیک' : 'No epic'}</option>
                  {projEpics.map(e => <option key={e.id} value={e.id}>{e.key} · {fa ? e.nameFa : e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">{fa ? 'مسئول' : 'Owner'}</label>
                <select className={input} value={msDraft.ownerId} onChange={e => setMsDraft({ ...msDraft, ownerId: e.target.value })}>
                  {users.map(u => <option key={u.id} value={u.id}>{fa ? u.nameFa : u.name}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <MultiPick
                  label={fa ? 'وابسته به نقاط عطف' : 'Depends on milestones'}
                  options={projMilestones.filter(m => m.id !== msDraft.id).map(m => ({ id: m.id, label: m.title }))}
                  value={msDraft.dependsOnMilestoneIds}
                  onChange={v => setMsDraft({ ...msDraft, dependsOnMilestoneIds: v })}
                  empty={fa ? 'نقطه عطف دیگری نیست' : 'No other milestones'}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-1.5 bg-purple-600 text-white font-semibold rounded-md">{t.save}</button>
              <button type="button" onClick={() => setMsDraft(null)} className="px-3 py-1.5 text-slate-500">{t.cancel}</button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {projMilestones.length === 0 && <div className="lg:col-span-2 p-6 text-center text-xs text-slate-400">{fa ? 'نقطه عطفی ثبت نشده است.' : 'No milestones yet.'}</div>}
          {projMilestones.map(m => {
            const view: MilestoneView | undefined = milestoneViews.get(m.id);
            const health: Health = view?.health || 'on_track';
            const due = view ? dueText(view.daysRemaining, fa) : null;
            return (
              <div key={m.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="font-bold text-slate-900 dark:text-white text-sm">{fa ? m.titleFa || m.title : m.title}</div>
                    <div className="flex items-center gap-2"><Badge health={health} fa={fa} /><span className="font-mono text-[11px] text-slate-500">{m.startDate ? `${m.startDate} → ` : ''}{m.dueDate}</span></div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <select
                      value={m.status}
                      onChange={e => updateMilestone(m.id, { status: e.target.value as MilestoneItem['status'] })}
                      className="px-1.5 py-1 text-[11px] rounded bg-slate-100 dark:bg-slate-800 font-semibold"
                      aria-label="Milestone status"
                    >
                      {(['planned', 'upcoming', 'on_track', 'at_risk', 'achieved', 'completed'] as const).map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select>
                    <button onClick={() => editMilestone(m)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => window.confirm(fa ? 'این نقطه عطف حذف شود؟' : 'Delete this milestone?') && deleteMilestone(m.id)} className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                {view ? <ProgressBar progress={view.progress} health={health} fa={fa} /> : <div className="h-8 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span>{view?.blockedBy.length ? `${fa ? 'منتظر' : 'Waiting on'}: ${view.blockedBy.map(b => b.title).join(', ')}` : ''}</span>
                  {due && <span className={view?.overdue ? 'text-rose-600 font-semibold' : ''}>{due}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
