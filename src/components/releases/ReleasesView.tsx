import React, { useState } from 'react';
import { 
  Package, Plus, CheckCircle2, Clock, Calendar, 
  ExternalLink, Check, RefreshCw 
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { Version } from '../../types/jira';

export const ReleasesView: React.FC = () => {
  const { 
    currentProject, versions, issues, createVersion, 
    toggleReleaseVersion, setSelectedIssueId, t, language 
  } = useJira();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [releaseDate, setReleaseDate] = useState('2026-12-15');

  const projectVersions = versions.filter(v => v.projectId === currentProject.id);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      createVersion({
        name: name.trim(),
        description: description.trim(),
        releaseDate,
        startDate: new Date().toISOString().split('T')[0],
        isReleased: false,
      });
      setName('');
      setDescription('');
      setIsCreateOpen(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            <span>{t.releasesTitle}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {language === 'fa' 
              ? 'مدیریت و پیگیری چرخه‌های انتشار نرم‌افزار، نسخه‌ها و میزان آمادگی تسک‌ها.' 
              : 'Track software releases, version readiness, and deliverable features.'}
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

      {/* Create Version Form Popover */}
      {isCreateOpen && (
        <form onSubmit={handleCreate} className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-md space-y-3 max-w-xl text-xs">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
            {t.createNewVersion}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t.versionName} *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="v3.0.0"
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t.releaseDate}
              </label>
              <input
                type="date"
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t.description}
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Release highlights and scope..."
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="px-3 py-1 text-slate-500 hover:text-slate-700"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="px-4 py-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded"
            >
              {t.save}
            </button>
          </div>
        </form>
      )}

      {/* Versions List */}
      <div className="space-y-4">
        {projectVersions.map((version) => {
          const versionIssues = issues.filter(i => i.fixVersionIds?.includes(version.id));
          const doneCount = versionIssues.filter(i => i.status === 'done').length;
          const inProgressCount = versionIssues.filter(i => i.status === 'inprogress' || i.status === 'review').length;
          const todoCount = versionIssues.filter(i => i.status === 'todo' || i.status === 'backlog').length;

          const total = versionIssues.length;
          const donePercent = total > 0 ? Math.round((doneCount / total) * 100) : (version.isReleased ? 100 : 0);
          const inProgressPercent = total > 0 ? Math.round((inProgressCount / total) * 100) : 0;
          const todoPercent = total > 0 ? 100 - donePercent - inProgressPercent : 0;

          return (
            <div
              key={version.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      {version.name}
                    </h3>
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                      version.isReleased
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    }`}>
                      {version.isReleased ? t.released : t.unreleased}
                    </span>
                  </div>
                  {version.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {version.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {version.releaseDate && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{version.releaseDate}</span>
                    </div>
                  )}

                  <button
                    onClick={() => toggleReleaseVersion(version.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                      version.isReleased
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{version.isReleased ? t.unreleaseVersion : t.releaseVersion}</span>
                  </button>
                </div>
              </div>

              {/* Progress Bar Breakdown */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">{t.progress}</span>
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                    {donePercent}% {t.done} ({doneCount}/{total} {t.issuesCount})
                  </span>
                </div>

                <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full flex overflow-hidden">
                  <div style={{ width: `${donePercent}%` }} className="bg-emerald-500 transition-all duration-300" title={`Done: ${donePercent}%`} />
                  <div style={{ width: `${inProgressPercent}%` }} className="bg-blue-500 transition-all duration-300" title={`In Progress: ${inProgressPercent}%`} />
                  <div style={{ width: `${todoPercent}%` }} className="bg-slate-300 dark:bg-slate-700 transition-all duration-300" title={`To Do: ${todoPercent}%`} />
                </div>

                <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-1">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>{doneCount} {t.done}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span>{inProgressCount} {t.inprogress}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    <span>{todoCount} {t.todo}</span>
                  </span>
                </div>
              </div>

              {/* Issues in this release */}
              {versionIssues.length > 0 && (
                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 space-y-1.5">
                  <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                    {language === 'fa' ? 'تسک‌های شامل این نسخه:' : 'Issues in this release:'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {versionIssues.map(iss => (
                      <button
                        key={iss.id}
                        onClick={() => setSelectedIssueId(iss.id)}
                        className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-xs font-mono font-semibold text-slate-700 dark:text-slate-300 transition-colors"
                      >
                        {iss.key}
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
