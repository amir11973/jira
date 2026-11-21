import React, { useState } from 'react';
import { 
  Plus, Play, CheckCircle2, ChevronDown, ChevronRight, 
  Layers, MoreHorizontal, ArrowUp, ArrowDown, MoveRight, Calendar
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { Issue, Sprint, Epic } from '../../types/jira';
import { IssueTypeIcon, PriorityIcon, UserAvatar } from '../common/JiraIcons';
import { StartSprintModal } from '../modals/StartSprintModal';
import { CompleteSprintModal } from '../modals/CompleteSprintModal';

export const BacklogView: React.FC = () => {
  const { 
    currentProject, sprints, epics, issues, users, 
    createSprint, createEpic, moveIssueSprint, setSelectedIssueId, 
    openCreateModal, t, language 
  } = useJira();

  const [epicsPanelOpen, setEpicsPanelOpen] = useState(true);
  const [selectedEpicFilter, setSelectedEpicFilter] = useState<string | null>(null);
  const [startSprintTarget, setStartSprintTarget] = useState<Sprint | null>(null);
  const [completeSprintTarget, setCompleteSprintTarget] = useState<Sprint | null>(null);
  
  // New Epic creation state
  const [isCreatingEpic, setIsCreatingEpic] = useState(false);
  const [newEpicName, setNewEpicName] = useState('');
  const [newEpicColor, setNewEpicColor] = useState('#8b5cf6');

  const projectSprints = sprints.filter(s => s.projectId === currentProject.id);
  const projectEpics = epics.filter(e => e.projectId === currentProject.id);
  const projectIssues = issues.filter(i => {
    if (i.projectId !== currentProject.id || i.archived) return false;
    if (selectedEpicFilter && i.epicId !== selectedEpicFilter) return false;
    return true;
  });

  const activeSprint = projectSprints.find(s => s.status === 'active');
  const plannedSprints = projectSprints.filter(s => s.status === 'planned');
  const backlogIssues = projectIssues.filter(i => !i.sprintId);

  const handleCreateSprint = () => {
    createSprint('', '');
  };

  const handleCreateEpicSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newEpicName.trim()) {
      createEpic({
        name: newEpicName.trim(),
        nameFa: newEpicName.trim(),
        summary: newEpicName.trim(),
        color: newEpicColor,
        status: 'inprogress',
        startDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      });
      setNewEpicName('');
      setIsCreatingEpic(false);
    }
  };

  // Helper to render points breakdown: todo (gray), inprogress (blue), done (green)
  const renderPointsBadge = (sprintIssues: Issue[]) => {
    const todoPts = sprintIssues.filter(i => i.status === 'todo' || i.status === 'backlog').reduce((a, i) => a + (i.storyPoints || 0), 0);
    const inprogressPts = sprintIssues.filter(i => i.status !== 'todo' && i.status !== 'backlog' && i.status !== 'done').reduce((a, i) => a + (i.storyPoints || 0), 0);
    const donePts = sprintIssues.filter(i => i.status === 'done').reduce((a, i) => a + (i.storyPoints || 0), 0);

    return (
      <div className="flex items-center gap-1 font-mono text-xs tabular-nums font-semibold">
        <span title="To Do" className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center text-[10px]">
          {todoPts}
        </span>
        <span title="In Progress" className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 flex items-center justify-center text-[10px]">
          {inprogressPts}
        </span>
        <span title="Done" className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-[10px]">
          {donePts}
        </span>
      </div>
    );
  };

  // Helper to render an issue row
  const renderIssueRow = (issue: Issue, currentSprintId: string | null) => {
    const assignee = users.find(u => u.id === issue.assigneeId);
    const epic = epics.find(e => e.id === issue.epicId);

    return (
      <div
        key={issue.id}
        onClick={() => setSelectedIssueId(issue.id)}
        className="flex items-center justify-between gap-3 px-3 py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 rounded-md transition-colors cursor-pointer group text-xs select-none"
      >
        {/* Left: Type, Key, Summary, Epic badge */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <IssueTypeIcon type={issue.type} className="w-4 h-4 shrink-0" />
          <span className="font-mono font-semibold text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 text-xs shrink-0">
            {issue.key}
          </span>
          <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
            {issue.summary}
          </span>
          {epic && (
            <span 
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 hidden sm:inline"
              style={{ backgroundColor: `${epic.color}20`, color: epic.color }}
            >
              {language === 'fa' ? epic.nameFa : epic.name}
            </span>
          )}
        </div>

        {/* Right: Status badge, Priority, Story Points, Move dropdown, Assignee */}
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
            issue.status === 'done' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' :
            issue.status === 'inprogress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300' :
            issue.status === 'review' ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300' :
            'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
          }`}>
            {issue.status}
          </span>

          <PriorityIcon priority={issue.priority} className="w-3.5 h-3.5" />

          {issue.storyPoints !== undefined && (
            <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono text-[10px] flex items-center justify-center font-bold">
              {issue.storyPoints}
            </span>
          )}

          {/* Quick Sprint Move Dropdown */}
          <div onClick={(e) => e.stopPropagation()}>
            <select
              value={currentSprintId || 'backlog'}
              onChange={(e) => moveIssueSprint(issue.id, e.target.value === 'backlog' ? null : e.target.value)}
              className="opacity-0 group-hover:opacity-100 transition-opacity bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-300 rounded px-1.5 py-0.5 border-none focus:outline-none"
              title="Move issue to another sprint or backlog"
            >
              <option value="backlog">{language === 'fa' ? 'بک‌لاگ' : 'Backlog'}</option>
              {projectSprints.filter(s => s.status !== 'completed').map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <UserAvatar user={assignee} size="sm" />
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-slate-50/50 dark:bg-slate-950">
      {/* Left Collapsible Epics Panel */}
      <div className={`border-e border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all duration-200 flex flex-col ${
        epicsPanelOpen ? 'w-64' : 'w-10'
      }`}>
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          {epicsPanelOpen ? (
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                {t.epics}
              </h3>
            </div>
          ) : (
            <Layers className="w-4 h-4 text-purple-600 mx-auto" />
          )}
          <button
            onClick={() => setEpicsPanelOpen(!epicsPanelOpen)}
            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            {epicsPanelOpen ? <ChevronDown className="w-3.5 h-3.5 -rotate-90" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>

        {epicsPanelOpen && (
          <div className="flex-1 p-2 space-y-1.5 overflow-y-auto text-xs">
            {/* "All Issues" Filter */}
            <button
              onClick={() => setSelectedEpicFilter(null)}
              className={`w-full text-start px-2.5 py-1.5 rounded-md font-medium transition-colors ${
                selectedEpicFilter === null
                  ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {t.allIssues}
            </button>

            {/* Epics list */}
            {projectEpics.map((epic) => {
              const epicIssuesCount = issues.filter(i => i.epicId === epic.id).length;
              const isSelected = selectedEpicFilter === epic.id;
              return (
                <button
                  key={epic.id}
                  onClick={() => setSelectedEpicFilter(isSelected ? null : epic.id)}
                  className={`w-full text-start p-2 rounded-md transition-colors space-y-1 border ${
                    isSelected
                      ? 'border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-950/30'
                      : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{ backgroundColor: epic.color }} />
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {language === 'fa' ? epic.nameFa : epic.name}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                      {epicIssuesCount}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {epic.key}
                  </div>
                </button>
              );
            })}

            {/* Create Epic Inline Button */}
            {isCreatingEpic ? (
              <form onSubmit={handleCreateEpicSubmit} className="p-2 border border-purple-200 dark:border-purple-800 rounded-md bg-purple-50/40 dark:bg-purple-950/20 space-y-2">
                <input
                  type="text"
                  value={newEpicName}
                  onChange={(e) => setNewEpicName(e.target.value)}
                  placeholder={language === 'fa' ? 'نام اپیک جدید...' : 'Epic Name...'}
                  className="w-full px-2 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded focus:outline-none"
                  autoFocus
                />
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    {['#8b5cf6', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899'].map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewEpicColor(c)}
                        className={`w-4 h-4 rounded-full ${newEpicColor === c ? 'ring-2 ring-offset-1 ring-purple-600' : ''}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button type="submit" className="px-2 py-0.5 bg-purple-600 text-white rounded text-[11px] font-semibold">
                      {t.save}
                    </button>
                    <button type="button" onClick={() => setIsCreatingEpic(false)} className="px-1.5 py-0.5 text-slate-400 text-[11px]">
                      {t.cancel}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setIsCreatingEpic(true)}
                className="w-full py-1.5 text-xs text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded flex items-center justify-center gap-1 font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.createEpic}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Sprints & Backlog Stream */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Active Sprint Section */}
        {activeSprint && (
          <div className="bg-slate-100/60 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {activeSprint.name}
                </h2>
                <span className="text-[10px] text-slate-400 font-mono">
                  ({projectIssues.filter(i => i.sprintId === activeSprint.id).length} {t.issuesCount})
                </span>
              </div>

              <div className="flex items-center gap-3">
                {renderPointsBadge(projectIssues.filter(i => i.sprintId === activeSprint.id))}
                <button
                  onClick={() => setCompleteSprintTarget(activeSprint)}
                  className="px-3 py-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded text-xs font-semibold transition-colors flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>{t.completeSprint}</span>
                </button>
              </div>
            </div>

            {/* Active Sprint Issues */}
            <div className="space-y-1.5">
              {projectIssues.filter(i => i.sprintId === activeSprint.id).map(issue => (
                renderIssueRow(issue, activeSprint.id)
              ))}
            </div>

            <button
              onClick={() => openCreateModal(activeSprint.id)}
              className="py-1 px-2 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 font-medium hover:bg-slate-200/50 dark:hover:bg-slate-800 rounded transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.createIssue}</span>
            </button>
          </div>
        )}

        {/* Planned Sprints */}
        {plannedSprints.map((sprint) => {
          const sprintIssuesList = projectIssues.filter(i => i.sprintId === sprint.id);
          return (
            <div key={sprint.id} className="bg-slate-100/60 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    {sprint.name}
                  </h2>
                  <span className="text-[10px] px-1.5 py-0.2 bg-slate-200 dark:bg-slate-800 rounded text-slate-500 uppercase font-semibold">
                    {t.planned}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    ({sprintIssuesList.length} {t.issuesCount})
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {renderPointsBadge(sprintIssuesList)}
                  <button
                    onClick={() => setStartSprintTarget(sprint)}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold transition-colors flex items-center gap-1 shadow-xs"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>{t.startSprint}</span>
                  </button>
                </div>
              </div>

              {/* Sprint Issues */}
              <div className="space-y-1.5">
                {sprintIssuesList.length === 0 ? (
                  <div className="p-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-center text-xs text-slate-400">
                    {t.dragOrMove}
                  </div>
                ) : (
                  sprintIssuesList.map(issue => renderIssueRow(issue, sprint.id))
                )}
              </div>

              <button
                onClick={() => openCreateModal(sprint.id)}
                className="py-1 px-2 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 font-medium hover:bg-slate-200/50 dark:hover:bg-slate-800 rounded transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.createIssue}</span>
              </button>
            </div>
          );
        })}

        {/* Product Backlog Section */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {t.productBacklog}
              </h2>
              <span className="text-[10px] text-slate-400 font-mono">
                ({backlogIssues.length} {t.issuesCount})
              </span>
            </div>

            <div className="flex items-center gap-3">
              {renderPointsBadge(backlogIssues)}
              <button
                onClick={handleCreateSprint}
                className="px-3 py-1 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 rounded text-xs font-semibold transition-colors flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.createSprint}</span>
              </button>
            </div>
          </div>

          {/* Backlog Issues List */}
          <div className="space-y-1.5">
            {backlogIssues.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 italic">
                {language === 'fa' ? 'هیچ تسکی در بک‌لاگ محصول وجود ندارد.' : 'No issues in the backlog.'}
              </div>
            ) : (
              backlogIssues.map(issue => renderIssueRow(issue, null))
            )}
          </div>

          <button
            onClick={() => openCreateModal(null)}
            className="py-1 px-2 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.createIssue}</span>
          </button>
        </div>
      </div>

      <StartSprintModal
        sprint={startSprintTarget}
        isOpen={Boolean(startSprintTarget)}
        onClose={() => setStartSprintTarget(null)}
      />

      <CompleteSprintModal
        sprint={completeSprintTarget}
        isOpen={Boolean(completeSprintTarget)}
        onClose={() => setCompleteSprintTarget(null)}
      />
    </div>
  );
};
