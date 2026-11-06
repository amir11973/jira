import React, { useState } from 'react';
import { 
  BarChart3, TrendingDown, Activity, PieChart, 
  Layers, CheckCircle2, AlertTriangle, Calendar 
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { IssueTypeIcon, PriorityIcon } from '../common/JiraIcons';

export const ReportsView: React.FC = () => {
  const { currentProject, activeSprint, issues, sprints, t, language } = useJira();
  const [selectedReport, setSelectedReport] = useState<'burndown' | 'velocity' | 'breakdown'>('burndown');

  const projectIssues = issues.filter(i => i.projectId === currentProject.id);

  // Burndown mock curve data for Sprint 24 (14 days)
  const burndownDays = [
    { day: 'Day 1', ideal: 26, actual: 26 },
    { day: 'Day 2', ideal: 24, actual: 26 },
    { day: 'Day 3', ideal: 22, actual: 23 },
    { day: 'Day 4', ideal: 20, actual: 23 },
    { day: 'Day 5', ideal: 18, actual: 21 },
    { day: 'Day 6', ideal: 16, actual: 18 },
    { day: 'Day 7', ideal: 14, actual: 18 },
    { day: 'Day 8', ideal: 12, actual: 15 },
    { day: 'Day 9', ideal: 10, actual: 12 },
    { day: 'Day 10', ideal: 8, actual: 10 },
    { day: 'Day 11', ideal: 6, actual: 8 },
    { day: 'Day 12', ideal: 4, actual: null },
    { day: 'Day 13', ideal: 2, actual: null },
    { day: 'Day 14', ideal: 0, actual: null },
  ];

  // Velocity data for past sprints
  const velocityData = [
    { sprint: 'Sprint 21', committed: 24, completed: 22 },
    { sprint: 'Sprint 22', committed: 28, completed: 25 },
    { sprint: 'Sprint 23', committed: 25, completed: 25 },
    { sprint: 'Sprint 24 (Current)', committed: 26, completed: 16 },
  ];

  // Distribution calculations
  const storiesCount = projectIssues.filter(i => i.type === 'story').length;
  const tasksCount = projectIssues.filter(i => i.type === 'task').length;
  const bugsCount = projectIssues.filter(i => i.type === 'bug').length;
  const epicsCount = projectIssues.filter(i => i.type === 'epic').length;

  const highestCount = projectIssues.filter(i => i.priority === 'highest').length;
  const highCount = projectIssues.filter(i => i.priority === 'high').length;
  const mediumCount = projectIssues.filter(i => i.priority === 'medium').length;
  const lowCount = projectIssues.filter(i => i.priority === 'low' || i.priority === 'lowest').length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <span>{t.reportsTitle}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {language === 'fa' 
              ? 'تحلیل عمیق عملکرد تیم، سرعت اجرای اسپرینت‌ها و نرخ کاهش کار باقیمانده.' 
              : 'Agile performance analytics, velocity charts, and burndown progress.'}
          </p>
        </div>

        {/* Report Switcher Tabs */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs font-semibold self-start sm:self-auto">
          <button
            onClick={() => setSelectedReport('burndown')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              selectedReport === 'burndown'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {t.burndownChart}
          </button>
          <button
            onClick={() => setSelectedReport('velocity')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              selectedReport === 'velocity'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {t.velocityChart}
          </button>
          <button
            onClick={() => setSelectedReport('breakdown')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              selectedReport === 'breakdown'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {t.typeBreakdown}
          </button>
        </div>
      </div>

      {/* Selected Report Container */}
      {selectedReport === 'burndown' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {t.burndownChart} — {activeSprint?.name || 'ENG Sprint 24'}
              </h2>
              <p className="text-xs text-slate-500">
                {language === 'fa' 
                  ? 'روند کاهش امتیازهای تعهد شده در طول روزهای اسپرینت' 
                  : 'Story points burn rate over sprint duration'}
              </p>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-slate-400 dark:bg-slate-600 border-b border-dashed" />
                <span className="text-slate-500">{t.idealGuideline}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-1 bg-blue-600 rounded-full" />
                <span className="text-blue-600 dark:text-blue-400 font-semibold">{t.actualRemaining}</span>
              </span>
            </div>
          </div>

          {/* SVG Interactive Burndown Line Chart */}
          <div className="w-full h-72 relative">
            <svg viewBox="0 0 700 240" className="w-full h-full overflow-visible">
              {/* Y Grid lines */}
              {[0, 60, 120, 180, 240].map((y, idx) => (
                <g key={idx}>
                  <line x1="40" y1={y} x2="680" y2={y} stroke="currentColor" strokeOpacity="0.1" className="text-slate-400" />
                  <text x="30" y={y + 4} textAnchor="end" className="fill-slate-400 text-[10px] font-mono">
                    {Math.round((240 - y) / 240 * 28)}
                  </text>
                </g>
              ))}

              {/* Ideal linear guideline (dashed) */}
              <line 
                x1="40" y1="17" 
                x2="680" y2="240" 
                stroke="#94a3b8" 
                strokeWidth="2" 
                strokeDasharray="4 4" 
              />

              {/* Actual curve line */}
              {/* Calculate coordinates: X from 40 to 680 (step = (680-40)/13 = 49.2), Y from 240 - (actual/28 * 240) */}
              <polyline
                fill="none"
                stroke="#2563eb"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points="40,17 89,17 138,42 187,42 236,60 286,85 335,85 384,111 433,137 482,154 532,171"
              />

              {/* Data points dots */}
              {[
                { x: 40, y: 17, val: 26 },
                { x: 89, y: 17, val: 26 },
                { x: 138, y: 42, val: 23 },
                { x: 187, y: 42, val: 23 },
                { x: 236, y: 60, val: 21 },
                { x: 286, y: 85, val: 18 },
                { x: 335, y: 85, val: 18 },
                { x: 384, y: 111, val: 15 },
                { x: 433, y: 137, val: 12 },
                { x: 482, y: 154, val: 10 },
                { x: 532, y: 171, val: 8 },
              ].map((pt, idx) => (
                <g key={idx} className="group cursor-pointer">
                  <circle cx={pt.x} cy={pt.y} r="5" fill="#2563eb" className="hover:r-7 transition-all" />
                  <title>{`Day ${idx + 1}: ${pt.val} pts remaining`}</title>
                </g>
              ))}

              {/* X Axis Day Labels */}
              {burndownDays.map((d, idx) => {
                const x = 40 + (idx * 49.2);
                return (
                  <text key={idx} x={x} y="255" textAnchor="middle" className="fill-slate-400 text-[10px] font-mono">
                    D{idx + 1}
                  </text>
                );
              })}
            </svg>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200/60 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between">
            <span>{language === 'fa' ? 'سرعت سوزاندن فعلی اسپرینت:' : 'Current Burn Rate:'} <strong>1.8 pts / day</strong></span>
            <span>{language === 'fa' ? 'پیش‌بینی اتمام اسپرینت:' : 'Projected Completion:'} <strong className="text-emerald-600">On Track</strong></span>
          </div>
        </div>
      )}

      {selectedReport === 'velocity' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {t.velocityChart}
              </h2>
              <p className="text-xs text-slate-500">
                {language === 'fa' 
                  ? 'مقایسه امتیازهای تعهد شده در آغاز اسپرینت در برابر انجام شده‌های نهایی' 
                  : 'Committed vs Completed story points per sprint'}
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-slate-300 dark:bg-slate-700 rounded-xs" />
                <span className="text-slate-500">{t.committedPoints}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-emerald-500 rounded-xs" />
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{t.completedPoints}</span>
              </span>
            </div>
          </div>

          {/* Velocity Bar Chart */}
          <div className="space-y-6 max-w-2xl">
            {velocityData.map((v, idx) => {
              const maxPoints = 30;
              const commWidth = Math.round((v.committed / maxPoints) * 100);
              const compWidth = Math.round((v.completed / maxPoints) * 100);
              const ratio = Math.round((v.completed / v.committed) * 100);

              return (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="font-bold text-slate-800 dark:text-slate-200">{v.sprint}</span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      {v.completed} / {v.committed} pts ({ratio}%)
                    </span>
                  </div>

                  <div className="space-y-1">
                    {/* Committed Bar */}
                    <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden flex">
                      <div 
                        style={{ width: `${commWidth}%` }} 
                        className="h-full bg-slate-300 dark:bg-slate-700 flex items-center px-2 text-[10px] text-slate-700 dark:text-slate-300 font-mono"
                      >
                        {v.committed} pts
                      </div>
                    </div>
                    {/* Completed Bar */}
                    <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden flex">
                      <div 
                        style={{ width: `${compWidth}%` }} 
                        className="h-full bg-emerald-500 text-white flex items-center px-2 text-[10px] font-mono font-bold"
                      >
                        {v.completed} pts
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300">
            {language === 'fa' 
              ? 'میانگین سرعت تیم در ۳ اسپرینت گذشته: ۲۴ امتیاز در هر دوره اسپرینت ۲ هفته‌ای.' 
              : 'Average Team Velocity: 24 story points per 2-week iteration.'}
          </div>
        </div>
      )}

      {selectedReport === 'breakdown' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Issue Types Breakdown */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {t.typeBreakdown}
            </h3>

            <div className="space-y-3">
              {[
                { type: 'story', label: t.storyType, count: storiesCount, color: 'bg-emerald-500' },
                { type: 'task', label: t.taskType, count: tasksCount, color: 'bg-blue-500' },
                { type: 'bug', label: t.bugType, count: bugsCount, color: 'bg-rose-500' },
                { type: 'epic', label: t.epicType, count: epicsCount, color: 'bg-purple-500' },
              ].map(item => {
                const total = projectIssues.length || 1;
                const percent = Math.round((item.count / total) * 100);
                return (
                  <div key={item.type} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <IssueTypeIcon type={item.type as any} className="w-3.5 h-3.5" />
                        <span className="font-medium text-slate-700 dark:text-slate-300">{item.label}</span>
                      </span>
                      <span className="font-mono text-slate-500 tabular-nums">{item.count} ({percent}%)</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full ${item.color}`} style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Priority Distribution */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {t.priorityBreakdown}
            </h3>

            <div className="space-y-3">
              {[
                { priority: 'highest', label: t.highest, count: highestCount, color: 'bg-rose-600' },
                { priority: 'high', label: t.high, count: highCount, color: 'bg-orange-500' },
                { priority: 'medium', label: t.medium, count: mediumCount, color: 'bg-amber-500' },
                { priority: 'low', label: t.low, count: lowCount, color: 'bg-emerald-500' },
              ].map(item => {
                const total = projectIssues.length || 1;
                const percent = Math.round((item.count / total) * 100);
                return (
                  <div key={item.priority} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <PriorityIcon priority={item.priority as any} className="w-3.5 h-3.5" />
                        <span className="font-medium text-slate-700 dark:text-slate-300">{item.label}</span>
                      </span>
                      <span className="font-mono text-slate-500 tabular-nums">{item.count} ({percent}%)</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full ${item.color}`} style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
