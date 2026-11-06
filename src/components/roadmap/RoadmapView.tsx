import React, { useState } from 'react';
import { 
  Calendar, Plus, ChevronRight, ChevronDown, 
  Layers, Clock, CheckCircle2, AlertCircle, Info 
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

  // Fixed timeline range: Oct 1, 2026 to Mar 31, 2027 (6 months)
  const timelineMonths = [
    { key: 'oct26', label: 'Oct 2026', labelFa: 'مهر ۱۴۰۵' },
    { key: 'nov26', label: 'Nov 2026', labelFa: 'آبان ۱۴۰۵' },
    { key: 'dec26', label: 'Dec 2026', labelFa: 'آذر ۱۴۰۵' },
    { key: 'jan27', label: 'Jan 2027', labelFa: 'دی ۱۴۰۵' },
    { key: 'feb27', label: 'Feb 2027', labelFa: 'بهمن ۱۴۰۵' },
    { key: 'mar27', label: 'Mar 2027', labelFa: 'اسفند ۱۴۰۵' },
  ];

  const timelineStart = new Date('2026-10-01T00:00:00Z').getTime();
  const timelineEnd = new Date('2027-03-31T23:59:59Z').getTime();
  const totalDuration = timelineEnd - timelineStart;

  // Calculate position & width percentage for a bar along the time axis
  const getBarPosition = (startDateStr: string, endDateStr: string) => {
    const start = new Date(startDateStr).getTime();
    const end = new Date(endDateStr).getTime();

    const clampedStart = Math.max(timelineStart, Math.min(timelineEnd, start));
    const clampedEnd = Math.max(clampedStart + 86400000 * 3, Math.min(timelineEnd, end));

    const leftPercent = ((clampedStart - timelineStart) / totalDuration) * 100;
    const widthPercent = Math.max(4, ((clampedEnd - clampedStart) / totalDuration) * 100);

    return { 
      leftPercent: Math.max(0, Math.min(96, leftPercent)), 
      widthPercent: Math.min(100 - leftPercent, Math.max(4, widthPercent)) 
    };
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
        <div className="p-4 bg-purple-50/50 dark:bg-purple-950/30 border-b border-purple-200 dark:border-purple-800 shrink-0 animate-in fade-in duration-150">
          <form onSubmit={handleAddEpic} className="max-w-2xl flex flex-wrap gap-3 items-end text-xs">
            <div className="flex-1 min-w-[220px]">
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {language === 'fa' ? 'عنوان اپیک جدید' : 'Epic Name'} *
              </label>
              <input
                type="text"
                required
                value={newEpicName}
                onChange={(e) => setNewEpicName(e.target.value)}
                placeholder="e.g. Next-Gen Public API Gateway"
                className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {language === 'fa' ? 'تاریخ شروع' : 'Start Date'}
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
                {language === 'fa' ? 'تاریخ پایان' : 'End Date'}
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
                className="px-4 py-1.5 bg-purple-600 text-white font-semibold rounded hover:bg-purple-700 transition-colors"
              >
                {t.save}
              </button>
              <button
                type="button"
                onClick={() => setIsAddEpicOpen(false)}
                className="px-3 py-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                {t.cancel}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Gantt Timeline Board */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-[1020px] h-full flex flex-col">
          {/* Timeline Header */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-20 text-xs font-semibold text-slate-600 dark:text-slate-400">
            {/* Left Column: Epic list header */}
            <div className="w-80 p-3 border-e border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-between">
              <span>{t.epics}</span>
              <span className="font-mono text-[10px] text-slate-400">({projectEpics.length})</span>
            </div>

            {/* Right Column: Chronological Time Axis Header (Always LTR from past to future) */}
            <div dir="ltr" className="flex-1 grid grid-cols-6 divide-x divide-slate-200 dark:divide-slate-800">
              {timelineMonths.map((m) => (
                <div key={m.key} className="p-3 text-center truncate font-medium text-slate-700 dark:text-slate-300">
                  {language === 'fa' ? m.labelFa : m.label}
                </div>
              ))}
            </div>
          </div>

          {/* Timeline Rows */}
          <div className="flex-1 divide-y divide-slate-100 dark:divide-slate-800/80">
            {projectEpics.map((epic) => {
              const epicIssues = issues.filter(i => i.epicId === epic.id);
              const doneIssues = epicIssues.filter(i => i.status === 'done');
              const progressPercent = epicIssues.length > 0 
                ? Math.round((doneIssues.length / epicIssues.length) * 100) 
                : (epic.status === 'done' ? 100 : 0);
              
              const { leftPercent, widthPercent } = getBarPosition(epic.startDate, epic.dueDate);
              const isExpanded = expandedEpics[epic.id];

              return (
                <div key={epic.id} className="group">
                  {/* Epic Main Row */}
                  <div className="flex hover:bg-slate-100/50 dark:hover:bg-slate-900/40 transition-colors items-stretch">
                    {/* Epic Left Column Info */}
                    <div className="w-80 p-3 border-e border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <button
                          onClick={() => toggleExpand(epic.id)}
                          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
                          title={isExpanded ? 'Collapse child issues' : 'Expand child issues'}
                        >
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                        <span 
                          className="w-3 h-3 rounded-xs shrink-0 shadow-xs" 
                          style={{ backgroundColor: epic.color }} 
                        />
                        <div className="truncate">
                          <span className="font-semibold text-xs text-slate-900 dark:text-white truncate block">
                            {language === 'fa' ? epic.nameFa : epic.name}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">{epic.key}</span>
                        </div>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 font-semibold tabular-nums shrink-0 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {progressPercent}%
                      </span>
                    </div>

                    {/* Epic Gantt Bar Canvas (DIR="LTR" for reliable chronological rendering) */}
                    <div dir="ltr" className="flex-1 relative min-h-[52px] flex items-center px-0">
                      {/* Grid guideline markings */}
                      <div className="absolute inset-0 grid grid-cols-6 divide-x divide-slate-100 dark:divide-slate-800/40 pointer-events-none" />

                      {/* Interactive Gantt Bar (Absolute Positioning) */}
                      <div
                        className="absolute h-8 rounded-lg shadow-sm flex items-center px-3 text-white text-[11px] font-semibold transition-all hover:shadow-md hover:brightness-105 cursor-pointer overflow-hidden z-10 border border-white/20 select-none"
                        style={{
                          left: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                          backgroundColor: epic.color,
                        }}
                        title={`${epic.name} (${epic.startDate} - ${epic.dueDate}) - ${progressPercent}% done`}
                      >
                        {/* Progress Fill inside bar */}
                        <div 
                          className="absolute inset-y-0 start-0 bg-black/25 transition-all" 
                          style={{ width: `${progressPercent}%` }} 
                        />
                        <span className="relative z-10 truncate drop-shadow-xs font-mono text-[11px] flex items-center gap-1.5">
                          <span>{epic.key}</span>
                          <span className="opacity-90">· {progressPercent}%</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Child Stories & Tasks (when expanded) */}
                  {isExpanded && epicIssues.map((childIssue, cIdx) => {
                    // Stagger child bars nicely within the epic's span
                    const childStep = widthPercent / Math.max(1, epicIssues.length);
                    const childLeft = Math.min(92, leftPercent + (cIdx * (childStep * 0.7)));
                    const childWidth = Math.max(8, Math.min(20, childStep * 1.4));

                    return (
                      <div 
                        key={childIssue.id}
                        onClick={() => setSelectedIssueId(childIssue.id)}
                        className="flex hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors border-t border-slate-100 dark:border-slate-800/40 cursor-pointer text-xs items-stretch"
                      >
                        {/* Child Left Column Info */}
                        <div className="w-80 ps-9 pe-3 py-2 border-e border-slate-200 dark:border-slate-800 shrink-0 flex items-center gap-2 truncate">
                          <IssueTypeIcon type={childIssue.type} className="w-3.5 h-3.5 shrink-0" />
                          <span className="font-mono text-[11px] text-slate-400 shrink-0">{childIssue.key}</span>
                          <span className="text-slate-700 dark:text-slate-300 truncate font-medium">
                            {childIssue.summary}
                          </span>
                        </div>

                        {/* Child Timeline Bar Canvas (LTR) */}
                        <div dir="ltr" className="flex-1 relative min-h-[38px] flex items-center">
                          <div className="absolute inset-0 grid grid-cols-6 divide-x divide-slate-100 dark:divide-slate-800/40 pointer-events-none" />
                          
                          <div
                            className={`absolute h-5 rounded-md px-2.5 text-[10px] font-semibold flex items-center gap-1.5 shadow-xs border transition-all hover:scale-102 ${
                              childIssue.status === 'done' 
                                ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' 
                                : childIssue.status === 'inprogress'
                                ? 'bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                            }`}
                            style={{
                              left: `${childLeft}%`,
                              width: `${childWidth}%`,
                              minWidth: '70px',
                            }}
                            title={`${childIssue.key}: ${childIssue.summary} (${childIssue.status})`}
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
