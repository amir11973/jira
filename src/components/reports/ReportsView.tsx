import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { IssueTypeIcon, PriorityIcon } from '../common/JiraIcons';
import { useReport } from '../../services/reports';
import type { BreakdownGroup, BreakdownReport, BurndownReport, VelocityReport } from '../../services/reports';

type ReportTab = 'burndown' | 'velocity' | 'breakdown';
type Unit = 'points' | 'count';

const FORECAST_STYLE: Record<string, { en: string; fa: string; cls: string }> = {
  ahead: { en: 'Ahead of plan', fa: 'جلوتر از برنامه', cls: 'text-emerald-600' },
  on_track: { en: 'On track', fa: 'مطابق برنامه', cls: 'text-emerald-600' },
  behind: { en: 'Behind plan', fa: 'عقب‌تر از برنامه', cls: 'text-rose-600' },
  completed: { en: 'All work done', fa: 'همه کارها انجام شد', cls: 'text-emerald-600' },
  no_scope: { en: 'No work in sprint', fa: 'کاری در اسپرینت نیست', cls: 'text-slate-500' },
};

/** Axis step that gives at most six whole-number gridlines. */
const axisStep = (n: number): number => {
  for (const step of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]) if (Math.ceil(n / step) <= 6) return step;
  return 1000;
};
const niceMax = (n: number): number => {
  const step = axisStep(Math.max(1, n));
  return Math.max(step, Math.ceil(n / step) * step);
};

const fmt = (n: number | undefined | null): string => (n === undefined || n === null ? '–' : Number.isInteger(n) ? String(n) : n.toFixed(1));

const Spinner: React.FC = () => (
  <div className="flex items-center justify-center p-10 text-slate-400">
    <Loader2 className="w-5 h-5 animate-spin" />
  </div>
);

const ErrorBox: React.FC<{ message: string }> = ({ message }) => (
  <div className="p-4 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
    <AlertTriangle className="w-4 h-4 shrink-0" />
    <span>{message}</span>
  </div>
);

const EstimatedNote: React.FC<{ fa: boolean }> = ({ fa }) => (
  <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
    <span>
      {fa
        ? 'بخشی از این تاریخچه از آخرین زمان ویرایش تسک‌ها بازسازی شده است (داده‌های قبل از ثبت تاریخچه). تغییرات جدید دقیق ثبت می‌شوند.'
        : 'Part of this history was reconstructed from last-updated dates (data that pre-dates history tracking). New changes are recorded exactly.'}
    </span>
  </div>
);

const Tile: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
    <div className="text-[10px] uppercase font-bold tracking-wide text-slate-400">{label}</div>
    <div className="text-lg font-bold text-slate-900 dark:text-white tabular-nums leading-tight mt-0.5">{value}</div>
    {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
  </div>
);

const UnitToggle: React.FC<{ unit: Unit; onChange: (u: Unit) => void; fa: boolean }> = ({ unit, onChange, fa }) => (
  <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-md text-[11px] font-semibold">
    {(['points', 'count'] as const).map(u => (
      <button
        key={u}
        onClick={() => onChange(u)}
        className={`px-2.5 py-1 rounded ${unit === u ? 'bg-white dark:bg-slate-700 shadow-xs text-slate-900 dark:text-white' : 'text-slate-500'}`}
      >
        {u === 'points' ? (fa ? 'امتیاز' : 'Story points') : fa ? 'تعداد' : 'Item count'}
      </button>
    ))}
  </div>
);

/* ------------------------------------------------------------------ burndown */

