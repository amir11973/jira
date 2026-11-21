import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  Download,
  ExternalLink,
  Bookmark,
  Trash2,
  AlertCircle,
  Flag,
  Star,
  ChevronDown,
  X,
  RotateCw,
  Copy,
  Check,
  SlidersHorizontal,
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { IssueTypeIcon, PriorityIcon, UserAvatar } from '../common/JiraIcons';
import { executeJqlQuery } from '../../utils/jqlEngine';
import { IssueType, Priority } from '../../types/jira';

type DefaultPresetId =
  | 'all'
  | 'my_open'
  | 'reported'
  | 'open'
  | 'done'
  | 'viewed_recent'
  | 'created_recent'
  | 'resolved_recent'
  | 'updated_recent';

type FacetPopover = null | 'space' | 'assignee' | 'type' | 'status' | 'more';

export const IssuesListView: React.FC = () => {
  const {
    projects,
    currentProject,
    issues,
    statuses,
    users,
    setSelectedIssueId,
    selectedIssueId,
    recentIssueIds,
    currentUser,
    savedFilters,
    saveFilter,
    deleteSavedFilter,
    pendingJqlQuery,
    setPendingJqlQuery,
    moveIssueStatus,
    currentWorkflow,
    showToast,
    t,
    language,
  } = useJira();

  const [jqlMode, setJqlMode] = useState(false);
  const [jqlDraft, setJqlDraft] = useState(
    `project = "${currentProject.key}" AND resolution = Unresolved ORDER BY priority DESC`
  );
  const [appliedJql, setAppliedJql] = useState(
    `project = "${currentProject.key}" AND resolution = Unresolved ORDER BY priority DESC`
  );
  const [activePreset, setActivePreset] = useState<DefaultPresetId>('open');
  const [isFilterStarred, setIsFilterStarred] = useState(false);
  const [isSaveFilterOpen, setIsSaveFilterOpen] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');

  // Faceted Basic Filters
  const [searchFilterText, setSearchFilterText] = useState<string>('');
  const [selectedSpaces, setSelectedSpaces] = useState<string[]>([currentProject.id]);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [assigneeOperator, setAssigneeOperator] = useState<'equals' | 'not_equals'>('equals');
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<IssueType[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<Priority[]>([]);
  const [resolutionFilter, setResolutionFilter] = useState<'all' | 'unresolved' | 'resolved'>('unresolved');
  const [flaggedOnly, setFlaggedOnly] = useState<boolean>(false);
  const [checkedIssueIds, setCheckedIssueIds] = useState<string[]>([]);

  const [openPopover, setOpenPopover] = useState<FacetPopover>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pendingJqlQuery) {
      setJqlMode(true);
      setJqlDraft(pendingJqlQuery);
      setAppliedJql(pendingJqlQuery);
      setPendingJqlQuery(null);
    }
  }, [pendingJqlQuery, setPendingJqlQuery]);

  useEffect(() => {
    if (!openPopover) return;
    const handleClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenPopover(null);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [openPopover]);

  const jqlResult = useMemo(() => {
    if (!jqlMode) return { issues: [], error: undefined };
    return executeJqlQuery(appliedJql, issues, projects, users, currentUser);
  }, [jqlMode, appliedJql, issues, projects, users, currentUser]);

  const toggleInArray = <T,>(arr: T[], val: T, setter: React.Dispatch<React.SetStateAction<T[]>>) => {
    setter(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };

  const applyPreset = (presetId: DefaultPresetId) => {
    setJqlMode(false);
    setActivePreset(presetId);
    if (presetId === 'open' || presetId === 'my_open') {
      setResolutionFilter('unresolved');
    } else if (presetId === 'done' || presetId === 'resolved_recent') {
      setResolutionFilter('resolved');
    } else {
      setResolutionFilter('all');
    }
  };

  const clearAllFilters = () => {
    setSearchFilterText('');
    setSelectedSpaces([]);
    setSelectedAssignees([]);
    setSelectedTypes([]);
    setSelectedStatuses([]);
    setSelectedPriorities([]);
    setResolutionFilter('all');
    setFlaggedOnly(false);
    setActivePreset('all');
    setOpenPopover(null);
  };

  const filteredIssues = useMemo(() => {
    if (jqlMode) {
      return jqlResult.issues;
    }

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    return issues.filter(issue => {
      if (issue.archived) return false;
      if (selectedSpaces.length > 0 && !selectedSpaces.includes(issue.projectId)) return false;

      if (activePreset === 'my_open' && (issue.assigneeId !== currentUser?.id || issue.status === 'done'))
        return false;
      if (activePreset === 'reported' && issue.reporterId !== currentUser?.id) return false;
      if (activePreset === 'open' && issue.status === 'done') return false;
      if (activePreset === 'done' && issue.status !== 'done') return false;
      if (activePreset === 'resolved_recent' && (issue.status !== 'done' || now - new Date(issue.updatedAt).getTime() > sevenDaysMs))
        return false;
      if (activePreset === 'created_recent' && now - new Date(issue.createdAt).getTime() > sevenDaysMs)
        return false;
      if (activePreset === 'updated_recent' && now - new Date(issue.updatedAt).getTime() > sevenDaysMs)
        return false;
      if (
        activePreset === 'viewed_recent' &&
        !recentIssueIds.includes(issue.id) &&
        issue.id !== selectedIssueId &&
        !issue.history?.length
      )
        return false;

      if (selectedTypes.length > 0 && !selectedTypes.includes(issue.type)) return false;
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(issue.status)) return false;
      if (selectedPriorities.length > 0 && !selectedPriorities.includes(issue.priority)) return false;
      if (flaggedOnly && !issue.flagged) return false;

      if (resolutionFilter === 'unresolved' && (issue.status === 'done' || Boolean(issue.resolution))) return false;
      if (resolutionFilter === 'resolved' && issue.status !== 'done' && !issue.resolution) return false;

      if (selectedAssignees.length > 0) {
        const mappedAssignees = selectedAssignees.map(a => (a === '__CURRENT_USER__' ? currentUser?.id || '' : a));
        const isUnassignedMatch = mappedAssignees.includes('__UNASSIGNED__') && !issue.assigneeId;
        const isUserMatch = Boolean(issue.assigneeId && mappedAssignees.includes(issue.assigneeId));
        const matched = isUnassignedMatch || isUserMatch;
        if (assigneeOperator === 'equals' && !matched) return false;
        if (assigneeOperator === 'not_equals' && matched) return false;
      }

      if (searchFilterText.trim()) {
        const q = searchFilterText.toLowerCase();
        const mKey = issue.key.toLowerCase().includes(q);
        const mSum = issue.summary.toLowerCase().includes(q);
        if (!mKey && !mSum) return false;
      }

      return true;
    });
  }, [
    jqlMode,
    jqlResult.issues,
    issues,
    selectedSpaces,
    activePreset,
    selectedTypes,
    selectedStatuses,
    selectedPriorities,
    selectedAssignees,
    assigneeOperator,
    resolutionFilter,
    flaggedOnly,
    searchFilterText,
    currentUser?.id,
    selectedIssueId,
    recentIssueIds,
  ]);

  const activeDetailIssue = issues.find(i => i.id === (selectedIssueId || filteredIssues[0]?.id));

  const buildJqlFromBasic = () => {
    const clauses: string[] = [];
    if (selectedSpaces.length > 0) {
      const keys = selectedSpaces
        .map(id => projects.find(p => p.id === id)?.key)
        .filter(Boolean);
      if (keys.length === 1) clauses.push(`project = "${keys[0]}"`);
      else if (keys.length > 1) clauses.push(`project IN (${keys.map(k => `"${k}"`).join(', ')})`);
    }
    if (selectedTypes.length > 0) clauses.push(`type IN (${selectedTypes.join(', ')})`);
    if (selectedStatuses.length > 0) clauses.push(`status IN (${selectedStatuses.join(', ')})`);
    if (resolutionFilter === 'unresolved') clauses.push('resolution = Unresolved');
    if (resolutionFilter === 'resolved') clauses.push('resolution != Unresolved');
    return (clauses.length ? clauses.join(' AND ') : 'ORDER BY updated DESC') + (clauses.length ? ' ORDER BY priority DESC' : '');
  };

  const handleRunJql = (e?: React.FormEvent) => {
    e?.preventDefault();
    setAppliedJql(jqlDraft);
  };

  const handleSaveFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFilterName.trim()) return;
    const jqlToSave = jqlMode ? jqlDraft : buildJqlFromBasic();
    saveFilter(newFilterName.trim(), jqlToSave);
    setNewFilterName('');
    setIsSaveFilterOpen(false);
    showToast('success', language === 'fa' ? 'فیلتر ذخیره شد.' : 'Filter saved.');
  };

  const handleCopyFilter = () => {
    const queryStr = jqlMode ? appliedJql : buildJqlFromBasic();
    navigator.clipboard?.writeText(queryStr).catch(() => {});
    showToast('info', language === 'fa' ? 'عبارت فیلتر کپی شد.' : `Copied filter: ${queryStr}`);
  };

  const exportAsJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredIssues, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    dlAnchorElem.setAttribute('download', `${currentProject.key}-work-items.json`);
    dlAnchorElem.click();
  };

  const exportAsCSV = () => {
    const headers = ['Key', 'Type', 'Summary', 'Status', 'Priority', 'Resolution', 'Assignee', 'StoryPoints', 'Created'];
    const rows = filteredIssues.map(i => [
      i.key,
      i.type,
      `"${i.summary.replace(/"/g, '""')}"`,
      i.status,
      i.priority,
      i.resolution || 'Unresolved',
      users.find(u => u.id === i.assigneeId)?.name || 'Unassigned',
      i.storyPoints || 0,
      i.createdAt,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', encodeURI(csvContent));
    dlAnchorElem.setAttribute('download', `${currentProject.key}-work-items.csv`);
    dlAnchorElem.click();
  };

  const defaultPresets: { id: DefaultPresetId; label: string }[] = [
    { id: 'open', label: language === 'fa' ? 'موارد کار باز' : 'Open work items' },
    { id: 'my_open', label: t.myOpenIssues },
    { id: 'reported', label: t.reportedByMe },
    { id: 'all', label: t.allIssues },
    { id: 'done', label: language === 'fa' ? 'تکمیل‌شده' : 'Done work items' },
    { id: 'viewed_recent', label: t.viewedRecently },
    { id: 'created_recent', label: t.createdRecently },
    { id: 'resolved_recent', label: t.doneThisWeek },
    { id: 'updated_recent', label: t.updatedRecently },
  ];

  const activePresetTitle = defaultPresets.find(p => p.id === activePreset)?.label || t.issuesAndFilters;
  const totalNonArchivedCount = issues.filter(i => !i.archived).length;
  const workTypeOptions: { id: IssueType; label: string }[] = [
    { id: 'epic', label: t.epicType },
    { id: 'bug', label: t.bugType },
    { id: 'feature', label: t.featureType },
    { id: 'story', label: t.storyType },
    { id: 'task', label: t.taskType },
  ];
  const standardTypes: IssueType[] = ['epic', 'story', 'feature', 'task', 'bug'];
  const allStandardSelected = standardTypes.every(st => selectedTypes.includes(st));

  const filteredAssigneeUsers = users.filter(u => {
    const q = assigneeSearch.trim().toLowerCase();
    return !q || u.name.toLowerCase().includes(q) || u.nameFa.toLowerCase().includes(q);
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/40 dark:bg-[#1D2125]">
      {/* Top Header + Faceted Filter Bar */}
      <div
        ref={barRef}
        className="px-5 pt-4 pb-3 bg-white dark:bg-[#1D2125] border-b border-slate-200 dark:border-slate-800 space-y-3 shrink-0"
      >
        {/* Title Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">
              {jqlMode ? (language === 'fa' ? 'جستجوی پیشرفته JQL' : 'Search work items') : activePresetTitle}
            </h1>
            <button
              type="button"
              onClick={() => setIsFilterStarred(prev => !prev)}
              title={language === 'fa' ? 'ستاره‌دار کردن فیلتر' : 'Star filter'}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-amber-500"
            >
              <Star className={`w-4 h-4 ${isFilterStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0 text-xs">
            <button
              type="button"
              onClick={() => setIsSaveFilterOpen(prev => !prev)}
              className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5"
            >
              <Bookmark className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>{t.saveFilter}</span>
            </button>

            <button
              type="button"
              onClick={exportAsJSON}
              title={t.exportJson}
              className="px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 font-mono"
            >
              <Download className="w-3.5 h-3.5" />
              <span>JSON</span>
            </button>

            <button
              type="button"
              onClick={exportAsCSV}
              title={t.exportCsv}
              className="px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 font-mono"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        {/* Save Filter Inline Form */}
        {isSaveFilterOpen && (
          <form
            onSubmit={handleSaveFilterSubmit}
            className="flex items-center gap-2 bg-blue-50/60 dark:bg-blue-950/30 p-2 rounded-lg border border-blue-200 dark:border-blue-800 text-xs"
          >
            <input
              type="text"
              required
              value={newFilterName}
              onChange={e => setNewFilterName(e.target.value)}
              placeholder={language === 'fa' ? 'نام فیلتر ذخیره‌شده...' : 'Filter name...'}
              className="flex-1 px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
            />
            <button type="submit" className="px-3 py-1 bg-blue-600 text-white font-semibold rounded">
              {t.save}
            </button>
            <button type="button" onClick={() => setIsSaveFilterOpen(false)} className="px-2 py-1 text-slate-500">
              {t.cancel}
            </button>
          </form>
        )}

        {/* Basic | JQL Segmented Toggle + Faceted Filter Popover Bar (matches Jira Cloud screenshots) */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* [Basic | JQL] Segmented Pill */}
            <div className="inline-flex rounded-md border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setJqlMode(false)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                  !jqlMode
                    ? 'bg-white dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 border border-blue-500/60 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t.basicMode}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!jqlMode) {
                    const generated = buildJqlFromBasic();
                    setJqlDraft(generated);
                    setAppliedJql(generated);
                  }
                  setJqlMode(true);
                }}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                  jqlMode
                    ? 'bg-white dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 border border-blue-500/60 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                JQL
              </button>
            </div>

            {jqlMode ? (
              <form onSubmit={handleRunJql} className="flex-1 flex gap-2 min-w-[260px]">
                <input
                  type="text"
                  dir="ltr"
                  value={jqlDraft}
                  onChange={e => setJqlDraft(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-slate-900 text-emerald-400 font-mono text-xs rounded border border-slate-700 focus:outline-none focus:border-blue-500"
                  placeholder='project = "ENG" AND status != done ORDER BY priority DESC'
                />
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold"
                >
                  {t.runJql}
                </button>
              </form>
            ) : (
              <>
                {/* Search work items input */}
                <div className="relative w-44 sm:w-52">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchFilterText}
                    onChange={e => setSearchFilterText(e.target.value)}
                    placeholder={language === 'fa' ? 'جستجوی موارد کار...' : 'Search work items'}
                    className="w-full ps-8 pe-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:border-blue-500 text-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* Space Facet Popover */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenPopover(prev => (prev === 'space' ? null : 'space'))}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border font-medium transition-colors ${
                      openPopover === 'space' || selectedSpaces.length > 0
                        ? 'border-blue-500/80 bg-blue-50/70 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>
                      {language === 'fa' ? 'فضا' : 'Space'}
                      {selectedSpaces.length > 0 ? `: ${selectedSpaces.length}` : ''}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 opacity-75" />
                  </button>

                  {openPopover === 'space' && (
                    <div className="absolute top-full mt-1.5 start-0 w-64 bg-white dark:bg-[#282E33] border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl z-40 py-1.5 max-h-64 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => setSelectedSpaces([])}
                        className="w-full px-3 py-1.5 text-start text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {language === 'fa' ? 'همه فضاها' : 'All Spaces'}
                      </button>
                      {projects.map(p => {
                        const checked = selectedSpaces.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => toggleInArray(selectedSpaces, p.id, setSelectedSpaces)}
                            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-start"
                          >
                            <span
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-400'
                              }`}
                            >
                              {checked && <Check className="w-3 h-3" />}
                            </span>
                            <span className={`w-4 h-4 rounded ${p.avatarColor} text-white font-bold text-[8px] flex items-center justify-center shrink-0`}>
                              {p.key.slice(0, 2)}
                            </span>
                            <span className="truncate text-slate-800 dark:text-slate-200">
                              {language === 'fa' ? p.nameFa : p.name} ({p.key})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Assignee Facet Popover (matches Screenshot 12) */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenPopover(prev => (prev === 'assignee' ? null : 'assignee'))}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border font-medium transition-colors ${
                      openPopover === 'assignee' || selectedAssignees.length > 0
                        ? 'border-blue-500/80 bg-blue-50/70 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>
                      {t.assignee}
                      {selectedAssignees.length > 0 ? `: ${selectedAssignees.length}` : ''}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 opacity-75" />
                  </button>

                  {openPopover === 'assignee' && (
                    <div className="absolute top-full mt-1.5 start-0 w-72 bg-white dark:bg-[#282E33] border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl z-40 overflow-hidden">
                      <div className="p-2.5 border-b border-slate-100 dark:border-slate-700 space-y-2">
                        <select
                          value={assigneeOperator}
                          onChange={e => setAssigneeOperator(e.target.value as 'equals' | 'not_equals')}
                          className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-xs font-medium"
                        >
                          <option value="equals">Assignee = (equals)</option>
                          <option value="not_equals">Assignee != (not equals)</option>
                        </select>
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={assigneeSearch}
                            onChange={e => setAssigneeSearch(e.target.value)}
                            placeholder={language === 'fa' ? 'جستجوی مسئول...' : 'Search Assignee'}
                            autoFocus
                            className="w-full ps-8 pe-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-xs focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>
                      <div className="max-h-60 overflow-y-auto py-1">
                        <button
                          type="button"
                          onClick={() => toggleInArray(selectedAssignees, '__CURRENT_USER__', setSelectedAssignees)}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-start"
                        >
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              selectedAssignees.includes('__CURRENT_USER__')
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'border-slate-400'
                            }`}
                          >
                            {selectedAssignees.includes('__CURRENT_USER__') && <Check className="w-3 h-3" />}
                          </span>
                          <UserAvatar user={currentUser} size="sm" />
                          <span className="font-medium text-slate-800 dark:text-slate-100">
                            {language === 'fa' ? 'کاربر فعلی (Current User)' : 'Current User'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleInArray(selectedAssignees, '__UNASSIGNED__', setSelectedAssignees)}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-start"
                        >
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              selectedAssignees.includes('__UNASSIGNED__')
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'border-slate-400'
                            }`}
                          >
                            {selectedAssignees.includes('__UNASSIGNED__') && <Check className="w-3 h-3" />}
                          </span>
                          <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 flex items-center justify-center text-[10px]">
                            —
                          </span>
                          <span className="text-slate-700 dark:text-slate-200">
                            {language === 'fa' ? 'بدون مسئول (Unassigned)' : 'Unassigned'}
                          </span>
                        </button>

                        <div className="px-3 py-1 mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {language === 'fa' ? 'اعضای تیم' : 'Users'}
                        </div>
                        {filteredAssigneeUsers.map(u => {
                          const checked = selectedAssignees.includes(u.id);
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => toggleInArray(selectedAssignees, u.id, setSelectedAssignees)}
                              className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-start"
                            >
                              <span
                                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                  checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-400'
                                }`}
                              >
                                {checked && <Check className="w-3 h-3" />}
                              </span>
                              <UserAvatar user={u} size="sm" />
                              <span className="truncate text-slate-800 dark:text-slate-200">
                                {language === 'fa' ? u.nameFa : u.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Type Facet Popover */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenPopover(prev => (prev === 'type' ? null : 'type'))}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border font-medium transition-colors ${
                      openPopover === 'type' || selectedTypes.length > 0
                        ? 'border-blue-500/80 bg-blue-50/70 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>
                      {language === 'fa' ? 'نوع' : 'Type'}
                      {selectedTypes.length > 0 ? `: ${selectedTypes.length}` : ''}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 opacity-75" />
                  </button>

                  {openPopover === 'type' && (
                    <div className="absolute top-full mt-1.5 start-0 w-60 bg-white dark:bg-[#282E33] border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl z-40 py-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedTypes(allStandardSelected ? [] : standardTypes)}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-start font-medium"
                      >
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            allStandardSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-400'
                          }`}
                        >
                          {allStandardSelected && <Check className="w-3 h-3" />}
                        </span>
                        <span>{language === 'fa' ? 'همه انواع استاندارد' : 'All standard work types'}</span>
                      </button>
                      <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
                      {workTypeOptions.map(wt => {
                        const checked = selectedTypes.includes(wt.id);
                        return (
                          <button
                            key={wt.id}
                            type="button"
                            onClick={() => toggleInArray(selectedTypes, wt.id, setSelectedTypes)}
                            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-start"
                          >
                            <span
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-400'
                              }`}
                            >
                              {checked && <Check className="w-3 h-3" />}
                            </span>
                            <IssueTypeIcon type={wt.id} className="w-4 h-4 shrink-0" />
                            <span className="text-slate-800 dark:text-slate-200">{wt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Status Facet Popover */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenPopover(prev => (prev === 'status' ? null : 'status'))}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border font-medium transition-colors ${
                      openPopover === 'status' || selectedStatuses.length > 0
                        ? 'border-blue-500/80 bg-blue-50/70 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>
                      {t.status}
                      {selectedStatuses.length > 0 ? `: ${selectedStatuses.length}` : ''}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 opacity-75" />
                  </button>

                  {openPopover === 'status' && (
                    <div className="absolute top-full mt-1.5 start-0 w-52 bg-white dark:bg-[#282E33] border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl z-40 py-1.5">
                      {statuses.map(st => {
                        const checked = selectedStatuses.includes(st.id);
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => toggleInArray(selectedStatuses, st.id, setSelectedStatuses)}
                            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-start"
                          >
                            <span
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-400'
                              }`}
                            >
                              {checked && <Check className="w-3 h-3" />}
                            </span>
                            <span className="text-slate-800 dark:text-slate-200">
                              {language === 'fa' ? st.nameFa : st.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* More Filters Popover */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenPopover(prev => (prev === 'more' ? null : 'more'))}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border font-medium transition-colors ${
                      openPopover === 'more' || selectedPriorities.length > 0 || flaggedOnly
                        ? 'border-blue-500/80 bg-blue-50/70 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>{language === 'fa' ? 'فیلترهای بیشتر' : 'More filters'}</span>
                    <ChevronDown className="w-3.5 h-3.5 opacity-75" />
                  </button>

                  {openPopover === 'more' && (
                    <div className="absolute top-full mt-1.5 start-0 w-64 bg-white dark:bg-[#282E33] border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl z-40 p-3 space-y-3 text-xs">
                      <div>
                        <div className="text-[11px] font-bold uppercase text-slate-400 mb-1">{t.resolution}</div>
                        <select
                          value={resolutionFilter}
                          onChange={e => setResolutionFilter(e.target.value as 'all' | 'unresolved' | 'resolved')}
                          className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded"
                        >
                          <option value="all">{language === 'fa' ? 'همه' : 'All'}</option>
                          <option value="unresolved">{t.unresolved}</option>
                          <option value="resolved">{language === 'fa' ? 'حل‌شده (Done)' : 'Resolved'}</option>
                        </select>
                      </div>

                      <div>
                        <div className="text-[11px] font-bold uppercase text-slate-400 mb-1">{t.priority}</div>
                        <div className="space-y-1">
                          {(['highest', 'high', 'medium', 'low', 'lowest'] as Priority[]).map(pr => {
                            const checked = selectedPriorities.includes(pr);
                            return (
                              <button
                                key={pr}
                                type="button"
                                onClick={() => toggleInArray(selectedPriorities, pr, setSelectedPriorities)}
                                className="w-full flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-start"
                              >
                                <span
                                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                    checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-400'
                                  }`}
                                >
                                  {checked && <Check className="w-2.5 h-2.5" />}
                                </span>
                                <PriorityIcon priority={pr} className="w-3.5 h-3.5" />
                                <span className="capitalize">{pr}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <label className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={flaggedOnly}
                          onChange={e => setFlaggedOnly(e.target.checked)}
                          className="rounded border-slate-400 text-amber-600"
                        />
                        <Flag className="w-3.5 h-3.5 text-amber-500" />
                        <span>{t.flagged} only</span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Active Resolution Chip (matches Screenshot 11 `Resolution = v Unresolved x`) */}
                {resolutionFilter !== 'all' && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-blue-500/80 bg-blue-50/70 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold">
                    <span>
                      Resolution = {resolutionFilter === 'unresolved' ? t.unresolved : 'Resolved'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setResolutionFilter('all')}
                      className="hover:text-blue-900 dark:hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="px-2 py-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white font-medium"
                >
                  {language === 'fa' ? 'پاک‌کردن فیلترها' : 'Clear filters'}
                </button>

                <button
                  type="button"
                  onClick={handleCopyFilter}
                  className="px-2 py-1.5 text-blue-600 dark:text-blue-400 hover:underline font-semibold inline-flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  <span>{language === 'fa' ? 'کپی فیلتر' : 'Copy filter'}</span>
                </button>
              </>
            )}
          </div>

          {jqlMode && jqlResult.error && (
            <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 font-mono">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{jqlResult.error}</span>
            </div>
          )}

          {/* 9 Default Presets + Saved Filters Strip */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] text-slate-400 font-semibold me-1">{t.presets}:</span>
            {defaultPresets.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${
                  !jqlMode && activePreset === p.id
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}

            {savedFilters.map(sf => (
              <div
                key={sf.id}
                className="inline-flex items-center gap-1 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded px-2 py-0.5 text-[11px]"
              >
                <button
                  type="button"
                  onClick={() => {
                    setJqlMode(true);
                    setJqlDraft(sf.jql);
                    setAppliedJql(sf.jql);
                  }}
                  className="font-semibold text-purple-700 dark:text-purple-300 hover:underline"
                >
                  {sf.name}
                </button>
                <button
                  type="button"
                  onClick={() => deleteSavedFilter(sf.id)}
                  className="text-purple-400 hover:text-rose-500"
                  title={t.delete}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Results Table + Optional Split Pane */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden border-e border-slate-200 dark:border-slate-800">
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead className="bg-slate-100/80 dark:bg-[#22272B] border-b border-slate-200 dark:border-slate-800 text-slate-500 sticky top-0 z-10 font-semibold">
                <tr>
                  <th className="p-2.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredIssues.length > 0 && checkedIssueIds.length === filteredIssues.length}
                      onChange={e =>
                        setCheckedIssueIds(e.target.checked ? filteredIssues.map(i => i.id) : [])
                      }
                      className="rounded border-slate-400"
                    />
                  </th>
                  <th className="p-2.5 text-start">{language === 'fa' ? 'کار (Work)' : 'Work'}</th>
                  <th className="p-2.5 text-start w-40">{t.assignee}</th>
                  <th className="p-2.5 text-start w-40">{t.reporter}</th>
                  <th className="p-2.5 text-start w-28">{t.priority}</th>
                  <th className="p-2.5 text-start w-32">{t.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {filteredIssues.map(issue => {
                  const isSelected = activeDetailIssue?.id === issue.id;
                  const assignee = users.find(u => u.id === issue.assigneeId);
                  const reporter = users.find(u => u.id === issue.reporterId);
                  const statusObj = currentWorkflow.statuses.find(s => s.id === issue.status);
                  const statusColor =
                    statusObj?.category === 'done' || issue.status === 'done'
                      ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                      : statusObj?.category === 'inprogress' || issue.status === 'inprogress' || issue.status === 'review'
                      ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700';

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
                      <td className="p-2.5 text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checkedIssueIds.includes(issue.id)}
                          onChange={() => toggleInArray(checkedIssueIds, issue.id, setCheckedIssueIds)}
                          className="rounded border-slate-400"
                        />
                      </td>
                      <td className="p-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <IssueTypeIcon type={issue.type} className="w-4 h-4 shrink-0" />
                          <span className="font-mono font-semibold text-blue-600 dark:text-blue-400 hover:underline shrink-0">
                            {issue.key}
                          </span>
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-md">
                            {issue.summary}
                          </span>
                          {issue.flagged && <Flag className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />}
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div className="flex items-center gap-2 truncate">
                          <UserAvatar user={assignee} size="sm" />
                          <span className="truncate text-slate-600 dark:text-slate-300">
                            {assignee
                              ? language === 'fa'
                                ? assignee.nameFa
                                : assignee.name
                              : language === 'fa'
                              ? 'بدون مسئول'
                              : 'Unassigned'}
                          </span>
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div className="flex items-center gap-2 truncate">
                          <UserAvatar user={reporter} size="sm" />
                          <span className="truncate text-slate-600 dark:text-slate-300">
                            {reporter ? (language === 'fa' ? reporter.nameFa : reporter.name) : '—'}
                          </span>
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div className="flex items-center gap-1.5 capitalize text-slate-700 dark:text-slate-300">
                          <PriorityIcon priority={issue.priority} className="w-3.5 h-3.5" />
                          <span>{issue.priority}</span>
                        </div>
                      </td>
                      <td className="p-2.5" onClick={e => e.stopPropagation()}>
                        <select
                          value={issue.status}
                          onChange={e => moveIssueStatus(issue.id, e.target.value)}
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

            {filteredIssues.length === 0 && (
              <div className="p-12 text-center text-slate-400 text-xs italic">{t.noMatchingIssues}</div>
            )}
          </div>

          {/* Bottom Table Counter Bar matching Screenshot 11 (`16 of 16 ↻`) */}
          <div className="px-4 py-2 bg-white dark:bg-[#1D2125] border-t border-slate-200 dark:border-slate-800 flex items-center justify-center gap-2 text-xs text-slate-500 font-mono tabular-nums shrink-0">
            <span>
              {filteredIssues.length} of {totalNonArchivedCount}
            </span>
            <button
              type="button"
              onClick={() => showToast('info', language === 'fa' ? 'لیست به‌روزرسانی شد.' : 'Work items refreshed')}
              title={language === 'fa' ? 'به‌روزرسانی' : 'Refresh'}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right Split Preview */}
        {activeDetailIssue && (
          <div className="w-80 lg:w-96 bg-white dark:bg-slate-900 p-5 overflow-y-auto hidden xl:block space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IssueTypeIcon type={activeDetailIssue.type} />
                <span className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400">
                  {activeDetailIssue.key}
                </span>
              </div>
              <button
                type="button"
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
                <span className="font-bold uppercase text-slate-800 dark:text-slate-200">
                  {activeDetailIssue.status}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-400">{t.resolution}:</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {activeDetailIssue.resolution || t.unresolved}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-400">{t.priority}:</span>
                <span className="font-semibold capitalize text-slate-800 dark:text-slate-200">
                  {activeDetailIssue.priority}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-400">{t.assignee}:</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {users.find(u => u.id === activeDetailIssue.assigneeId)?.name || 'Unassigned'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-400">{t.storyPoints}:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {activeDetailIssue.storyPoints ?? 0} pts
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
