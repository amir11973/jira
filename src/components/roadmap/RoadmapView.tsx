import React, { useState } from 'react';
import { 
  Calendar, Plus, ChevronRight, ChevronDown, 
  Layers, Clock, CheckCircle2 
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { Epic, Issue } from '../../types/jira';
import { IssueTypeIcon } from '../common/JiraIcons';

export const RoadmapView: React.FC = () => {
  const { currentProject, epics, issues, createEpic, setSelectedIssueId, t, language } = useJira();
  const [zoomLevel, setZoomLevel] = useState<'weeks' | 'months' | 'quarters'>('months');
  const [expandedEpics, setExpandedEpics] = useState<Record<string, boolean>>({
    'epic-1': true,
    'epic-2': true,
  });

  const [isAddEpicOpen, setIsAddEpicOpen] = useState(false);
  const [newEpicName, setNewEpicName] = useState('');
  const [newStartDate, setNewStartDate] = useState('2026-11-01');
  const [newEndDate, setNewEndDate] = useState('2026-12-31');

  const projectEpics = epics.filter(e => e.projectId === currentProject.id);

  const toggleExpand = (epicId: string) => {
    setExpandedEpics(prev => ({ ...prev, [epicId]: !prev[epicId] }));
  };

  const handleAddEpic = (e: React.FormEvent) => {
    e.preventDefault();
    if (newEpicName.trim()) {
      createEpic({
        name: newEpicName.trim(),
        nameFa: newEpicName.trim(),
        summary: newEpicName.trim(),
        color: '#0ea5e9',
        status: 'inprogress',
        startDate: newStartDate,
        dueDate: newEndDate,
      });
      setNewEpicName('');
      setIsAddEpicOpen(false);
    }
  };

  // Fixed timeline timeline range: Oct 2026 to Mar 2027
  const timelineMonths = [
    { label: 'Oct 2026', labelFa: 'مهر ۱۴۰۵', startDays: 0, days: 31 },
    { label: 'Nov 2026', labelFa: 'آبان ۱۴۰۵', startDays: 31, days: 30 },
    { label: 'Dec 2026', labelFa: 'آذر ۱۴۰۵', startDays: 61, days: 31 },
    { label: 'Jan 2027', labelFa: 'دی ۱۴۰۵', startDays: 92, days: 31 },
    { label: 'Feb 2027', labelFa: 'بهمن ۱۴۰۵', startDays: 123, days: 28 },
    { label: 'Mar 2027', labelFa: 'اسفند ۱۴۰۵', startDays: 151, days: 31 },
  ];
  const totalDays = 182; // ~6 months

  // Calculate position & width percentage for an epic bar
  const getBarPosition = (startDateStr: string, endDateStr: string) => {
    const baseDate = new Date('2026-10-01').getTime();
    const start = new Date(startDateStr).getTime();
    const end = new Date(endDateStr).getTime();

    const startDiffDays = Math.max(0, (start - baseDate) / (1000 * 60 * 60 * 24));
    const durationDays = Math.max(7, (end - start) / (1000 * 60 * 60 * 24));

    const leftPercent = Math.min(95, Math.max(0, (startDiffDays / totalDays) * 100));
    const widthPercent = Math.min(100 - leftPercent, Math.max(5, (durationDays / totalDays) * 100));

    return { leftPercent, widthPercent };
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/50 dark:bg-slate-950">
      {/* Header & Controls */}
      <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-purple-600" />
            <span>{t.roadmapTitle}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t.roadmapSubtitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-medium">
            {(['weeks', 'months', 'quarters'] as const).map(z => (
              <button
                key={z}
                onClick={() => setZoomLevel(z)}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  zoomLevel === z
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {z === 'weeks' ? t.zoomWeeks : z === 'months' ? t.zoomMonths : t.zoomQuarters}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsAddEpicOpen(true)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1 shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.addEpicOnTimeline}</span>
          </button>
        </div>
      </div>

      {/* Add Epic Modal / Popover */}
      {isAddEpicOpen && (
        <div className="p-4 bg-purple-50/50 dark:bg-purple-950/30 border-b border-purple-200 dark:border-purple-800 shrink-0">
          <form onSubmit={handleAddEpic} className="max-w-xl flex flex-wrap gap-3 items-end text-xs">
            <div className="flex-1 min-w-[200px]">
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {language === 'fa' ? 'عنوان اپیک جدید' : 'Epic Name'}
              </label>
              <input
                type="text"
                required
                value={newEpicName}
                onChange={(e) => setNewEpicName(e.target.value)}
                placeholder="e.g. Next-Gen Public API Gateway"
                className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {language === 'fa' ? 'شروع' : 'Start'}
              </label>
              <input
                type="date"
                value={newStartDate}
                onChange={(e) => setNewStartDate(e.target.value)}
                className="px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {language === 'fa' ? 'پایان' : 'End'}
              </label>
              <input
                type="date"
                value={newEndDate}
                onChange={(e) => setNewEndDate(e.target.value)}
                className="px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-1.5 bg-purple-600 text-white font-semibold rounded hover:bg-purple-700"
              >
                {t.save}
              </button>
              <button
                type="button"
                onClick={() => setIsAddEpicOpen(false)}
                className="px-3 py-1.5 text-slate-500 hover:text-slate-700"
              >
                {t.cancel}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Gantt Timeline Board */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-[1000px] h-full flex flex-col">
          {/* Timeline Header Columns */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-10 text-xs font-semibold text-slate-600 dark:text-slate-400">
            <div className="w-80 p-3 border-e border-slate-200 dark:border-slate-800 shrink-0">
              {t.epics}
            </div>
            <div className="flex-1 grid grid-cols-6 divide-x divide-slate-200 dark:divide-slate-800">
              {timelineMonths.map((m, idx) => (
                <div key={idx} className="p-3 text-center truncate">
                  {language === 'fa' ? m.labelFa : m.label}
                </div>
              ))}
            </div>
          </div>

          {/* Timeline Body Rows */}
          <div className="flex-1 divide-y divide-slate-100 dark:divide-slate-800/80">
            {projectEpics.map((epic) => {
              const epicIssues = issues.filter(i => i.epicId === epic.id);
              const doneIssues = epicIssues.filter(i => i.status === 'done');
              const progressPercent = epicIssues.length > 0 ? Math.round((doneIssues.length / epicIssues.length) * 100) : 0;
              const { leftPercent, widthPercent } = getBarPosition(epic.startDate, epic.dueDate);
              const isExpanded = expandedEpics[epic.id];

              return (
                <div key={epic.id} className="group">
                  {/* Epic Main Row */}
                  <div className="flex hover:bg-slate-100/50 dark:hover:bg-slate-900/40 transition-colors">
                    {/* Epic Left Details */}
                    <div className="w-80 p-3 border-e border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <button
                          onClick={() => toggleExpand(epic.id)}
                          className="p-0.5 text-slate-400 hover:text-slate-600"
                        >
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                        <span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{ backgroundColor: epic.color }} />
                        <span className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                          {language === 'fa' ? epic.nameFa : epic.name}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-400 font-semibold tabular-nums">
                        {progressPercent}%
                      </span>
                    </div>

                    {/* Epic Gantt Bar Cell */}
                    <div className="flex-1 relative p-2 min-h-[48px] flex items-center">
                      {/* Grid guideline markings */}
                      <div className="absolute inset-0 grid grid-cols-6 divide-x divide-slate-100 dark:divide-slate-800/40 pointer-events-none" />

                      {/* Interactive Gantt Bar */}
                      <div
                        className="relative h-7 rounded-md shadow-xs flex items-center px-2.5 text-white text-[11px] font-semibold transition-all hover:brightness-105 cursor-pointer overflow-hidden z-1"
                        style={{
                          left: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                          backgroundColor: epic.color,
                        }}
                        title={`${epic.name} (${epic.startDate} - ${epic.dueDate})`}
                      >
                        {/* Progress Fill inside bar */}
                        <div 
                          className="absolute inset-y-0 start-0 bg-black/20" 
                          style={{ width: `${progressPercent}%` }} 
                        />
                        <span className="relative z-2 truncate drop-shadow-xs">
                          {epic.key} · {progressPercent}% {language === 'fa' ? 'پیشرفت' : 'done'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Child Stories & Tasks (when expanded) */}
                  {isExpanded && epicIssues.map((childIssue) => {
                    return (
                      <div 
                        key={childIssue.id}
                        onClick={() => setSelectedIssueId(childIssue.id)}
                        className="flex hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors border-t border-slate-100 dark:border-slate-800/40 cursor-pointer text-xs"
                      >
                        {/* Child Left Info */}
                        <div className="w-80 ps-9 pe-3 py-2 border-e border-slate-200 dark:border-slate-800 shrink-0 flex items-center gap-2 truncate">
                          <IssueTypeIcon type={childIssue.type} className="w-3.5 h-3.5 shrink-0" />
                          <span className="font-mono text-[11px] text-slate-400 shrink-0">{childIssue.key}</span>
                          <span className="text-slate-700 dark:text-slate-300 truncate font-medium">
                            {childIssue.summary}
                          </span>
                        </div>

                        {/* Child Timeline Marker */}
                        <div className="flex-1 relative p-1.5 flex items-center">
                          <div className="absolute inset-0 grid grid-cols-6 divide-x divide-slate-100 dark:divide-slate-800/40 pointer-events-none" />
                          <div
                            className={`relative h-4 rounded-full px-2 text-[10px] font-medium flex items-center gap-1 ${
                              childIssue.status === 'done' 
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                                : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                            style={{
                              left: `${leftPercent + 4}%`,
                              width: '120px',
                            }}
                          >
                            <span className="truncate">{childIssue.status}</span>
                          </div>
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
