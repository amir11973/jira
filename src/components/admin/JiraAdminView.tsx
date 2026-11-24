import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Search,
  AlertTriangle,
  ExternalLink,
  Plus,
  Edit2,
  Copy,
  Trash2,
  Power,
  GitBranch,
  Layers,
  Database,
  Sliders,
  Zap,
  UserCog,
  Megaphone,
  Lock,
  Plug,
  Monitor,
  CheckCircle2,
  X,
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { globalFieldCatalog, initialLegacyWorkflows } from '../../data/mockData';
import { IssueTypeIcon, PriorityIcon } from '../common/JiraIcons';
import { formatLocalizedDateTime, formatLocalizedNumber } from '../../utils/i18n';

type AdminSubSection =
  | 'work_type_hierarchy'
  | 'work_types'
  | 'work_type_schemes'
  | 'subtasks'
  | 'workflows'
  | 'workflow_schemes'
  | 'screens'
  | 'screen_schemes'
  | 'work_type_screen_schemes'
  | 'fields'
  | 'field_configurations'
  | 'system'
  | 'automation'
  | 'personal';

export const JiraAdminView: React.FC = () => {
  const {
    activeAdminTab,
    setActiveAdminTab,
    siteConfig,
    updateSiteConfig,
    projects,
    issues,
    workflows,
    createWorkflow,
    updateWorkflowMeta,
    cloneWorkflow,
    deleteWorkflow,
    setEditingWorkflowId,
    automationRules,
    toggleAutomationRule,
    setActiveView,
    currentUser,
    language,
    toggleLanguage,
    theme,
    toggleTheme,
    showToast,
    t,
  } = useJira();

  const [subSection, setSubSection] = useState<AdminSubSection>(() => {
    if (activeAdminTab === 'system') return 'system';
    if (activeAdminTab === 'automation') return 'automation';
    if (activeAdminTab === 'personal') return 'personal';
    if (activeAdminTab === 'fields') return 'fields';
    if (activeAdminTab === 'work_items') return 'work_type_hierarchy';
    return 'workflows';
  });

  useEffect(() => {
    if (activeAdminTab === 'system') setSubSection('system');
    else if (activeAdminTab === 'automation') setSubSection('automation');
    else if (activeAdminTab === 'personal') setSubSection('personal');
    else if (activeAdminTab === 'fields' && subSection !== 'field_configurations') {
      setSubSection('fields');
    } else if (
      activeAdminTab === 'workflows' &&
      subSection !== 'workflow_schemes'
    ) {
      setSubSection('workflows');
    } else if (
      activeAdminTab === 'work_items' &&
      !['work_type_hierarchy', 'work_types', 'work_type_schemes', 'subtasks', 'screens', 'screen_schemes', 'work_type_screen_schemes'].includes(subSection)
    ) {
      setSubSection('work_type_hierarchy');
    }
  }, [activeAdminTab]);

  // Switch Settings dropdown
  const [switchMenuOpen, setSwitchMenuOpen] = useState(false);
  const switchMenuRef = useRef<HTMLDivElement>(null);

  // Add workflow dropdown & Create modal
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [isCreateWfOpen, setIsCreateWfOpen] = useState(false);
  const [newWfName, setNewWfName] = useState('');
  const [newWfDesc, setNewWfDesc] = useState('');
  const [newWfProjectId, setNewWfProjectId] = useState('');
  const [newWfTemplate, setNewWfTemplate] = useState<'software' | 'kanban' | 'blank'>('software');

  // Info / Limits Modals
  const [isLimitsModalOpen, setIsLimitsModalOpen] = useState(false);
  const [isLearnMoreOpen, setIsLearnMoreOpen] = useState(false);

  // Workflows list controls
  const [wfSearch, setWfSearch] = useState('');
  const [wfStatusTab, setWfStatusTab] = useState<'active' | 'inactive'>('active');
  const [resultsPerPage, setResultsPerPage] = useState<number>(10);
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Fields search & Subtask setting
  const [fieldSearch, setFieldSearch] = useState('');
  const [subtasksEnabled, setSubtasksEnabled] = useState(true);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (switchMenuRef.current && !switchMenuRef.current.contains(e.target as Node)) {
        setSwitchMenuOpen(false);
      }
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const selectSidebarItem = (sec: AdminSubSection) => {
    setSubSection(sec);
    if (sec === 'workflows' || sec === 'workflow_schemes') setActiveAdminTab('workflows');
    else if (sec === 'fields' || sec === 'field_configurations') setActiveAdminTab('fields');
    else if (sec === 'system') setActiveAdminTab('system');
    else if (sec === 'automation') setActiveAdminTab('automation');
    else if (sec === 'personal') setActiveAdminTab('personal');
    else setActiveAdminTab('work_items');
  };

  const currentSwitchCategory =
    subSection === 'system'
      ? language === 'fa'
        ? 'سیستم و عمومی'
        : 'System'
      : subSection === 'automation'
      ? language === 'fa'
        ? 'اتوماسیون سراسری'
        : 'Automation'
      : subSection === 'personal'
      ? language === 'fa'
        ? 'تنظیمات شخصی'
        : 'Personal'
      : language === 'fa'
      ? 'آیتم‌های کاری (Work items)'
      : 'Work items';

  // Filter & Sort Workflows
  const activeCount = workflows.filter(w => w.isActive !== false).length;
  const inactiveCount =
    workflows.filter(w => w.isActive === false).length + initialLegacyWorkflows.length;

  const displayedWorkflows = useMemo(() => {
    const q = wfSearch.trim().toLowerCase();
    const list = workflows
      .filter(w => (wfStatusTab === 'active' ? w.isActive !== false : w.isActive === false))
      .filter(
        w =>
          !q ||
          w.name.toLowerCase().includes(q) ||
          (w.schemeName || '').toLowerCase().includes(q)
      )
      .sort((a, b) =>
        sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
      );
    return list.slice(0, resultsPerPage);
  }, [workflows, wfStatusTab, wfSearch, sortAsc, resultsPerPage]);

  const filteredLegacyWorkflows = useMemo(() => {
    if (wfStatusTab !== 'inactive') return [];
    const q = wfSearch.trim().toLowerCase();
    return initialLegacyWorkflows.filter(
      l =>
        !q ||
        l.name.toLowerCase().includes(q) ||
        l.schemeType.toLowerCase().includes(q)
    );
  }, [wfStatusTab, wfSearch]);

  const filteredFields = useMemo(
    () =>
      globalFieldCatalog.filter(
        f =>
          !fieldSearch.trim() ||
          f.name.toLowerCase().includes(fieldSearch.toLowerCase()) ||
          f.id.toLowerCase().includes(fieldSearch.toLowerCase()) ||
          f.type.toLowerCase().includes(fieldSearch.toLowerCase())
      ),
    [fieldSearch]
  );

  const handleOpenWorkflowEditor = (workflowId: string) => {
    setEditingWorkflowId(workflowId);
    setActiveView('workflow');
  };

  const handleCreateWorkflowSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWfName.trim()) return;
    const created = createWorkflow({
      name: newWfName.trim(),
      description: newWfDesc.trim(),
      projectId: newWfProjectId || undefined,
      template: newWfTemplate,
    });
    setNewWfName('');
    setNewWfDesc('');
    setNewWfProjectId('');
    setIsCreateWfOpen(false);
    showToast(
      'success',
      language === 'fa' ? 'گردش‌کار جدید ایجاد شد.' : `Workflow "${created.name}" created.`
    );
    handleOpenWorkflowEditor(created.id);
  };

  const sidebarGroups: {
    title: string;
    titleFa: string;
    items: { id: AdminSubSection; label: string; labelFa: string }[];
  }[] = [
    {
      title: 'Work types',
      titleFa: 'انواع کار (Work types)',
      items: [
        { id: 'work_type_hierarchy', label: 'Work type hierarchy', labelFa: 'سلسله‌مراتب انواع کار' },
        { id: 'work_types', label: 'Work types', labelFa: 'انواع کار' },
        { id: 'work_type_schemes', label: 'Work type schemes', labelFa: 'طرح‌های نوع کار' },
        { id: 'subtasks', label: 'Sub-tasks', labelFa: 'زیروظایف (Sub-tasks)' },
      ],
    },
    {
      title: 'Workflows',
      titleFa: 'گردش‌کارها (Workflows)',
      items: [
        { id: 'workflows', label: 'Workflows', labelFa: 'گردش‌کارها' },
        { id: 'workflow_schemes', label: 'Workflow schemes', labelFa: 'طرح‌های گردش‌کار' },
      ],
    },
    {
      title: 'Screens',
      titleFa: 'صفحه‌ها (Screens)',
      items: [
        { id: 'screens', label: 'Screens', labelFa: 'صفحه‌ها' },
        { id: 'screen_schemes', label: 'Screen schemes', labelFa: 'طرح‌های صفحه' },
        { id: 'work_type_screen_schemes', label: 'Work type screen schemes', labelFa: 'طرح صفحه نوع کار' },
      ],
    },
    {
      title: 'Fields',
      titleFa: 'فیلدها (Fields)',
      items: [
        { id: 'fields', label: 'Fields', labelFa: 'فیلدها' },
        { id: 'field_configurations', label: 'Field configurations', labelFa: 'پیکربندی فیلدها' },
      ],
    },
  ];

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-white dark:bg-[#1D2125] text-slate-900 dark:text-slate-100">
      {/* Left Admin Sidebar (Jira admin settings) */}
      <aside className="w-64 shrink-0 border-e border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#1D2125] flex flex-col h-full overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Top Back Link */}
          <button
            type="button"
            onClick={() => setActiveView('board')}
            className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>{language === 'fa' ? 'تنظیمات مدیریت جیرا' : 'Jira admin settings'}</span>
          </button>

          {/* Switch settings dropdown */}
          <div ref={switchMenuRef} className="relative space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {language === 'fa' ? 'تغییر بخش تنظیمات' : 'Switch settings'}
            </div>
            <button
              type="button"
              onClick={() => setSwitchMenuOpen(prev => !prev)}
              className="w-full px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#22272B] hover:border-slate-400 dark:hover:border-slate-600 text-xs font-medium text-slate-800 dark:text-slate-100 flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-2 truncate">
                <Layers className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="truncate">{currentSwitchCategory}</span>
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {switchMenuOpen && (
              <div className="absolute z-30 start-0 end-0 mt-1 bg-white dark:bg-[#22272B] border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1 text-xs">
                {[
                  {
                    id: 'workflows' as AdminSubSection,
                    label: language === 'fa' ? 'آیتم‌های کاری (Work items)' : 'Work items',
                    icon: Layers,
                  },
                  {
                    id: 'system' as AdminSubSection,
                    label: language === 'fa' ? 'سیستم و بنر اعلانات' : 'System',
                    icon: Sliders,
                  },
                  {
                    id: 'automation' as AdminSubSection,
                    label: language === 'fa' ? 'اتوماسیون سراسری' : 'Automation',
                    icon: Zap,
                  },
                  {
                    id: 'personal' as AdminSubSection,
                    label: language === 'fa' ? 'تنظیمات شخصی' : 'Personal Settings',
                    icon: UserCog,
                  },
                ].map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        selectSidebarItem(opt.id);
                        setSwitchMenuOpen(false);
                      }}
                      className="w-full px-3 py-2 text-start hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 text-slate-700 dark:text-slate-200"
                    >
                      <Icon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
                <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
                <button
                  type="button"
                  onClick={() => {
                    setSwitchMenuOpen(false);
                    setActiveView('integrations');
                  }}
                  className="w-full px-3 py-2 text-start hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 text-blue-600 dark:text-blue-400 font-semibold"
                >
                  <Plug className="w-3.5 h-3.5" />
                  <span>{t.integrationsView}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Grouped Navigation Items */}
        <nav className="px-2 pb-6 space-y-5 text-xs" aria-label="Jira admin navigation">
          {sidebarGroups.map(group => (
            <div key={group.title} className="space-y-1">
              <div className="px-3 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                {language === 'fa' ? group.titleFa : group.title}
              </div>
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const isActive = subSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectSidebarItem(item.id)}
                      className={`w-full text-start ps-6 pe-3 py-2 rounded-md transition-colors flex items-center justify-between whitespace-nowrap ${
                        isActive
                          ? 'bg-blue-50 dark:bg-[#1C2B41] text-blue-700 dark:text-blue-400 font-semibold border-s-2 border-blue-600 dark:border-blue-400'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="truncate">{language === 'fa' ? item.labelFa : item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-white dark:bg-[#1D2125] p-6 lg:p-8">
        {/* ================= WORKFLOWS PAGE (Exact Screenshot 300 Design) ================= */}
        {subSection === 'workflows' && (
          <div className="max-w-6xl space-y-5">
            {/* Title + Add workflow dropdown */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                {language === 'fa' ? 'گردش‌کارها (Workflows)' : 'Workflows'}
              </h1>

              <div ref={addMenuRef} className="relative">
                <div className="inline-flex rounded-md overflow-hidden shadow-xs">
                  <button
                    type="button"
                    onClick={() => setIsCreateWfOpen(true)}
                    className="px-3.5 py-2 bg-[#0C66E4] hover:bg-[#0055CC] text-white text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    {language === 'fa' ? 'افزودن گردش‌کار' : 'Add workflow'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddMenuOpen(prev => !prev)}
                    aria-label="Add workflow options"
                    className="px-2 py-2 bg-[#0C66E4] hover:bg-[#0055CC] border-s border-blue-500/50 text-white"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {addMenuOpen && (
                  <div className="absolute end-0 mt-1.5 w-56 bg-white dark:bg-[#22272B] border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1 z-30 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setAddMenuOpen(false);
                        setIsCreateWfOpen(true);
                      }}
                      className="w-full px-3.5 py-2 text-start hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 text-slate-800 dark:text-slate-100 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5 text-blue-500" />
                      <span>{language === 'fa' ? 'ایجاد گردش‌کار جدید' : 'Create new workflow'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddMenuOpen(false);
                        setActiveView('integrations');
                      }}
                      className="w-full px-3.5 py-2 text-start hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 text-slate-800 dark:text-slate-100 font-medium"
                    >
                      <Plug className="w-3.5 h-3.5 text-emerald-500" />
                      <span>{language === 'fa' ? 'درون‌ریزی از مرکز یکپارچه‌سازی' : 'Import from Integrations'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Subtitle */}
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-4xl">
              {language === 'fa'
                ? 'گردش‌کار جیرا مجموعه‌ای از وضعیت‌ها و انتقال‌هاست که یک تسک در طول چرخه حیات خود از آن عبور می‌کند و معمولاً نشان‌دهنده یک فرآیند در سازمان شماست.'
                : 'A Jira workflow is a set of statuses and transitions that a work item moves through during its lifecycle, and typically represents a process within your organization.'}{' '}
              <button
                type="button"
                onClick={() => setIsLearnMoreOpen(true)}
                className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 font-medium"
              >
                <span>{language === 'fa' ? 'اطلاعات بیشتر درباره گردش‌کارها' : 'Find out more about workflows'}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
              .
            </p>

            {/* Amber Notice Callout Banner (hairline border, no thick left stripe) */}
            <div className="rounded-lg border border-amber-500/35 bg-amber-50/80 dark:bg-[#2F261A] p-4 flex items-start gap-3 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <div className="font-bold text-slate-900 dark:text-white">
                  {language === 'fa'
                    ? 'محدودیت جدید برای تعداد وضعیت‌ها در هر گردش‌کار'
                    : 'New limits for statuses per workflow'}
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {language === 'fa'
                    ? 'محدودیتی برای تعداد وضعیت‌ها در هر گردش‌کار معرفی شده است. این محدودیت‌ها از سپتامبر ۲۰۲۶ اعمال خواهند شد. لطفاً وضعیت‌های بدون استفاده را از گردش‌کارهای خود حذف کنید.'
                    : "We've introduced a limit of statuses per workflow. These limits will be enforced starting in September 2026. Please remove any unused statuses from your workflows."}
                </p>
                <button
                  type="button"
                  onClick={() => setIsLimitsModalOpen(true)}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  {language === 'fa' ? 'مطالعه بیشتر و بررسی وضعیت‌ها' : 'Read more'}
                </button>
              </div>
            </div>

            {/* Search & Results per page */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="relative w-64 max-w-full">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={wfSearch}
                  onChange={e => setWfSearch(e.target.value)}
                  placeholder={language === 'fa' ? 'یافتن گردش‌کار' : 'Find workflow'}
                  className="w-full ps-9 pe-3 py-2 bg-white dark:bg-[#22272B] border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#22272B]">
                <span className="text-slate-500 dark:text-slate-400">
                  {language === 'fa' ? 'تعداد در صفحه:' : 'Results per page:'}
                </span>
                <select
                  value={resultsPerPage}
                  onChange={e => setResultsPerPage(Number(e.target.value))}
                  className="bg-transparent font-semibold text-slate-900 dark:text-white focus:outline-none tabular-nums cursor-pointer"
                >
                  <option value={10} className="dark:bg-slate-900">{formatLocalizedNumber(10, language)}</option>
                  <option value={25} className="dark:bg-slate-900">{formatLocalizedNumber(25, language)}</option>
                  <option value={50} className="dark:bg-slate-900">{formatLocalizedNumber(50, language)}</option>
                </select>
              </div>
            </div>

            {/* Active workflows / Inactive workflows Tabs */}
            <div className="border-b border-slate-200 dark:border-slate-800 flex items-center gap-6 text-xs">
              <button
                type="button"
                onClick={() => setWfStatusTab('active')}
                className={`pb-2.5 font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  wfStatusTab === 'active'
                    ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <span>{language === 'fa' ? 'گردش‌کارهای فعال' : 'Active workflows'}</span>
                <span className="font-mono text-[11px] opacity-75 tabular-nums">
                  ({formatLocalizedNumber(activeCount, language)})
                </span>
              </button>

              <button
                type="button"
                onClick={() => setWfStatusTab('inactive')}
                className={`pb-2.5 font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  wfStatusTab === 'inactive'
                    ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <span>{language === 'fa' ? 'گردش‌کارهای غیرفعال' : 'Inactive workflows'}</span>
                <span className="font-mono text-[11px] opacity-75 tabular-nums">
                  ({formatLocalizedNumber(inactiveCount, language)})
                </span>
              </button>
            </div>

            {/* Workflows Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                    <th className="py-2.5 px-3 text-start">
                      <button
                        type="button"
                        onClick={() => setSortAsc(prev => !prev)}
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                      >
                        <span>{language === 'fa' ? 'نام' : 'Name'}</span>
                        {sortAsc ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </th>
                    <th className="py-2.5 px-3 text-start">
                      {language === 'fa' ? 'فضاهای متصل' : 'Included in Space(s)'}
                    </th>
                    <th className="py-2.5 px-3 text-start">
                      {language === 'fa' ? 'طرح‌های گردش‌کار' : 'Included in Workflow Scheme(s)'}
                    </th>
                    <th className="py-2.5 px-3 text-start">
                      {language === 'fa' ? 'آخرین به‌روزرسانی' : 'Last Updated'}
                    </th>
                    <th className="py-2.5 px-3 text-end">
                      {language === 'fa' ? 'عملیات' : 'Actions'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {displayedWorkflows.map(wf => {
                    const proj = projects.find(p => p.id === wf.projectId);
                    return (
                      <tr
                        key={wf.id}
                        className="hover:bg-slate-50 dark:hover:bg-[#22272B]/70 transition-colors"
                      >
                        <td className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => handleOpenWorkflowEditor(wf.id)}
                            className="font-semibold text-blue-600 dark:text-blue-400 hover:underline text-start"
                          >
                            {wf.name}
                          </button>
                          <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                            {formatLocalizedNumber(wf.statuses.length, language)}{' '}
                            {language === 'fa' ? 'وضعیت' : 'statuses'} ·{' '}
                            {formatLocalizedNumber(
                              wf.transitions.filter(tr => tr.fromStatusId !== 'start').length,
                              language
                            )}{' '}
                            {language === 'fa' ? 'انتقال' : 'transitions'}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-700 dark:text-slate-300">
                          {proj ? (
                            <span className="font-medium">
                              {language === 'fa' ? proj.nameFa : proj.name}{' '}
                              <span className="font-mono text-[11px] text-slate-400">({proj.key})</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                          {wf.schemeName || (proj ? `${proj.key} Workflow Scheme` : 'Unassigned')}
                        </td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400 font-mono text-[11px] tabular-nums whitespace-nowrap">
                          {wf.updatedAt
                            ? formatLocalizedDateTime(wf.updatedAt, language)
                            : '—'}
                        </td>
                        <td className="py-3 px-3 text-end">
                          <div className="inline-flex items-center gap-1 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleOpenWorkflowEditor(wf.id)}
                              className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-blue-600 hover:text-white hover:border-blue-600 font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 transition-colors"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>{t.edit}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const c = cloneWorkflow(wf.id);
                                if (c) {
                                  showToast(
                                    'success',
                                    language === 'fa'
                                      ? `نسخه کپی «${c.name}» در گردش‌کارهای غیرفعال ایجاد شد.`
                                      : `Cloned to "${c.name}" (Inactive workflows).`
                                  );
                                }
                              }}
                              title={language === 'fa' ? 'کپی گردش‌کار' : 'Copy workflow'}
                              className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const nextActive = wf.isActive === false;
                                updateWorkflowMeta(wf.id, { isActive: nextActive });
                                showToast(
                                  'info',
                                  nextActive
                                    ? language === 'fa'
                                      ? 'گردش‌کار فعال شد.'
                                      : 'Workflow activated.'
                                    : language === 'fa'
                                    ? 'گردش‌کار غیرفعال شد.'
                                    : 'Workflow moved to inactive.'
                                );
                              }}
                              title={
                                wf.isActive === false
                                  ? language === 'fa'
                                    ? 'فعال‌سازی'
                                    : 'Activate'
                                  : language === 'fa'
                                  ? 'غیرفعال‌سازی'
                                  : 'Deactivate'
                              }
                              className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                            {wf.isActive === false && !wf.projectId && (
                              <button
                                type="button"
                                onClick={() => {
                                  deleteWorkflow(wf.id);
                                  showToast(
                                    'info',
                                    language === 'fa' ? 'گردش‌کار حذف شد.' : 'Workflow deleted.'
                                  );
                                }}
                                title={t.delete}
                                className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Legacy / Read-only System Workflows under Inactive tab */}
                  {filteredLegacyWorkflows.map(lwf => (
                    <tr key={lwf.id} className="hover:bg-slate-50 dark:hover:bg-[#22272B]/70">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {lwf.name}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{lwf.description}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-400">—</td>
                      <td className="py-3 px-3 text-slate-500">{lwf.schemeType}</td>
                      <td className="py-3 px-3 text-slate-400 font-mono text-[11px] tabular-nums">
                        {formatLocalizedNumber(lwf.statusesCount, language)} statuses ·{' '}
                        {formatLocalizedNumber(lwf.transitionsCount, language)} transitions
                      </td>
                      <td className="py-3 px-3 text-end text-slate-400 text-[11px] font-mono">
                        {language === 'fa' ? 'سیستمی (فقط‌خواندنی)' : 'System Read-Only'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {displayedWorkflows.length === 0 && filteredLegacyWorkflows.length === 0 && (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 border-b border-slate-200 dark:border-slate-800">
                  <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-[#22272B] border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                    <Zap className="w-7 h-7 text-amber-500" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-slate-900 dark:text-white">
                      {language === 'fa' ? 'گردش‌کاری یافت نشد' : 'No workflows match your filter'}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                      {language === 'fa'
                        ? 'عبارت جستجو را تغییر دهید یا یک گردش‌کار جدید ایجاد کنید.'
                        : 'Try clearing your search filter or create a new workflow for your spaces.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {wfSearch && (
                      <button
                        type="button"
                        onClick={() => setWfSearch('')}
                        className="px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {language === 'fa' ? 'پاک‌کردن فیلتر' : 'Clear filter'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsCreateWfOpen(true)}
                      className="px-3.5 py-1.5 rounded-md bg-[#0C66E4] hover:bg-[#0055CC] text-white text-xs font-semibold"
                    >
                      {language === 'fa' ? 'ایجاد گردش‌کار' : 'Add workflow'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= WORKFLOW SCHEMES ================= */}
        {subSection === 'workflow_schemes' && (
          <div className="max-w-5xl space-y-5 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  {language === 'fa' ? 'طرح‌های گردش‌کار (Workflow schemes)' : 'Workflow schemes'}
                </h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">
                  {language === 'fa'
                    ? 'طرح‌های گردش‌کار مشخص می‌کنند هر فضا و نوع کار از کدام گردش‌کار استفاده می‌کند.'
                    : 'Workflow schemes associate workflows with spaces and work item types.'}
                </p>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-start border-collapse">
                <thead className="bg-slate-50 dark:bg-[#22272B] border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="p-3 text-start">{language === 'fa' ? 'نام طرح' : 'Scheme Name'}</th>
                    <th className="p-3 text-start">{language === 'fa' ? 'فضای متصل' : 'Spaces'}</th>
                    <th className="p-3 text-start">{language === 'fa' ? 'گردش‌کار متصل' : 'Workflow'}</th>
                    <th className="p-3 text-end">{language === 'fa' ? 'عملیات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {workflows
                    .filter(w => w.isActive !== false)
                    .map(wf => {
                      const proj = projects.find(p => p.id === wf.projectId);
                      return (
                        <tr key={wf.id} className="hover:bg-slate-50 dark:hover:bg-[#22272B]/60">
                          <td className="p-3 font-semibold text-slate-900 dark:text-white">
                            {wf.schemeName || `${proj?.key || 'Default'} Workflow Scheme`}
                          </td>
                          <td className="p-3 text-slate-600 dark:text-slate-300">
                            {proj ? `${proj.name} (${proj.key})` : 'Unassigned'}
                          </td>
                          <td className="p-3 text-blue-600 dark:text-blue-400 font-medium">
                            {wf.name}
                          </td>
                          <td className="p-3 text-end">
                            <button
                              type="button"
                              onClick={() => handleOpenWorkflowEditor(wf.id)}
                              className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-blue-600 hover:text-white font-semibold"
                            >
                              {t.editWorkflow}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= WORK TYPE HIERARCHY & WORK TYPES ================= */}
        {(subSection === 'work_type_hierarchy' || subSection === 'work_types') && (
          <div className="max-w-5xl space-y-5 text-xs">
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                {subSection === 'work_type_hierarchy'
                  ? language === 'fa'
                    ? 'سلسله‌مراتب انواع کار'
                    : 'Work type hierarchy'
                  : language === 'fa'
                  ? 'انواع کار (Work types)'
                  : 'Work types'}
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                {language === 'fa'
                  ? 'ساختار سلسله‌مراتبی بین اپیک‌ها، استوری‌ها، تسک‌ها، باگ‌ها و زیروظایف.'
                  : 'Defines parent-child hierarchy relationships from Epics down to Sub-tasks.'}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {language === 'fa' ? 'سطوح سلسله‌مراتب' : 'Hierarchy Levels'}
                </h2>
                {[
                  { type: 'epic' as const, level: 'Level +1', label: 'Epic', desc: 'Portfolio & roadmap parent grouping.' },
                  { type: 'story' as const, level: 'Level 0', label: 'Story', desc: 'End-user requirement.' },
                  { type: 'feature' as const, level: 'Level 0', label: 'Feature', desc: 'Capability milestone.' },
                  { type: 'task' as const, level: 'Level 0', label: 'Task', desc: 'Engineering or ops task.' },
                  { type: 'bug' as const, level: 'Level 0', label: 'Bug', desc: 'Defect or incident.' },
                  { type: 'subtask' as const, level: 'Level -1', label: 'Sub-task', desc: 'Nested child deliverable.' },
                ].map(row => {
                  const count = issues.filter(i => i.type === row.type).length;
                  return (
                    <div
                      key={row.type}
                      className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800"
                    >
                      <div className="flex items-center gap-3">
                        <IssueTypeIcon type={row.type} className="w-4 h-4 shrink-0" />
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">{row.label}</div>
                          <div className="text-[11px] text-slate-400">{row.desc}</div>
                        </div>
                      </div>
                      <div className="text-end font-mono tabular-nums">
                        <div className="font-bold text-slate-600 dark:text-slate-300">{row.level}</div>
                        <div className="text-[10px] text-slate-400">
                          {formatLocalizedNumber(count, language)} {language === 'fa' ? 'مورد' : 'items'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-4">
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2.5">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t.priority}</h2>
                  {(['highest', 'high', 'medium', 'low', 'lowest'] as const).map(p => (
                    <div
                      key={p}
                      className="flex items-center justify-between p-2 rounded border border-slate-100 dark:border-slate-800"
                    >
                      <div className="flex items-center gap-2">
                        <PriorityIcon priority={p} className="w-4 h-4" />
                        <span className="font-semibold capitalize">{p}</span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                        {formatLocalizedNumber(issues.filter(i => i.priority === p).length, language)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    {language === 'fa' ? 'انواع نتیجه و ارتباط تسک‌ها' : 'Resolutions & Link Types'}
                  </h2>
                  <div className="text-slate-600 dark:text-slate-300 space-y-1.5">
                    <div>
                      <strong>Resolutions:</strong> Done, Won&apos;t Do, Duplicate, Cannot Reproduce
                    </div>
                    <div>
                      <strong>Link Types:</strong> Blocks / Is Blocked By · Cloners · Duplicates · Relates To
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= WORK TYPE SCHEMES ================= */}
        {subSection === 'work_type_schemes' && (
          <div className="max-w-5xl space-y-5 text-xs">
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                {language === 'fa' ? 'طرح‌های نوع کار (Work type schemes)' : 'Work type schemes'}
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                {language === 'fa'
                  ? 'مجموعه انواع کاری که برای هر فضای کاری فعال شده است.'
                  : 'Controls which work item types are available when creating items inside each space.'}
              </p>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-start border-collapse">
                <thead className="bg-slate-50 dark:bg-[#22272B] border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="p-3 text-start">{language === 'fa' ? 'طرح' : 'Scheme'}</th>
                    <th className="p-3 text-start">{language === 'fa' ? 'انواع کار شامل‌شده' : 'Work Types'}</th>
                    <th className="p-3 text-start">{language === 'fa' ? 'فضاها' : 'Spaces'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {projects.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-[#22272B]/60">
                      <td className="p-3 font-semibold text-slate-900 dark:text-white">
                        {p.key}: {p.template === 'scrum' ? 'Scrum' : 'Kanban'} Work Type Scheme
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">
                        Epic, Story, Feature, Task, Bug, Sub-task
                      </td>
                      <td className="p-3 font-mono text-slate-500">
                        {p.name} ({p.key})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= SUB-TASKS ================= */}
        {subSection === 'subtasks' && (
          <div className="max-w-3xl space-y-5 text-xs">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {language === 'fa' ? 'تنظیمات زیروظایف (Sub-tasks)' : 'Sub-tasks'}
            </h1>
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between gap-4">
              <div>
                <div className="font-bold text-sm text-slate-900 dark:text-white">
                  {language === 'fa' ? 'فعال‌سازی زیروظایف در فضاها' : 'Enable Sub-tasks across Jira spaces'}
                </div>
                <p className="text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                  {language === 'fa'
                    ? `تعداد کل زیروظایف ثبت‌شده: ${formatLocalizedNumber(
                        issues.reduce((sum, i) => sum + i.subtasks.length, 0),
                        language
                      )}`
                    : `Total nested sub-tasks tracked across work items: ${issues.reduce(
                        (sum, i) => sum + i.subtasks.length,
                        0
                      )}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSubtasksEnabled(prev => !prev);
                  showToast(
                    'info',
                    !subtasksEnabled
                      ? language === 'fa'
                        ? 'زیروظایف فعال شد.'
                        : 'Sub-tasks enabled.'
                      : language === 'fa'
                      ? 'زیروظایف غیرفعال شد.'
                      : 'Sub-tasks disabled.'
                  );
                }}
                className={`px-3.5 py-1.5 rounded-md font-semibold whitespace-nowrap ${
                  subtasksEnabled
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {subtasksEnabled
                  ? language === 'fa'
                    ? 'فعال (Enabled)'
                    : 'Enabled'
                  : language === 'fa'
                  ? 'غیرفعال (Disabled)'
                  : 'Disabled'}
              </button>
            </div>
          </div>
        )}

        {/* ================= SCREENS & SCREEN SCHEMES ================= */}
        {(subSection === 'screens' ||
          subSection === 'screen_schemes' ||
          subSection === 'work_type_screen_schemes') && (
          <div className="max-w-5xl space-y-5 text-xs">
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Monitor className="w-5 h-5 text-blue-600" />
                <span>
                  {subSection === 'screens'
                    ? language === 'fa'
                      ? 'صفحه‌های فرم و نمایش (Screens)'
                      : 'Screens'
                    : subSection === 'screen_schemes'
                    ? language === 'fa'
                      ? 'طرح‌های صفحه (Screen schemes)'
                      : 'Screen schemes'
                    : language === 'fa'
                    ? 'طرح‌های صفحه بر اساس نوع کار'
                    : 'Work type screen schemes'}
                </span>
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                {language === 'fa'
                  ? 'ترتیب فیلدهایی که هنگام ایجاد، ویرایش یا مشاهده تسک و اجرای انتقال گردش‌کار نمایش داده می‌شوند.'
                  : 'Configure which fields appear when creating, editing, viewing, or transitioning work items.'}
              </p>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-start border-collapse">
                <thead className="bg-slate-50 dark:bg-[#22272B] border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="p-3 text-start">{language === 'fa' ? 'نام صفحه' : 'Screen Name'}</th>
                    <th className="p-3 text-start">{language === 'fa' ? 'فیلدهای پیکربندی‌شده' : 'Configured Fields'}</th>
                    <th className="p-3 text-start">{language === 'fa' ? 'طرح متصل' : 'Screen Scheme'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[
                    {
                      name: 'Default Issue Screen',
                      fields: 'Summary, Work Type, Description, Priority, Assignee, Labels, Due Date, Security Level',
                      scheme: 'Default Screen Scheme (Create / Edit / View)',
                    },
                    {
                      name: 'Resolve Issue Transition Screen',
                      fields: 'Resolution, Fix Versions, Remaining Estimate, Comment',
                      scheme: 'Workflow Transition Screen Scheme',
                    },
                    {
                      name: 'Agile Planning & Estimation Screen',
                      fields: 'Story Point Estimate, Sprint, Parent Epic, Start Date, Team',
                      scheme: 'Scrum & Timeline Screen Scheme',
                    },
                  ].map(scr => (
                    <tr key={scr.name} className="hover:bg-slate-50 dark:hover:bg-[#22272B]/60">
                      <td className="p-3 font-bold text-slate-900 dark:text-white">{scr.name}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">{scr.fields}</td>
                      <td className="p-3 font-mono text-[11px] text-slate-500">{scr.scheme}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= FIELDS & FIELD CONFIGURATIONS ================= */}
        {(subSection === 'fields' || subSection === 'field_configurations') && (
          <div className="max-w-6xl space-y-5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Database className="w-5 h-5 text-blue-600" />
                  <span>
                    {subSection === 'fields'
                      ? language === 'fa'
                        ? 'کاتالوگ فیلدهای سیستم و سفارشی'
                        : 'Fields'
                      : language === 'fa'
                      ? 'پیکربندی فیلدها (Field configurations)'
                      : 'Field configurations'}
                  </span>
                </h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                  {formatLocalizedNumber(globalFieldCatalog.length, language)}{' '}
                  {language === 'fa' ? 'فیلد استاندارد جیرا' : 'system and custom fields'}
                </p>
              </div>
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={fieldSearch}
                  onChange={e => setFieldSearch(e.target.value)}
                  placeholder={language === 'fa' ? 'جستجوی فیلد...' : 'Search fields...'}
                  className="w-full ps-8 pe-3 py-1.5 bg-white dark:bg-[#22272B] border border-slate-300 dark:border-slate-700 rounded-md"
                />
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-start border-collapse">
                <thead className="bg-slate-50 dark:bg-[#22272B] border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="p-3 text-start">Field Name</th>
                    <th className="p-3 text-start">Field ID</th>
                    <th className="p-3 text-start">Type</th>
                    <th className="p-3 text-start">Scope</th>
                    <th className="p-3 text-start">
                      {subSection === 'field_configurations' ? 'Requirement' : 'Description'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {filteredFields.map(f => (
                    <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-[#22272B]/60">
                      <td className="p-3 font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>{f.name}</span>
                        {f.locked && (
                          <span title="System Locked Field" className="inline-flex">
                            <Lock className="w-3 h-3 text-amber-500" />
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-blue-600 dark:text-blue-400">
                        {f.id}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">{f.type}</td>
                      <td className="p-3 font-mono text-[11px] uppercase text-slate-500">{f.scope}</td>
                      <td className="p-3 text-slate-500">
                        {subSection === 'field_configurations'
                          ? f.id === 'summary' || f.id === 'issuetype'
                            ? 'Required'
                            : 'Optional'
                          : f.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= SYSTEM & BANNER ================= */}
        {subSection === 'system' && (
          <div className="max-w-5xl space-y-5 text-xs">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {language === 'fa' ? 'تنظیمات عمومی سامانه و بنر اعلانات' : 'System & Announcement Banner'}
            </h1>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {language === 'fa' ? 'پیکربندی عمومی سامانه' : 'General Configuration'}
                </h3>
                <div>
                  <label className="block font-semibold mb-1">
                    {language === 'fa' ? 'عنوان سامانه' : 'Site Title'}
                  </label>
                  <input
                    type="text"
                    value={siteConfig.siteTitle}
                    onChange={e => updateSiteConfig({ siteTitle: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#22272B] border border-slate-300 dark:border-slate-700 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">
                    {language === 'fa' ? 'منطقه زمانی پیش‌فرض' : 'Default Time Zone'}
                  </label>
                  <select
                    value={siteConfig.timezone}
                    onChange={e => updateSiteConfig({ timezone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#22272B] border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                  >
                    <option value="GMT+03:30 Tehran">GMT+03:30 Tehran</option>
                    <option value="UTC">UTC (Coordinated Universal Time)</option>
                    <option value="GMT+01:00 Berlin">GMT+01:00 Berlin</option>
                    <option value="GMT-08:00 Los Angeles">GMT-08:00 Los Angeles</option>
                  </select>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-amber-500" />
                    <span>
                      {language === 'fa' ? 'بنر اعلانات سراسری' : 'Announcement Banner'}
                    </span>
                  </h3>
                  <label className="flex items-center gap-2 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={siteConfig.announcementEnabled}
                      onChange={e => updateSiteConfig({ announcementEnabled: e.target.checked })}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>{language === 'fa' ? 'فعال' : 'Enabled'}</span>
                  </label>
                </div>
                <textarea
                  rows={3}
                  value={siteConfig.announcementBanner}
                  onChange={e => updateSiteConfig({ announcementBanner: e.target.value })}
                  placeholder={
                    language === 'fa'
                      ? 'مثلاً: نگهداری برنامه‌ریزی‌شده سرور دیتابیس پنج‌شنبه ساعت ۲۳:۰۰ انجام می‌شود.'
                      : 'e.g. Scheduled Cloud SQL maintenance window this Thursday 23:00 GMT+03:30.'
                  }
                  className="w-full p-3 bg-slate-50 dark:bg-[#22272B] border border-slate-300 dark:border-slate-700 rounded-md resize-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    updateSiteConfig({ announcementEnabled: true });
                    showToast(
                      'success',
                      language === 'fa' ? 'تنظیمات سیستم ذخیره شد.' : 'System configuration saved.'
                    );
                  }}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md"
                >
                  {t.save}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= GLOBAL AUTOMATION ================= */}
        {subSection === 'automation' && (
          <div className="max-w-5xl space-y-4 text-xs">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {language === 'fa'
                ? 'مدیریت قوانین اتوماسیون در کل فضاها'
                : 'Global Automation Rules Across Spaces'}
            </h1>
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
              {automationRules.map(rule => {
                const proj = projects.find(p => p.id === rule.projectId);
                return (
                  <div key={rule.id} className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">
                        <span className="font-mono text-blue-600 me-2">[{proj?.key || 'ALL'}]</span>
                        {language === 'fa' ? rule.nameFa : rule.name}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                        {language === 'fa' ? rule.descriptionFa : rule.description} ·{' '}
                        <span className="font-mono">
                          {formatLocalizedNumber(rule.executionsCount, language)} runs
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={() => toggleAutomationRule(rule.id)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= PERSONAL SETTINGS ================= */}
        {subSection === 'personal' && (
          <div className="max-w-xl space-y-4 text-xs">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {t.personalSettings}
            </h1>
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="space-y-1">
                <div className="text-slate-400">Account</div>
                <div className="font-bold text-slate-900 dark:text-white">
                  {language === 'fa' ? currentUser?.nameFa : currentUser?.name} ({currentUser?.email})
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">
                    {language === 'fa' ? 'زبان رابط کاربری' : 'Language'}
                  </label>
                  <button
                    type="button"
                    onClick={toggleLanguage}
                    className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#22272B] font-semibold text-start"
                  >
                    {language === 'fa'
                      ? 'فارسی (RTL) — تغییر به English'
                      : 'English (LTR) — Switch to فارسی'}
                  </button>
                </div>
                <div>
                  <label className="block font-semibold mb-1">
                    {language === 'fa' ? 'پوسته ظاهری' : 'Appearance'}
                  </label>
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#22272B] font-semibold text-start capitalize"
                  >
                    {theme} mode
                  </button>
                </div>
              </div>
              <div>
                <label className="block font-semibold mb-1">
                  {language === 'fa' ? 'منطقه زمانی شما' : 'Your Time Zone'}
                </label>
                <div className="px-3 py-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#22272B] font-mono">
                  {siteConfig.timezone}
                </div>
              </div>
              <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
                <span className="font-semibold">
                  {language === 'fa'
                    ? 'دریافت خلاصه ایمیل تغییرات'
                    : 'Receive email activity digest'}
                </span>
                <input
                  type="checkbox"
                  checked={siteConfig.emailDigestEnabled}
                  onChange={e => updateSiteConfig({ emailDigestEnabled: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600"
                />
              </label>
            </div>
          </div>
        )}
      </main>

      {/* ================= CREATE WORKFLOW MODAL ================= */}
      {isCreateWfOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateWorkflowSubmit}
            className="bg-white dark:bg-[#22272B] border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {language === 'fa' ? 'ایجاد گردش‌کار جدید' : 'Add workflow'}
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateWfOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block font-semibold mb-1">
                {language === 'fa' ? 'نام گردش‌کار' : 'Name'} *
              </label>
              <input
                type="text"
                required
                value={newWfName}
                onChange={e => setNewWfName(e.target.value)}
                placeholder="e.g. Security Review Workflow"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1D2125] border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">
                {language === 'fa' ? 'توضیحات' : 'Description'}
              </label>
              <textarea
                rows={2}
                value={newWfDesc}
                onChange={e => setNewWfDesc(e.target.value)}
                placeholder={
                  language === 'fa'
                    ? 'شرح کوتاه هدف و کاربرد این گردش‌کار...'
                    : 'Describe how work items move through this process...'
                }
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1D2125] border border-slate-300 dark:border-slate-700 rounded-md resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">
                  {language === 'fa' ? 'الگوی اولیه' : 'Template'}
                </label>
                <select
                  value={newWfTemplate}
                  onChange={e => setNewWfTemplate(e.target.value as 'software' | 'kanban' | 'blank')}
                  className="w-full px-2.5 py-2 bg-slate-50 dark:bg-[#1D2125] border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  <option value="software">Software (4 statuses)</option>
                  <option value="kanban">Kanban (4 statuses)</option>
                  <option value="blank">Minimal (To Do → Done)</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">
                  {language === 'fa' ? 'اتصال به فضا (اختیاری)' : 'Space (optional)'}
                </label>
                <select
                  value={newWfProjectId}
                  onChange={e => setNewWfProjectId(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-50 dark:bg-[#1D2125] border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  <option value="">{language === 'fa' ? 'بدون اتصال (غیرفعال)' : 'Unassigned (Inactive)'}</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.key})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreateWfOpen(false)}
                className="px-3 py-1.5 text-slate-500 hover:text-slate-700"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-[#0C66E4] hover:bg-[#0055CC] text-white font-semibold rounded-md"
              >
                {language === 'fa' ? 'ایجاد و ویرایش ۳ مرحله‌ای' : 'Create & Edit'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ================= STATUS LIMITS AUDIT MODAL ================= */}
      {isLimitsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#22272B] border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-lg p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>
                  {language === 'fa'
                    ? 'گزارش وضعیت‌ها نسبت به سقف مجاز (۵۰ وضعیت)'
                    : 'Workflow Status Limit Audit (50 max per workflow)'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setIsLimitsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
              {workflows.map(wf => (
                <div key={wf.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">{wf.name}</div>
                    <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                      {formatLocalizedNumber(wf.statuses.length, language)} / {formatLocalizedNumber(50, language)}{' '}
                      {language === 'fa' ? 'وضعیت' : 'statuses'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsLimitsModalOpen(false);
                      handleOpenWorkflowEditor(wf.id);
                    }}
                    className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-blue-600 hover:text-white font-semibold"
                  >
                    {t.edit}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= LEARN MORE ABOUT WORKFLOWS MODAL ================= */}
      {isLearnMoreOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#22272B] border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-lg p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-blue-500" />
                <span>{language === 'fa' ? 'راهنمای مدیریت گردش‌کارها' : 'About Jira Workflows'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsLearnMoreOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2.5 text-slate-600 dark:text-slate-300 leading-relaxed">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <strong>1. Statuses:</strong> Represent the states a work item goes through (To Do, In Progress, Done), with optional global transitions from any status.
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <strong>2. Transitions:</strong> Connect one or multiple From statuses to a To status, and appear as drop zones on boards.
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <strong>3. Rules:</strong> Restrict, validate, or perform automated actions (assign user, copy fields, set security level, trigger webhook, update field).
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
