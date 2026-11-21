import React, { useState } from 'react';
import {
  X,
  Upload,
  Check,
  Users,
  Lock,
  Globe,
  GanttChart,
  LayoutDashboard,
  FolderKanban,
  ArrowLeft,
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';

type TemplateCategory =
  | 'made_for_you'
  | 'software'
  | 'service'
  | 'work'
  | 'product'
  | 'marketing'
  | 'customer'
  | 'hr';

interface TemplateItem {
  id: 'scrum' | 'kanban' | 'work_requests' | 'it_service' | 'business' | 'personal';
  title: string;
  titleFa: string;
  product: string;
  category: TemplateCategory;
  badge?: string;
  desc: string;
  descFa: string;
  color: string;
}

const TEMPLATE_CATALOG: TemplateItem[] = [
  {
    id: 'scrum',
    title: 'Scrum',
    titleFa: 'اسکرام (Scrum)',
    product: 'Jira Software',
    category: 'software',
    badge: 'Last created',
    desc: 'Plan, track, and execute work using sprints and a backlog.',
    descFa: 'برنامه‌ریزی، پیگیری و تحویل کار با اسپرینت‌ها و بک‌لاگ.',
    color: 'bg-blue-600',
  },
  {
    id: 'it_service',
    title: 'Basic IT service management',
    titleFa: 'مدیریت سرویس IT (ITSM)',
    product: 'Jira Service Management',
    category: 'service',
    desc: 'Quickly respond to requests, resolve incidents, and deploy changes.',
    descFa: 'پاسخ‌گویی سریع به درخواست‌ها، رفع رخدادها و مدیریت تغییرات.',
    color: 'bg-amber-600',
  },
  {
    id: 'kanban',
    title: 'Kanban',
    titleFa: 'کانبان (Kanban)',
    product: 'Jira Software',
    category: 'software',
    desc: 'Visualize and advance your project forward using a continuous flow board.',
    descFa: 'مدیریت جریان پیوسته کارها با تخته کانبان و کنترل محدودیت WIP.',
    color: 'bg-emerald-600',
  },
  {
    id: 'work_requests',
    title: 'Work requests & forms',
    titleFa: 'درخواست‌های کار و فرم‌ها',
    product: 'Jira Work Management',
    category: 'work',
    desc: 'Create custom intake forms and track structured requests in one place.',
    descFa: 'ساخت فرم‌های پذیرش درخواست و پیگیری کارها به‌صورت یکپارچه.',
    color: 'bg-purple-600',
  },
  {
    id: 'business',
    title: 'Business project management',
    titleFa: 'مدیریت پروژه کسب‌وکار',
    product: 'Jira Work Management',
    category: 'marketing',
    desc: 'Coordinate campaigns, approvals, timelines, and cross-functional work.',
    descFa: 'هماهنگی کمپین‌ها، تاییدیه‌ها، زمان‌بندی و پروژه‌های بین‌تیمی.',
    color: 'bg-indigo-600',
  },
  {
    id: 'personal',
    title: 'Personal task list',
    titleFa: 'فهرست کارهای شخصی',
    product: 'Jira Personal',
    category: 'hr',
    desc: 'Lightweight private board and list for personal milestones and focus.',
    descFa: 'فضای سبک و شخصی برای پیگیری اهداف و وظایف روزانه.',
    color: 'bg-slate-600',
  },
];

const TemplateIllustration: React.FC<{ id: TemplateItem['id'] }> = ({ id }) => {
  if (id === 'scrum') {
    return (
      <svg viewBox="0 0 220 90" className="w-full h-24 rounded-md bg-slate-100 dark:bg-slate-800/80 p-2">
        <rect x="24" y="12" width="172" height="14" rx="3" className="fill-slate-300 dark:fill-slate-700" />
        <rect x="24" y="34" width="172" height="14" rx="3" className="fill-slate-300 dark:fill-slate-700" />
        <rect x="24" y="56" width="172" height="14" rx="3" className="fill-slate-300 dark:fill-slate-700" />
        <rect x="44" y="28" width="118" height="22" rx="4" className="fill-blue-500" />
        <circle cx="55" cy="39" r="3" className="fill-white" />
        <rect x="64" y="37" width="48" height="4" rx="2" className="fill-white/90" />
        <rect x="134" y="35" width="20" height="8" rx="4" className="fill-blue-900/60" />
      </svg>
    );
  }
  if (id === 'it_service') {
    return (
      <svg viewBox="0 0 220 90" className="w-full h-24 rounded-md bg-slate-100 dark:bg-slate-800/80 p-2">
        <rect x="24" y="10" width="52" height="70" rx="4" className="fill-slate-200 dark:fill-slate-700/70" />
        <rect x="84" y="10" width="52" height="70" rx="4" className="fill-slate-200 dark:fill-slate-700/70" />
        <rect x="144" y="10" width="52" height="70" rx="4" className="fill-slate-200 dark:fill-slate-700/70" />
        <rect x="30" y="34" width="110" height="22" rx="4" className="fill-amber-600" />
        <circle cx="42" cy="45" r="5" className="fill-white" />
        <rect x="52" y="42" width="44" height="6" rx="3" className="fill-white" />
        <circle cx="144" cy="36" r="10" className="fill-white dark:fill-slate-900 stroke-amber-500" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 220 90" className="w-full h-24 rounded-md bg-slate-100 dark:bg-slate-800/80 p-2">
      <rect x="22" y="12" width="54" height="66" rx="4" className="fill-slate-200 dark:fill-slate-700/70" />
      <rect x="83" y="12" width="54" height="66" rx="4" className="fill-slate-200 dark:fill-slate-700/70" />
      <rect x="144" y="12" width="54" height="66" rx="4" className="fill-slate-200 dark:fill-slate-700/70" />
      <rect x="28" y="36" width="48" height="22" rx="4" className="fill-purple-500" />
      <rect x="92" y="24" width="44" height="20" rx="3" className="fill-emerald-500/80" />
      <rect x="150" y="38" width="40" height="20" rx="3" className="fill-blue-500/80" />
    </svg>
  );
};

export const QuickCreateModals: React.FC = () => {
  const {
    activeQuickModal,
    setActiveQuickModal,
    projects,
    users,
    createProject,
    createPlan,
    createDashboard,
    createTeam,
    setActiveView,
    showToast,
    t,
    language,
  } = useJira();

  // Create Space State
  const [spaceCategory, setSpaceCategory] = useState<TemplateCategory>('made_for_you');
  const [pickedTemplate, setPickedTemplate] = useState<TemplateItem | null>(null);
  const [spaceName, setSpaceName] = useState('');
  const [spaceNameFa, setSpaceNameFa] = useState('');
  const [spaceKey, setSpaceKey] = useState('');

  // Create Plan State
  const [planName, setPlanName] = useState('');
  const [planDesc, setPlanDesc] = useState('');
  const [planSpaceIds, setPlanSpaceIds] = useState<string[]>(projects.map(p => p.id));

  // Create Dashboard State (Exact match to Screenshot 10)
  const [dashName, setDashName] = useState('');
  const [dashDesc, setDashDesc] = useState('');
  const [dashViewers, setDashViewers] = useState('Private');
  const [dashEditors, setDashEditors] = useState('Private');
  const [viewerScopeAdded, setViewerScopeAdded] = useState<string[]>(['Private']);
  const [editorScopeAdded, setEditorScopeAdded] = useState<string[]>(['Private']);

  // Create Team State
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [teamLeadId, setTeamLeadId] = useState(users[0]?.id || 'user-1');

  if (activeQuickModal === 'none') return null;

  const closeModal = () => {
    setActiveQuickModal('none');
    setPickedTemplate(null);
  };

  // 1. Full-Screen Space Templates Modal (Exact match to Screenshot 13)
  if (activeQuickModal === 'create_space') {
    const visibleTemplates =
      spaceCategory === 'made_for_you'
        ? TEMPLATE_CATALOG
        : TEMPLATE_CATALOG.filter(tItem => tItem.category === spaceCategory || spaceCategory === 'product');

    const handleSpaceSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!spaceName.trim() || !spaceKey.trim() || !pickedTemplate) return;
      createProject({
        key: spaceKey.trim(),
        name: spaceName.trim(),
        nameFa: spaceNameFa.trim() || spaceName.trim(),
        description: pickedTemplate.desc,
        category: pickedTemplate.product,
        template: pickedTemplate.id,
        avatarColor: pickedTemplate.color,
      });
      setSpaceName('');
      setSpaceNameFa('');
      setSpaceKey('');
      closeModal();
    };

    const categories: { id: TemplateCategory; label: string }[] = [
      { id: 'software', label: language === 'fa' ? 'توسعه نرم‌افزار' : 'Software development' },
      { id: 'service', label: language === 'fa' ? 'مدیریت سرویس IT' : 'Service management' },
      { id: 'work', label: language === 'fa' ? 'مدیریت کار و فرم' : 'Work management' },
      { id: 'product', label: language === 'fa' ? 'مدیریت محصول' : 'Product management' },
      { id: 'marketing', label: language === 'fa' ? 'بازاریابی' : 'Marketing' },
      { id: 'customer', label: language === 'fa' ? 'خدمات مشتریان' : 'Customer service' },
      { id: 'hr', label: language === 'fa' ? 'منابع انسانی' : 'Human resources' },
    ];

    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 flex overflow-hidden">
        {/* Left Templates Sidebar */}
        <div className="w-64 border-e border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4 flex flex-col gap-4 overflow-y-auto shrink-0 text-xs">
          <div className="flex items-center justify-between">
            <button
              onClick={closeModal}
              className="p-1.5 rounded-md text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800"
              title={t.close}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <h2 className="text-lg font-bold text-slate-900 dark:text-white px-2">
            {language === 'fa' ? 'الگوهای فضا (Space templates)' : 'Space templates'}
          </h2>

          <div className="space-y-0.5">
            <button
              onClick={() => {
                setPickedTemplate(null);
                setSpaceCategory('made_for_you');
              }}
              className={`w-full text-start px-3 py-2 rounded-md font-medium transition-colors ${
                spaceCategory === 'made_for_you'
                  ? 'bg-blue-100/80 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              {language === 'fa' ? 'پیشنهادی برای شما' : 'Made for you'}
            </button>
            <button
              onClick={() => {
                closeModal();
                setActiveView('spaces');
                showToast('info', language === 'fa' ? 'از اینجا می‌توانید فضای جدید ایجاد یا مدیریت کنید.' : 'Manage or import spaces from the directory.');
              }}
              className="w-full text-start px-3 py-2 rounded-md font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 flex items-center gap-2"
            >
              <span>{language === 'fa' ? 'ورود داده (Import data)' : 'Import data'}</span>
              <Upload className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>

          <div className="pt-2 space-y-1">
            <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {language === 'fa' ? 'دسته‌بندی‌ها' : 'CATEGORIES'}
            </div>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => {
                  setPickedTemplate(null);
                  setSpaceCategory(cat.id);
                }}
                className={`w-full text-start px-3 py-2 rounded-md font-medium transition-colors ${
                  spaceCategory === cat.id
                    ? 'bg-blue-100/80 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right Template Cards or Space Name Step */}
        <div className="flex-1 overflow-y-auto p-8 sm:p-12">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <span>{language === 'fa' ? 'الگوهای فضا' : 'Space templates'} /</span>
              {pickedTemplate && (
                <span className="text-slate-700 dark:text-slate-200 font-semibold">
                  {language === 'fa' ? pickedTemplate.titleFa : pickedTemplate.title}
                </span>
              )}
            </div>

            {!pickedTemplate ? (
              <>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                    {spaceCategory === 'made_for_you'
                      ? language === 'fa'
                        ? 'پیشنهادی برای شما'
                        : 'Made for you'
                      : categories.find(c => c.id === spaceCategory)?.label}
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    {language === 'fa'
                      ? 'الگوی مناسب تیم خود را انتخاب کنید تا گردش‌کار، تخته و فیلدها خودکار آماده شوند.'
                      : 'Templates tailored to how agile and service teams work.'}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {visibleTemplates.map(tpl => (
                    <button
                      key={tpl.id}
                      onClick={() => setPickedTemplate(tpl)}
                      className="text-start bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 rounded-xl p-4 flex flex-col gap-3 transition-all hover:shadow-md group"
                    >
                      <TemplateIllustration id={tpl.id} />
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600">
                            {language === 'fa' ? tpl.titleFa : tpl.title}
                          </h3>
                        </div>
                        {tpl.badge && (
                          <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {tpl.badge}
                          </span>
                        )}
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed pt-1">
                          {language === 'fa' ? tpl.descFa : tpl.desc}
                        </p>
                      </div>
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-xs ${tpl.color}`} />
                        <span>{tpl.product}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <form onSubmit={handleSpaceSubmit} className="max-w-xl space-y-5 text-xs">
                <button
                  type="button"
                  onClick={() => setPickedTemplate(null)}
                  className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-semibold"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{language === 'fa' ? 'بازگشت به الگوها' : 'Back to templates'}</span>
                </button>

                <div>
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FolderKanban className="w-5 h-5 text-blue-600" />
                    <span>{language === 'fa' ? 'نام‌گذاری فضای جدید' : 'Add space details'}</span>
                  </h1>
                  <p className="text-slate-500 mt-1">
                    {language === 'fa' ? 'الگوی انتخابی:' : 'Template:'}{' '}
                    <strong>{language === 'fa' ? pickedTemplate.titleFa : pickedTemplate.title}</strong>
                  </p>
                </div>

                <div>
                  <label className="block font-semibold mb-1">{t.projectName} *</label>
                  <input
                    type="text"
                    required
                    value={spaceName}
                    onChange={e => {
                      const val = e.target.value;
                      setSpaceName(val);
                      if (!spaceKey) {
                        const autoKey = val
                          .replace(/[^a-zA-Z0-9]/g, '')
                          .slice(0, 4)
                          .toUpperCase();
                        if (autoKey) setSpaceKey(autoKey);
                      }
                    }}
                    placeholder="e.g. Growth Experiments"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold mb-1">{t.projectKey} *</label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={spaceKey}
                      onChange={e => setSpaceKey(e.target.value.toUpperCase())}
                      placeholder="GRW"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">{t.projectName} (FA)</label>
                    <input
                      type="text"
                      value={spaceNameFa}
                      onChange={e => setSpaceNameFa(e.target.value)}
                      placeholder="تیم رشد محصول"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                  <button type="button" onClick={closeModal} className="px-4 py-2 text-slate-500">
                    {t.cancel}
                  </button>
                  <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md">
                    {t.createSpace}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 2. Create Dashboard Modal (Exact match to Screenshot 10)
  if (activeQuickModal === 'create_dashboard') {
    const handleDashSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!dashName.trim()) return;
      createDashboard({
        name: dashName.trim(),
        description: dashDesc.trim(),
        viewers: viewerScopeAdded.join(', '),
        editors: editorScopeAdded.join(', '),
      });
      setDashName('');
      setDashDesc('');
      closeModal();
      setActiveView('dashboards');
      showToast('success', language === 'fa' ? 'داشبورد جدید ایجاد شد.' : 'Dashboard created.');
    };

    return (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
        <form
          onSubmit={handleDashSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4 text-xs"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4 text-emerald-600" />
              <span>{language === 'fa' ? 'ایجاد داشبورد' : 'Create dashboard'}</span>
            </h3>
            <button type="button" onClick={closeModal} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            {language === 'fa' ? 'فیلدهای ستاره‌دار * الزامی هستند.' : 'Required fields are marked with an asterisk '}
            <span className="text-rose-500">*</span>
          </p>

          <div>
            <label className="block font-semibold mb-1 text-slate-800 dark:text-slate-200">
              {language === 'fa' ? 'نام داشبورد' : 'Name'} <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={dashName}
              onChange={e => setDashName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border-2 border-blue-500/70 rounded-md focus:outline-none text-slate-900 dark:text-white"
              autoFocus
            />
          </div>

          <div>
            <label className="block font-semibold mb-1 text-slate-800 dark:text-slate-200">{t.description}</label>
            <textarea
              rows={3}
              value={dashDesc}
              onChange={e => setDashDesc(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md resize-none focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block font-semibold text-slate-800 dark:text-slate-200">
              {language === 'fa' ? 'مشاهده‌کنندگان (Viewers)' : 'Viewers'}
            </label>
            <div className="flex items-center gap-2">
              <select
                value={dashViewers}
                onChange={e => setDashViewers(e.target.value)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md min-w-[160px]"
              >
                <option value="Private">Private</option>
                <option value="My organization">My organization</option>
                <option value="Engineering Team">Engineering Team</option>
              </select>
              <span className="text-[11px] text-slate-400 flex-1">
                {dashViewers === 'Private' ? 'Only you' : `Shared with ${dashViewers}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (!viewerScopeAdded.includes(dashViewers)) {
                    setViewerScopeAdded(prev => [...prev, dashViewers]);
                  }
                }}
                className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md font-semibold"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-slate-600 dark:text-slate-300">
              {viewerScopeAdded.map(v => (
                <span key={v} className="inline-flex items-center gap-1">
                  {v === 'Private' ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                  {v}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block font-semibold text-slate-800 dark:text-slate-200">
              {language === 'fa' ? 'ویرایشگران (Editors)' : 'Editors'}
            </label>
            <div className="flex items-center gap-2">
              <select
                value={dashEditors}
                onChange={e => setDashEditors(e.target.value)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md min-w-[160px]"
              >
                <option value="Private">Private</option>
                <option value="Administrators">Administrators</option>
                <option value="Space Leads">Space Leads</option>
              </select>
              <span className="text-[11px] text-slate-400 flex-1">
                {dashEditors === 'Private' ? 'Only you' : `Shared with ${dashEditors}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (!editorScopeAdded.includes(dashEditors)) {
                    setEditorScopeAdded(prev => [...prev, dashEditors]);
                  }
                }}
                className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md font-semibold"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-slate-600 dark:text-slate-300">
              {editorScopeAdded.map(ed => (
                <span key={ed} className="inline-flex items-center gap-1">
                  {ed === 'Private' ? <Lock className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                  {ed}
                </span>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={closeModal} className="px-4 py-1.5 text-slate-500 font-medium">
              {t.cancel}
            </button>
            <button type="submit" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md">
              {t.save}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // 3. Create Plan Modal (Triggered directly from + on Plans in Sidebar)
  if (activeQuickModal === 'create_plan') {
    const handlePlanSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!planName.trim()) return;
      createPlan({
        name: planName.trim(),
        description: planDesc.trim(),
        spaceIds: planSpaceIds,
      });
      setPlanName('');
      setPlanDesc('');
      closeModal();
      setActiveView('plans');
      showToast('success', language === 'fa' ? 'برنامه کلان (Plan) ایجاد شد.' : 'Plan created.');
    };

    return (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
        <form
          onSubmit={handlePlanSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4 text-xs"
        >
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <GanttChart className="w-4 h-4 text-indigo-600" />
              <span>{language === 'fa' ? 'ایجاد برنامه کلان (Create plan)' : 'Create plan'}</span>
            </h3>
            <button type="button" onClick={closeModal} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="block font-semibold mb-1">{language === 'fa' ? 'نام برنامه' : 'Plan name'} *</label>
            <input
              type="text"
              required
              value={planName}
              onChange={e => setPlanName(e.target.value)}
              placeholder="e.g. Q1 Enterprise Launch Plan"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              autoFocus
            />
          </div>

          <div>
            <label className="block font-semibold mb-1">{t.description}</label>
            <textarea
              rows={2}
              value={planDesc}
              onChange={e => setPlanDesc(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md resize-none"
            />
          </div>

          <div>
            <label className="block font-semibold mb-1.5">
              {language === 'fa' ? 'فضاهای متصل به این برنامه' : 'Issue sources (Spaces)'}
            </label>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {projects.map(p => {
                const checked = planSpaceIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex items-center justify-between p-2 rounded-md border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      <span className="font-mono font-bold me-1.5">{p.key}</span>
                      {language === 'fa' ? p.nameFa : p.name}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setPlanSpaceIds(prev =>
                          prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id]
                        )
                      }
                      className="rounded border-slate-300 text-blue-600"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                createPlan({
                  name: 'Demo Portfolio Roadmap',
                  description: 'Pre-populated cross-space sample plan.',
                  spaceIds: projects.map(p => p.id),
                  isDemo: true,
                });
                closeModal();
                setActiveView('plans');
              }}
              className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
            >
              + {language === 'fa' ? 'ساخت برنامه دمو' : 'Create demo plan'}
            </button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={closeModal} className="px-3 py-1.5 text-slate-500">
                {t.cancel}
              </button>
              <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-md">
                {language === 'fa' ? 'ایجاد برنامه' : 'Create'}
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  // 4. Create Team Modal (Triggered directly from + on Teams in Sidebar)
  const handleTeamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    createTeam({
      name: teamName.trim(),
      nameFa: teamName.trim(),
      description: teamDesc.trim() || 'Cross-functional delivery team.',
      leadId: teamLeadId,
      memberIds: [teamLeadId],
    });
    setTeamName('');
    setTeamDesc('');
    closeModal();
    setActiveView('teams');
    showToast('success', language === 'fa' ? 'تیم جدید ایجاد شد.' : 'Team created.');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <form
        onSubmit={handleTeamSubmit}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4 text-xs"
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-600" />
            <span>{language === 'fa' ? 'ایجاد تیم جدید' : 'Create a team'}</span>
          </h3>
          <button type="button" onClick={closeModal} className="text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div>
          <label className="block font-semibold mb-1">{language === 'fa' ? 'نام تیم' : 'Team name'} *</label>
          <input
            type="text"
            required
            value={teamName}
            onChange={e => setTeamName(e.target.value)}
            placeholder="e.g. Payments Reliability"
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
            autoFocus
          />
        </div>
        <div>
          <label className="block font-semibold mb-1">{language === 'fa' ? 'سرپرست تیم' : 'Team Lead'}</label>
          <select
            value={teamLeadId}
            onChange={e => setTeamLeadId(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
          >
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {language === 'fa' ? u.nameFa : u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold mb-1">{t.description}</label>
          <textarea
            rows={2}
            value={teamDesc}
            onChange={e => setTeamDesc(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md resize-none"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={closeModal} className="px-3 py-1.5 text-slate-500">
            {t.cancel}
          </button>
          <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-md flex items-center gap-1">
            <Check className="w-3.5 h-3.5" />
            <span>{language === 'fa' ? 'ایجاد تیم' : 'Create team'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
