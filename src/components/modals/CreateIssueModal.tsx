import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Flag,
  Layers,
  ChevronDown,
  Search,
  Tag,
  Calendar,
  Maximize2,
  Minimize2,
  User as UserIcon,
  Sparkles,
  Check,
  Gauge,
  IterationCw,
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { IssueType, Priority } from '../../types/jira';
import { IssueTypeIcon, PriorityIcon, UserAvatar } from '../common/JiraIcons';

type ChipPopover =
  | null
  | 'space'
  | 'type'
  | 'assignee'
  | 'labels'
  | 'priority'
  | 'dates'
  | 'parent'
  | 'sprint'
  | 'points';

export const CreateIssueModal: React.FC = () => {
  const {
    isCreateModalOpen,
    setIsCreateModalOpen,
    createModalDefaultSprintId,
    createModalDefaultType,
    createIssue,
    projects,
    recentProjectIds,
    currentProject,
    users,
    epics,
    sprints,
    t,
    language,
  } = useJira();

  const [targetProjectId, setTargetProjectId] = useState<string>(currentProject.id);
  const [issueType, setIssueType] = useState<IssueType>('story');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [assigneeId, setAssigneeId] = useState<string>('AUTOMATIC');
  const [epicId, setEpicId] = useState<string>('');
  const [sprintId, setSprintId] = useState<string>('');
  const [storyPoints, setStoryPoints] = useState<number>(3);
  const [labelsList, setLabelsList] = useState<string[]>([]);
  const [labelDraft, setLabelDraft] = useState('');
  const [component, setComponent] = useState<string>('Core Engine');
  const [startDate, setStartDate] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [flagged, setFlagged] = useState<boolean>(false);
  const [createAnother, setCreateAnother] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const [openPopover, setOpenPopover] = useState<ChipPopover>(null);
  const [spaceSearch, setSpaceSearch] = useState('');
  const [assigneeSearch, setAssigneeSearch] = useState('');

  const modalRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLInputElement>(null);

  const selectedProject = projects.find(p => p.id === targetProjectId) || currentProject;

  useEffect(() => {
    if (isCreateModalOpen) {
      setTargetProjectId(currentProject.id);
      setIssueType(createModalDefaultType || 'story');
      setEpicId('');
      setOpenPopover(null);
      setSpaceSearch('');
      setAssigneeSearch('');
      if (currentProject.features?.sprints === false) {
        setSprintId('');
      } else if (createModalDefaultSprintId !== undefined) {
        setSprintId(createModalDefaultSprintId || '');
      } else {
        const active = sprints.find(s => s.projectId === currentProject.id && s.status === 'active');
        setSprintId(active ? active.id : '');
      }
      setTimeout(() => summaryRef.current?.focus(), 40);
    }
  }, [
    isCreateModalOpen,
    createModalDefaultSprintId,
    createModalDefaultType,
    sprints,
    currentProject.id,
    currentProject.features?.sprints,
  ]);

  useEffect(() => {
    if (!isCreateModalOpen) return;
    if (selectedProject.features?.sprints === false) {
      setSprintId('');
    } else if (targetProjectId !== currentProject.id) {
      const active = sprints.find(s => s.projectId === targetProjectId && s.status === 'active');
      setSprintId(active ? active.id : '');
      setEpicId('');
    }
  }, [targetProjectId, selectedProject.features?.sprints, currentProject.id, isCreateModalOpen, sprints]);

  useEffect(() => {
    if (!openPopover) return;
    const handleClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setOpenPopover(null);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [openPopover]);

  if (!isCreateModalOpen) return null;

  const togglePopover = (p: ChipPopover) => {
    setOpenPopover(prev => (prev === p ? null : p));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) return;

    createIssue({
      projectId: selectedProject.id,
      type: issueType,
      summary: summary.trim(),
      description: description.trim(),
      priority,
      assigneeId: assigneeId || null,
      epicId: issueType === 'epic' ? null : epicId || null,
      sprintId: selectedProject.features?.sprints === false ? null : sprintId || null,
      storyPoints: Number(storyPoints) || 0,
      labels: labelsList,
      components: component.trim() ? [component.trim()] : [],
      startDate: startDate || undefined,
      dueDate: dueDate || undefined,
      flagged,
    });

    setSummary('');
    setDescription('');
    setStartDate('');
    setDueDate('');
    setFlagged(false);
    setLabelsList([]);
    setOpenPopover(null);
    if (!createAnother) {
      setIsCreateModalOpen(false);
    } else {
      setTimeout(() => summaryRef.current?.focus(), 40);
    }
  };

  const projectEpics = epics.filter(e => e.projectId === selectedProject.id);
  const projectSprints = sprints.filter(s => s.projectId === selectedProject.id && s.status !== 'completed');

  const workTypes: { id: IssueType; label: string }[] = [
    { id: 'epic', label: t.epicType },
    { id: 'story', label: t.storyType },
    { id: 'feature', label: t.featureType },
    { id: 'task', label: t.taskType },
    { id: 'bug', label: t.bugType },
  ];

  const priorities: { id: Priority; label: string }[] = [
    { id: 'highest', label: t.highest },
    { id: 'high', label: t.high },
    { id: 'medium', label: t.medium },
    { id: 'low', label: t.low },
    { id: 'lowest', label: t.lowest },
  ];

  const suggestedLabels = ['frontend', 'backend', 'api', 'security', 'ux', 'bugfix', 'performance'];

  const qSpace = spaceSearch.trim().toLowerCase();
  const filteredSpaces = projects.filter(
    p =>
      !qSpace ||
      p.key.toLowerCase().includes(qSpace) ||
      p.name.toLowerCase().includes(qSpace) ||
      p.nameFa.toLowerCase().includes(qSpace)
  );
  const recentSpacesList = recentProjectIds
    .map(id => filteredSpaces.find(p => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const selectedAssignee = users.find(u => u.id === assigneeId);
  const selectedEpic = projectEpics.find(e => e.id === epicId);
  const selectedSprint = projectSprints.find(s => s.id === sprintId);
  const currentTypeObj = workTypes.find(wt => wt.id === issueType) || workTypes[1];
  const currentPriorityObj = priorities.find(pr => pr.id === priority) || priorities[2];

  const filteredUsers = users.filter(u => {
    const q = assigneeSearch.trim().toLowerCase();
    return !q || u.name.toLowerCase().includes(q) || u.nameFa.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-start justify-center p-4 pt-12 sm:pt-16 overflow-y-auto">
      <div
        ref={modalRef}
        className={`bg-white dark:bg-[#22272B] border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-2xl w-full transition-all overflow-visible ${
          isExpanded ? 'max-w-3xl' : 'max-w-[600px]'
        }`}
      >
        <form onSubmit={handleSubmit}>
          {/* Top Compact Bar: [Space Picker] | [Work Type Picker] ....... [Expand] [Close] */}
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2 gap-2">
            <div className="flex items-center gap-1.5 relative">
              {/* Space Selector Chip */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => togglePopover('space')}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors border ${
                    openPopover === 'space'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                      : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded text-[9px] font-bold text-white flex items-center justify-center shrink-0 ${selectedProject.avatarColor}`}
                  >
                    {selectedProject.key.slice(0, 1)}
                  </span>
                  <span className="font-mono">{selectedProject.key}</span>
                  <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                </button>

                {openPopover === 'space' && (
                  <div className="absolute top-full mt-1.5 start-0 w-72 bg-white dark:bg-[#282E33] border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl z-40 overflow-hidden text-xs">
                    <div className="p-2 border-b border-slate-100 dark:border-slate-700/80">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={spaceSearch}
                          onChange={e => setSpaceSearch(e.target.value)}
                          placeholder={language === 'fa' ? 'جستجوی فضا...' : 'Search spaces'}
                          autoFocus
                          className="w-full ps-8 pe-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto py-1">
                      {recentSpacesList.length > 0 && (
                        <>
                          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {language === 'fa' ? 'فضاهای اخیر' : 'Recent Spaces'}
                          </div>
                          {recentSpacesList.map(p => (
                            <button
                              key={`rec-${p.id}`}
                              type="button"
                              onClick={() => {
                                setTargetProjectId(p.id);
                                setOpenPopover(null);
                              }}
                              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-start transition-colors ${
                                p.id === selectedProject.id
                                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`w-5 h-5 rounded ${p.avatarColor} text-white font-bold text-[9px] flex items-center justify-center shrink-0`}
                                >
                                  {p.key.slice(0, 2)}
                                </span>
                                <span className="truncate">
                                  {language === 'fa' ? p.nameFa : p.name} ({p.key})
                                </span>
                              </div>
                              {p.id === selectedProject.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                            </button>
                          ))}
                        </>
                      )}

                      <div className="px-3 py-1 mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {language === 'fa' ? 'همه فضاها' : 'All Spaces'}
                      </div>
                      {filteredSpaces.map(p => (
                        <button
                          key={`all-${p.id}`}
                          type="button"
                          onClick={() => {
                            setTargetProjectId(p.id);
                            setOpenPopover(null);
                          }}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-start transition-colors ${
                            p.id === selectedProject.id
                              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-5 h-5 rounded ${p.avatarColor} text-white font-bold text-[9px] flex items-center justify-center shrink-0`}
                            >
                              {p.key.slice(0, 2)}
                            </span>
                            <span className="truncate">
                              {language === 'fa' ? p.nameFa : p.name} ({p.key})
                            </span>
                          </div>
                          {p.id === selectedProject.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <span className="text-slate-300 dark:text-slate-600 select-none">|</span>

              {/* Work Type Picker Chip */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => togglePopover('type')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors border ${
                    openPopover === 'type'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100'
                  }`}
                >
                  <IssueTypeIcon type={issueType} className="w-4 h-4 shrink-0" />
                  <span>{currentTypeObj.label}</span>
                  <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                </button>

                {openPopover === 'type' && (
                  <div className="absolute top-full mt-1.5 start-0 w-48 bg-white dark:bg-[#282E33] border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl z-40 py-1 text-xs">
                    {workTypes.map(wt => (
                      <button
                        key={wt.id}
                        type="button"
                        onClick={() => {
                          setIssueType(wt.id);
                          setOpenPopover(null);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-start transition-colors ${
                          wt.id === issueType
                            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <IssueTypeIcon type={wt.id} className="w-4 h-4 shrink-0" />
                          <span>{wt.label}</span>
                        </div>
                        {wt.id === issueType && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsExpanded(prev => !prev)}
                title={isExpanded ? (language === 'fa' ? 'حالت فشرده' : 'Compact view') : (language === 'fa' ? 'بزرگ‌نمایی' : 'Expand dialog')}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Summary & Description Borderless Body */}
          <div className="px-5 pt-2 pb-3 space-y-2">
            <input
              ref={summaryRef}
              type="text"
              required
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder={language === 'fa' ? 'خلاصه کار (Summary)...' : 'Summary'}
              className="w-full text-lg font-bold bg-transparent border-0 px-0 py-1 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-0"
            />

            {issueType === 'epic' && (
              <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/80 text-purple-700 dark:text-purple-300 flex items-center gap-2 text-[11px]">
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {language === 'fa'
                    ? 'ایجاد اپیک جدید به‌صورت خودکار آن را در Plans، Timeline و بک‌لاگ این فضا ثبت می‌کند.'
                    : 'Creating an Epic registers it across Plans, Timeline, and the Backlog Epics panel.'}
                </span>
              </div>
            )}

            <textarea
              rows={isExpanded ? 6 : 3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={
                language === 'fa'
                  ? 'توضیحات، شرایط پذیرش (Acceptance Criteria) یا مراحل بازتولید را بنویسید...'
                  : 'Add a description...'
              }
              className="w-full text-xs leading-relaxed bg-transparent border-0 px-0 py-1 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-0 resize-none"
            />

            {isExpanded && (
              <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">{t.components}</label>
                  <input
                    type="text"
                    value={component}
                    onChange={e => setComponent(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <button
                    type="button"
                    onClick={() => setFlagged(prev => !prev)}
                    className={`px-3 py-1.5 rounded-md border text-xs font-medium flex items-center gap-1.5 ${
                      flagged
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>{t.flagged}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Metadata Chip Toolbar (matching Jira Cloud Inline Chips) */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2 text-xs">
              {/* Assignee Chip */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => togglePopover('assignee')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                    openPopover === 'assignee'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'border-slate-300 dark:border-slate-600/80 bg-slate-50 dark:bg-[#2C333A] hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {selectedAssignee ? (
                    <UserAvatar user={selectedAssignee} size="sm" />
                  ) : assigneeId === 'AUTOMATIC' ? (
                    <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span className="truncate max-w-[120px]">
                    {selectedAssignee
                      ? language === 'fa'
                        ? selectedAssignee.nameFa
                        : selectedAssignee.name
                      : assigneeId === 'AUTOMATIC'
                      ? language === 'fa'
                        ? 'خودکار'
                        : 'Automatic'
                      : language === 'fa'
                      ? 'بدون مسئول'
                      : 'Unassigned'}
                  </span>
                </button>

                {openPopover === 'assignee' && (
                  <div className="absolute bottom-full mb-1.5 start-0 w-64 bg-white dark:bg-[#282E33] border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl z-40 overflow-hidden text-xs">
                    <div className="p-2 border-b border-slate-100 dark:border-slate-700">
                      <input
                        type="text"
                        value={assigneeSearch}
                        onChange={e => setAssigneeSearch(e.target.value)}
                        placeholder={language === 'fa' ? 'جستجوی کاربر...' : 'Search assignee...'}
                        autoFocus
                        className="w-full px-2.5 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="max-h-56 overflow-y-auto py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setAssigneeId('AUTOMATIC');
                          setOpenPopover(null);
                        }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-start"
                      >
                        <span className="flex items-center gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                          <span>{language === 'fa' ? 'خودکار (مدیر فضا)' : 'Automatic (Space Lead)'}</span>
                        </span>
                        {assigneeId === 'AUTOMATIC' && <Check className="w-3.5 h-3.5 text-blue-500" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAssigneeId('');
                          setOpenPopover(null);
                        }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-start"
                      >
                        <span className="flex items-center gap-2">
                          <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                          <span>{language === 'fa' ? 'بدون مسئول' : 'Unassigned'}</span>
                        </span>
                        {assigneeId === '' && <Check className="w-3.5 h-3.5 text-blue-500" />}
                      </button>
                      <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
                      {filteredUsers.map(u => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setAssigneeId(u.id);
                            setOpenPopover(null);
                          }}
                          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-start"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <UserAvatar user={u} size="sm" />
                            <span className="truncate">{language === 'fa' ? u.nameFa : u.name}</span>
                          </span>
                          {assigneeId === u.id && <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Labels Chip */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => togglePopover('labels')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                    openPopover === 'labels' || labelsList.length > 0
                      ? 'border-blue-500/70 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'border-slate-300 dark:border-slate-600/80 bg-slate-50 dark:bg-[#2C333A] hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>
                    {labelsList.length > 0 ? `${t.labels} (${labelsList.length})` : t.labels}
                  </span>
                </button>

                {openPopover === 'labels' && (
                  <div className="absolute bottom-full mb-1.5 start-0 w-64 bg-white dark:bg-[#282E33] border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl z-40 p-3 space-y-2 text-xs">
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={labelDraft}
                        onChange={e => setLabelDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = labelDraft.trim();
                            if (val && !labelsList.includes(val)) {
                              setLabelsList(prev => [...prev, val]);
                            }
                            setLabelDraft('');
                          }
                        }}
                        placeholder={language === 'fa' ? 'افزودن برچسب + Enter' : 'Add label + Enter'}
                        autoFocus
                        className="flex-1 px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {Array.from(new Set([...suggestedLabels, ...labelsList])).map(lbl => {
                        const active = labelsList.includes(lbl);
                        return (
                          <button
                            key={lbl}
                            type="button"
                            onClick={() =>
                              setLabelsList(prev => (active ? prev.filter(x => x !== lbl) : [...prev, lbl]))
                            }
                            className={`px-2 py-0.5 rounded font-mono text-[11px] border ${
                              active
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {lbl}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Priority Chip */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => togglePopover('priority')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                    openPopover === 'priority'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'border-slate-300 dark:border-slate-600/80 bg-slate-50 dark:bg-[#2C333A] hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <PriorityIcon priority={priority} className="w-3.5 h-3.5" />
                  <span>{currentPriorityObj.label}</span>
                </button>

                {openPopover === 'priority' && (
                  <div className="absolute bottom-full mb-1.5 start-0 w-44 bg-white dark:bg-[#282E33] border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl z-40 py-1 text-xs">
                    {priorities.map(pr => (
                      <button
                        key={pr.id}
                        type="button"
                        onClick={() => {
                          setPriority(pr.id);
                          setOpenPopover(null);
                        }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-start"
                      >
                        <span className="flex items-center gap-2">
                          <PriorityIcon priority={pr.id} className="w-3.5 h-3.5" />
                          <span>{pr.label}</span>
                        </span>
                        {priority === pr.id && <Check className="w-3.5 h-3.5 text-blue-500" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Due date Chip */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => togglePopover('dates')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                    openPopover === 'dates' || dueDate
                      ? 'border-blue-500/70 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'border-slate-300 dark:border-slate-600/80 bg-slate-50 dark:bg-[#2C333A] hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="font-mono">{dueDate || t.dueDate}</span>
                </button>

                {openPopover === 'dates' && (
                  <div className="absolute bottom-full mb-1.5 start-0 w-60 bg-white dark:bg-[#282E33] border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl z-40 p-3 space-y-2.5 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-500 mb-1">{t.startDate}</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-500 mb-1">{t.dueDate}</label>
                      <input
                        type="date"
                        value={dueDate}
                        onChange={e => setDueDate(e.target.value)}
                        className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded font-mono"
                      />
                    </div>
                    <div className="flex justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setStartDate('');
                          setDueDate('');
                          setOpenPopover(null);
                        }}
                        className="text-slate-400 hover:text-rose-500"
                      >
                        {language === 'fa' ? 'پاک کردن' : 'Clear'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpenPopover(null)}
                        className="text-blue-600 font-semibold"
                      >
                        {t.save}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Parent Epic Chip (hidden when creating an Epic itself) */}
              {issueType !== 'epic' && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => togglePopover('parent')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                      openPopover === 'parent' || selectedEpic
                        ? 'border-purple-500/70 bg-purple-50/70 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300'
                        : 'border-slate-300 dark:border-slate-600/80 bg-slate-50 dark:bg-[#2C333A] hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 text-purple-500" />
                    <span className="truncate max-w-[130px]">
                      {selectedEpic
                        ? `${selectedEpic.key}`
                        : language === 'fa'
                        ? 'اپیک والد'
                        : 'Parent'}
                    </span>
                  </button>

                  {openPopover === 'parent' && (
                    <div className="absolute bottom-full mb-1.5 start-0 w-64 bg-white dark:bg-[#282E33] border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl z-40 py-1 max-h-56 overflow-y-auto text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setEpicId('');
                          setOpenPopover(null);
                        }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-start text-slate-500"
                      >
                        <span>{language === 'fa' ? 'بدون اپیک والد' : 'None (No Parent)'}</span>
                        {!epicId && <Check className="w-3.5 h-3.5 text-blue-500" />}
                      </button>
                      {projectEpics.map(ep => (
                        <button
                          key={ep.id}
                          type="button"
                          onClick={() => {
                            setEpicId(ep.id);
                            setOpenPopover(null);
                          }}
                          className="w-full flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-start"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-xs shrink-0"
                              style={{ backgroundColor: ep.color }}
                            />
                            <span className="font-mono text-[11px] text-slate-400 shrink-0">{ep.key}</span>
                            <span className="truncate">{language === 'fa' ? ep.nameFa : ep.name}</span>
                          </div>
                          {epicId === ep.id && <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Sprint Chip (when space has sprints enabled) */}
              {selectedProject.features?.sprints !== false && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => togglePopover('sprint')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                      openPopover === 'sprint' || selectedSprint
                        ? 'border-blue-500/70 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                        : 'border-slate-300 dark:border-slate-600/80 bg-slate-50 dark:bg-[#2C333A] hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <IterationCw className="w-3.5 h-3.5" />
                    <span className="truncate max-w-[110px]">
                      {selectedSprint ? selectedSprint.name : language === 'fa' ? 'بک‌لاگ' : 'Backlog'}
                    </span>
                  </button>

                  {openPopover === 'sprint' && (
                    <div className="absolute bottom-full mb-1.5 start-0 w-56 bg-white dark:bg-[#282E33] border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl z-40 py-1 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setSprintId('');
                          setOpenPopover(null);
                        }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-start"
                      >
                        <span>{language === 'fa' ? 'بک‌لاگ محصول' : 'Product Backlog'}</span>
                        {!sprintId && <Check className="w-3.5 h-3.5 text-blue-500" />}
                      </button>
                      {projectSprints.map(sp => (
                        <button
                          key={sp.id}
                          type="button"
                          onClick={() => {
                            setSprintId(sp.id);
                            setOpenPopover(null);
                          }}
                          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-start"
                        >
                          <span className="truncate">
                            {sp.name} {sp.status === 'active' ? '●' : ''}
                          </span>
                          {sprintId === sp.id && <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Story Points Chip */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => togglePopover('points')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border text-xs font-mono font-medium transition-colors ${
                    openPopover === 'points'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'border-slate-300 dark:border-slate-600/80 bg-slate-50 dark:bg-[#2C333A] hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <Gauge className="w-3.5 h-3.5" />
                  <span>{storyPoints} pts</span>
                </button>

                {openPopover === 'points' && (
                  <div className="absolute bottom-full mb-1.5 start-0 w-36 bg-white dark:bg-[#282E33] border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl z-40 py-1 text-xs">
                    {[0, 1, 2, 3, 5, 8, 13, 21].map(pt => (
                      <button
                        key={pt}
                        type="button"
                        onClick={() => {
                          setStoryPoints(pt);
                          setOpenPopover(null);
                        }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 font-mono"
                      >
                        <span>{pt} pts</span>
                        {storyPoints === pt && <Check className="w-3.5 h-3.5 text-blue-500" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer Bar: Create another checkbox + Cancel + Create */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-[#1D2125] rounded-b-xl text-xs">
            <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-300 font-medium select-none">
              <input
                type="checkbox"
                checked={createAnother}
                onChange={e => setCreateAnother(e.target.checked)}
                className="rounded border-slate-400 text-blue-600 focus:ring-blue-500"
              />
              <span>{language === 'fa' ? 'ایجاد مورد دیگر' : 'Create another'}</span>
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-3.5 py-1.5 font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded transition-colors"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={!summary.trim()}
                className="px-4 py-1.5 font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded shadow-xs transition-colors"
              >
                {language === 'fa' ? 'ایجاد' : 'Create'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
