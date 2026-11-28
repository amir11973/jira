import React, { useMemo, useState } from 'react';
import { Calendar, Plus, ChevronRight, ChevronDown, AlertTriangle, Flag, Rocket, Loader2 } from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { IssueTypeIcon } from '../common/JiraIcons';
import { useReport } from '../../services/reports';
import type { RoadmapReport, Schedule } from '../../services/reports';

type Zoom = 'weeks' | 'months' | 'quarters';

const DAY = 86_400_000;
const PX_PER_DAY: Record<Zoom, number> = { weeks: 9, months: 3.4, quarters: 1.3 };
const ms = (d: string): number => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number): string => new Date(t).toISOString().slice(0, 10);
const addDays = (d: string, n: number): string => iso(ms(d) + n * DAY);

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const RoadmapView: React.FC = () => {
  const { currentProject, epics, setSelectedIssueId, createEpic, t, language } = useJira();
  const fa = language === 'fa';
  const { data, loading, error } = useReport<RoadmapReport>(`/api/planning/roadmap?projectId=${encodeURIComponent(currentProject.id)}`, 'planning');
  const [zoom, setZoom] = useState<Zoom>('months');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [isAddEpicOpen, setIsAddEpicOpen] = useState(false);
  const [newEpicName, setNewEpicName] = useState('');
  const todayStr = new Date().toISOString().slice(0, 10);
  const [newStartDate, setNewStartDate] = useState(todayStr);
  const [newEndDate, setNewEndDate] = useState(addDays(todayStr, 60));

  const projectEpics = epics.filter(e => e.projectId === currentProject.id);
  const epicViews = new Map((data?.epics || []).map(e => [e.id, e] as const));
  const today = data?.today || todayStr;
  const pxPerDay = PX_PER_DAY[zoom];

  // The visible range follows the data: earliest and latest planned date, padded and snapped to month borders.
  const range = useMemo(() => {
    const dates: string[] = [today];
    for (const e of data?.epics || []) {
      if (e.schedule.startDate) dates.push(e.schedule.startDate);
      if (e.schedule.dueDate) dates.push(e.schedule.dueDate);
      for (const c of e.children) {
        if (c.schedule.startDate) dates.push(c.schedule.startDate);
        if (c.schedule.dueDate) dates.push(c.schedule.dueDate);
      }
    }
    for (const s of data?.sprints || []) {
      if (s.startDate) dates.push(s.startDate);
      if (s.endDate) dates.push(s.endDate);
    }
    for (const r of data?.releases || []) {
      if (r.startDate) dates.push(r.startDate);
      if (r.releaseDate) dates.push(r.releaseDate);
    }
    for (const m of data?.milestones || []) if (m.dueDate) dates.push(m.dueDate);
    const sorted = dates.filter(Boolean).sort();
    const first = new Date(ms(addDays(sorted[0], -14)));
    const last = new Date(ms(addDays(sorted[sorted.length - 1], 21)));
    const start = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1);
    const end = Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1);
    return { start, end, days: Math.round((end - start) / DAY) };
  }, [data, today]);

  const width = Math.max(600, range.days * pxPerDay);
  const left = (d: string): number => ((ms(d) - range.start) / DAY) * pxPerDay;
  const bar = (s: Schedule): { left: number; width: number } | null => {
    if (!s.startDate && !s.dueDate) return null;
    const a = s.startDate || (s.dueDate as string);
    const b = s.dueDate || (s.startDate as string);
    const l = left(a);
    return { left: l, width: Math.max(10, left(addDays(b, 1)) - l) };
  };

  const columns = useMemo(() => {
    const cols: Array<{ key: string; label: string; left: number; width: number }> = [];
    if (zoom === 'weeks') {
      for (let t0 = range.start; t0 < range.end; t0 += 7 * DAY) {
        const d = new Date(t0);
        cols.push({ key: String(t0), label: `${MONTHS_EN[d.getUTCMonth()]} ${d.getUTCDate()}`, left: ((t0 - range.start) / DAY) * pxPerDay, width: 7 * pxPerDay });
      }
    } else {
      const step = zoom === 'months' ? 1 : 3;
      let cursor = new Date(range.start);
      while (cursor.getTime() < range.end) {
        const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + step, 1));
        const label = zoom === 'months' ? `${MONTHS_EN[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}` : `Q${Math.floor(cursor.getUTCMonth() / 3) + 1} ${cursor.getUTCFullYear()}`;
        cols.push({ key: String(cursor.getTime()), label, left: ((cursor.getTime() - range.start) / DAY) * pxPerDay, width: ((next.getTime() - cursor.getTime()) / DAY) * pxPerDay });
        cursor = next;
      }
    }
    return cols;
  }, [range, zoom, pxPerDay]);

  const handleAddEpic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEpicName.trim() || newEndDate < newStartDate) return;
    createEpic({ name: newEpicName.trim(), nameFa: newEpicName.trim(), summary: newEpicName.trim(), color: '#0ea5e9', status: 'todo', startDate: newStartDate, dueDate: newEndDate });
    setNewEpicName('');
    setIsAddEpicOpen(false);
  };

  const todayLeft = left(today);
  const Grid = (
    <div className="absolute inset-0 pointer-events-none">
      {columns.map(c => <div key={c.key} className="absolute top-0 bottom-0 border-s border-slate-100 dark:border-slate-800/50" style={{ left: c.left }} />)}
      <div className="absolute top-0 bottom-0 border-s-2 border-rose-400/70" style={{ left: todayLeft }} />
    </div>
  );

  const rowLeft = 'w-72 shrink-0 border-e border-slate-200 dark:border-slate-800 sticky start-0 z-10 bg-white dark:bg-slate-900';
  const sprintColor = (s: string) => (s === 'active' ? 'bg-blue-500' : s === 'completed' ? 'bg-slate-400' : 'bg-sky-300 dark:bg-sky-700');
  const healthColor = (h: string) => (h === 'overdue' ? 'bg-rose-500' : h === 'at_risk' ? 'bg-amber-500' : h === 'released' || h === 'completed' ? 'bg-emerald-500' : h === 'blocked' ? 'bg-purple-500' : 'bg-blue-500');

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/50 dark:bg-slate-950">
      <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-purple-600" />
            <span>{t.roadmapTitle}</span>
            {loading && !data && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {fa
              ? 'زمان‌بندی اپیک‌ها از تاریخ‌های خودشان یا از تسک‌ها و اسپرینت‌های زیرمجموعه محاسبه می‌شود؛ انتشارها و نقاط عطف روی همان محور نمایش داده می‌شوند.'
              : 'Epic schedules come from their own dates or are derived from child work items and sprints; releases and milestones share the same timeline.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-medium">
            {(['weeks', 'months', 'quarters'] as const).map(z => (
              <button key={z} onClick={() => setZoom(z)} className={`px-2.5 py-1 rounded-md transition-colors ${zoom === z ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>
                {z === 'weeks' ? t.zoomWeeks : z === 'months' ? t.zoomMonths : t.zoomQuarters}
              </button>
            ))}
          </div>
          <button onClick={() => setIsAddEpicOpen(true)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1 shadow-xs transition-colors">
            <Plus className="w-3.5 h-3.5" />
            <span>{t.addEpicOnTimeline}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="m-3 p-3 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />{error}
        </div>
      )}

      {isAddEpicOpen && (
        <div className="p-4 bg-purple-50/50 dark:bg-purple-950/30 border-b border-purple-200 dark:border-purple-800 shrink-0">
          <form onSubmit={handleAddEpic} className="max-w-2xl flex flex-wrap gap-3 items-end text-xs">
            <div className="flex-1 min-w-[220px]">
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{fa ? 'عنوان اپیک جدید' : 'Epic name'} *</label>
              <input type="text" required value={newEpicName} onChange={e => setNewEpicName(e.target.value)} className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-purple-500" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{fa ? 'تاریخ شروع' : 'Start date'}</label>
              <input type="date" value={newStartDate} onChange={e => setNewStartDate(e.target.value)} className="px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{fa ? 'تاریخ پایان' : 'End date'}</label>
              <input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} className="px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md" />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={newEndDate < newStartDate} className="px-4 py-1.5 bg-purple-600 text-white font-semibold rounded hover:bg-purple-700 disabled:opacity-50">{t.save}</button>
              <button type="button" onClick={() => setIsAddEpicOpen(false)} className="px-3 py-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">{t.cancel}</button>
            </div>
          </form>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <div style={{ minWidth: 288 + width }} className="flex flex-col">
          {/* header */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-20 text-xs font-semibold text-slate-600 dark:text-slate-400">
            <div className={`${rowLeft} p-3 flex items-center justify-between`}>
              <span>{t.epics}</span>
              <span className="font-mono text-[10px] text-slate-400">({projectEpics.length})</span>
            </div>
            <div dir="ltr" className="relative h-10" style={{ width }}>
              {columns.map(c => (
                <div key={c.key} className="absolute top-0 bottom-0 border-s border-slate-200 dark:border-slate-800 px-2 flex items-center whitespace-nowrap text-slate-700 dark:text-slate-300" style={{ left: c.left, width: c.width }}>
                  {c.label}
                </div>
              ))}
              <div className="absolute top-0 bottom-0 border-s-2 border-rose-400" style={{ left: todayLeft }} />
            </div>
          </div>

          {/* sprints, releases, milestones */}
          {data && data.sprints.length > 0 && (
            <div className="flex border-b border-slate-100 dark:border-slate-800/80">
              <div className={`${rowLeft} px-3 py-2 text-[11px] font-semibold text-slate-500`}>{fa ? 'اسپرینت‌ها' : 'Sprints'}</div>
              <div dir="ltr" className="relative h-9" style={{ width }}>
                {Grid}
                {data.sprints.map(s => {
                  const b = bar({ startDate: s.startDate, dueDate: s.endDate, source: 'epic' });
                  if (!b) return null;
                  return (
                    <div key={s.id} className={`absolute top-1.5 h-6 rounded text-white text-[10px] font-semibold px-2 flex items-center overflow-hidden whitespace-nowrap ${sprintColor(s.status)}`} style={{ left: b.left, width: b.width }} title={`${s.name} (${s.status}) · ${s.progress.percent}% ${t.done}`}>
                      {s.name}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {data && data.releases.length > 0 && (
            <div className="flex border-b border-slate-100 dark:border-slate-800/80">
              <div className={`${rowLeft} px-3 py-2 text-[11px] font-semibold text-slate-500 flex items-center gap-1`}><Rocket className="w-3 h-3" />{fa ? 'انتشارها' : 'Releases'}</div>
              <div dir="ltr" className="relative h-9" style={{ width }}>
                {Grid}
                {data.releases.map(r => {
                  const b = bar({ startDate: r.startDate ?? null, dueDate: r.releaseDate ?? null, source: 'epic' });
                  if (!b) return null;
                  return (
                    <div key={r.id} className="absolute top-1.5 h-6 flex items-center" style={{ left: b.left, width: b.width }} title={`${r.name} · ${r.progress.percent}% ${t.done} · ${r.openIssueCount} open`}>
                      <div className={`h-1.5 flex-1 rounded-full opacity-60 ${healthColor(r.health)}`} />
                      <div className={`w-3.5 h-3.5 rotate-45 shrink-0 ${healthColor(r.health)}`} />
                      <span className="absolute -top-0.5 start-0 text-[10px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap px-1">{r.name.split(' ')[0]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {data && data.milestones.some(m => m.dueDate) && (
            <div className="flex border-b border-slate-100 dark:border-slate-800/80">
              <div className={`${rowLeft} px-3 py-2 text-[11px] font-semibold text-slate-500 flex items-center gap-1`}><Flag className="w-3 h-3" />{fa ? 'نقاط عطف' : 'Milestones'}</div>
              <div dir="ltr" className="relative h-9" style={{ width }}>
                {Grid}
                {data.milestones.filter(m => m.dueDate).map(m => (
                  <div key={m.id} className="absolute top-1.5 flex items-center gap-1 whitespace-nowrap" style={{ left: left(m.dueDate as string) - 6 }} title={`${m.title} · ${m.dueDate} · ${m.progress.percent}%`}>
                    <Flag className={`w-3.5 h-3.5 ${m.health === 'overdue' ? 'text-rose-500' : m.health === 'completed' ? 'text-emerald-500' : 'text-purple-500'}`} />
                    <span className="text-[10px] text-slate-600 dark:text-slate-300">{fa ? m.titleFa || m.title : m.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* epics */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {projectEpics.length === 0 && <div className="p-10 text-center text-xs text-slate-400">{fa ? 'اپیکی وجود ندارد.' : 'No epics yet.'}</div>}
            {projectEpics.map(epic => {
              const view = epicViews.get(epic.id);
              const percent = view?.progress.percent ?? (epic.status === 'done' ? 100 : 0);
              const b = view ? bar(view.schedule) : bar({ startDate: epic.startDate, dueDate: epic.dueDate, source: 'epic' });
              const isOpen = expanded[epic.id] ?? false;
              const derived = view && view.schedule.source !== 'epic' && view.schedule.source !== 'none';
              return (
                <div key={epic.id}>
                  <div className="flex hover:bg-slate-100/50 dark:hover:bg-slate-900/40 transition-colors items-stretch">
                    <div className={`${rowLeft} p-3 flex items-center justify-between gap-2`}>
                      <div className="flex items-center gap-2 truncate">
                        <button onClick={() => setExpanded(p => ({ ...p, [epic.id]: !isOpen }))} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded">
                          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                        <span className="w-3 h-3 rounded-xs shrink-0" style={{ backgroundColor: epic.color }} />
                        <div className="truncate">
                          <span className="font-semibold text-xs text-slate-900 dark:text-white truncate block">{fa ? epic.nameFa : epic.name}</span>
                          <span className="font-mono text-[10px] text-slate-400">{epic.key}{derived ? ` · ${fa ? 'محاسبه‌شده از' : 'derived from'} ${view?.schedule.source}` : ''}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {view?.overdue && <span title={fa ? 'عقب‌افتاده' : 'Overdue'}><AlertTriangle className="w-3.5 h-3.5 text-rose-500" /></span>}
                        {view?.slipping && !view.overdue && <span title={fa ? 'کارها بعد از پایان اپیک برنامه‌ریزی شده‌اند' : 'Child work is scheduled after the epic ends'}><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /></span>}
                        <span className="font-mono text-[10px] text-slate-500 font-semibold tabular-nums bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{percent}%</span>
                      </div>
                    </div>
                    <div dir="ltr" className="relative min-h-[52px]" style={{ width }}>
                      {Grid}
                      {b ? (
                        <div
                          className={`absolute top-2.5 h-8 rounded-lg shadow-sm flex items-center px-3 text-white text-[11px] font-semibold overflow-hidden z-[1] border ${view?.overdue ? 'border-rose-400 ring-1 ring-rose-400' : derived ? 'border-dashed border-white/70' : 'border-white/20'}`}
                          style={{ left: b.left, width: b.width, backgroundColor: epic.color }}
                          title={`${epic.name} (${view?.schedule.startDate ?? ''} → ${view?.schedule.dueDate ?? ''}) · ${percent}% ${t.done}`}
                        >
                          <div className="absolute inset-y-0 start-0 bg-black/25" style={{ width: `${percent}%` }} />
                          <span className="relative z-10 truncate font-mono flex items-center gap-1.5"><span>{epic.key}</span><span className="opacity-90">· {percent}%</span></span>
                        </div>
                      ) : (
                        <div className="absolute top-4 start-3 text-[11px] text-slate-400">{fa ? 'بدون تاریخ؛ تاریخ به تسک‌ها یا اسپرینت اضافه کنید' : 'No dates yet — schedule its work items or sprints'}</div>
                      )}
                    </div>
                  </div>

                  {isOpen && view?.children.map(child => {
                    const cb = bar(child.schedule);
                    return (
                      <div key={child.id} onClick={() => setSelectedIssueId(child.id)} className="flex hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors border-t border-slate-100 dark:border-slate-800/40 cursor-pointer text-xs items-stretch">
                        <div className={`${rowLeft} ps-9 pe-3 py-2 flex items-center gap-2 truncate`}>
                          <IssueTypeIcon type={child.type as never} className="w-3.5 h-3.5 shrink-0" />
                          <span className="font-mono text-[11px] text-slate-400 shrink-0">{child.key}</span>
                          <span className="text-slate-700 dark:text-slate-300 truncate font-medium">{child.summary}</span>
                        </div>
                        <div dir="ltr" className="relative min-h-[38px]" style={{ width }}>
                          {Grid}
                          {cb ? (
                            <div
                              className={`absolute top-2 h-5 rounded-md px-2 text-[10px] font-semibold flex items-center shadow-xs border z-[1] ${
                                child.category === 'done'
                                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                                  : child.category === 'inprogress'
                                  ? 'bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                                  : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                              } ${child.schedule.source === 'sprints' ? 'border-dashed' : ''}`}
                              style={{ left: cb.left, width: cb.width }}
                              title={`${child.key}: ${child.summary} (${child.status}) ${child.schedule.startDate ?? ''} → ${child.schedule.dueDate ?? ''}${child.schedule.source === 'sprints' ? ' · from sprint' : ''}`}
                            >
                              <span className="truncate">{child.status}</span>
                            </div>
                          ) : (
                            <div className="absolute top-2.5 start-3 text-[10px] text-slate-400">{fa ? 'بدون تاریخ' : 'not scheduled'}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
