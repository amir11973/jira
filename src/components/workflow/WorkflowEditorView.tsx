import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  GitBranch,
  Plus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Shield,
  CheckSquare,
  Zap,
  X,
  Search,
  ChevronDown,
  Edit2,
  Check,
  UserPlus,
  Copy,
  Lock,
  Webhook,
  Sliders,
  Info,
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { Status, StatusCategory, WorkflowRuleKind, WorkflowTransition } from '../../types/jira';
import { WORKFLOW_RULE_CATALOG, RuleCatalogItem, getTransitionFromIds } from '../../utils/workflowEngine';
import { initialStatuses } from '../../data/mockData';
import { IssueTypeIcon } from '../common/JiraIcons';
import { formatLocalizedNumber } from '../../utils/i18n';

type EditorPage = 'statuses' | 'transitions' | 'rules';

export const WorkflowEditorView: React.FC = () => {
  const {
    workflows,
    activeWorkflow,
    setEditingWorkflowId,
    projects,
    users,
    workflowReturnIssueId,
    setWorkflowReturnIssueId,
    setSelectedIssueId,
    setActiveView,
    setActiveAdminTab,
    addWorkflowStatus,
    removeWorkflowStatus,
    toggleStatusGlobalTransition,
    addWorkflowTransition,
    updateWorkflowTransition,
    addWorkflowRule,
    removeWorkflowRule,
    removeWorkflowTransition,
    showToast,
    language,
    t,
  } = useJira();

  const [activePage, setActivePage] = useState<EditorPage>('statuses');
  const [viewMode, setViewMode] = useState<'diagram' | 'text'>('diagram');
  const [showLabels, setShowLabels] = useState(true);

  const nonStartTransitions = useMemo(
    () => activeWorkflow.transitions.filter(tr => tr.fromStatusId !== 'start'),
    [activeWorkflow.transitions]
  );

  const [selectedTransitionId, setSelectedTransitionId] = useState<string>(
    nonStartTransitions[0]?.id || activeWorkflow.transitions[0]?.id || ''
  );

  useEffect(() => {
    if (!activeWorkflow.transitions.some(tr => tr.id === selectedTransitionId)) {
      setSelectedTransitionId(nonStartTransitions[0]?.id || activeWorkflow.transitions[0]?.id || '');
    }
  }, [activeWorkflow.id, activeWorkflow.transitions, nonStartTransitions, selectedTransitionId]);

  const selectedTransition: WorkflowTransition | undefined =
    activeWorkflow.transitions.find(tr => tr.id === selectedTransitionId) ||
    nonStartTransitions[0] ||
    activeWorkflow.transitions[0];

  // --- Page 1: Statuses State ---
  const [statusQuery, setStatusQuery] = useState('');
  const [statusNameFa, setStatusNameFa] = useState('');
  const [statusCategory, setStatusCategory] = useState<StatusCategory>('inprogress');
  const [allowFromAny, setAllowFromAny] = useState(true);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusComboRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusComboRef.current && !statusComboRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Pool of existing statuses across workflows + initialStatuses not yet in activeWorkflow
  const availableExistingStatuses = useMemo(() => {
    const seen = new Map<string, Status>();
    [...initialStatuses, ...workflows.flatMap(w => w.statuses)].forEach(st => {
      if (!seen.has(st.id)) seen.set(st.id, st);
    });
    const currentIds = new Set(activeWorkflow.statuses.map(s => s.id));
    const q = statusQuery.trim().toLowerCase();
    return Array.from(seen.values()).filter(
      st =>
        !currentIds.has(st.id) &&
        (!q || st.name.toLowerCase().includes(q) || st.nameFa.toLowerCase().includes(q))
    );
  }, [workflows, activeWorkflow.statuses, statusQuery]);

  const exactStatusExistsInWorkflow = useMemo(() => {
    const q = statusQuery.trim().toLowerCase();
    if (!q) return false;
    return activeWorkflow.statuses.some(
      s => s.name.toLowerCase() === q || s.nameFa.toLowerCase() === q
    );
  }, [activeWorkflow.statuses, statusQuery]);

  const handleAttachExistingStatus = (st: Status) => {
    addWorkflowStatus(
      {
        name: st.name,
        nameFa: st.nameFa,
        category: st.category,
        existingStatusId: st.id,
        allowFromAny,
      },
      activeWorkflow.id
    );
    setStatusQuery('');
    setStatusNameFa('');
    setStatusDropdownOpen(false);
    showToast(
      'success',
      language === 'fa'
        ? `وضعیت «${st.nameFa}» به گردش‌کار اضافه شد.`
        : `Status "${st.name}" added to workflow.`
    );
  };

  const handleCreateStatusSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = statusQuery.trim();
    if (!trimmed) return;
    const matchExisting = availableExistingStatuses.find(
      s => s.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (matchExisting) {
      handleAttachExistingStatus(matchExisting);
      return;
    }
    addWorkflowStatus(
      {
        name: trimmed,
        nameFa: statusNameFa.trim() || trimmed,
        category: statusCategory,
        allowFromAny,
      },
      activeWorkflow.id
    );
    setStatusQuery('');
    setStatusNameFa('');
    setStatusDropdownOpen(false);
    showToast(
      'success',
      language === 'fa' ? 'وضعیت جدید به گردش‌کار اضافه شد.' : 'Status added to workflow.'
    );
  };

  // --- Page 2: Transitions State ---
  const [editingTransitionId, setEditingTransitionId] = useState<string | null>(null);
  const [trFromIds, setTrFromIds] = useState<string[]>([]);
  const [trToId, setTrToId] = useState<string>('');
  const [trName, setTrName] = useState<string>('');
  const [fromMenuOpen, setFromMenuOpen] = useState(false);
  const fromMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fromMenuRef.current && !fromMenuRef.current.contains(e.target as Node)) {
        setFromMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleFromStatusOption = (statusId: string) => {
    if (statusId === 'any') {
      setTrFromIds(prev => (prev.includes('any') ? [] : ['any']));
      return;
    }
    setTrFromIds(prev => {
      const withoutAny = prev.filter(id => id !== 'any');
      return withoutAny.includes(statusId)
        ? withoutAny.filter(id => id !== statusId)
        : [...withoutAny, statusId];
    });
  };

  const startEditTransition = (tr: WorkflowTransition) => {
    setEditingTransitionId(tr.id);
    setTrFromIds(getTransitionFromIds(tr));
    setTrToId(tr.toStatusId);
    setTrName(tr.name);
    setSelectedTransitionId(tr.id);
    setActivePage('transitions');
  };

  const resetTransitionForm = () => {
    setEditingTransitionId(null);
    setTrFromIds([]);
    setTrToId('');
    setTrName('');
  };

  const handleSaveTransition = (e: React.FormEvent) => {
    e.preventDefault();
    if (trFromIds.length === 0 || !trToId || !trName.trim()) {
      showToast(
        'error',
        language === 'fa'
          ? 'لطفاً فیلدهای الزامی انتقال را تکمیل کنید.'
          : 'Please complete all required fields marked with *.'
      );
      return;
    }
    const primaryFrom = trFromIds.includes('any') ? 'any' : trFromIds[0];
    if (editingTransitionId) {
      updateWorkflowTransition(
        editingTransitionId,
        {
          name: trName.trim(),
          nameFa: trName.trim(),
          fromStatusId: primaryFrom,
          fromStatusIds: trFromIds,
          toStatusId: trToId,
        },
        activeWorkflow.id
      );
      setSelectedTransitionId(editingTransitionId);
      resetTransitionForm();
      showToast('success', language === 'fa' ? 'انتقال با موفقیت به‌روزرسانی شد.' : 'Transition updated.');
    } else {
      const created = addWorkflowTransition(
        {
          name: trName.trim(),
          nameFa: trName.trim(),
          fromStatusId: primaryFrom,
          fromStatusIds: trFromIds,
          toStatusId: trToId,
        },
        activeWorkflow.id
      );
      setSelectedTransitionId(created.id);
      resetTransitionForm();
      showToast('success', language === 'fa' ? 'انتقال جدید ایجاد شد.' : 'Transition created.');
    }
  };

  // --- Page 3: Rules State ---
  const [ruleKindFilter, setRuleKindFilter] = useState<WorkflowRuleKind | 'all'>('perform');
  const [configuringRuleItem, setConfiguringRuleItem] = useState<RuleCatalogItem | null>(null);
  const [ruleConfig, setRuleConfig] = useState<Record<string, string>>({});
  const [showRulesLearnMore, setShowRulesLearnMore] = useState(false);

  const openRuleConfigurator = (item: RuleCatalogItem) => {
    setConfiguringRuleItem(item);
    const defaults: Record<string, string> = {};
    item.configSchema.forEach(c => {
      defaults[c.key] = c.defaultValue;
    });
    setRuleConfig(defaults);
  };

  const handleConfirmRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransition || !configuringRuleItem) return;
    if (selectedTransition.fromStatusId === 'start') {
      showToast(
        'error',
        language === 'fa'
          ? 'یک انتقال غیراز Create انتخاب کنید.'
          : 'Select a transition other than Create to attach rules.'
      );
      return;
    }
    addWorkflowRule(
      selectedTransition.id,
      {
        kind: configuringRuleItem.kind,
        type: configuringRuleItem.type,
        label: configuringRuleItem.name,
        labelFa: configuringRuleItem.nameFa,
        config: ruleConfig,
      },
      activeWorkflow.id
    );
    setConfiguringRuleItem(null);
    showToast('success', language === 'fa' ? 'قانون به انتقال اضافه شد.' : 'Rule attached to transition.');
  };

  const filteredRuleCatalog = useMemo(
    () =>
      WORKFLOW_RULE_CATALOG.filter(
        r => ruleKindFilter === 'all' || r.kind === ruleKindFilter
      ),
    [ruleKindFilter]
  );

  const resolveStatusLabel = (statusId: string) => {
    if (statusId === 'any') return language === 'fa' ? 'همه وضعیت‌ها (Any)' : 'Any status';
    if (statusId === 'start') return 'START';
    const st = activeWorkflow.statuses.find(s => s.id === statusId);
    if (!st) return statusId;
    return language === 'fa' ? st.nameFa : st.name;
  };

  const formatTransitionFromLabel = (tr: WorkflowTransition) => {
    const ids = getTransitionFromIds(tr);
    return ids.map(resolveStatusLabel).join(', ');
  };

  const handleBackToItem = () => {
    const id = workflowReturnIssueId;
    setWorkflowReturnIssueId(null);
    setEditingWorkflowId(null);
    setActiveView('board');
    if (id) setSelectedIssueId(id);
  };

  const handleBackToWorkflows = () => {
    setEditingWorkflowId(null);
    setActiveAdminTab('workflows');
    setActiveView('jira_admin');
  };

  const boundProject = projects.find(p => p.id === activeWorkflow.projectId);

  const getRuleIcon = (item: RuleCatalogItem) => {
    if (item.type === 'perform_assign') return UserPlus;
    if (item.type === 'perform_copy_field') return Copy;
    if (item.type === 'perform_set_security_level') return Lock;
    if (item.type === 'perform_trigger_webhook') return Webhook;
    if (item.type === 'perform_update_field') return Sliders;
    if (item.kind === 'restrict') return Shield;
    if (item.kind === 'validate') return CheckSquare;
    return Zap;
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/50 dark:bg-[#161A1D]">
      {/* Top Toolbar */}
      <div className="px-6 py-4 bg-white dark:bg-[#1D2125] border-b border-slate-200 dark:border-slate-800 space-y-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {workflowReturnIssueId ? (
              <button
                onClick={handleBackToItem}
                className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t.backToItem}</span>
              </button>
            ) : (
              <button
                onClick={handleBackToWorkflows}
                className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{language === 'fa' ? 'بازگشت به گردش‌کارها' : 'Back to Workflows'}</span>
              </button>
            )}

            <div className="flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <select
                    value={activeWorkflow.id}
                    onChange={e => setEditingWorkflowId(e.target.value)}
                    aria-label="Select workflow"
                    className="text-sm sm:text-base font-bold text-slate-900 dark:text-white bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-700 rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {workflows.map(wf => (
                      <option key={wf.id} value={wf.id} className="dark:bg-slate-900">
                        {wf.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                    {boundProject ? boundProject.key : language === 'fa' ? 'آزاد' : 'Unassigned'} ·{' '}
                    {formatLocalizedNumber(activeWorkflow.statuses.length, language)}/
                    {formatLocalizedNumber(50, language)} {language === 'fa' ? 'وضعیت' : 'statuses'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right controls: Diagram/Text + Show transition labels */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer whitespace-nowrap shrink-0">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={e => setShowLabels(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-600 text-blue-600"
              />
              <span>{t.transitionLabels}</span>
            </label>

            <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-md border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setViewMode('diagram')}
                className={`px-2.5 py-1 rounded font-semibold whitespace-nowrap shrink-0 ${
                  viewMode === 'diagram'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {t.diagramView}
              </button>
              <button
                onClick={() => setViewMode('text')}
                className={`px-2.5 py-1 rounded font-semibold whitespace-nowrap shrink-0 ${
                  viewMode === 'text'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {t.textView}
              </button>
            </div>
          </div>
        </div>

        {/* 3-Page Sub-Navigation + Shared Work Types */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
          <nav className="flex items-center gap-1" aria-label="Workflow editor pages">
            {(
              [
                {
                  id: 'statuses' as const,
                  num: '1',
                  label: language === 'fa' ? 'وضعیت‌ها (Statuses)' : 'Statuses',
                  count: activeWorkflow.statuses.length,
                },
                {
                  id: 'transitions' as const,
                  num: '2',
                  label: language === 'fa' ? 'انتقال‌ها (Transitions)' : 'Transitions',
                  count: nonStartTransitions.length,
                },
                {
                  id: 'rules' as const,
                  num: '3',
                  label: language === 'fa' ? 'قوانین (Rules)' : 'Rules',
                  count: activeWorkflow.transitions.reduce((sum, tr) => sum + tr.rules.length, 0),
                },
              ] as const
            ).map(page => {
              const isActive = activePage === page.id;
              return (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => setActivePage(page.id)}
                  className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded text-[10px] font-mono font-bold inline-flex items-center justify-center ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {formatLocalizedNumber(page.num, language)}
                  </span>
                  <span>{page.label}</span>
                  <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                    ({formatLocalizedNumber(page.count, language)})
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="hidden md:flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium">
              {language === 'fa' ? 'انواع کار:' : 'Work types:'}
            </span>
            {(['story', 'task', 'bug', 'epic', 'subtask'] as const).map(wt => (
              <span key={wt} className="inline-flex items-center gap-1 capitalize text-slate-600 dark:text-slate-300">
                <IssueTypeIcon type={wt} className="w-3.5 h-3.5" />
                <span>{wt}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Grid: Left = Active Page (1/2/3), Right = Live Workflow Diagram/Text */}
      <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Column: Active Editor Page */}
        <div className="xl:col-span-6 space-y-5">
          {/* ================= PAGE 1: STATUSES ================= */}
          {activePage === 'statuses' && (
            <div className="space-y-5">
              <form
                onSubmit={handleCreateStatusSubmit}
                className="bg-white dark:bg-[#1D2125] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs"
              >
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {language === 'fa' ? 'افزودن وضعیت (Add a status)' : 'Add a status'}
                  </h2>
                  <p className="text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    {language === 'fa'
                      ? 'وضعیت، پیشرفت کار را نشان می‌دهد. یک وضعیت موجود را انتخاب کنید یا نام جدید بنویسید تا ایجاد شود.'
                      : 'A status shows the progression of work. Add an existing status or type to create a new one.'}
                  </p>
                </div>

                {/* Status name combobox ("Search or create") */}
                <div ref={statusComboRef} className="relative">
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                    {language === 'fa' ? 'نام وضعیت (Status name)' : 'Status name'}
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={statusQuery}
                      onFocus={() => setStatusDropdownOpen(true)}
                      onChange={e => {
                        setStatusQuery(e.target.value);
                        setStatusDropdownOpen(true);
                      }}
                      placeholder={language === 'fa' ? 'جستجو یا ایجاد وضعیت جدید' : 'Search or create'}
                      className="w-full ps-9 pe-8 py-2 bg-slate-50 dark:bg-[#22272B] border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                    />
                    {statusQuery && (
                      <button
                        type="button"
                        onClick={() => setStatusQuery('')}
                        className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {statusDropdownOpen && (
                    <div className="absolute z-30 mt-1 start-0 end-0 bg-white dark:bg-[#22272B] border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto py-1">
                      {availableExistingStatuses.length > 0 && (
                        <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {language === 'fa' ? 'وضعیت‌های موجود سامانه' : 'Existing statuses'}
                        </div>
                      )}
                      {availableExistingStatuses.map(st => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => handleAttachExistingStatus(st)}
                          className="w-full px-3 py-2 text-start hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-2"
                        >
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {language === 'fa' ? st.nameFa : st.name}
                          </span>
                          <span className="text-[10px] font-mono uppercase text-slate-400">
                            {st.category}
                          </span>
                        </button>
                      ))}

                      {statusQuery.trim() && !exactStatusExistsInWorkflow && (
                        <button
                          type="submit"
                          className="w-full px-3 py-2 text-start hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1.5 border-t border-slate-100 dark:border-slate-800 mt-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>
                            {language === 'fa'
                              ? `ایجاد وضعیت جدید «${statusQuery.trim()}»`
                              : `Create new status "${statusQuery.trim()}"`}
                          </span>
                        </button>
                      )}

                      {availableExistingStatuses.length === 0 && !statusQuery.trim() && (
                        <div className="px-3 py-2.5 text-slate-400">
                          {language === 'fa'
                            ? 'همه وضعیت‌های پیش‌فرض اضافه شده‌اند. برای ایجاد نام جدید تایپ کنید.'
                            : 'Type a name to create a new status.'}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* New Status Category & Optional Persian Label */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                      {language === 'fa' ? 'دسته‌بندی وضعیت' : 'Category'}
                    </label>
                    <select
                      value={statusCategory}
                      onChange={e => setStatusCategory(e.target.value as StatusCategory)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-[#22272B] border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                    >
                      <option value="todo">To Do</option>
                      <option value="inprogress">In Progress</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                      {language === 'fa' ? 'عنوان فارسی (اختیاری)' : 'Persian label (optional)'}
                    </label>
                    <input
                      type="text"
                      value={statusNameFa}
                      onChange={e => setStatusNameFa(e.target.value)}
                      placeholder={language === 'fa' ? 'مثلاً تایید امنیتی' : 'e.g. در انتظار تایید'}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-[#22272B] border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Allow transitions from any status */}
                <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#22272B] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowFromAny}
                    onChange={e => setAllowFromAny(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-blue-600"
                  />
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-100">
                      {language === 'fa'
                        ? 'اجازه انتقال از هر وضعیتی (Allow transitions from any status)'
                        : 'Allow transitions from any status'}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {language === 'fa'
                        ? 'به‌طور خودکار یک انتقال سراسری از تمام وضعیت‌ها به این وضعیت جدید ایجاد می‌شود.'
                        : 'Automatically creates a global transition allowing items in any status to move here.'}
                    </div>
                  </div>
                </label>

                <div className="flex justify-end gap-2">
                  <button
                    type="submit"
                    disabled={!statusQuery.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-md whitespace-nowrap shrink-0"
                  >
                    {language === 'fa' ? 'افزودن وضعیت' : 'Add status'}
                  </button>
                </div>
              </form>

              {/* Statuses List inside this workflow */}
              <div className="bg-white dark:bg-[#1D2125] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
                <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 dark:text-white">
                    {language === 'fa' ? 'وضعیت‌های فعلی این گردش‌کار' : 'Statuses in this workflow'}
                  </h3>
                  <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                    {formatLocalizedNumber(activeWorkflow.statuses.length, language)} / {formatLocalizedNumber(50, language)}
                  </span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activeWorkflow.statuses.map(st => {
                    const hasGlobal = activeWorkflow.transitions.some(
                      tr =>
                        tr.toStatusId === st.id &&
                        (tr.fromStatusId === 'any' || tr.fromStatusIds?.includes('any'))
                    );
                    const dotColor =
                      st.category === 'done'
                        ? 'bg-emerald-500'
                        : st.category === 'inprogress'
                        ? 'bg-blue-500'
                        : 'bg-slate-400';

                    return (
                      <div
                        key={st.id}
                        className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`} />
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {language === 'fa' ? st.nameFa : st.name}
                              {st.numericId && (
                                <span className="ms-1.5 font-mono text-[10px] text-slate-400 tabular-nums">
                                  #{st.numericId}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 uppercase font-mono">
                              {st.category} · id: {st.id}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={hasGlobal}
                              onChange={e =>
                                toggleStatusGlobalTransition(st.id, e.target.checked, activeWorkflow.id)
                              }
                              className="rounded border-slate-300 dark:border-slate-600 text-blue-600"
                            />
                            <span>
                              {language === 'fa' ? 'انتقال از همه وضعیت‌ها' : 'From any status'}
                            </span>
                          </label>

                          {activeWorkflow.statuses.length > 2 && (
                            <button
                              type="button"
                              onClick={() => {
                                removeWorkflowStatus(st.id, activeWorkflow.id);
                                showToast(
                                  'info',
                                  language === 'fa' ? 'وضعیت از گردش‌کار حذف شد.' : 'Status removed.'
                                );
                              }}
                              title={t.delete}
                              className="p-1 text-slate-400 hover:text-rose-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ================= PAGE 2: TRANSITIONS ================= */}
          {activePage === 'transitions' && (
            <div className="space-y-5">
              <form
                onSubmit={handleSaveTransition}
                className="bg-white dark:bg-[#1D2125] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      {editingTransitionId
                        ? language === 'fa'
                          ? 'ویرایش انتقال (Edit transition)'
                          : 'Edit transition'
                        : language === 'fa'
                        ? 'افزودن انتقال (Add transition)'
                        : 'Transitions'}
                    </h2>
                    {editingTransitionId && (
                      <button
                        type="button"
                        onClick={resetTransitionForm}
                        className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 font-semibold"
                      >
                        {t.cancel}
                      </button>
                    )}
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                    {language === 'fa'
                      ? 'انتقال‌ها وضعیت‌ها را به هم متصل می‌کنند و نمایانگر اقداماتی هستند که کاربران برای جابجایی تسک‌ها انجام می‌دهند. همچنین هنگام کشیدن کارت‌ها در تخته به صورت ناحیه رهاسازی ظاهر می‌شوند.'
                      : "Transitions connect statuses. They represent actions people take to move work items through your workflow. They also appear as drop zones when people move cards across your project's board."}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                    {language === 'fa'
                      ? 'برای استفاده مجدد از یک انتقال، آن را ویرایش کرده و وضعیت‌های مبدأ بیشتری انتخاب کنید.'
                      : 'To reuse a transition, edit the transition and select additional from statuses.'}
                  </p>
                  <p className="text-[11px] text-slate-400 pt-1">
                    {language === 'fa'
                      ? 'فیلدهای الزامی با ستاره * مشخص شده‌اند.'
                      : 'Required fields are marked with an asterisk*'}
                  </p>
                </div>

                {/* From statuses* multi-select */}
                <div ref={fromMenuRef} className="relative">
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                    From statuses<span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setFromMenuOpen(prev => !prev)}
                    className="w-full min-h-[38px] px-3 py-1.5 bg-slate-50 dark:bg-[#22272B] border border-slate-300 dark:border-slate-700 rounded-md flex items-center justify-between gap-2 text-start"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      {trFromIds.length === 0 ? (
                        <span className="text-slate-400">
                          {language === 'fa' ? 'انتخاب وضعیت مبدأ' : 'Select from status'}
                        </span>
                      ) : (
                        trFromIds.map(id => (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-semibold text-[11px]"
                          >
                            <span>{resolveStatusLabel(id)}</span>
                            <span
                              role="button"
                              onClick={e => {
                                e.stopPropagation();
                                toggleFromStatusOption(id);
                              }}
                              className="hover:text-rose-500 cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </span>
                          </span>
                        ))
                      )}
                    </div>
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>

                  {fromMenuOpen && (
                    <div className="absolute z-30 mt-1 start-0 end-0 bg-white dark:bg-[#22272B] border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl max-h-56 overflow-y-auto py-1">
                      <button
                        type="button"
                        onClick={() => toggleFromStatusOption('any')}
                        className="w-full px-3 py-2 text-start hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between"
                      >
                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                          {language === 'fa' ? 'هر وضعیتی (Any status)' : 'Any status'}
                        </span>
                        {trFromIds.includes('any') && <Check className="w-3.5 h-3.5 text-blue-600" />}
                      </button>
                      <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
                      {activeWorkflow.statuses.map(st => {
                        const checked = trFromIds.includes(st.id);
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => toggleFromStatusOption(st.id)}
                            className="w-full px-3 py-2 text-start hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between"
                          >
                            <span className="text-slate-800 dark:text-slate-200">
                              {language === 'fa' ? st.nameFa : st.name}
                            </span>
                            {checked && <Check className="w-3.5 h-3.5 text-blue-600" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* To status* */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                    To status<span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={trToId}
                    onChange={e => setTrToId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#22272B] border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                  >
                    <option value="">
                      {language === 'fa' ? 'انتخاب وضعیت مقصد' : 'Select to status'}
                    </option>
                    {activeWorkflow.statuses.map(st => (
                      <option key={st.id} value={st.id}>
                        {language === 'fa' ? st.nameFa : st.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Name* + Tip */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                    Name<span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={trName}
                    onChange={e => setTrName(e.target.value)}
                    placeholder={language === 'fa' ? 'نام انتقال را بنویسید' : 'Give your transition a name'}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#22272B] border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                    {language === 'fa'
                      ? 'نکته: نام انتقال را به عنوان اقدامی که افراد برای جابجایی تسک انجام می‌دهند انتخاب کنید، مانند «شروع کار» یا «ادغام».'
                      : 'Tip: Name your transition as an action people take to move an issue, like "start work" or "merge".'}
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  {editingTransitionId && (
                    <button
                      type="button"
                      onClick={resetTransitionForm}
                      className="px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md font-semibold"
                    >
                      {t.cancel}
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md whitespace-nowrap shrink-0"
                  >
                    {editingTransitionId
                      ? language === 'fa'
                        ? 'ذخیره تغییرات انتقال'
                        : 'Update transition'
                      : language === 'fa'
                      ? 'ایجاد انتقال'
                      : 'Create transition'}
                  </button>
                </div>
              </form>

              {/* Transitions List with Edit (reuse) & Delete */}
              <div className="bg-white dark:bg-[#1D2125] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
                <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-900 dark:text-white">
                  {language === 'fa' ? 'انتقال‌های تعریف‌شده در گردش‌کار' : 'Existing transitions'}
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activeWorkflow.transitions.map(tr => {
                    const isStart = tr.fromStatusId === 'start';
                    return (
                      <div
                        key={tr.id}
                        className={`px-5 py-3 flex flex-wrap items-center justify-between gap-3 ${
                          selectedTransition?.id === tr.id ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                        }`}
                      >
                        <div
                          onClick={() => setSelectedTransitionId(tr.id)}
                          className="cursor-pointer min-w-0"
                        >
                          <div className="font-bold text-slate-900 dark:text-white">
                            {language === 'fa' ? tr.nameFa : tr.name}
                            <span className="ms-1.5 font-mono text-[10px] text-slate-400 tabular-nums">
                              #{tr.numericId}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            {formatTransitionFromLabel(tr)} → {resolveStatusLabel(tr.toStatusId)}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTransitionId(tr.id);
                              setActivePage('rules');
                            }}
                            className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 tabular-nums"
                          >
                            {formatLocalizedNumber(tr.rules.length, language)}{' '}
                            {language === 'fa' ? 'قانون' : 'rules'}
                          </button>

                          {!isStart && (
                            <>
                              <button
                                type="button"
                                onClick={() => startEditTransition(tr)}
                                title={t.edit}
                                className="p-1.5 rounded text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  removeWorkflowTransition(tr.id, activeWorkflow.id);
                                  if (editingTransitionId === tr.id) resetTransitionForm();
                                }}
                                title={t.delete}
                                className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ================= PAGE 3: RULES ================= */}
          {activePage === 'rules' && (
            <div className="space-y-5">
              <div className="bg-white dark:bg-[#1D2125] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {language === 'fa' ? 'قوانین انتقال (Rules)' : 'Rules'}
                  </h2>
                  <p className="text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    {language === 'fa'
                      ? 'هنگام جابجایی تسک‌ها به صورت خودکار یک عملیات انجام دهید. از این قوانین برای صرفه‌جویی در زمان و خودکارسازی کارهای تکراری تیم استفاده کنید.'
                      : 'Automatically perform an action when moving work items. Use these rules to save time doing tasks your team would otherwise have to do manually.'}{' '}
                    <button
                      type="button"
                      onClick={() => setShowRulesLearnMore(prev => !prev)}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-medium inline-flex items-center gap-0.5"
                    >
                      <span>{language === 'fa' ? 'بیشتر بدانید' : 'Learn more'}</span>
                      <Info className="w-3 h-3" />
                    </button>
                    .
                  </p>
                  {showRulesLearnMore && (
                    <div className="mt-2.5 p-3 rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/30 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                      <div>
                        <strong>Perform actions (Post-functions):</strong> Run automatically after a work item successfully moves through the transition.
                      </div>
                      <div>
                        <strong>Restrict (Conditions):</strong> Hide or disable the transition unless the condition holds.
                      </div>
                      <div>
                        <strong>Validate (Validators):</strong> Check required fields or prior statuses before saving the status change.
                      </div>
                    </div>
                  )}
                </div>

                {/* Target Transition Selector */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                    {language === 'fa' ? 'انتقال هدف برای اعمال قانون' : 'Target transition'}
                  </label>
                  <select
                    value={selectedTransition?.id || ''}
                    onChange={e => {
                      setSelectedTransitionId(e.target.value);
                      setConfiguringRuleItem(null);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#22272B] border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                  >
                    {nonStartTransitions.map(tr => (
                      <option key={tr.id} value={tr.id}>
                        {language === 'fa' ? tr.nameFa : tr.name} ({formatTransitionFromLabel(tr)} →{' '}
                        {resolveStatusLabel(tr.toStatusId)}) — #{tr.numericId}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Rule Kind Tabs */}
                <div className="flex flex-wrap gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-3">
                  {(
                    [
                      { id: 'perform', label: language === 'fa' ? 'اجرای خودکار عملیات (۵)' : 'Perform actions (5)' },
                      { id: 'restrict', label: language === 'fa' ? 'محدودسازی (۵)' : 'Restrict (5)' },
                      { id: 'validate', label: language === 'fa' ? 'اعتبارسنجی (۴)' : 'Validate (4)' },
                      { id: 'all', label: language === 'fa' ? 'همه قوانین (۱۴)' : 'All rules (14)' },
                    ] as const
                  ).map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setRuleKindFilter(tab.id);
                        setConfiguringRuleItem(null);
                      }}
                      className={`px-3 py-1.5 rounded-md font-semibold whitespace-nowrap shrink-0 ${
                        ruleKindFilter === tab.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Rule Configurator OR Rule Catalog Cards */}
                {configuringRuleItem ? (
                  <form
                    onSubmit={handleConfirmRule}
                    className="p-4 rounded-lg border border-blue-300 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20 space-y-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-white">
                          {language === 'fa' ? configuringRuleItem.nameFa : configuringRuleItem.name}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {language === 'fa' ? configuringRuleItem.purposeFa : configuringRuleItem.purpose}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setConfiguringRuleItem(null)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {configuringRuleItem.configSchema.map(cfg => {
                      const extraUserOptions =
                        configuringRuleItem.type === 'perform_assign' && cfg.key === 'target'
                          ? users.map(u => ({
                              value: `user:${u.id}`,
                              label: language === 'fa' ? `کاربر: ${u.nameFa}` : `User: ${u.name}`,
                            }))
                          : [];
                      const allOptions = cfg.options ? [...cfg.options, ...extraUserOptions] : undefined;

                      return (
                        <div key={cfg.key}>
                          <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                            {language === 'fa' ? cfg.labelFa : cfg.label}
                          </label>
                          {allOptions ? (
                            <select
                              value={ruleConfig[cfg.key] ?? cfg.defaultValue}
                              onChange={e =>
                                setRuleConfig(prev => ({ ...prev, [cfg.key]: e.target.value }))
                              }
                              className="w-full px-3 py-2 bg-white dark:bg-[#22272B] border border-slate-300 dark:border-slate-700 rounded-md"
                            >
                              {allOptions.map(o => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={ruleConfig[cfg.key] ?? cfg.defaultValue}
                              onChange={e =>
                                setRuleConfig(prev => ({ ...prev, [cfg.key]: e.target.value }))
                              }
                              className="w-full px-3 py-2 bg-white dark:bg-[#22272B] border border-slate-300 dark:border-slate-700 rounded-md"
                            />
                          )}
                        </div>
                      );
                    })}

                    <div className="flex justify-between items-center pt-1">
                      <button
                        type="button"
                        onClick={() => setConfiguringRuleItem(null)}
                        className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 font-semibold"
                      >
                        ← {language === 'fa' ? 'بازگشت به لیست قوانین' : 'Back to rules'}
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md whitespace-nowrap shrink-0"
                      >
                        {language === 'fa' ? 'افزودن به انتقال' : 'Add rule to transition'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-2.5 max-h-[420px] overflow-y-auto pe-1">
                    {filteredRuleCatalog.map(item => {
                      const RuleIcon = getRuleIcon(item);
                      return (
                        <div
                          key={item.type}
                          className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 bg-slate-50/50 dark:bg-[#22272B]/60 flex items-start justify-between gap-3 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1D2125] flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400">
                              <RuleIcon className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 dark:text-white">
                                {language === 'fa' ? item.nameFa : item.name}
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                                {language === 'fa' ? item.purposeFa : item.purpose}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => openRuleConfigurator(item)}
                            className="px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 hover:bg-blue-600 hover:text-white hover:border-blue-600 font-semibold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
                          >
                            {language === 'fa' ? 'انتخاب' : 'Select'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Active rules attached to the selected transition */}
              {selectedTransition && (
                <div className="bg-white dark:bg-[#1D2125] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 dark:text-white">
                      {language === 'fa'
                        ? `قوانین فعال روی «${selectedTransition.nameFa}»`
                        : `Active rules on "${selectedTransition.name}"`}
                    </h3>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {formatLocalizedNumber(selectedTransition.rules.length, language)}
                    </span>
                  </div>

                  {selectedTransition.rules.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                      {language === 'fa'
                        ? 'هنوز هیچ قانونی برای این انتقال ثبت نشده است.'
                        : 'No rules configured on this transition yet.'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedTransition.rules.map(rule => (
                        <div
                          key={rule.id}
                          className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#22272B] flex items-start justify-between gap-2"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              {rule.kind === 'restrict' && <Shield className="w-3.5 h-3.5 text-amber-500" />}
                              {rule.kind === 'validate' && <CheckSquare className="w-3.5 h-3.5 text-rose-500" />}
                              {rule.kind === 'perform' && <Zap className="w-3.5 h-3.5 text-emerald-500" />}
                              <span className="font-bold text-slate-800 dark:text-slate-100">
                                {language === 'fa' ? rule.labelFa : rule.label}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              {Object.entries(rule.config)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(' · ')}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              removeWorkflowRule(selectedTransition.id, rule.id, activeWorkflow.id)
                            }
                            className="text-slate-400 hover:text-rose-500 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Live Diagram / Text Preview & Transition Inspector */}
        <div className="xl:col-span-6 space-y-4">
          {viewMode === 'diagram' ? (
            <div className="bg-white dark:bg-[#1D2125] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {language === 'fa' ? 'پیش‌نمایش زنده نمودار گردش‌کار' : 'Live Workflow Diagram'}
                </div>
                <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                  {formatLocalizedNumber(activeWorkflow.statuses.length, language)}{' '}
                  {language === 'fa' ? 'وضعیت' : 'statuses'} ·{' '}
                  {formatLocalizedNumber(nonStartTransitions.length, language)}{' '}
                  {language === 'fa' ? 'انتقال' : 'transitions'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 p-4 rounded-lg bg-slate-50/70 dark:bg-[#161A1D] border border-slate-200 dark:border-slate-800">
                <div className="w-9 h-9 rounded-full bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 flex items-center justify-center text-[9px] font-bold font-mono shrink-0">
                  START
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                {activeWorkflow.statuses.map(st => {
                  const incoming = activeWorkflow.transitions.filter(
                    tr => tr.toStatusId === st.id && tr.fromStatusId !== 'start'
                  );
                  const categoryAccent =
                    st.category === 'done'
                      ? 'border-emerald-500/40'
                      : st.category === 'inprogress'
                      ? 'border-blue-500/40'
                      : 'border-slate-300 dark:border-slate-700';

                  return (
                    <div
                      key={st.id}
                      className={`px-3.5 py-2.5 rounded-lg border ${categoryAccent} bg-white dark:bg-[#22272B] min-w-[125px]`}
                    >
                      <div className="text-[10px] font-mono text-slate-400 uppercase">{st.category}</div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                        {language === 'fa' ? st.nameFa : st.name}
                      </div>
                      {showLabels && (
                        <div className="text-[10px] font-mono text-slate-400 mt-1 tabular-nums">
                          {formatLocalizedNumber(incoming.length, language)}{' '}
                          {language === 'fa' ? 'ورودی' : 'in'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    {language === 'fa'
                      ? 'برای ویرایش یا تنظیم قوانین، روی یک انتقال کلیک کنید:'
                      : 'Click a transition to inspect, edit, or configure rules:'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activeWorkflow.transitions.map(tr => {
                    const isSelected = selectedTransition?.id === tr.id;
                    return (
                      <div
                        key={tr.id}
                        onClick={() => setSelectedTransitionId(tr.id)}
                        className={`p-3 rounded-lg border text-start text-xs cursor-pointer transition-colors flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/35'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 dark:text-white truncate">
                            {language === 'fa' ? tr.nameFa : tr.name}
                            {showLabels && (
                              <span className="ms-1.5 font-mono text-[10px] text-slate-400 tabular-nums">
                                #{tr.numericId}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            {formatTransitionFromLabel(tr)} → {resolveStatusLabel(tr.toStatusId)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="font-mono text-[11px] font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                            {formatLocalizedNumber(tr.rules.length, language)}{' '}
                            {language === 'fa' ? 'قانون' : 'rules'}
                          </span>
                          {tr.fromStatusId !== 'start' && (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                startEditTransition(tr);
                              }}
                              title={t.edit}
                              className="p-1 rounded text-slate-400 hover:text-blue-600"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#1D2125] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-start border-collapse">
                <thead className="bg-slate-100/80 dark:bg-[#22272B] border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                  <tr>
                    <th className="p-3 text-start">ID</th>
                    <th className="p-3 text-start">{language === 'fa' ? 'نام انتقال' : 'Transition'}</th>
                    <th className="p-3 text-start">{language === 'fa' ? 'مبدأ → مقصد' : 'From → To'}</th>
                    <th className="p-3 text-end">{language === 'fa' ? 'قوانین' : 'Rules'}</th>
                    <th className="p-3 text-end"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {activeWorkflow.transitions.map(tr => (
                    <tr
                      key={tr.id}
                      onClick={() => setSelectedTransitionId(tr.id)}
                      className={`cursor-pointer ${
                        selectedTransition?.id === tr.id
                          ? 'bg-blue-50/70 dark:bg-blue-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="p-3 font-mono text-slate-400 tabular-nums">#{tr.numericId}</td>
                      <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                        {language === 'fa' ? tr.nameFa : tr.name}
                      </td>
                      <td className="p-3 font-mono text-slate-500">
                        {formatTransitionFromLabel(tr)} → {resolveStatusLabel(tr.toStatusId)}
                      </td>
                      <td className="p-3 text-end font-mono tabular-nums">
                        {formatLocalizedNumber(tr.rules.length, language)}
                      </td>
                      <td className="p-3 text-end">
                        {tr.fromStatusId !== 'start' && (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                startEditTransition(tr);
                              }}
                              className="text-slate-400 hover:text-blue-600 p-1"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                removeWorkflowTransition(tr.id, activeWorkflow.id);
                              }}
                              className="text-slate-400 hover:text-rose-500 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