const BurndownPanel: React.FC = () => {
  const { currentProject, sprints, language } = useJira();
  const fa = language === 'fa';
  const projectSprints = useMemo(
    () =>
      sprints
        .filter(s => s.projectId === currentProject.id && s.status !== 'planned')
        .sort((a, b) => (a.status === b.status ? (b.startDate || '').localeCompare(a.startDate || '') : a.status === 'active' ? -1 : 1)),
    [sprints, currentProject.id]
  );
  const [sprintId, setSprintId] = useState<string>('');
  const [unit, setUnit] = useState<Unit | 'auto'>('auto');

  useEffect(() => {
    if (!projectSprints.some(s => s.id === sprintId)) setSprintId(projectSprints[0]?.id || '');
  }, [projectSprints, sprintId]);

  const { data, loading, error } = useReport<BurndownReport>(
    sprintId ? `/api/reports/burndown?sprintId=${encodeURIComponent(sprintId)}&metric=${unit}` : null
  );

  if (projectSprints.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-xs text-slate-500">
        {fa ? 'هنوز اسپرینتی شروع نشده است. پس از شروع اسپرینت، نمودار سوختن از تاریخچه واقعی ساخته می‌شود.' : 'No sprint has been started yet. The burndown is built from the sprint history once a sprint starts.'}
      </div>
    );
  }

  const w = 700;
  const h = 250;
  const pad = { l: 44, r: 16, t: 14, b: 30 };
  const series = data?.series || [];
  const maxY = niceMax(
    Math.max(1, data?.committed || 0, ...series.map(p => Math.max(p.ideal, p.scope ?? 0, p.remaining ?? 0)))
  );
  const x = (i: number) => pad.l + (series.length <= 1 ? 0 : (i / (series.length - 1)) * (w - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / maxY) * (h - pad.t - pad.b);
  const actual = series.map((p, i) => ({ p, i })).filter(({ p }) => p.remaining !== null);
  const labelEvery = Math.max(1, Math.ceil(series.length / 12));
  const unitLabel = data?.metric === 'count' ? (fa ? 'تسک' : 'items') : fa ? 'امتیاز' : 'pts';
  const forecast = data?.forecast ? FORECAST_STYLE[data.forecast] : null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            {fa ? 'نمودار سوختن اسپرینت' : 'Sprint burndown'}
            {data ? ` — ${data.sprint.name}` : ''}
          </h2>
          <p className="text-xs text-slate-500">
            {fa ? 'کار باقی‌مانده در هر روز، بازسازی‌شده از تغییرات وضعیت، اسپرینت و برآورد تسک‌ها' : 'Remaining work per day, replayed from status, sprint and estimate changes'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sprintId}
            onChange={e => setSprintId(e.target.value)}
            aria-label="Sprint"
            className="px-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
          >
            {projectSprints.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} {s.status === 'completed' ? '✓' : ''}
              </option>
            ))}
          </select>
          {data?.canToggleMetric && <UnitToggle unit={data.metric} onChange={setUnit} fa={fa} />}
        </div>
      </div>

      {error && <ErrorBox message={error} />}
      {loading && !data && <Spinner />}

      {data && data.state === 'planned' && (
        <div className="p-8 text-center text-xs text-slate-500">{fa ? 'این اسپرینت هنوز شروع نشده است.' : 'This sprint has not started yet.'}</div>
      )}

      {data && data.state !== 'planned' && (
        <>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-slate-400" />
              <span className="text-slate-500">{fa ? 'خط ایده‌آل' : 'Ideal'}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-1 bg-blue-600 rounded-full" />
              <span className="text-blue-600 dark:text-blue-400 font-semibold">{fa ? 'باقی‌مانده واقعی' : 'Remaining'}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-amber-500" />
              <span className="text-amber-600">{fa ? 'حجم کل کار (scope)' : 'Total scope'}</span>
            </span>
          </div>

          <div dir="ltr" className="w-full">
            <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="Burndown chart">
              {Array.from({ length: Math.round(maxY / axisStep(maxY)) + 1 }, (_, k) => k * axisStep(maxY)).map(v => (
                <g key={v}>
                  <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity="0.1" className="text-slate-400" />
                  <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" className="fill-slate-400 text-[10px] font-mono">
                    {fmt(v)}
                  </text>
                </g>
              ))}
              {series.map((p, i) =>
                p.isToday ? <line key="today" x1={x(i)} x2={x(i)} y1={pad.t} y2={h - pad.b} stroke="#f43f5e" strokeOpacity="0.5" strokeDasharray="3 3" /> : null
              )}
              <polyline fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5 4" points={series.map((p, i) => `${x(i)},${y(p.ideal)}`).join(' ')} />
              <polyline
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.5"
                points={actual.flatMap(({ p, i }, k) => (k === 0 ? [`${x(i)},${y(p.scope ?? 0)}`] : [`${x(i)},${y(actual[k - 1].p.scope ?? 0)}`, `${x(i)},${y(p.scope ?? 0)}`])).join(' ')}
              />
              <polyline fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={actual.map(({ p, i }) => `${x(i)},${y(p.remaining ?? 0)}`).join(' ')} />
              {actual.map(({ p, i }) => (
                <circle key={p.date} cx={x(i)} cy={y(p.remaining ?? 0)} r={p.isToday ? 5 : 3.5} fill="#2563eb">
                  <title>{`${p.date}: ${fmt(p.remaining)} ${unitLabel} remaining of ${fmt(p.scope)} (ideal ${fmt(p.ideal)})`}</title>
                </circle>
              ))}
              {series.map((p, i) =>
                i % labelEvery === 0 || i === series.length - 1 ? (
                  <text key={p.date} x={x(i)} y={h - 10} textAnchor="middle" className="fill-slate-400 text-[10px] font-mono">
                    {p.date.slice(5)}
                  </text>
                ) : null
              )}
            </svg>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Tile label={fa ? 'تعهد اولیه' : 'Committed'} value={`${fmt(data.committed)} ${unitLabel}`} />
            <Tile label={fa ? 'اضافه‌شده' : 'Added'} value={`${data.scopeAdded ? '+' : ''}${fmt(data.scopeAdded)}`} hint={fa ? 'پس از شروع' : 'after start'} />
            <Tile label={fa ? 'حذف‌شده' : 'Removed'} value={`${data.scopeRemoved ? '−' : ''}${fmt(data.scopeRemoved)}`} hint={fa ? 'از اسپرینت خارج شد' : 'left the sprint'} />
            <Tile label={fa ? 'انجام‌شده' : 'Completed'} value={`${fmt(data.completed)} / ${fmt(data.scope)}`} />
            <Tile label={fa ? 'باقی‌مانده' : 'Remaining'} value={`${fmt(data.remaining)} ${unitLabel}`} />
            <Tile label={fa ? 'سرعت سوختن' : 'Burn rate'} value={`${fmt(data.burnRate)}/${fa ? 'روز' : 'day'}`} />
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200/60 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 flex flex-wrap items-center justify-between gap-2">
            <span>
              {fa ? 'وضعیت نسبت به برنامه:' : 'Versus plan:'}{' '}
              <strong className={forecast?.cls}>{forecast ? (fa ? forecast.fa : forecast.en) : '–'}</strong>
            </span>
            {data.state === 'active' && (
              <span>
                {fa ? 'پیش‌بینی پایان با سرعت فعلی:' : 'Projected finish at current pace:'}{' '}
                <strong>{data.projectedFinishDate || (fa ? 'نامشخص' : 'unknown')}</strong>
                {data.projectedFinishDate && data.plannedEndDate && data.projectedFinishDate > data.plannedEndDate && (
                  <span className="text-rose-600"> ({fa ? 'پس از پایان برنامه‌ریزی‌شده' : 'after the planned end'} {data.plannedEndDate})</span>
                )}
              </span>
            )}
            {data.state === 'completed' && <span>{fa ? 'اسپرینت تکمیل شده است.' : 'This sprint is completed.'}</span>}
          </div>
          {data.estimated && <EstimatedNote fa={fa} />}
        </>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ velocity */

const VelocityPanel: React.FC = () => {
  const { currentProject, language } = useJira();
  const fa = language === 'fa';
  const { data, loading, error } = useReport<VelocityReport>(`/api/reports/velocity?projectId=${encodeURIComponent(currentProject.id)}&limit=8`);
  const [unit, setUnit] = useState<Unit | null>(null);
  const effective: Unit = unit ?? (data?.hasPoints === false ? 'count' : 'points');
  const committedOf = (s: VelocityReport['sprints'][number]) => (effective === 'points' ? s.committedPoints : s.committedCount);
  const addedOf = (s: VelocityReport['sprints'][number]) => (effective === 'points' ? s.addedPoints : s.addedCount);
  const completedOf = (s: VelocityReport['sprints'][number]) => (effective === 'points' ? s.completedPoints : s.completedCount);
  const max = niceMax(Math.max(1, ...(data?.sprints || []).map(s => Math.max(committedOf(s) + addedOf(s), completedOf(s)))));
  const unitLabel = effective === 'points' ? (fa ? 'امتیاز' : 'pts') : fa ? 'تسک' : 'items';

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">{fa ? 'سرعت تیم (Velocity)' : 'Velocity'}</h2>
          <p className="text-xs text-slate-500">
            {fa ? 'کار تعهدشده در شروع هر اسپرینت در برابر کار انجام‌شده تا پایان آن (فقط اسپرینت‌های تکمیل‌شده)' : 'Work committed at the start of each sprint vs work completed by its end (completed sprints only)'}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs font-medium">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-slate-300 dark:bg-slate-600 rounded-xs" />{fa ? 'تعهد' : 'Committed'}</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-amber-400 rounded-xs" />{fa ? 'اضافه‌شده' : 'Added'}</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-emerald-500 rounded-xs" />{fa ? 'انجام‌شده' : 'Completed'}</span>
          {data?.hasPoints && <UnitToggle unit={effective} onChange={setUnit} fa={fa} />}
        </div>
      </div>

      {error && <ErrorBox message={error} />}
      {loading && !data && <Spinner />}

      {data && data.sprints.length === 0 && (
        <div className="p-8 text-center text-xs text-slate-500">
          {fa ? 'هنوز اسپرینت تکمیل‌شده‌ای وجود ندارد. با تکمیل اولین اسپرینت، سرعت تیم اینجا نمایش داده می‌شود.' : 'No sprint has been completed yet. Velocity appears here once the first sprint is completed.'}
        </div>
      )}

      {data && data.sprints.length > 0 && (
        <>
          <div className="space-y-5 max-w-3xl">
            {data.sprints.map(s => {
              const committed = committedOf(s);
              const added = addedOf(s);
              const completed = completedOf(s);
              return (
                <div key={s.sprintId} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="font-bold text-slate-800 dark:text-slate-200">{s.name}</span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      {fmt(completed)} / {fmt(committed + added)} {unitLabel} ({s.completionRate}%)
                    </span>
                  </div>
                  <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden flex" title={`${fa ? 'تعهد' : 'Committed'} ${fmt(committed)} + ${fa ? 'اضافه' : 'added'} ${fmt(added)}`}>
                    <div style={{ width: `${(committed / max) * 100}%` }} className="h-full bg-slate-300 dark:bg-slate-600" />
                    <div style={{ width: `${(added / max) * 100}%` }} className="h-full bg-amber-400" />
                  </div>
                  <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden flex">
                    <div style={{ width: `${(completed / max) * 100}%` }} className="h-full bg-emerald-500 text-white text-[10px] font-mono font-bold flex items-center px-2">
                      {completed > 0 ? fmt(completed) : ''}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {s.startDate} → {s.endDate}
                    {s.incompletePoints + s.incompleteCount > 0 && ` · ${fa ? 'ناتمام' : 'unfinished'}: ${effective === 'points' ? s.incompletePoints : s.incompleteCount} ${unitLabel}`}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300">
            {fa
              ? `میانگین سرعت در ${data.averageWindow} اسپرینت اخیر: ${fmt(effective === 'points' ? data.averageCompletedPoints : data.averageCompletedCount)} ${unitLabel} در هر اسپرینت.`
              : `Average velocity over the last ${data.averageWindow} completed sprint${data.averageWindow === 1 ? '' : 's'}: ${fmt(effective === 'points' ? data.averageCompletedPoints : data.averageCompletedCount)} ${unitLabel} per sprint.`}
          </div>
          {data.estimated && <EstimatedNote fa={fa} />}
        </>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ breakdown */

const TYPE_COLOR: Record<string, string> = { story: 'bg-emerald-500', task: 'bg-blue-500', bug: 'bg-rose-500', epic: 'bg-purple-500', feature: 'bg-teal-500', subtask: 'bg-slate-400' };
const PRIORITY_COLOR: Record<string, string> = { highest: 'bg-rose-600', high: 'bg-orange-500', medium: 'bg-amber-500', low: 'bg-emerald-500', lowest: 'bg-sky-400' };
const CATEGORY_COLOR: Record<string, string> = { todo: 'bg-slate-400', inprogress: 'bg-blue-500', done: 'bg-emerald-500' };

const EXTRA_DIMENSIONS = ['epic', 'sprint', 'version', 'component', 'label', 'resolution'] as const;

const GroupCard: React.FC<{
  title: string;
  dim: string;
  groups: BreakdownGroup[];
  total: number;
  totalPoints: number;
  unit: Unit;
  fa: boolean;
}> = ({ title, dim, groups, total, totalPoints, unit, fa }) => (
  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
    {groups.length === 0 && <div className="text-xs text-slate-400">{fa ? 'داده‌ای نیست.' : 'No data.'}</div>}
    <div className="space-y-3">
      {groups.map(g => {
        const value = unit === 'points' ? g.points : g.count;
        const denom = unit === 'points' ? totalPoints : total;
        const percent = denom > 0 ? Math.round((value / denom) * 100) : 0;
        const donePct = g.count > 0 ? Math.round((g.doneCount / g.count) * 100) : 0;
        const color =
          dim === 'type' ? TYPE_COLOR[g.key] : dim === 'priority' ? PRIORITY_COLOR[g.key] : dim === 'status' ? CATEGORY_COLOR[g.category || 'todo'] : 'bg-blue-500';
        return (
          <div key={g.key || 'none'} className="space-y-1">
            <div className="flex justify-between text-xs gap-2">
              <span className="flex items-center gap-2 min-w-0">
                {dim === 'type' && <IssueTypeIcon type={g.key as never} className="w-3.5 h-3.5 shrink-0" />}
                {dim === 'priority' && <PriorityIcon priority={g.key as never} className="w-3.5 h-3.5 shrink-0" />}
                <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{fa && g.labelFa ? g.labelFa : g.label}</span>
              </span>
              <span className="font-mono text-slate-500 tabular-nums shrink-0" title={`${g.doneCount}/${g.count} ${fa ? 'انجام‌شده' : 'done'} (${donePct}%)`}>
                {g.count} · {g.points}p ({percent}%)
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full ${color || 'bg-blue-500'}`} style={{ width: `${percent}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const BreakdownPanel: React.FC = () => {
  const { currentProject, sprints, versions, epics, language } = useJira();
  const fa = language === 'fa';
  const [sprintId, setSprintId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [epicId, setEpicId] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [unit, setUnit] = useState<Unit>('count');
  const [extra, setExtra] = useState<(typeof EXTRA_DIMENSIONS)[number]>('epic');

  const qs = new URLSearchParams({ projectId: currentProject.id });
  if (sprintId) qs.set('sprintId', sprintId);
  if (versionId) qs.set('versionId', versionId);
  if (epicId) qs.set('epicId', epicId);
  if (includeArchived) qs.set('includeArchived', 'true');
  const { data, loading, error } = useReport<BreakdownReport>(`/api/reports/breakdown?${qs.toString()}`);

  const sel = 'px-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md max-w-[11rem]';
  const extraTitles: Record<string, [string, string]> = {
    epic: ['Epic', 'اپیک'],
    sprint: ['Sprint', 'اسپرینت'],
    version: ['Fix version', 'نسخه'],
    component: ['Component', 'مؤلفه'],
    label: ['Label', 'برچسب'],
    resolution: ['Resolution', 'نتیجه'],
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-3 text-xs">
        <select value={sprintId} onChange={e => setSprintId(e.target.value)} className={sel} aria-label="Sprint">
          <option value="">{fa ? 'همه اسپرینت‌ها' : 'All sprints'}</option>
          {sprints.filter(s => s.projectId === currentProject.id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={versionId} onChange={e => setVersionId(e.target.value)} className={sel} aria-label="Version">
          <option value="">{fa ? 'همه نسخه‌ها' : 'All versions'}</option>
          {versions.filter(v => v.projectId === currentProject.id).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select value={epicId} onChange={e => setEpicId(e.target.value)} className={sel} aria-label="Epic">
          <option value="">{fa ? 'همه اپیک‌ها' : 'All epics'}</option>
          {epics.filter(e => e.projectId === currentProject.id).map(e => <option key={e.id} value={e.id}>{fa ? e.nameFa : e.name}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={includeArchived} onChange={e => setIncludeArchived(e.target.checked)} />
          {fa ? 'شامل بایگانی' : 'Include archived'}
        </label>
        <div className="ms-auto"><UnitToggle unit={unit} onChange={setUnit} fa={fa} /></div>
      </div>

      {error && <ErrorBox message={error} />}
      {loading && !data && <Spinner />}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Tile label={fa ? 'کل تسک‌ها' : 'Work items'} value={data.totals.count} />
            <Tile label={fa ? 'امتیاز کل' : 'Story points'} value={data.totals.points} />
            <Tile label={fa ? 'انجام‌شده' : 'Done'} value={`${data.totals.doneCount}`} hint={`${data.totals.count ? Math.round((data.totals.doneCount / data.totals.count) * 100) : 0}%`} />
            <Tile label={fa ? 'عقب‌افتاده' : 'Overdue'} value={data.totals.overdue} />
            <Tile label={fa ? 'بدون مسئول' : 'Unassigned'} value={data.totals.unassigned} />
            <Tile label={fa ? 'بدون برآورد' : 'Unestimated'} value={data.totals.unestimated} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <GroupCard title={fa ? 'توزیع انواع تسک' : 'Work types'} dim="type" groups={data.dimensions.type || []} total={data.totals.count} totalPoints={data.totals.points} unit={unit} fa={fa} />
            <GroupCard title={fa ? 'توزیع اولویت' : 'Priority'} dim="priority" groups={data.dimensions.priority || []} total={data.totals.count} totalPoints={data.totals.points} unit={unit} fa={fa} />
            <GroupCard title={fa ? 'وضعیت' : 'Status'} dim="status" groups={data.dimensions.status || []} total={data.totals.count} totalPoints={data.totals.points} unit={unit} fa={fa} />
            <GroupCard title={fa ? 'مسئول' : 'Assignee'} dim="assignee" groups={data.dimensions.assignee || []} total={data.totals.count} totalPoints={data.totals.points} unit={unit} fa={fa} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-600 dark:text-slate-300">{fa ? 'گروه‌بندی بر اساس' : 'Group by'}</span>
              <select value={extra} onChange={e => setExtra(e.target.value as typeof extra)} className={sel}>
                {EXTRA_DIMENSIONS.map(d => <option key={d} value={d}>{fa ? extraTitles[d][1] : extraTitles[d][0]}</option>)}
              </select>
            </div>
            <GroupCard title={fa ? extraTitles[extra][1] : extraTitles[extra][0]} dim={extra} groups={data.dimensions[extra] || []} total={data.totals.count} totalPoints={data.totals.points} unit={unit} fa={fa} />
          </div>
        </>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ shell */

export const ReportsView: React.FC = () => {
  const { t, language } = useJira();
  const [selectedReport, setSelectedReport] = useState<ReportTab>('burndown');

  const tabBtn = (id: ReportTab, label: string) => (
    <button
      key={id}
      onClick={() => setSelectedReport(id)}
      className={`px-3 py-1.5 rounded-md transition-colors ${
        selectedReport === id ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <span>{t.reportsTitle}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {language === 'fa'
              ? 'گزارش‌ها از تاریخچه واقعی اسپرینت‌ها و تسک‌های همین فضا محاسبه می‌شوند.'
              : 'Reports are computed live from this space’s real sprint history and work items.'}
          </p>
        </div>
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs font-semibold self-start sm:self-auto">
          {tabBtn('burndown', t.burndownChart)}
          {tabBtn('velocity', t.velocityChart)}
          {tabBtn('breakdown', t.typeBreakdown)}
        </div>
      </div>

      {selectedReport === 'burndown' && <BurndownPanel />}
      {selectedReport === 'velocity' && <VelocityPanel />}
      {selectedReport === 'breakdown' && <BreakdownPanel />}
    </div>
  );
};
