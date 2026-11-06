import React, { useState, useMemo } from 'react';
import { 
  Filter, Search, Download, Terminal, Check, 
  ArrowUpDown, ExternalLink, RefreshCw 
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { Issue, IssueType, Priority } from '../../types/jira';
import { IssueTypeIcon, PriorityIcon, UserAvatar } from '../common/JiraIcons';

export const IssuesListView: React.FC = () => {
  const { 
    currentProject, issues, users, setSelectedIssueId, 
    selectedIssueId, currentUser, t, language 
  } = useJira();

  const [jqlMode, setJqlMode] = useState(false);
  const [jqlInput, setJqlInput] = useState(`project = "${currentProject.key}" AND status != "done" ORDER BY priority DESC`);
  const [activePreset, setActivePreset] = useState<'all' | 'my' | 'reported' | 'bugs' | 'unassigned'>('all');

  // Filter dropdowns state for Basic mode
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchFilterText, setSearchFilterText] = useState<string>('');

  // Process & filter issues
  const filteredIssues = useMemo(() => {
    return issues.filter(issue => {
      if (issue.projectId !== currentProject.id) return false;

      // Presets
      if (activePreset === 'my' && issue.assigneeId !== currentUser.id) return false;
      if (activePreset === 'reported' && issue.reporterId !== currentUser.id) return false;
      if (activePreset === 'bugs' && issue.type !== 'bug') return false;
      if (activePreset === 'unassigned' && issue.assigneeId) return false;

      // Basic Filters
      if (filterType !== 'all' && issue.type !== filterType) return false;
      if (filterStatus !== 'all' && issue.status !== filterStatus) return false;
      if (filterAssignee !== 'all' && issue.assigneeId !== filterAssignee) return false;
      if (filterPriority !== 'all' && issue.priority !== filterPriority) return false;

      if (searchFilterText.trim()) {
        const q = searchFilterText.toLowerCase();
        const mKey = issue.key.toLowerCase().includes(q);
        const mSum = issue.summary.toLowerCase().includes(q);
        if (!mKey && !mSum) return false;
      }

      return true;
    });
  }, [issues, currentProject.id, activePreset, filterType, filterStatus, filterAssignee, filterPriority, searchFilterText, currentUser.id]);

  // Selected issue preview on the right
  const activeDetailIssue = issues.find(i => i.id === (selectedIssueId || filteredIssues[0]?.id));

  // Export functions
  const exportAsJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredIssues, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    dlAnchorElem.setAttribute('download', `${currentProject.key}-issues-export.json`);
    dlAnchorElem.click();
  };

  const exportAsCSV = () => {
    const headers = ['Key', 'Type', 'Summary', 'Status', 'Priority', 'Assignee', 'StoryPoints', 'Created'];
    const rows = filteredIssues.map(i => [
      i.key,
      i.type,
      `"${i.summary.replace(/"/g, '""')}"`,
      i.status,
      i.priority,
      users.find(u => u.id === i.assigneeId)?.name || 'Unassigned',
      i.storyPoints || 0,
      i.createdAt
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', encodeURI(csvContent));
    dlAnchorElem.setAttribute('download', `${currentProject.key}-issues-export.csv`);
    dlAnchorElem.click();
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/50 dark:bg-slate-950">
      {/* Top Filter & JQL Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 space-y-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Filter className="w-5 h-5 text-blue-600" />
              <span>{t.issuesAndFilters}</span>
            </h1>
            <span className="font-mono text-xs text-slate-400 font-semibold tabular-nums">
              ({filteredIssues.length} {t.totalFound})
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setJqlMode(!jqlMode)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                jqlMode
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>{jqlMode ? t.basicMode : t.jqlMode}</span>
            </button>

            {/* Export buttons */}
            <button
              onClick={exportAsJSON}
              title={t.exportJson}
              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline font-mono">JSON</span>
            </button>
            <button
              onClick={exportAsCSV}
              title={t.exportCsv}
              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline font-mono">CSV</span>
            </button>
          </div>
        </div>

        {/* JQL Bar or Basic Filters */}
        {jqlMode ? (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={jqlInput}
                onChange={(e) => setJqlInput(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 text-emerald-400 font-mono text-xs rounded-md border border-slate-700 focus:outline-none focus:border-purple-500"
                placeholder="project = ENG AND status = 'In Progress'"
              />
            </div>
            <button
              onClick={() => {}}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-xs font-semibold shadow-xs"
            >
              {t.runJql}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Search Input */}
            <div className="relative min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchFilterText}
                onChange={(e) => setSearchFilterText(e.target.value)}
                placeholder={language === 'fa' ? 'فیلتر متن یا کد...' : 'Filter text...'}
                className="w-full ps-8 pe-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Type Filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none"
            >
              <option value="all">{language === 'fa' ? 'همه انواع' : 'All Types'}</option>
              <option value="story">{t.storyType}</option>
              <option value="task">{t.taskType}</option>
              <option value="bug">{t.bugType}</option>
              <option value="epic">{t.epicType}</option>
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none"
            >
              <option value="all">{language === 'fa' ? 'همه وضعیت‌ها' : 'All Statuses'}</option>
              <option value="todo">{t.todo}</option>
              <option value="inprogress">{t.inprogress}</option>
              <option value="review">{t.review}</option>
              <option value="done">{t.done}</option>
            </select>

            {/* Priority Filter */}
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none"
            >
              <option value="all">{language === 'fa' ? 'همه اولویت‌ها' : 'All Priorities'}</option>
              <option value="highest">{t.highest}</option>
              <option value="high">{t.high}</option>
              <option value="medium">{t.medium}</option>
              <option value="low">{t.low}</option>
              <option value="lowest">{t.lowest}</option>
            </select>

            {/* Assignee Filter */}
            <select
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none"
            >
              <option value="all">{language === 'fa' ? 'همه اعضا' : 'All Assignees'}</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {language === 'fa' ? u.nameFa : u.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Saved Filter Preset Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1">
          <span className="text-[11px] text-slate-400 font-semibold me-1">{t.presets}:</span>
          {[
            { id: 'all', label: t.allIssues },
            { id: 'my', label: t.myOpenIssues },
            { id: 'reported', label: t.reportedByMe },
            { id: 'bugs', label: t.criticalBugs },
            { id: 'unassigned', label: t.unassignedIssues },
          ].map(p => (
            <button
              key={p.id}
              onClick={() => setActivePreset(p.id as any)}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors whitespace-nowrap ${
                activePreset === p.id
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Split Pane: Table on Left (60%), Details Preview on Right (40%) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Table List */}
        <div className="flex-1 overflow-y-auto border-e border-slate-200 dark:border-slate-800">
          <table className="w-full text-xs text-start border-collapse">
            <thead className="bg-slate-100/70 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 sticky top-0 font-semibold">
              <tr>
                <th className="p-3 text-start w-12">Type</th>
                <th className="p-3 text-start w-24">Key</th>
                <th className="p-3 text-start">{t.summary}</th>
                <th className="p-3 text-start w-28">{t.status}</th>
                <th className="p-3 text-start w-20">{t.priority}</th>
                <th className="p-3 text-start w-28">{t.assignee}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredIssues.map((issue) => {
                const isSelected = activeDetailIssue?.id === issue.id;
                const assignee = users.find(u => u.id === issue.assigneeId);
                return (
                  <tr
                    key={issue.id}
                    onClick={() => setSelectedIssueId(issue.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
                    }`}
                  >
                    <td className="p-3">
                      <IssueTypeIcon type={issue.type} />
                    </td>
                    <td className="p-3 font-mono font-semibold text-blue-600 dark:text-blue-400">
                      {issue.key}
                    </td>
                    <td className="p-3 font-medium text-slate-800 dark:text-slate-200 max-w-xs truncate">
                      {issue.summary}
                    </td>
                    <td className="p-3">
                      <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                        issue.status === 'done' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' :
                        issue.status === 'inprogress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' :
                        issue.status === 'review' ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300' :
                        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {issue.status}
                      </span>
                    </td>
                    <td className="p-3">
                      <PriorityIcon priority={issue.priority} />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5 truncate">
                        <UserAvatar user={assignee} size="sm" />
                        <span className="truncate text-slate-600 dark:text-slate-400">
                          {assignee ? (language === 'fa' ? assignee.nameFa : assignee.name) : '—'}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredIssues.length === 0 && (
            <div className="p-12 text-center text-slate-400 text-xs italic">
              {t.noMatchingIssues}
            </div>
          )}
        </div>

        {/* Right Pane: Quick Issue Preview */}
        {activeDetailIssue && (
          <div className="w-80 lg:w-96 bg-white dark:bg-slate-900 p-5 overflow-y-auto hidden md:block space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IssueTypeIcon type={activeDetailIssue.type} />
                <span className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400">
                  {activeDetailIssue.key}
                </span>
              </div>
              <button
                onClick={() => setSelectedIssueId(activeDetailIssue.id)}
                className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline font-semibold"
              >
                <span>{language === 'fa' ? 'جزئیات کامل' : 'Full details'}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-snug">
              {activeDetailIssue.summary}
            </h3>

            <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-200/60 dark:border-slate-800">
              {activeDetailIssue.description || <span className="italic text-slate-400">No description provided.</span>}
            </div>

            <div className="space-y-2 text-xs border-t border-slate-200 dark:border-slate-800 pt-3">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-400">{t.status}:</span>
                <span className="font-bold uppercase text-slate-800 dark:text-slate-200">{activeDetailIssue.status}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-400">{t.priority}:</span>
                <span className="font-semibold capitalize text-slate-800 dark:text-slate-200">{activeDetailIssue.priority}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-400">{t.assignee}:</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {users.find(u => u.id === activeDetailIssue.assigneeId)?.name || 'Unassigned'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-400">{t.storyPoints}:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{activeDetailIssue.storyPoints ?? 0} pts</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
