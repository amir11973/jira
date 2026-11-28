import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Clock,
  Link2,
  CheckSquare,
  Trash2,
  Plus,
  Send,
  Flag,
  Eye,
  GitBranch,
  Zap,
  ChevronDown,
  ChevronUp,
  Lock,
  Copy,
  Archive,
  Paperclip,
  Code2,
  Share2,
  ExternalLink,
  MoreHorizontal,
  AlignLeft,
  Settings,
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { buildDevLinkUrl, reposForProject } from '../../utils/devLinks';
import { IssueTypeIcon, PriorityIcon, UserAvatar } from '../common/JiraIcons';
import { formatLocalizedDateTime, formatMinutes } from '../../utils/i18n';
import { LogWorkModal } from './LogWorkModal';
import { IssueLink, IssueType, Priority, ResolutionType } from '../../types/jira';
import { getAvailableTransitions } from '../../utils/workflowEngine';

export const IssueDetailModal: React.FC = () => {
  const {
    selectedIssueId,
    setSelectedIssueId,
    issues,
    createIssue,
    updateIssue,
    deleteIssue,
    moveIssueStatus,
    toggleFlagged,
    toggleWatcher,
    addSubtask,
    toggleSubtask,
    deleteSubtask,
    addComment,
    linkIssue,
    cloneIssue,
    toggleArchiveIssue,
    uploadIssueAttachment,
    deleteIssueAttachment,
    repositories,
    users: allUsersForAttachments,
    addIssueDevLink,
    addWorkflowStatus,
    projects,
    currentProject,
    setCurrentProjectId,
    setActiveView,
    showToast,
    users,
    currentUser,
    epics,
    sprints,
    currentWorkflow,
    setWorkflowViewerIssueId,
    t,
    language,
  } = useJira();

  const [activeTab, setActiveTab] = useState<'all' | 'comments' | 'history' | 'worklogs'>('all');
  const [commentText, setCommentText] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [isLogWorkOpen, setIsLogWorkOpen] = useState(false);
  const [isLinkIssueOpen, setIsLinkIssueOpen] = useState(false);
  const [linkTargetKey, setLinkTargetKey] = useState('');
  const [linkRelation, setLinkRelation] = useState<IssueLink['type']>('relates_to');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [tempTitle, setTempTitle] = useState('');
  const [tempDesc, setTempDesc] = useState('');
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [isAddingInlineStatus, setIsAddingInlineStatus] = useState(false);
  const [inlineStatusName, setInlineStatusName] = useState('');
  const [uploadingCount, setUploadingCount] = useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [devPanelOpen, setDevPanelOpen] = useState(true);
  const [automationPanelOpen, setAutomationPanelOpen] = useState(false);
  const [quickAddMenuOpen, setQuickAddMenuOpen] = useState(false);
  const [quickMoreMenuOpen, setQuickMoreMenuOpen] = useState(false);
  const [childItemsOpen, setChildItemsOpen] = useState(true);
  const [isAddingChildItem, setIsAddingChildItem] = useState(false);
  const [newChildTitle, setNewChildTitle] = useState('');
  const [newChildType, setNewChildType] = useState<IssueType>('story');
  const [detailsOpen, setDetailsOpen] = useState(true);

  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  const issue = issues.find(i => i.id === selectedIssueId);

  // 'M' keyboard shortcut to focus comment textarea (F17)
  useEffect(() => {
    if (!selectedIssueId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if ((e.key === 'm' || e.key === 'M') && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
        setActiveTab('comments');
        setTimeout(() => commentInputRef.current?.focus(), 40);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIssueId]);

  if (!selectedIssueId || !issue) return null;

  const issueProject = projects.find(p => p.id === issue.projectId) || currentProject;
  const parentEpic = epics.find(e => e.id === issue.epicId);
  const currentSprint = sprints.find(s => s.id === issue.sprintId);
  const assigneeUser = users.find(u => u.id === issue.assigneeId);
  const reporterUser = users.find(u => u.id === issue.reporterId) || users[0];
  const currentStatusObj = currentWorkflow.statuses.find(s => s.id === issue.status);
  const availableTransitions = getAvailableTransitions(issue, currentUser, currentWorkflow, language);

  const totalLoggedMinutes = issue.worklogs.reduce((acc, w) => acc + w.timeSpentMinutes, 0);
  const origMinutes = issue.originalEstimateMinutes || 240;
  const loggedPercent = Math.min(100, Math.round((totalLoggedMinutes / origMinutes) * 100));
  const isWatching = Boolean(currentUser && (issue.watchers || []).includes(currentUser.id));

  const matchedEpicObj = epics.find(
    e => e.id === issue.epicId || e.key === issue.key || (issue.type === 'epic' && e.name === issue.summary)
  );
  const resolvedEpicId = issue.epicId || matchedEpicObj?.id || (issue.type === 'epic' ? issue.id : undefined);
  const childIssues = issues.filter(
    i =>
      !i.archived &&
      i.id !== issue.id &&
      ((issue.type === 'epic' && resolvedEpicId && i.epicId === resolvedEpicId) || i.parentIssueId === issue.id)
  );
  const childDoneCount = childIssues.filter(c => c.status === 'done').length;
  const childInProgCount = childIssues.filter(c => c.status === 'inprogress' || c.status === 'review').length;
  const childDonePct = childIssues.length > 0 ? Math.round((childDoneCount / childIssues.length) * 100) : 0;
  const childInProgPct = childIssues.length > 0 ? Math.round((childInProgCount / childIssues.length) * 100) : 0;

  const quickReplies =
    language === 'fa'
      ? ['چه کسی روی این تسک کار می‌کند؟', 'لطفاً آخرین وضعیت را اعلام کنید.', 'ممنون، بررسی و تایید شد.']
      : ['Who is working on this...?', 'Status update...', 'Thanks...'];

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

  const combinedActivity = [
    ...issue.comments.map(c => ({
      kind: 'comment' as const,
      id: c.id,
      authorId: c.authorId,
      createdAt: c.createdAt,
      content: c.content,
    })),
    ...(issue.history || []).map(h => ({
      kind: 'history' as const,
      id: h.id,
      authorId: h.authorId,
      createdAt: h.createdAt,
      field: h.field,
      fromValue: h.fromValue,
      toValue: h.toValue,
    })),
    ...issue.worklogs.map(w => ({
      kind: 'worklog' as const,
      id: w.id,
      authorId: w.authorId,
      createdAt: w.startedAt,
      minutes: w.timeSpentMinutes,
      comment: w.comment,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
          {/* Header with Breadcrumbs + Clone / Archive / Flag / Watch / Delete */}
          <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0 bg-slate-50/50 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <button
                  onClick={() => {
                    setSelectedIssueId(null);
                    setActiveView('spaces');
                  }}
                  className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline font-medium"
                >
                  {language === 'fa' ? 'فضاها' : 'Spaces'}
                </button>
                <span>/</span>
                <button
                  onClick={() => {
                    setCurrentProjectId(issueProject.id);
                    setSelectedIssueId(null);
                    setActiveView('board');
                  }}
                  className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline font-semibold text-slate-700 dark:text-slate-300"
                >
                  {issueProject.key}
                </button>
                {parentEpic && (
                  <>
                    <span>/</span>
                    <button
                      onClick={() => {
                        setCurrentProjectId(issueProject.id);
                        setSelectedIssueId(null);
                        setActiveView('roadmap');
                      }}
                      className="hover:underline font-semibold truncate max-w-[140px]"
                      style={{ color: parentEpic.color }}
                    >
                      {parentEpic.key}
                    </button>
                  </>
                )}
                <span>/</span>
              </div>

              <IssueTypeIcon type={issue.type} className="w-4 h-4 shrink-0" />
              <span className="font-mono font-semibold text-sm text-slate-800 dark:text-slate-200">
                {issue.key}
              </span>
              {currentSprint && (
                <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                  · {currentSprint.name}
                </span>
              )}
              {issue.flagged && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  <Flag className="w-3.5 h-3.5 fill-amber-500" />
                  <span>{t.flagged}</span>
                </span>
              )}
              {issue.archived && (
                <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                  ({language === 'fa' ? 'آرشیو شده' : 'Archived'})
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => toggleWatcher(issue.id)}
                className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${
                  isWatching
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title={isWatching ? t.unwatchIssue : t.watchIssue}
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="font-mono tabular-nums">{(issue.watchers || []).length}</span>
              </button>

              <button
                onClick={() => toggleFlagged(issue.id)}
                className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${
                  issue.flagged
                    ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title={issue.flagged ? t.unflagImpediment : t.flagImpediment}
              >
                <Flag className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => {
                  const cloned = cloneIssue(issue.id);
                  if (cloned) setSelectedIssueId(cloned.id);
                }}
                title={t.cloneIssue}
                className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Copy className="w-4 h-4" />
              </button>

              <button
                onClick={() => toggleArchiveIssue(issue.id)}
                title={issue.archived ? t.restoreIssue : t.archiveIssue}
                className={`p-1.5 rounded-md transition-colors ${
                  issue.archived
                    ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40'
                    : 'text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Archive className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  navigator.clipboard?.writeText(`${window.location.origin}/browse/${issue.key}`).catch(() => {});
                  showToast('info', language === 'fa' ? `لینک ${issue.key} کپی شد.` : `Copied link for ${issue.key}`);
                }}
                title={language === 'fa' ? 'کپی لینک' : 'Copy Link'}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Share2 className="w-4 h-4" />
              </button>

              <button
                onClick={handleDelete}
                title={t.delete}
                className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
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
            {/* Left Main Column */}
            <div className="lg:col-span-8 p-6 space-y-6">
              <div>
                {isEditingTitle ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={tempTitle}
                      onChange={e => setTempTitle(e.target.value)}
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
                  >
                    {issue.summary}
                  </h1>
                )}

                {/* Quick Action Toolbar (+ / ... / Description edit) matching Jira Cloud */}
                <div className="flex items-center gap-1.5 mt-3 relative">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setQuickAddMenuOpen(prev => !prev);
                        setQuickMoreMenuOpen(false);
                      }}
                      title={language === 'fa' ? 'افزودن سریع' : 'Add'}
                      className="w-8 h-8 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    {quickAddMenuOpen && (
                      <div className="absolute top-full mt-1 start-0 w-48 bg-white dark:bg-[#282E33] border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1 z-30 text-xs">
                        {issue.type === 'epic' && (
                          <button
                            type="button"
                            onClick={() => {
                              setChildItemsOpen(true);
                              setIsAddingChildItem(true);
                              setQuickAddMenuOpen(false);
                            }}
                            className="w-full px-3 py-2 text-start hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 text-slate-800 dark:text-slate-200"
                          >
                            <Plus className="w-3.5 h-3.5 text-purple-500" />
                            <span>{language === 'fa' ? 'آیتم فرزند (Child work item)' : 'Child work item'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingSubtask(true);
                            setQuickAddMenuOpen(false);
                          }}
                          className="w-full px-3 py-2 text-start hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 text-slate-800 dark:text-slate-200"
                        >
                          <CheckSquare className="w-3.5 h-3.5 text-blue-500" />
                          <span>{t.addSubtask}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsLinkIssueOpen(true);
                            setQuickAddMenuOpen(false);
                          }}
                          className="w-full px-3 py-2 text-start hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 text-slate-800 dark:text-slate-200"
                        >
                          <Link2 className="w-3.5 h-3.5 text-emerald-500" />
                          <span>{t.linkIssue}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            fileInputRef.current?.click();
                            setQuickAddMenuOpen(false);
                          }}
                          className="w-full px-3 py-2 text-start hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 text-slate-800 dark:text-slate-200"
                        >
                          <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                          <span>{language === 'fa' ? 'پیوست فایل' : 'Attach file'}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setQuickMoreMenuOpen(prev => !prev);
                        setQuickAddMenuOpen(false);
                      }}
                      title={language === 'fa' ? 'اقدامات بیشتر' : 'More actions'}
                      className="w-8 h-8 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {quickMoreMenuOpen && (
                      <div className="absolute top-full mt-1 start-0 w-44 bg-white dark:bg-[#282E33] border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1 z-30 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            const cloned = cloneIssue(issue.id);
                            if (cloned) setSelectedIssueId(cloned.id);
                            setQuickMoreMenuOpen(false);
                          }}
                          className="w-full px-3 py-2 text-start hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>{t.cloneIssue}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            toggleFlagged(issue.id);
                            setQuickMoreMenuOpen(false);
                          }}
                          className="w-full px-3 py-2 text-start hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                        >
                          <Flag className="w-3.5 h-3.5 text-amber-500" />
                          <span>{issue.flagged ? t.unflagImpediment : t.flagImpediment}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            toggleArchiveIssue(issue.id);
                            setQuickMoreMenuOpen(false);
                          }}
                          className="w-full px-3 py-2 text-start hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                        >
                          <Archive className="w-3.5 h-3.5" />
                          <span>{issue.archived ? t.restoreIssue : t.archiveIssue}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setQuickMoreMenuOpen(false);
                            handleDelete();
                          }}
                          className="w-full px-3 py-2 text-start hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 flex items-center gap-2"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{t.delete}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setTempDesc(issue.description);
                      setIsEditingDesc(true);
                    }}
                    title={language === 'fa' ? 'ویرایش توضیحات' : 'Edit description'}
                    className="w-8 h-8 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors"
                  >
                    <AlignLeft className="w-4 h-4" />
                  </button>
                </div>
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
                      onChange={e => setTempDesc(e.target.value)}
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
                    {issue.description || (
                      <span className="text-slate-400 italic">
                        {language === 'fa' ? 'توضیحاتی ثبت نشده است. برای نوشتن کلیک کنید.' : 'Add a description...'}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Child work items (Epic / Parent hierarchy table with Progress bar + Inline + Add + Inline Status dropdown) */}
              {(issue.type === 'epic' || childIssues.length > 0) && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setChildItemsOpen(prev => !prev)}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100"
                    >
                      {childItemsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                      <span>{language === 'fa' ? 'آیتم‌های کار زیرمجموعه (Child work items)' : 'Child work items'}</span>
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums">({childIssues.length})</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setChildItemsOpen(true);
                          setIsAddingChildItem(true);
                        }}
                        title={language === 'fa' ? 'افزودن آیتم فرزند' : 'Add child work item'}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {childItemsOpen && (
                    <div className="space-y-2.5">
                      {/* Progress bar */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex">
                          {childDonePct > 0 && (
                            <div
                              className="h-full bg-emerald-500 transition-all duration-300"
                              style={{ width: `${childDonePct}%` }}
                            />
                          )}
                          {childInProgPct > 0 && (
                            <div
                              className="h-full bg-blue-500 transition-all duration-300"
                              style={{ width: `${childInProgPct}%` }}
                            />
                          )}
                        </div>
                        <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                          {childDonePct}% Done
                        </span>
                      </div>

                      {/* Child table */}
                      {childIssues.length > 0 && (
                        <div className="border border-slate-200 dark:border-slate-700/80 rounded-lg overflow-hidden">
                          <table className="w-full text-xs text-start border-collapse">
                            <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] font-semibold text-slate-500 border-b border-slate-200 dark:border-slate-700/80">
                              <tr>
                                <th className="py-1.5 px-2.5 text-start">{language === 'fa' ? 'کار' : 'Work'}</th>
                                <th className="py-1.5 px-2 text-start w-20">{language === 'fa' ? 'اولویت' : 'Priority'}</th>
                                <th className="py-1.5 px-2 text-start w-20">{language === 'fa' ? 'مسئول' : 'Assignee'}</th>
                                <th className="py-1.5 px-2.5 text-end w-32">{t.status}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                              {childIssues.map(ch => {
                                const chAssignee = users.find(u => u.id === ch.assigneeId);
                                const chStatusObj = currentWorkflow.statuses.find(s => s.id === ch.status);
                                const statusColor =
                                  chStatusObj?.category === 'done' || ch.status === 'done'
                                    ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                                    : chStatusObj?.category === 'inprogress' || ch.status === 'inprogress' || ch.status === 'review'
                                    ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700';

                                return (
                                  <tr key={ch.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                    <td className="py-2 px-2.5">
                                      <button
                                        type="button"
                                        onClick={() => setSelectedIssueId(ch.id)}
                                        className="flex items-center gap-2 text-start min-w-0 group"
                                      >
                                        <IssueTypeIcon type={ch.type} className="w-3.5 h-3.5 shrink-0" />
                                        <span className="font-mono text-blue-600 dark:text-blue-400 group-hover:underline shrink-0">
                                          {ch.key}
                                        </span>
                                        <span className="text-slate-800 dark:text-slate-200 truncate max-w-[240px]">
                                          {ch.summary}
                                        </span>
                                      </button>
                                    </td>
                                    <td className="py-2 px-2">
                                      <div className="flex items-center gap-1 text-slate-500 capitalize">
                                        <PriorityIcon priority={ch.priority} className="w-3.5 h-3.5" />
                                        <span className="hidden sm:inline text-[11px]">{ch.priority}</span>
                                      </div>
                                    </td>
                                    <td className="py-2 px-2">
                                      <div className="flex items-center gap-1.5">
                                        <UserAvatar user={chAssignee} size="sm" />
                                      </div>
                                    </td>
                                    <td className="py-2 px-2.5 text-end">
                                      <select
                                        value={ch.status}
                                        onChange={e => moveIssueStatus(ch.id, e.target.value)}
                                        className={`px-2 py-0.5 rounded border text-[11px] font-bold focus:outline-none cursor-pointer ${statusColor}`}
                                      >
                                        {currentWorkflow.statuses.map(st => (
                                          <option key={st.id} value={st.id}>
                                            {language === 'fa' ? st.nameFa : st.name}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Inline + Create Child Work Item row */}
                      {isAddingChildItem && (
                        <form
                          onSubmit={e => {
                            e.preventDefault();
                            if (!newChildTitle.trim()) return;
                            createIssue({
                              projectId: issue.projectId,
                              type: newChildType,
                              summary: newChildTitle.trim(),
                              epicId: resolvedEpicId || null,
                              parentIssueId: issue.id,
                              priority: 'medium',
                            });
                            setNewChildTitle('');
                            setIsAddingChildItem(false);
                          }}
                          className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-blue-500/60 text-xs"
                        >
                          <select
                            value={newChildType}
                            onChange={e => setNewChildType(e.target.value as IssueType)}
                            className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs font-medium"
                          >
                            <option value="story">{t.storyType}</option>
                            <option value="task">{t.taskType}</option>
                            <option value="bug">{t.bugType}</option>
                            <option value="feature">{t.featureType}</option>
                          </select>
                          <input
                            type="text"
                            value={newChildTitle}
                            onChange={e => setNewChildTitle(e.target.value)}
                            placeholder={language === 'fa' ? 'عنوان آیتم جدید را بنویسید...' : 'What needs to be done?'}
                            autoFocus
                            className="flex-1 min-w-[180px] px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs focus:outline-none focus:border-blue-500"
                          />
                          <button type="submit" className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded">
                            {language === 'fa' ? 'ایجاد' : 'Create'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsAddingChildItem(false);
                              setNewChildTitle('');
                            }}
                            className="px-2 py-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                          >
                            {t.cancel}
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Subtasks */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>
                      {t.subtasks} ({issue.subtasks.filter(s => s.isCompleted).length}/{issue.subtasks.length})
                    </span>
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
                    {issue.subtasks.map(sub => (
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
                          <span
                            className={`truncate ${
                              sub.isCompleted ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {sub.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-semibold ${
                              sub.isCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'
                            }`}
                          >
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
                      onChange={e => setNewSubtaskTitle(e.target.value)}
                      placeholder={language === 'fa' ? 'عنوان زیروظیفه...' : 'What needs to be done?'}
                      className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-blue-500 rounded-md focus:outline-none"
                      autoFocus
                    />
                    <button type="submit" className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded">
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
                    {issue.links.map(link => (
                      <div
                        key={link.id}
                        className="flex items-center justify-between p-2 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400 uppercase font-medium">
                            {link.type.replace(/_/g, ' ')}
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
                  <form
                    onSubmit={handleAddLink}
                    className="flex flex-wrap gap-2 items-center bg-slate-50 dark:bg-slate-800 p-2 rounded-md border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    <select
                      value={linkRelation}
                      onChange={e => setLinkRelation(e.target.value as IssueLink['type'])}
                      className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs"
                    >
                      <option value="relates_to">{language === 'fa' ? 'مرتبط با' : 'relates to'}</option>
                      <option value="blocks">{language === 'fa' ? 'مسدودکننده' : 'blocks'}</option>
                      <option value="is_blocked_by">{language === 'fa' ? 'مسدود شده توسط' : 'is blocked by'}</option>
                      <option value="cloners">{t.clonersLink}</option>
                      <option value="duplicates">{t.duplicateLink}</option>
                    </select>
                    <input
                      type="text"
                      value={linkTargetKey}
                      onChange={e => setLinkTargetKey(e.target.value)}
                      placeholder="ENG-102"
                      className="w-28 px-2 py-1 uppercase font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs"
                    />
                    <button type="submit" className="px-2.5 py-1 bg-blue-600 text-white font-medium rounded">
                      {t.save}
                    </button>
                    <button type="button" onClick={() => setIsLinkIssueOpen(false)} className="text-slate-400">
                      {t.cancel}
                    </button>
                  </form>
                )}
              </div>

              {/* Attachments Section (F09, F26) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>
                      {t.attachmentsView} ({(issue.attachments || []).length})
                    </span>
                  </h4>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingCount > 0}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium disabled:opacity-60"
                  >
                    <Plus className="w-3 h-3" />
                    <span>
                      {uploadingCount > 0
                        ? language === 'fa'
                          ? 'در حال بارگذاری…'
                          : 'Uploading…'
                        : language === 'fa'
                        ? 'افزودن فایل'
                        : 'Attach file'}
                    </span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={async e => {
                      const files = Array.from(e.target.files || []);
                      e.target.value = '';
                      for (const file of files) {
                        setUploadingCount(c => c + 1);
                        await uploadIssueAttachment(issue.id, file);
                        setUploadingCount(c => c - 1);
                      }
                    }}
                  />
                </div>

                {(issue.attachments || []).length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(issue.attachments || []).map(att => {
                      const uploader = allUsersForAttachments.find(u => u.id === att.uploadedBy);
                      const canRemove =
                        currentUser?.role === 'admin' || (currentUser && att.uploadedBy === currentUser.id);
                      return (
                        <div
                          key={att.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <div className="min-w-0">
                              {att.downloadUrl ? (
                                <a
                                  href={att.downloadUrl}
                                  download={att.name}
                                  className="font-medium text-blue-600 dark:text-blue-400 hover:underline truncate block"
                                  title={language === 'fa' ? 'دانلود' : 'Download'}
                                >
                                  {att.name}
                                </a>
                              ) : (
                                <span
                                  className="font-medium text-slate-500 truncate block"
                                  title={language === 'fa' ? 'فایل ذخیره نشده است' : 'No stored file (legacy entry)'}
                                >
                                  {att.name}
                                </span>
                              )}
                              {uploader && (
                                <span className="text-[10px] text-slate-400 truncate block">
                                  {language === 'fa' ? uploader.nameFa : uploader.name}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-[10px] text-slate-400">{att.size}</span>
                            {canRemove && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(language === 'fa' ? 'این پیوست حذف شود؟' : 'Remove this attachment?')) {
                                    deleteIssueAttachment(issue.id, att.id);
                                  }
                                }}
                                className="text-slate-400 hover:text-rose-600"
                                title={language === 'fa' ? 'حذف' : 'Remove'}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Activity Tabs: All / Comments / History / Worklog */}
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-4 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold">
                  {[
                    { id: 'all', label: t.allActivity },
                    { id: 'comments', label: `${t.comments} (${issue.comments.length})` },
                    { id: 'history', label: `${t.history} (${(issue.history || []).length})` },
                    { id: 'worklogs', label: `${t.worklogs} (${issue.worklogs.length})` },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`pb-2 transition-colors ${
                        activeTab === tab.id
                          ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Comment Input + Quick Replies */}
                {(activeTab === 'all' || activeTab === 'comments') && (
                  <form onSubmit={handleAddComment} className="flex gap-3 items-start">
                    <UserAvatar user={currentUser} size="sm" />
                    <div className="flex-1 space-y-2">
                      <textarea
                        ref={commentInputRef}
                        rows={2}
                        value={commentText}
                        onChange={e => setCommentText(e.target.value)}
                        placeholder={t.addComment}
                        className="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500 resize-none text-slate-800 dark:text-slate-200"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          {quickReplies.map((qr, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setCommentText(qr)}
                              className="px-2 py-0.5 text-[11px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded transition-colors"
                            >
                              {qr}
                            </button>
                          ))}
                        </div>
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
                    </div>
                  </form>
                )}

                {activeTab === 'all' && (
                  <div className="space-y-2.5 pt-1">
                    {combinedActivity.map(item => {
                      const author = users.find(u => u.id === item.authorId);
                      return (
                        <div key={item.id} className="flex gap-3 text-xs">
                          <UserAvatar user={author} size="sm" />
                          <div className="flex-1 bg-slate-50/70 dark:bg-slate-800/40 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-800 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {author ? (language === 'fa' ? author.nameFa : author.name) : 'System'}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {new Date(item.createdAt).toLocaleString()}
                              </span>
                            </div>
                            {item.kind === 'comment' && (
                              <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{item.content}</p>
                            )}
                            {item.kind === 'history' && (
                              <p className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                                {item.field}: {item.fromValue || '—'} → <strong className="text-slate-700 dark:text-slate-200">{item.toValue}</strong>
                              </p>
                            )}
                            {item.kind === 'worklog' && (
                              <p className="text-blue-600 dark:text-blue-400 font-mono text-[11px]">
                                Logged {formatMinutes(item.minutes, language)} {item.comment ? `— ${item.comment}` : ''}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeTab === 'comments' && (
                  <div className="space-y-3 pt-2">
                    {issue.comments.map(c => {
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
                )}

                {activeTab === 'history' && (
                  <div className="space-y-2 text-xs">
                    {(issue.history || []).length === 0 ? (
                      <div className="p-4 text-center text-slate-400 italic">No history recorded yet.</div>
                    ) : (
                      (issue.history || []).map(h => {
                        const actor = users.find(u => u.id === h.authorId);
                        return (
                          <div
                            key={h.id}
                            className="flex items-center justify-between p-2.5 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800"
                          >
                            <div className="flex items-center gap-2">
                              <UserAvatar user={actor} size="sm" />
                              <div>
                                <span className="font-semibold text-slate-800 dark:text-slate-200">
                                  {actor ? (language === 'fa' ? actor.nameFa : actor.name) : 'System'}
                                </span>{' '}
                                <span className="text-slate-500">changed {h.field}:</span>{' '}
                                <span className="font-mono text-slate-400">{h.fromValue || '—'}</span> →{' '}
                                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                                  {h.toValue}
                                </span>
                              </div>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">
                              {new Date(h.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {activeTab === 'worklogs' && (
                  <div className="space-y-2 text-xs">
                    {issue.worklogs.length === 0 ? (
                      <div className="p-4 text-center text-slate-400 italic">
                        {language === 'fa' ? 'هیچ زمانی برای این تسک ثبت نشده است.' : 'No work logged yet.'}
                      </div>
                    ) : (
                      issue.worklogs.map(w => {
                        const author = users.find(u => u.id === w.authorId);
                        return (
                          <div
                            key={w.id}
                            className="flex items-center justify-between p-2.5 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800"
                          >
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

            {/* Right Meta Column */}
            <div className="lg:col-span-4 p-6 bg-slate-50/50 dark:bg-slate-900/40 space-y-4 text-xs">
              {/* Workflow Status Dropdown + View Workflow (Figure 1) */}
              <div className="relative">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  {t.status}
                </label>
                <button
                  type="button"
                  onClick={() => setStatusMenuOpen(prev => !prev)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-bold text-blue-600 dark:text-blue-400 flex items-center justify-between uppercase tracking-wide text-xs"
                >
                  <span>
                    {currentStatusObj
                      ? language === 'fa'
                        ? currentStatusObj.nameFa
                        : currentStatusObj.name
                      : issue.status}
                  </span>
                  <ChevronDown className="w-4 h-4" />
                </button>

                {statusMenuOpen && (
                  <div className="absolute top-full mt-1 start-0 end-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-1 z-30">
                    {availableTransitions.map(({ transition, statusObj, restrictResult }) => (
                      <button
                        key={transition.id}
                        type="button"
                        disabled={!restrictResult.allowed}
                        onClick={() => {
                          moveIssueStatus(issue.id, statusObj.id);
                          setStatusMenuOpen(false);
                        }}
                        className={`w-full text-start px-2.5 py-2 rounded text-xs flex items-center justify-between gap-2 ${
                          restrictResult.allowed
                            ? 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold'
                            : 'opacity-55 cursor-not-allowed text-slate-400'
                        }`}
                        title={restrictResult.reason}
                      >
                        <span>→ {language === 'fa' ? statusObj.nameFa : statusObj.name}</span>
                        {!restrictResult.allowed && <Lock className="w-3 h-3 text-rose-500 shrink-0" />}
                      </button>
                    ))}
                    <div className="border-t border-slate-100 dark:border-slate-800 mt-1 pt-1 space-y-1">
                      {isAddingInlineStatus ? (
                        <form
                          onSubmit={e => {
                            e.preventDefault();
                            if (!inlineStatusName.trim()) return;
                            const st = addWorkflowStatus({
                              name: inlineStatusName.trim(),
                              nameFa: inlineStatusName.trim(),
                              category: 'inprogress',
                            });
                            moveIssueStatus(issue.id, st.id);
                            setInlineStatusName('');
                            setIsAddingInlineStatus(false);
                            setStatusMenuOpen(false);
                          }}
                          className="p-1.5 flex gap-1"
                        >
                          <input
                            type="text"
                            value={inlineStatusName}
                            onChange={e => setInlineStatusName(e.target.value)}
                            placeholder={language === 'fa' ? 'نام وضعیت...' : 'New status...'}
                            className="flex-1 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-xs"
                            autoFocus
                          />
                          <button type="submit" className="px-2 py-1 bg-blue-600 text-white rounded text-[11px] font-semibold">
                            +
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsAddingInlineStatus(true)}
                          className="w-full text-start px-2.5 py-1.5 rounded text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{t.addStatus}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setStatusMenuOpen(false);
                          setSelectedIssueId(null);
                          setActiveView('workflow');
                        }}
                        className="w-full text-start px-2.5 py-1.5 rounded text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5"
                      >
                        <GitBranch className="w-3.5 h-3.5" />
                        <span>{t.editWorkflow}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setStatusMenuOpen(false);
                          setWorkflowViewerIssueId(issue.id);
                        }}
                        className="w-full text-start px-2.5 py-1.5 rounded text-xs font-semibold text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 flex items-center gap-1.5"
                      >
                        <GitBranch className="w-3.5 h-3.5" />
                        <span>{t.viewWorkflow}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Details Collapsible Header Bar (matching Jira Cloud Details panel) */}
              <div className="border border-slate-200 dark:border-slate-700/80 rounded-lg bg-white dark:bg-slate-900/60 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setDetailsOpen(prev => !prev)}
                    className="flex items-center gap-1.5 font-bold text-xs text-slate-800 dark:text-slate-100"
                  >
                    {detailsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                    <span>{language === 'fa' ? 'جزئیات (Details)' : 'Details'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIssueId(null);
                      setActiveView('settings');
                    }}
                    title={t.projectSettings}
                    className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                </div>

                {detailsOpen && (
                  <div className="p-3 space-y-3.5">
              {/* Resolution */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  {t.resolution}
                </label>
                <select
                  value={issue.resolution || ''}
                  onChange={e =>
                    updateIssue(issue.id, {
                      resolution: (e.target.value || null) as ResolutionType | null,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                >
                  <option value="">{t.unresolved}</option>
                  <option value="Done">Done</option>
                  <option value="Won't Do">Won&apos;t Do</option>
                  <option value="Duplicate">Duplicate</option>
                  <option value="Cannot Reproduce">Cannot Reproduce</option>
                </select>
              </div>

              {/* Security Level */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  {language === 'fa' ? 'سطح امنیتی (Security Level)' : 'Security Level'}
                </label>
                <select
                  value={issue.securityLevel || ''}
                  onChange={e =>
                    updateIssue(issue.id, {
                      securityLevel: e.target.value || undefined,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                >
                  <option value="">{language === 'fa' ? 'پیش‌فرض فضا (None)' : 'None (Default)'}</option>
                  <option value="Standard">Standard</option>
                  <option value="Confidential">Confidential</option>
                  <option value="Restricted">Restricted</option>
                  <option value="Executive Only">Executive Only</option>
                </select>
              </div>

              {/* Assignee */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {t.assignee}
                  </label>
                  <button
                    onClick={() => {
                      if (currentUser) updateIssue(issue.id, { assigneeId: currentUser.id });
                    }}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {language === 'fa' ? 'به من اختصاص بده' : 'Assign to me'}
                  </button>
                </div>
                <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-1.5 border border-slate-300 dark:border-slate-700 rounded-md">
                  <UserAvatar user={assigneeUser} size="sm" />
                  <select
                    value={issue.assigneeId || ''}
                    onChange={e => updateIssue(issue.id, { assigneeId: e.target.value || null })}
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

              {/* Priority & Story Points */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    {t.priority}
                  </label>
                  <div className="relative">
                    <select
                      value={issue.priority}
                      onChange={e => updateIssue(issue.id, { priority: e.target.value as Priority })}
                      className="w-full ps-7 pe-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                    >
                      <option value="highest">Highest</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                      <option value="lowest">Lowest</option>
                    </select>
                    <div className="absolute start-2 top-1/2 -translate-y-1/2 pointer-events-none">
                      <PriorityIcon priority={issue.priority} className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    {t.storyPoints}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={issue.storyPoints ?? 0}
                    onChange={e => updateIssue(issue.id, { storyPoints: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Start Date & Due Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    {t.startDate}
                  </label>
                  <input
                    type="date"
                    value={issue.startDate || ''}
                    onChange={e => updateIssue(issue.id, { startDate: e.target.value || undefined })}
                    className="w-full px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    {t.dueDate}
                  </label>
                  <input
                    type="date"
                    value={issue.dueDate || ''}
                    onChange={e => updateIssue(issue.id, { dueDate: e.target.value || undefined })}
                    className="w-full px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono text-[11px]"
                  />
                </div>
              </div>

              {/* Epic & Team */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    {t.epic}
                  </label>
                  <select
                    value={issue.epicId || ''}
                    onChange={e => updateIssue(issue.id, { epicId: e.target.value || null })}
                    className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                  >
                    <option value="">{t.none}</option>
                    {epics
                      .filter(e => e.projectId === issue.projectId)
                      .map(e => (
                        <option key={e.id} value={e.id}>
                          {language === 'fa' ? e.nameFa : e.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    {t.team}
                  </label>
                    <input
                      type="text"
                      value={issue.team || ''}
                      onChange={e => updateIssue(issue.id, { team: e.target.value })}
                      placeholder="Core Platform"
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                    />
                  </div>
                </div>

                {/* WBS Code & Costs */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      WBS
                    </label>
                    <input
                      type="text"
                      value={issue.wbsCode || ''}
                      onChange={e => updateIssue(issue.id, { wbsCode: e.target.value || undefined })}
                      placeholder="1.1.2"
                      className="w-full px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      {language === 'fa' ? 'برآورد هزینه' : 'Est. Cost'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={issue.estimatedCost ?? ''}
                      onChange={e =>
                        updateIssue(issue.id, {
                          estimatedCost: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      className="w-full px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      {language === 'fa' ? 'هزینه واقعی' : 'Actual Cost'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={issue.actualCost ?? ''}
                      onChange={e =>
                        updateIssue(issue.id, {
                          actualCost: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      className="w-full px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono text-[11px]"
                    />
                  </div>
                </div>

                {/* Imported Custom Fields & External Source Link */}
                {issue.customFields && Object.keys(issue.customFields).length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {language === 'fa' ? 'فیلدهای سفارشی (Custom Fields)' : 'Custom Fields'}
                    </div>
                    <div className="grid grid-cols-1 gap-1">
                      {Object.entries(issue.customFields).map(([cfKey, cfVal]) => (
                        <div key={cfKey} className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-slate-50 dark:bg-slate-800/60">
                          <span className="text-slate-500 truncate">{cfKey}</span>
                          <span className="font-mono font-medium text-slate-800 dark:text-slate-200">{String(cfVal)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {issue.externalUrl && /^https?:/i.test(issue.externalUrl) && (
                  <div className="pt-1">
                    <a
                      href={issue.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>
                        {language === 'fa' ? 'مشاهده در سیستم مبدا' : 'Open in Source System'} ({issue.externalKey || issue.key})
                      </span>
                    </a>
                  </div>
                )}
                    </div>
                  )}
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
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${loggedPercent}%` }} />
                </div>
                <div className="flex justify-between text-[11px] font-mono text-slate-500">
                  <span>
                    {t.logged}:{' '}
                    <strong className="text-slate-700 dark:text-slate-300">
                      {formatMinutes(totalLoggedMinutes, language)}
                    </strong>
                  </span>
                  <span>
                    {t.remaining}:{' '}
                    <strong className="text-slate-700 dark:text-slate-300">
                      {formatMinutes(issue.remainingEstimateMinutes, language)}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Collapsible Development Panel (F31, F56) */}
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setDevPanelOpen(prev => !prev)}
                  className="w-full px-3 py-2 flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  <span className="flex items-center gap-1.5">
                    <Code2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{t.developmentPanel}</span>
                    <span className="font-mono text-[10px] text-slate-400">
                      ({(issue.devLinks || []).length})
                    </span>
                  </span>
                  {devPanelOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {devPanelOpen && (
                  <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-700 space-y-2 text-[11px]">
                    {(issue.devLinks || []).map(dl => (
                      <div key={dl.id} className="p-2 rounded bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          {dl.url && /^https?:\/\//.test(dl.url) ? (
                            <a
                              href={dl.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-blue-600 dark:text-blue-400 hover:underline truncate block"
                            >
                              {dl.title}
                            </a>
                          ) : (
                            <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">{dl.title}</div>
                          )}
                          <div className="font-mono text-[10px] text-slate-400">
                            {dl.type.toUpperCase()} · {dl.status} · {dl.repo}
                            {dl.environment ? ` · ${dl.environment}` : ''}
                            {dl.verified && (
                              <span
                                className="ms-1.5 text-emerald-600 font-bold"
                                title={language === 'fa' ? 'وضعیت توسط سرویس کنترل نسخه تأیید شده است' : 'State confirmed by the source control provider'}
                              >
                                ✓ {language === 'fa' ? 'تأییدشده' : 'verified'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          const repo = reposForProject(repositories, issue.projectId)[0];
                          if (!repo) {
                            showToast(
                              'error',
                              language === 'fa'
                                ? 'هیچ مخزنی متصل نیست. ابتدا از صفحه توسعه مخزن را متصل کنید.'
                                : 'No repository is connected for this space. Connect one on the Development page first.'
                            );
                            return;
                          }
                          const branch = `feature/${issue.key.toLowerCase()}-impl`;
                          addIssueDevLink(issue.id, {
                            type: 'branch',
                            title: branch,
                            status: 'open',
                            repo: repo.name,
                            url: buildDevLinkUrl(repo, 'branch', branch),
                          });
                        }}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                      >
                        + {language === 'fa' ? 'ایجاد Branch' : 'Create branch'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedIssueId(null);
                          setActiveView('development');
                        }}
                        className="text-slate-500 hover:text-blue-600 inline-flex items-center gap-1"
                      >
                        <span>{language === 'fa' ? 'صفحه توسعه' : 'Dev page'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Collapsible Automation – Rule executions Panel (F45) */}
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAutomationPanelOpen(prev => !prev)}
                  className="w-full px-3 py-2 flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  <span className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span>{t.automationExecutions}</span>
                    <span className="font-mono text-[10px] text-slate-400">
                      ({(issue.automationExecutions || []).length})
                    </span>
                  </span>
                  {automationPanelOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {automationPanelOpen && (
                  <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-700 space-y-1.5 text-[11px]">
                    {(issue.automationExecutions || []).length === 0 ? (
                      <div className="text-slate-400 italic py-1">
                        {language === 'fa' ? 'هنوز قانونی روی این تسک اجرا نشده است.' : 'No rule executions yet.'}
                      </div>
                    ) : (
                      (issue.automationExecutions || []).map(exec => (
                        <div key={exec.id} className="p-2 rounded bg-slate-50 dark:bg-slate-900/60 space-y-0.5">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{exec.ruleName}</div>
                          <div className="text-slate-500">{exec.message}</div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {new Date(exec.executedAt).toLocaleString()}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Dates */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-400 space-y-1 font-mono">
                <div>
                  {language === 'fa' ? 'ایجاد:' : 'Created:'} {formatLocalizedDateTime(issue.createdAt, language)}
                </div>
                <div>
                  {language === 'fa' ? 'به‌روزرسانی:' : 'Updated:'} {formatLocalizedDateTime(issue.updatedAt, language)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <LogWorkModal issueId={issue.id} isOpen={isLogWorkOpen} onClose={() => setIsLogWorkOpen(false)} />
    </>
  );
};
