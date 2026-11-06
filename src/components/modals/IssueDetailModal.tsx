import React, { useState } from 'react';
import { 
  X, Clock, Link2, CheckSquare, Trash2, Copy, 
  Send, MoreHorizontal, Plus, ChevronRight, User as UserIcon
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { IssueTypeIcon, PriorityIcon, UserAvatar } from '../common/JiraIcons';
import { formatMinutes } from '../../utils/i18n';
import { LogWorkModal } from './LogWorkModal';
import { Priority } from '../../types/jira';

export const IssueDetailModal: React.FC = () => {
  const { 
    selectedIssueId, setSelectedIssueId, issues, updateIssue, deleteIssue, 
    addSubtask, toggleSubtask, deleteSubtask, addComment, linkIssue, 
    users, currentUser, epics, sprints, versions, statuses, t, language 
  } = useJira();

  const [activeTab, setActiveTab] = useState<'comments' | 'worklogs' | 'history'>('comments');
  const [commentText, setCommentText] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [isLogWorkOpen, setIsLogWorkOpen] = useState(false);
  const [isLinkIssueOpen, setIsLinkIssueOpen] = useState(false);
  const [linkTargetKey, setLinkTargetKey] = useState('');
  const [linkRelation, setLinkRelation] = useState<'blocks' | 'is_blocked_by' | 'relates_to'>('relates_to');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [tempTitle, setTempTitle] = useState('');
  const [tempDesc, setTempDesc] = useState('');

  const issue = issues.find(i => i.id === selectedIssueId);

  if (!selectedIssueId || !issue) return null;

  const currentEpic = epics.find(e => e.id === issue.epicId);
  const currentSprint = sprints.find(s => s.id === issue.sprintId);
  const assigneeUser = users.find(u => u.id === issue.assigneeId);
  const reporterUser = users.find(u => u.id === issue.reporterId) || users[0];

  const totalLoggedMinutes = issue.worklogs.reduce((acc, w) => acc + w.timeSpentMinutes, 0);
  const origMinutes = issue.originalEstimateMinutes || 240;
  const loggedPercent = Math.min(100, Math.round((totalLoggedMinutes / origMinutes) * 100));

  const handleSaveTitle = () => {
    if (tempTitle.trim()) {
      updateIssue(issue.id, { summary: tempTitle.trim() });
    }
    setIsEditingTitle(false);
  };

  const handleSaveDesc = () => {
    updateIssue(issue.id, { description: tempDesc });
    setIsEditingDesc(false);
  };

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSubtaskTitle.trim()) {
      addSubtask(issue.id, newSubtaskTitle.trim());
      setNewSubtaskTitle('');
      setIsAddingSubtask(false);
    }
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (commentText.trim()) {
      addComment(issue.id, commentText.trim());
      setCommentText('');
    }
  };

  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (linkTargetKey.trim()) {
      linkIssue(issue.id, linkTargetKey.trim().toUpperCase(), linkRelation);
      setLinkTargetKey('');
      setIsLinkIssueOpen(false);
    }
  };

  const handleDelete = () => {
    if (window.confirm(t.confirmDelete)) {
      deleteIssue(issue.id);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0 bg-slate-50/50 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <IssueTypeIcon type={issue.type} className="w-5 h-5" />
              <span className="font-mono font-semibold text-sm text-slate-800 dark:text-slate-200">
                {issue.key}
              </span>
              {currentSprint && (
                <span className="text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-medium">
                  {currentSprint.name}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleDelete}
                title={t.delete}
                className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="h-4 w-px bg-slate-200 dark:border-slate-800" />
              <button
                onClick={() => setSelectedIssueId(null)}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body Columns */}
          <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
            {/* Left Main Column (7 cols) */}
            <div className="lg:col-span-8 p-6 space-y-6">
              {/* Summary / Title */}
              <div>
                {isEditingTitle ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={tempTitle}
                      onChange={(e) => setTempTitle(e.target.value)}
                      className="w-full text-lg font-bold px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-blue-500 rounded-md focus:outline-none text-slate-900 dark:text-white"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveTitle}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded"
                      >
                        {t.save}
                      </button>
                      <button
                        onClick={() => setIsEditingTitle(false)}
                        className="px-3 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs rounded"
                      >
                        {t.cancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <h1 
                    onClick={() => {
                      setTempTitle(issue.summary);
                      setIsEditingTitle(true);
                    }}
                    className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/50 p-1.5 -m-1.5 rounded-md cursor-pointer transition-colors"
                    title="Click to edit title"
                  >
                    {issue.summary}
                  </h1>
                )}
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t.description}
                </h4>
                {isEditingDesc ? (
                  <div className="space-y-2">
                    <textarea
                      rows={5}
                      value={tempDesc}
                      onChange={(e) => setTempDesc(e.target.value)}
                      className="w-full text-xs p-3 bg-slate-50 dark:bg-slate-800 border border-blue-500 rounded-md focus:outline-none resize-none text-slate-800 dark:text-slate-200"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveDesc}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded"
                      >
                        {t.save}
                      </button>
                      <button
                        onClick={() => setIsEditingDesc(false)}
                        className="px-3 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs rounded"
                      >
                        {t.cancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => {
                      setTempDesc(issue.description);
                      setIsEditingDesc(true);
                    }}
                    className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed p-2.5 -m-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer min-h-[4rem] border border-transparent hover:border-slate-200 dark:hover:border-slate-800 transition-colors whitespace-pre-wrap"
                  >
                    {issue.description || <span className="text-slate-400 italic">{language === 'fa' ? 'توضیحاتی ثبت نشده است. برای نوشتن کلیک کنید.' : 'Add a description...'}</span>}
                  </div>
                )}
              </div>

              {/* Subtasks */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>{t.subtasks} ({issue.subtasks.filter(s => s.isCompleted).length}/{issue.subtasks.length})</span>
                  </h4>
                  <button
                    onClick={() => setIsAddingSubtask(true)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{t.addSubtask}</span>
                  </button>
                </div>

                {issue.subtasks.length > 0 && (
                  <div className="space-y-1">
                    {issue.subtasks.map((sub) => (
                      <div
                        key={sub.id}
                        className="flex items-center justify-between p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 text-xs transition-colors group"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <input
                            type="checkbox"
                            checked={sub.isCompleted}
                            onChange={() => toggleSubtask(issue.id, sub.id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="font-mono text-slate-400 text-[11px] shrink-0">{sub.key}</span>
                          <span className={`truncate ${sub.isCompleted ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
                            {sub.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            sub.isCompleted ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}>
                            {sub.isCompleted ? t.done : t.todo}
                          </span>
                          <button
                            onClick={() => deleteSubtask(issue.id, sub.id)}
                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-opacity p-0.5"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {isAddingSubtask && (
                  <form onSubmit={handleAddSubtask} className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      placeholder={language === 'fa' ? 'عنوان زیروظیفه...' : 'What needs to be done?'}
                      className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-blue-500 rounded-md focus:outline-none"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700"
                    >
                      {t.save}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingSubtask(false)}
                      className="px-2 py-1 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      {t.cancel}
                    </button>
                  </form>
                )}
              </div>

              {/* Linked Issues */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />
                    <span>{t.linkedIssues}</span>
                  </h4>
                  <button
                    onClick={() => setIsLinkIssueOpen(true)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{t.linkIssue}</span>
                  </button>
                </div>

                {issue.links && issue.links.length > 0 && (
                  <div className="space-y-1">
                    {issue.links.map((link) => (
                      <div
                        key={link.id}
                        className="flex items-center justify-between p-2 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400 uppercase font-medium">
                            {link.type.replace('_', ' ')}
                          </span>
                          <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold">
                            {link.targetIssueKey}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {isLinkIssueOpen && (
                  <form onSubmit={handleAddLink} className="flex gap-2 items-center bg-slate-50 dark:bg-slate-800 p-2 rounded-md border border-slate-200 dark:border-slate-700 text-xs">
                    <select
                      value={linkRelation}
                      onChange={(e) => setLinkRelation(e.target.value as any)}
                      className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs"
                    >
                      <option value="relates_to">{language === 'fa' ? 'مرتبط با' : 'relates to'}</option>
                      <option value="blocks">{language === 'fa' ? 'مسدودکننده' : 'blocks'}</option>
                      <option value="is_blocked_by">{language === 'fa' ? 'مسدود شده توسط' : 'is blocked by'}</option>
                    </select>
                    <input
                      type="text"
                      value={linkTargetKey}
                      onChange={(e) => setLinkTargetKey(e.target.value)}
                      placeholder="ENG-102"
                      className="w-28 px-2 py-1 uppercase font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs"
                    />
                    <button
                      type="submit"
                      className="px-2.5 py-1 bg-blue-600 text-white font-medium rounded hover:bg-blue-700"
                    >
                      {t.save}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsLinkIssueOpen(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      {t.cancel}
                    </button>
                  </form>
                )}
              </div>

              {/* Activity Section (Comments & Worklogs) */}
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-4 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold">
                  <button
                    onClick={() => setActiveTab('comments')}
                    className={`pb-2 transition-colors relative ${
                      activeTab === 'comments'
                        ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {t.comments} ({issue.comments.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('worklogs')}
                    className={`pb-2 transition-colors relative ${
                      activeTab === 'worklogs'
                        ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {t.worklogs} ({issue.worklogs.length})
                  </button>
                </div>

                {activeTab === 'comments' && (
                  <div className="space-y-4">
                    {/* Add Comment Input */}
                    <form onSubmit={handleAddComment} className="flex gap-3 items-start">
                      <UserAvatar user={currentUser} size="sm" />
                      <div className="flex-1 space-y-2">
                        <textarea
                          rows={2}
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          placeholder={t.addComment}
                          className="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500 resize-none text-slate-800 dark:text-slate-200"
                        />
                        {commentText.trim() && (
                          <button
                            type="submit"
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded flex items-center gap-1.5 shadow-xs"
                          >
                            <Send className="w-3 h-3" />
                            <span>{t.save}</span>
                          </button>
                        )}
                      </div>
                    </form>

                    {/* Comments List */}
                    <div className="space-y-3 pt-2">
                      {issue.comments.map((c) => {
                        const author = users.find(u => u.id === c.authorId);
                        return (
                          <div key={c.id} className="flex gap-3 text-xs">
                            <UserAvatar user={author} size="sm" />
                            <div className="flex-1 bg-slate-50/70 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-200/60 dark:border-slate-800 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-900 dark:text-white">
                                  {author ? (language === 'fa' ? author.nameFa : author.name) : 'User'}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {new Date(c.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                              <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                                {c.content}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeTab === 'worklogs' && (
                  <div className="space-y-2 text-xs">
                    {issue.worklogs.length === 0 ? (
                      <div className="p-4 text-center text-slate-400 italic">
                        {language === 'fa' ? 'هیچ زمانی برای این تسک ثبت نشده است.' : 'No work logged yet.'}
                      </div>
                    ) : (
                      issue.worklogs.map((w) => {
                        const author = users.find(u => u.id === w.authorId);
                        return (
                          <div key={w.id} className="flex items-center justify-between p-2.5 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-2.5">
                              <UserAvatar user={author} size="sm" />
                              <div>
                                <div className="font-medium text-slate-800 dark:text-slate-200">
                                  {author ? (language === 'fa' ? author.nameFa : author.name) : 'User'}
                                </div>
                                {w.comment && <div className="text-[11px] text-slate-500 italic">{w.comment}</div>}
                              </div>
                            </div>
                            <div className="text-end">
                              <div className="font-mono font-bold text-blue-600 dark:text-blue-400">
                                {formatMinutes(w.timeSpentMinutes, language)}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {new Date(w.startedAt).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Meta Column (4 cols) */}
            <div className="lg:col-span-4 p-6 bg-slate-50/50 dark:bg-slate-900/40 space-y-5 text-xs">
              {/* Status Transition Selector */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  {t.status}
                </label>
                <select
                  value={issue.status}
                  onChange={(e) => updateIssue(issue.id, { status: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-bold text-blue-600 dark:text-blue-400 focus:outline-none focus:border-blue-500 uppercase tracking-wide text-xs"
                >
                  <option value="todo">{t.todo}</option>
                  <option value="inprogress">{t.inprogress}</option>
                  <option value="review">{t.review}</option>
                  <option value="done">{t.done}</option>
                </select>
              </div>

              {/* Assignee */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {t.assignee}
                  </label>
                  <button
                    onClick={() => updateIssue(issue.id, { assigneeId: currentUser.id })}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {language === 'fa' ? 'به من اختصاص بده' : 'Assign to me'}
                  </button>
                </div>
                <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-1.5 border border-slate-300 dark:border-slate-700 rounded-md">
                  <UserAvatar user={assigneeUser} size="sm" />
                  <select
                    value={issue.assigneeId || ''}
                    onChange={(e) => updateIssue(issue.id, { assigneeId: e.target.value || null })}
                    className="flex-1 bg-transparent border-none focus:outline-none text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="">{language === 'fa' ? 'بدون مسئول (Unassigned)' : 'Unassigned'}</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {language === 'fa' ? u.nameFa : u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Reporter */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  {t.reporter}
                </label>
                <div className="flex items-center gap-2 p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md">
                  <UserAvatar user={reporterUser} size="sm" />
                  <span className="text-slate-800 dark:text-slate-200 font-medium">
                    {language === 'fa' ? reporterUser.nameFa : reporterUser.name}
                  </span>
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  {t.priority}
                </label>
                <div className="relative">
                  <select
                    value={issue.priority}
                    onChange={(e) => updateIssue(issue.id, { priority: e.target.value as Priority })}
                    className="w-full ps-8 pe-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                  >
                    <option value="highest">{t.highest}</option>
                    <option value="high">{t.high}</option>
                    <option value="medium">{t.medium}</option>
                    <option value="low">{t.low}</option>
                    <option value="lowest">{t.lowest}</option>
                  </select>
                  <div className="absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                    <PriorityIcon priority={issue.priority} className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Story Points */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  {t.storyPoints}
                </label>
                <input
                  type="number"
                  min="0"
                  value={issue.storyPoints ?? 0}
                  onChange={(e) => updateIssue(issue.id, { storyPoints: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Epic */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  {t.epic}
                </label>
                <select
                  value={issue.epicId || ''}
                  onChange={(e) => updateIssue(issue.id, { epicId: e.target.value || null })}
                  className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                >
                  <option value="">{language === 'fa' ? 'بدون اپیک' : 'None'}</option>
                  {epics.filter(e => e.projectId === issue.projectId).map(e => (
                    <option key={e.id} value={e.id}>
                      {language === 'fa' ? e.nameFa : e.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Time Tracking Widget */}
              <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    <span>{t.timeTracking}</span>
                  </span>
                  <button
                    onClick={() => setIsLogWorkOpen(true)}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                  >
                    + {t.logWork}
                  </button>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-600 transition-all duration-300" 
                    style={{ width: `${loggedPercent}%` }} 
                  />
                </div>

                <div className="flex justify-between text-[11px] font-mono text-slate-500">
                  <span>{t.logged}: <strong className="text-slate-700 dark:text-slate-300">{formatMinutes(totalLoggedMinutes, language)}</strong></span>
                  <span>{t.remaining}: <strong className="text-slate-700 dark:text-slate-300">{formatMinutes(issue.remainingEstimateMinutes, language)}</strong></span>
                </div>
              </div>

              {/* Dates */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-400 space-y-1 font-mono">
                <div>Created: {new Date(issue.createdAt).toLocaleString()}</div>
                <div>Updated: {new Date(issue.updatedAt).toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <LogWorkModal
        issueId={issue.id}
        isOpen={isLogWorkOpen}
        onClose={() => setIsLogWorkOpen(false)}
      />
    </>
  );
};
