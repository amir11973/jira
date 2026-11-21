import React, { useState } from 'react';
import { Flag, Plus, Search, Table } from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { Priority } from '../../types/jira';
import { IssueTypeIcon, PriorityIcon, UserAvatar } from '../common/JiraIcons';

export const SpaceListView: React.FC = () => {
  const {
    currentProject,
    issues,
    statuses,
    users,
    updateIssue,
    moveIssueStatus,
    toggleFlagged,
    setSelectedIssueId,
    openCreateModal,
    language,
    t,
  } = useJira();

  const [filterText, setFilterText] = useState('');
  const [editingSummaryId, setEditingSummaryId] = useState<string | null>(null);
  const [tempSummary, setTempSummary] = useState('');

  const projectIssues = issues.filter(i => {
    if (i.projectId !== currentProject.id || i.archived) return false;
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      return i.key.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q);
    }
    return true;
  });

  const commitSummaryEdit = (issueId: string) => {
    if (tempSummary.trim()) {
      updateIssue(issueId, { summary: tempSummary.trim() });
    }
    setEditingSummaryId(null);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/50 dark:bg-slate-950">
      {/* Header Toolbar */}
      <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <Table className="w-5 h-5 text-blue-600" />
          <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
            {t.listView} — {language === 'fa' ? currentProject.nameFa : currentProject.name}
          </h1>
          <span className="font-mono text-xs text-slate-400 tabular-nums">
            ({projectIssues.length})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              placeholder={language === 'fa' ? 'فیلتر سریع فهرست...' : 'Filter list...'}
              className="ps-8 pe-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={() => openCreateModal(null)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.createIssue}</span>
          </button>
        </div>
      </div>

      {/* Inline Editable Spreadsheet Table */}
      <div className="flex-1 overflow-auto p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
          <table className="w-full text-xs text-start border-collapse min-w-[920px]">
            <thead className="bg-slate-100/80 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
              <tr>
                <th className="p-2.5 text-start w-10">Type</th>
                <th className="p-2.5 text-start w-24">Key</th>
                <th className="p-2.5 text-start">{t.summary}</th>
                <th className="p-2.5 text-start w-36">{t.status}</th>
                <th className="p-2.5 text-start w-28">{t.priority}</th>
                <th className="p-2.5 text-start w-40">{t.assignee}</th>
                <th className="p-2.5 text-start w-20">{t.storyPoints}</th>
                <th className="p-2.5 text-start w-32">{t.dueDate}</th>
                <th className="p-2.5 text-center w-16">{t.flagged}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {projectIssues.map(issue => {
                const assignee = users.find(u => u.id === issue.assigneeId);
                return (
                  <tr
                    key={issue.id}
                    className={`hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition-colors ${
                      issue.flagged ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''
                    }`}
                  >
                    <td className="p-2.5">
                      <IssueTypeIcon type={issue.type} />
                    </td>
                    <td className="p-2.5">
                      <button
                        onClick={() => setSelectedIssueId(issue.id)}
                        className="font-mono font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {issue.key}
                      </button>
                    </td>
                    <td className="p-2.5 max-w-xs">
                      {editingSummaryId === issue.id ? (
                        <input
                          type="text"
                          value={tempSummary}
                          onChange={e => setTempSummary(e.target.value)}
                          onBlur={() => commitSummaryEdit(issue.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitSummaryEdit(issue.id);
                            if (e.key === 'Escape') setEditingSummaryId(null);
                          }}
                          autoFocus
                          className="w-full px-2 py-1 bg-white dark:bg-slate-800 border border-blue-500 rounded text-xs focus:outline-none"
                        />
                      ) : (
                        <div
                          onClick={() => {
                            setEditingSummaryId(issue.id);
                            setTempSummary(issue.summary);
                          }}
                          title={language === 'fa' ? 'برای ویرایش کلیک کنید' : 'Click to edit inline'}
                          className="font-medium text-slate-800 dark:text-slate-200 truncate cursor-text hover:bg-slate-100 dark:hover:bg-slate-800 px-1.5 py-0.5 -mx-1.5 rounded"
                        >
                          {issue.summary}
                        </div>
                      )}
                    </td>
                    <td className="p-2.5">
                      <select
                        value={issue.status}
                        onChange={e => moveIssueStatus(issue.id, e.target.value)}
                        className="w-full px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold border border-transparent focus:border-blue-500 focus:outline-none text-[11px]"
                      >
                        {statuses.map(st => (
                          <option key={st.id} value={st.id}>
                            {language === 'fa' ? st.nameFa : st.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2.5">
                      <div className="flex items-center gap-1.5">
                        <PriorityIcon priority={issue.priority} className="w-3.5 h-3.5 shrink-0" />
                        <select
                          value={issue.priority}
                          onChange={e => updateIssue(issue.id, { priority: e.target.value as Priority })}
                          className="bg-transparent text-slate-700 dark:text-slate-300 text-xs focus:outline-none cursor-pointer"
                        >
                          <option value="highest">Highest</option>
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                          <option value="lowest">Lowest</option>
                        </select>
                      </div>
                    </td>
                    <td className="p-2.5">
                      <div className="flex items-center gap-1.5">
                        <UserAvatar user={assignee} size="sm" />
                        <select
                          value={issue.assigneeId || ''}
                          onChange={e => updateIssue(issue.id, { assigneeId: e.target.value || null })}
                          className="bg-transparent text-slate-700 dark:text-slate-300 text-xs focus:outline-none max-w-[110px] truncate cursor-pointer"
                        >
                          <option value="">{language === 'fa' ? 'بدون مسئول' : 'Unassigned'}</option>
                          {users.map(u => (
                            <option key={u.id} value={u.id}>
                              {language === 'fa' ? u.nameFa : u.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="p-2.5">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={issue.storyPoints ?? 0}
                        onChange={e => updateIssue(issue.id, { storyPoints: Number(e.target.value) })}
                        className="w-14 px-1.5 py-0.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono text-center"
                      />
                    </td>
                    <td className="p-2.5">
                      <input
                        type="date"
                        value={issue.dueDate || ''}
                        onChange={e => updateIssue(issue.id, { dueDate: e.target.value || undefined })}
                        className="px-1.5 py-0.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono text-[11px]"
                      />
                    </td>
                    <td className="p-2.5 text-center">
                      <button
                        onClick={() => toggleFlagged(issue.id)}
                        title={issue.flagged ? t.unflagImpediment : t.flagImpediment}
                        className={`p-1 rounded transition-colors ${
                          issue.flagged
                            ? 'text-amber-600 bg-amber-100 dark:bg-amber-950/60 dark:text-amber-400'
                            : 'text-slate-300 hover:text-slate-500 dark:text-slate-600'
                        }`}
                      >
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
