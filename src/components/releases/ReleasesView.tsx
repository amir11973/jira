import React, { useState } from 'react';
import { Package, Plus, Calendar, Check, AlertTriangle, Clock, Loader2 } from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { useReport } from '../../services/reports';
import type { ReleaseHealth, ReleasesReport } from '../../services/reports';

const HEALTH: Record<ReleaseHealth, { en: string; fa: string; cls: string }> = {
  released: { en: 'Released', fa: 'منتشر شده', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  on_track: { en: 'On track', fa: 'مطابق برنامه', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  at_risk: { en: 'At risk', fa: 'در معرض ریسک', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  overdue: { en: 'Overdue', fa: 'عقب‌افتاده', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' },
  no_scope: { en: 'No work assigned', fa: 'بدون تسک', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
};

export const ReleasesView: React.FC = () => {
  const { currentProject, versions, createVersion, updateVersion, toggleReleaseVersion, setSelectedIssueId, users, t, language } = useJira();
  const fa = language === 'fa';
  const { data, loading, error } = useReport<ReleasesReport>(`/api/planning/releases?projectId=${encodeURIComponent(currentProject.id)}`, 'planning');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [releaseDate, setReleaseDate] = useState('');

  const projectVersions = versions.filter(v => v.projectId === currentProject.id);
  const views = new Map((data?.releases || []).map(r => [r.id, r] as const));

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (startDate && releaseDate && releaseDate < startDate) return;
    createVersion({
      name: name.trim(),
      description: description.trim(),
      releaseDate: releaseDate || undefined,
      startDate: startDate || undefined,
      isReleased: false,
    });
    setName('');
    setDescription('');
    setReleaseDate('');
    setIsCreateOpen(false);
  };

  const release = (id: string) => {
    const view = views.get(id);
    const version = versions.find(v => v.id === id);
    if (version && !version.isReleased && view && view.openIssueCount > 0) {
      const ok = window.confirm(
        fa
          ? `${view.openIssueCount} تسک هنوز باز است. با این حال نسخه منتشر شود؟`
          : `${view.openIssueCount} work item(s) are still open in this version. Release it anyway?`
      );
      if (!ok) return;
    }
    toggleReleaseVersion(id);
  };

  const userName = (id: string | null) => {
    const u = users.find(x => x.id === id);
    return u ? (fa ? u.nameFa : u.name) : fa ? 'بدون مسئول' : 'Unassigned';
  };

  const dateInput = 'px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-xs font-mono';

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            <span>{t.releasesTitle}</span>
            {loading && !data && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {fa
              ? 'پیشرفت هر نسخه از تسک‌هایی که آن را به‌عنوان «نسخه انتشار» دارند محاسبه می‌شود.'
              : 'Each release is derived live from the work items that have it as their fix version.'}
          </p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{t.createNewVersion}</span>
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {isCreateOpen && (
        <form onSubmit={handleCreate} className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-md space-y-3 max-w-xl text-xs">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">{t.createNewVersion}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.versionName} *</label>
              <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="v3.0.0" className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{fa ? 'تاریخ شروع' : 'Start date'}</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.releaseDate}</label>
              <input type="date" value={releaseDate} onChange={e => setReleaseDate(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none" />
            </div>
          </div>
          {startDate && releaseDate && releaseDate < startDate && (
            <div className="text-rose-600">{fa ? 'تاریخ انتشار قبل از تاریخ شروع است.' : 'The release date is before the start date.'}</div>
          )}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.description}</label>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Release highlights and scope..." className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none resize-none" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setIsCreateOpen(false)} className="px-3 py-1 text-slate-500 hover:text-slate-700">{t.cancel}</button>
            <button type="submit" className="px-4 py-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded">{t.save}</button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {projectVersions.length === 0 && (
          <div className="p-10 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
            {fa ? 'هنوز نسخه‌ای ساخته نشده است.' : 'No versions yet. Create one and assign it as the fix version of work items.'}
          </div>
        )}
        {projectVersions.map(version => {
          const view = views.get(version.id);
          const p = view?.progress;
          const total = p?.total ?? 0;
          const donePct = total ? Math.round(((p?.done ?? 0) / total) * 100) : 0;
          const inProgPct = total ? Math.round(((p?.inProgress ?? 0) / total) * 100) : 0;
          const todoPct = total ? Math.max(0, 100 - donePct - inProgPct) : 0;
          const health: ReleaseHealth = view?.health ?? (version.isReleased ? 'released' : 'on_track');
          const days = view?.daysToRelease;
          const slipping = !version.isReleased && view?.derivedReleaseDate && version.releaseDate && view.derivedReleaseDate > version.releaseDate;

          return (
            <div key={version.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">{version.name}</h3>
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${HEALTH[health].cls}`}>{fa ? HEALTH[health].fa : HEALTH[health].en}</span>
                    {view?.readyToRelease && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-600 text-white">{fa ? 'آماده انتشار' : 'Ready to release'}</span>
                    )}
                  </div>
                  {version.description && <p className="text-xs text-slate-500 dark:text-slate-400">{version.description}</p>}
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />
                      <input type="date" aria-label="Start date" className={dateInput} value={version.startDate || ''} onChange={e => updateVersion(version.id, { startDate: e.target.value || undefined })} />
                      →
                      <input type="date" aria-label="Release date" className={dateInput} value={version.releaseDate || ''} onChange={e => updateVersion(version.id, { releaseDate: e.target.value || undefined })} />
                    </span>
                    {!version.isReleased && days !== null && days !== undefined && (
                      <span className={`flex items-center gap-1 ${days < 0 ? 'text-rose-600 font-semibold' : ''}`}>
                        <Clock className="w-3 h-3" />
                        {days < 0 ? (fa ? `${-days} روز عقب‌افتاده` : `${-days} day(s) overdue`) : days === 0 ? (fa ? 'امروز' : 'today') : fa ? `${days} روز مانده` : `${days} day(s) left`}
                      </span>
                    )}
                  </div>
                  {slipping && (
                    <div className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {fa
                        ? `کارهای باز تا ${view?.derivedReleaseDate} برنامه‌ریزی شده‌اند که پس از تاریخ انتشار است.`
                        : `Open work is scheduled until ${view?.derivedReleaseDate}, after the release date.`}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => release(version.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 self-start ${
                    version.isReleased ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{version.isReleased ? t.unreleaseVersion : t.releaseVersion}</span>
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">{t.progress}</span>
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                    {p ? `${p.percent}% ${t.done} (${p.done}/${p.total} ${t.issuesCount}${p.basis === 'points' ? ` · ${p.donePoints}/${p.totalPoints} ${fa ? 'امتیاز' : 'pts'}` : ''})` : '…'}
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full flex overflow-hidden">
                  <div style={{ width: `${donePct}%` }} className="bg-emerald-500 transition-all duration-300" title={`Done: ${donePct}%`} />
                  <div style={{ width: `${inProgPct}%` }} className="bg-blue-500 transition-all duration-300" title={`In progress: ${inProgPct}%`} />
                  <div style={{ width: `${todoPct}%` }} className="bg-slate-300 dark:bg-slate-700 transition-all duration-300" title={`To do: ${todoPct}%`} />
                </div>
                <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-1">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />{p?.done ?? 0} {t.done}</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />{p?.inProgress ?? 0} {t.inprogress}</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400" />{p?.todo ?? 0} {t.todo}</span>
                </div>
              </div>

              {view && view.openIssues.length > 0 && (
                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 space-y-1.5">
                  <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                    {fa ? `تسک‌های باز (${view.openIssueCount})` : `Open work (${view.openIssueCount})`}
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {view.openIssues.map(iss => (
                      <button key={iss.id} onClick={() => setSelectedIssueId(iss.id)} className="w-full flex items-center gap-3 py-1.5 text-start text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 px-1 rounded">
                        <span className="font-mono font-bold text-blue-600 shrink-0">{iss.key}</span>
                        <span className="truncate flex-1 text-slate-700 dark:text-slate-300">{iss.summary}</span>
                        <span className="text-[10px] text-slate-400 shrink-0">{userName(iss.assigneeId)}</span>
                        <span className={`text-[10px] font-mono shrink-0 ${iss.dueDate && data && iss.dueDate < data.today ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>{iss.dueDate || ''}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
