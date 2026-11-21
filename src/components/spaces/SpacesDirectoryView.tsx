import React, { useState } from 'react';
import {
  FolderKanban,
  Search,
  Star,
  Plus,
  X,
  Kanban,
  ListTodo,
  Headphones,
  Briefcase,
  UserCheck,
  Inbox,
  ArrowUpRight,
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { UserAvatar } from '../common/JiraIcons';

export const SpacesDirectoryView: React.FC = () => {
  const {
    projects,
    issues,
    users,
    setCurrentProjectId,
    setActiveView,
    toggleStarProject,
    createProject,
    setActiveQuickModal,
    t,
    language,
  } = useJira();

  const [search, setSearch] = useState('');
  const [templateFilter, setTemplateFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const [keyInput, setKeyInput] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameFa, setNameFa] = useState('');
  const [category, setCategory] = useState('Software Development');
  const [selectedTemplate, setSelectedTemplate] = useState<
    'kanban' | 'scrum' | 'work_requests' | 'it_service' | 'personal' | 'business'
  >('scrum');

  const templatesCatalog: {
    id: 'kanban' | 'scrum' | 'work_requests' | 'it_service' | 'personal' | 'business';
    name: string;
    nameFa: string;
    desc: string;
    descFa: string;
    color: string;
    icon: React.FC<{ className?: string }>;
  }[] = [
    {
      id: 'scrum',
      name: 'Scrum',
      nameFa: 'اسکرام (Scrum)',
      desc: 'Plan and deliver iterative sprints with Backlog, Velocity & Burndown.',
      descFa: 'برنامه‌ریزی اسپرینت‌های تکرارشونده با بک‌لاگ و نمودارهای سرعت تیم.',
      color: 'bg-blue-600',
      icon: ListTodo,
    },
    {
      id: 'kanban',
      name: 'Kanban',
      nameFa: 'کانبان (Kanban)',
      desc: 'Visualize continuous delivery flow, limit WIP, and ship steadily.',
      descFa: 'جریان پیوسته تحویل کار بدون وابستگی به اسپرینت‌های زمان‌بندی‌شده.',
      color: 'bg-emerald-600',
      icon: Kanban,
    },
    {
      id: 'work_requests',
      name: 'Work Requests',
      nameFa: 'درخواست‌های کار و فرم‌ها',
      desc: 'Collect structured stakeholder requests via Intake Forms.',
      descFa: 'پذیرش ساختاریافته درخواست‌ها با فرم‌های آماده و پیگیری SLA.',
      color: 'bg-amber-600',
      icon: Inbox,
    },
    {
      id: 'it_service',
      name: 'IT Service Management',
      nameFa: 'مدیریت سرویس IT (ITSM)',
      desc: 'Manage incidents, change requests, and linked Assets CMDB.',
      descFa: 'مدیریت رخدادها، درخواست‌های تغییر و دارایی‌های زیرساخت.',
      color: 'bg-rose-600',
      icon: Headphones,
    },
    {
      id: 'business',
      name: 'Business Project',
      nameFa: 'پروژه کسب‌وکار و عملیات',
      desc: 'Track marketing campaigns, finance approvals, and cross-team lists.',
      descFa: 'ردیابی پروژه‌های عملیاتی، مالی و کمپین‌های کسب‌وکار.',
      color: 'bg-purple-600',
      icon: Briefcase,
    },
    {
      id: 'personal',
      name: 'Personal Tasks',
      nameFa: 'وظایف شخصی',
      desc: 'Lightweight private workspace for personal milestones.',
      descFa: 'فضای سبک و شخصی برای پیگیری کارهای روزمره.',
      color: 'bg-slate-600',
      icon: UserCheck,
    },
  ];

  const filteredProjects = projects.filter(p => {
    const q = search.trim().toLowerCase();
    const matchText =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.nameFa.toLowerCase().includes(q) ||
      p.key.toLowerCase().includes(q);
    const matchTpl = templateFilter === 'all' || (p.template || 'scrum') === templateFilter;
    return matchText && matchTpl;
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim() || !nameEn.trim()) return;
    const tplObj = templatesCatalog.find(x => x.id === selectedTemplate);
    createProject({
      key: keyInput.trim(),
      name: nameEn.trim(),
      nameFa: nameFa.trim() || nameEn.trim(),
      description: `${tplObj?.name || 'Software'} space`,
      category,
      template: selectedTemplate,
      avatarColor: tplObj?.color || 'bg-blue-600',
    });
    setKeyInput('');
    setNameEn('');
    setNameFa('');
    setIsCreateOpen(false);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-blue-600" />
            <span>{t.spacesDirectory}</span>
            <span className="font-mono text-xs text-slate-400 tabular-nums">({projects.length})</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {language === 'fa'
              ? 'مدیریت، جستجو و ایجاد فضاهای کاری بر اساس الگوهای اسکرام، کانبان، IT و کسب‌وکار.'
              : 'Browse, search, star, and create Spaces from Scrum, Kanban, Work Requests, and ITSM templates.'}
          </p>
        </div>

        <button
          onClick={() => setActiveQuickModal('create_space')}
          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 shadow-xs self-start"
        >
          <Plus className="w-4 h-4" />
          <span>{t.createSpace}</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={language === 'fa' ? 'جستجوی نام یا کلید فضا...' : 'Search spaces by name or key...'}
            className="w-full ps-9 pe-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md text-xs focus:outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={templateFilter}
          onChange={e => setTemplateFilter(e.target.value)}
          className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md text-xs"
        >
          <option value="all">{language === 'fa' ? 'همه الگوها' : 'All Templates'}</option>
          {templatesCatalog.map(tpl => (
            <option key={tpl.id} value={tpl.id}>
              {language === 'fa' ? tpl.nameFa : tpl.name}
            </option>
          ))}
        </select>
      </div>

      {/* Spaces Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-xs text-start border-collapse">
          <thead className="bg-slate-100/80 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
            <tr>
              <th className="p-3 text-center w-10">★</th>
              <th className="p-3 text-start">{t.projectName}</th>
              <th className="p-3 text-start">{t.projectKey}</th>
              <th className="p-3 text-start">{t.spaceTemplate}</th>
              <th className="p-3 text-start">{t.projectLead}</th>
              <th className="p-3 text-end">{language === 'fa' ? 'تعداد تسک‌ها' : 'Work Items'}</th>
              <th className="p-3 text-end">{t.actions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {filteredProjects.map(proj => {
              const lead = users.find(u => u.id === proj.leadId);
              const count = issues.filter(i => i.projectId === proj.id && !i.archived).length;
              return (
                <tr key={proj.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="p-3 text-center">
                    <button onClick={() => toggleStarProject(proj.id)} className="text-slate-400 hover:text-amber-500">
                      <Star className={`w-4 h-4 ${proj.starred ? 'fill-amber-400 text-amber-500' : ''}`} />
                    </button>
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => {
                        setCurrentProjectId(proj.id);
                        setActiveView('board');
                      }}
                      className="flex items-center gap-2.5 text-start group"
                    >
                      <span
                        className={`w-7 h-7 rounded-md ${proj.avatarColor} text-white font-bold text-[10px] flex items-center justify-center shrink-0`}
                      >
                        {proj.key.slice(0, 3)}
                      </span>
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600">
                          {language === 'fa' ? proj.nameFa : proj.name}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-xs">{proj.category}</div>
                      </div>
                    </button>
                  </td>
                  <td className="p-3 font-mono font-bold text-slate-700 dark:text-slate-300">{proj.key}</td>
                  <td className="p-3 font-mono uppercase text-[11px] text-slate-500">{proj.template || 'scrum'}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <UserAvatar user={lead} size="sm" />
                      <span className="text-slate-700 dark:text-slate-300">
                        {language === 'fa' ? lead?.nameFa : lead?.name}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 text-end font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-200">
                    {count}
                  </td>
                  <td className="p-3 text-end">
                    <button
                      onClick={() => {
                        setCurrentProjectId(proj.id);
                        setActiveView('board');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-700 dark:text-slate-200 font-semibold transition-colors"
                    >
                      <span>{language === 'fa' ? 'ورود' : 'Open'}</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create Space Modal with Visual Template Picker (F07) */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleCreateSubmit}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-3xl p-6 space-y-5 text-xs my-8"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{t.createSpace}</h3>
                <p className="text-[11px] text-slate-500">
                  {language === 'fa'
                    ? 'ابتدا الگوی مناسب تیم خود را انتخاب کنید و مشخصات فضا را وارد نمایید.'
                    : 'Choose a template tailored to your workflow and configure your space key.'}
                </p>
              </div>
              <button type="button" onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Visual Template Picker Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {templatesCatalog.map(tpl => {
                const Icon = tpl.icon;
                const active = selectedTemplate === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setSelectedTemplate(tpl.id)}
                    className={`p-3 rounded-xl border text-start transition-all space-y-1.5 ${
                      active
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-md ${tpl.color} text-white flex items-center justify-center`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {language === 'fa' ? tpl.nameFa : tpl.name}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      {language === 'fa' ? tpl.descFa : tpl.desc}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <label className="block font-semibold mb-1">{t.projectKey} *</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={keyInput}
                  onChange={e => setKeyInput(e.target.value.toUpperCase())}
                  placeholder="MKTG"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono uppercase"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold mb-1">{t.projectName} (EN) *</label>
                <input
                  type="text"
                  required
                  value={nameEn}
                  onChange={e => setNameEn(e.target.value)}
                  placeholder="Marketing Launchpad"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">{t.projectName} (FA)</label>
                <input
                  type="text"
                  value={nameFa}
                  onChange={e => setNameFa(e.target.value)}
                  placeholder="کمپین مارکتینگ"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1">{language === 'fa' ? 'دسته‌بندی' : 'Category'}</label>
              <input
                type="text"
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onClick={() => setIsCreateOpen(false)} className="px-4 py-1.5 text-slate-500">
                {t.cancel}
              </button>
              <button type="submit" className="px-5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md">
                {t.createSpace}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
