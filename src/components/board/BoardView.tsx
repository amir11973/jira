import React, { useState } from 'react';
import { Plus, CheckCircle2, Calendar, Flag } from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { Issue } from '../../types/jira';
import { IssueTypeIcon, PriorityIcon, UserAvatar } from '../common/JiraIcons';
import { CompleteSprintModal } from '../modals/CompleteSprintModal';

export const BoardView: React.FC = () => {
  const {
    currentProject,
    activeSprint,
    issues,
    statuses,
    epics,
    users,
    currentUser,
    searchQuery,
    quickFilter,
    setQuickFilter,
    groupBy,
    setGroupBy,
    setSelectedIssueId,
    openCreateModal,
    moveIssueStatus,
    t,
    language,
    setActiveView,
  } = useJira();

  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [draggedIssueId, setDraggedIssueId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const [selectedEpicFilter, setSelectedEpicFilter] = useState<string>('all');

  const isKanbanMode =
    currentProject.features?.sprints === false || currentProject.template === 'kanban';

  const boardIssues = issues.filter(i => {
    if (i.projectId !== currentProject.id || i.archived) return false;
    if (isKanbanMode) return true;
    return activeSprint ? i.sprintId === activeSprint.id : false;
  });

  const filteredIssues = boardIssues.filter(issue => {
    if (selectedEpicFilter !== 'all' && issue.epicId !== selectedEpicFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchKey = issue.key.toLowerCase().includes(q);
      const matchSummary = issue.summary.toLowerCase().includes(q);
      const matchDesc = issue.description.toLowerCase().includes(q);
      if (!matchKey && !matchSummary && !matchDesc) return false;
    }

    if (quickFilter === 'my' && issue.assigneeId !== currentUser?.id) return false;
    if (quickFilter === 'bugs' && issue.type !== 'bug') return false;
    if (quickFilter === 'high' && issue.priority !== 'high' && issue.priority !== 'highest') return false;
    if (quickFilter === 'recent') {
      const dayAgo = new Date();
      dayAgo.setDate(dayAgo.getDate() - 3);
      if (new Date(issue.updatedAt) < dayAgo) return false;
    }

    return true;
  });

  const totalPoints = boardIssues.reduce((acc, i) => acc + (i.storyPoints || 0), 0);
  const donePoints = boardIssues
    .filter(i => i.status === 'done')
    .reduce((acc, i) => acc + (i.storyPoints || 0), 0);
  const donePercent = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : 0;

  if (!isKanbanMode && !activeSprint) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 dark:bg-slate-950">
        <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4 shadow-sm">
          <Calendar className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-2">{t.noActiveSprint}</h3>
        <p className="text-xs text-slate-500 max-w-sm mb-5">{t.noActiveSprintDesc}</p>
        <button
          onClick={() => setActiveView('backlog')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold shadow-xs transition-colors"
        >
          {t.goToBacklog}
        </button>
      </div>
    );
  }

  const handleDropOnColumn = (targetStatusId: string) => {
    if (draggedIssueId) {
      moveIssueStatus(draggedIssueId, targetStatusId);
    }
    setDraggedIssueId(null);
    setDragOverStatus(null);
  };

  const renderColumnCards = (statusId: string, issueSubset: Issue[]) => {
    const colIssues = issueSubset.filter(i => i.status === statusId);

    return (
      <div className="space-y-2 flex-1 min-h-[120px]">
        {colIssues.map(issue => {
          const assignee = users.find(u => u.id === issue.assigneeId);
          const epic = epics.find(e => e.id === issue.epicId);
          const completedSubs = issue.subtasks.filter(s => s.isCompleted).length;

          return (
            <div
              key={issue.id}
              draggable
              onDragStart={() => setDraggedIssueId(issue.id)}
              onDragEnd={() => {
                setDraggedIssueId(null);
                setDragOverStatus(null);
              }}
              onClick={() => setSelectedIssueId(issue.id)}
              className={`rounded-lg p-3 shadow-xs hover:shadow-md transition-all cursor-pointer group select-none space-y-2 border ${
                issue.flagged
                  ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600'
              }`}
            >
              {(epic || issue.flagged) && (
                <div className="flex items-center justify-between gap-1.5">
                  {epic ? (
                    <span
                      className="text-[10px] font-semibold tracking-wide truncate max-w-[160px]"
                      style={{ color: epic.color }}
                    >
                      {language === 'fa' ? epic.nameFa : epic.name}
                    </span>
                  ) : (
                    <span />
                  )}
                  {issue.flagged && (
                    <span
                      title={t.flagged}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
                    >
                      <Flag className="w-3 h-3 fill-amber-500" />
                    </span>
                  )}
                </div>
              )}

              <p className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-snug line-clamp-3">
                {issue.summary}
              </p>

              {issue.dueDate && (
                <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>{issue.dueDate}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800/80 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <IssueTypeIcon type={issue.type} className="w-3.5 h-3.5" />
                  <span className="font-mono text-slate-500 font-semibold text-[11px] group-hover:text-blue-600 dark:group-hover:text-blue-400">
                    {issue.key}
                  </span>
                  <PriorityIcon priority={issue.priority} className="w-3.5 h-3.5" />
                </div>

                <div className="flex items-center gap-2">
                  {issue.subtasks.length > 0 && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      {completedSubs}/{issue.subtasks.length}
                    </span>
                  )}
                  {currentProject.features?.estimation !== false && issue.storyPoints !== undefined && (
                    <span className="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono text-[10px] flex items-center justify-center font-bold">
                      {issue.storyPoints}
                    </span>
                  )}
                  <UserAvatar user={assignee} size="sm" />
                </div>
              </div>

              <div
                onClick={e => e.stopPropagation()}
                className="opacity-0 group-hover:opacity-100 transition-opacity pt-1 flex items-center justify-between text-[10px] text-slate-400"
              >
                <span>{language === 'fa' ? 'انتقال سریع:' : 'Move to:'}</span>
                <select
                  value={issue.status}
                  onChange={e => moveIssueStatus(issue.id, e.target.value)}
                  className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded px-1 py-0.5 border-none focus:outline-none"
                >
                  {statuses.map(st => (
                    <option key={st.id} value={st.id}>
                      {language === 'fa' ? st.nameFa : st.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/50 dark:bg-slate-950">
      {/* Header Banner */}
      <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {isKanbanMode
                  ? `${language === 'fa' ? currentProject.nameFa : currentProject.name} — ${t.kanbanBoard}`
                  : activeSprint?.name}
              </h1>
              <span className="text-[11px] font-mono uppercase font-semibold text-emerald-600 dark:text-emerald-400">
                {isKanbanMode ? 'KANBAN' : t.active}
              </span>
            </div>
            {!isKanbanMode && activeSprint?.goal && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                <span className="font-semibold">{t.sprintGoal}:</span> {activeSprint.goal}
              </p>
            )}
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-24 sm:w-32 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${donePercent}%` }} />
              </div>
              <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                {donePoints}/{totalPoints} {t.pointsCount} ({donePercent}%)
              </span>
            </div>

            {!isKanbanMode && activeSprint && (
              <button
                onClick={() => setIsCompleteModalOpen(true)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                <span>{t.completeSprint}</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter & Swimlane Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs text-slate-400 font-medium me-1 hidden sm:inline">{t.quickFilters}:</span>
            {[
              { id: 'all', label: t.allIssues },
              { id: 'my', label: t.onlyMyIssues },
              { id: 'recent', label: t.recentlyUpdated },
              { id: 'bugs', label: t.bugsOnly },
              { id: 'high', label: t.highPriority },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setQuickFilter(f.id as any)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors whitespace-nowrap ${
                  quickFilter === f.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200/80 dark:hover:bg-slate-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={selectedEpicFilter}
              onChange={e => setSelectedEpicFilter(e.target.value)}
              className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-1 rounded-md text-xs font-medium border-none focus:outline-none"
            >
              <option value="all">{language === 'fa' ? 'همه اپیک‌ها' : 'All Epics'}</option>
              {epics
                .filter(ep => ep.projectId === currentProject.id)
                .map(ep => (
                  <option key={ep.id} value={ep.id}>
                    {ep.key} — {language === 'fa' ? ep.nameFa : ep.name}
                  </option>
                ))}
            </select>

            <span className="text-slate-400">{t.groupBy}:</span>
            <select
              value={groupBy}
              onChange={e => setGroupBy(e.target.value as any)}
              className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-1 rounded-md text-xs font-medium border-none focus:outline-none"
            >
              <option value="none">{t.none}</option>
              <option value="assignee">{t.assignee}</option>
              <option value="epic">{t.epic}</option>
            </select>

            <button
              onClick={() => openCreateModal(activeSprint ? activeSprint.id : null, 'story')}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              <span>{language === 'fa' ? 'استوری' : 'Story'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Board Columns Canvas */}
      <div className="flex-1 overflow-x-auto p-4">
        {groupBy === 'none' ? (
          <div
            className="grid gap-4 h-full"
            style={{
              gridTemplateColumns: `repeat(${statuses.length}, minmax(240px, 1fr))`,
            }}
          >
            {statuses.map(status => {
              const count = filteredIssues.filter(i => i.status === status.id).length;
              const isDropTarget = dragOverStatus === status.id;
              return (
                <div
                  key={status.id}
                  onDragOver={e => {
                    e.preventDefault();
                    setDragOverStatus(status.id);
                  }}
                  onDragLeave={() => setDragOverStatus(null)}
                  onDrop={() => handleDropOnColumn(status.id)}
                  className={`rounded-xl p-3 flex flex-col h-full border transition-colors ${
                    isDropTarget
                      ? 'bg-blue-50/80 dark:bg-blue-950/30 border-blue-400'
                      : 'bg-slate-100/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between pb-3 px-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        {language === 'fa' ? status.nameFa : status.name}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-slate-400 font-bold">
                        {count}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto pe-1">{renderColumnCards(status.id, filteredIssues)}</div>

                  <button
                    onClick={() => openCreateModal(activeSprint ? activeSprint.id : null)}
                    className="w-full mt-2 py-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800/80 rounded border border-dashed border-transparent hover:border-slate-300 dark:hover:border-slate-700 transition-all flex items-center justify-center gap-1 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t.createIssue}</span>
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-6 min-w-[840px]">
            {(groupBy === 'assignee' ? users : epics.filter(e => e.projectId === currentProject.id)).map(groupItem => {
              const groupIssues = filteredIssues.filter(i =>
                groupBy === 'assignee' ? i.assigneeId === groupItem.id : i.epicId === groupItem.id
              );
              if (groupIssues.length === 0) return null;

              return (
                <div key={groupItem.id} className="space-y-2">
                  <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-1.5">
                    {groupBy === 'assignee' ? (
                      <div className="flex items-center gap-2">
                        <UserAvatar user={groupItem as any} size="sm" />
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {language === 'fa' ? (groupItem as any).nameFa : (groupItem as any).name}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: (groupItem as any).color }}
                        />
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {language === 'fa' ? (groupItem as any).nameFa : (groupItem as any).name}
                        </span>
                      </div>
                    )}
                    <span className="text-xs text-slate-400 font-mono">({groupIssues.length})</span>
                  </div>

                  <div
                    className="grid gap-4"
                    style={{
                      gridTemplateColumns: `repeat(${statuses.length}, minmax(210px, 1fr))`,
                    }}
                  >
                    {statuses.map(status => (
                      <div
                        key={status.id}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => handleDropOnColumn(status.id)}
                        className="bg-slate-100/50 dark:bg-slate-900/30 rounded-lg p-2.5"
                      >
                        <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">
                          {language === 'fa' ? status.nameFa : status.name}
                        </div>
                        {renderColumnCards(status.id, groupIssues)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CompleteSprintModal
        sprint={activeSprint ?? null}
        isOpen={isCompleteModalOpen}
        onClose={() => setIsCompleteModalOpen(false)}
      />
    </div>
  );
};
