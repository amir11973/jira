import React, { useState } from 'react';
import {
  ShieldCheck,
  Sliders,
  Layers,
  Database,
  GitBranch,
  Zap,
  UserCog,
  Megaphone,
  Search,
  Lock,
  ArrowUpRight,
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { globalFieldCatalog, initialLegacyWorkflows } from '../../data/mockData';
import { IssueTypeIcon, PriorityIcon } from '../common/JiraIcons';

export const JiraAdminView: React.FC = () => {
  const {
    activeAdminTab,
    setActiveAdminTab,
    siteConfig,
    updateSiteConfig,
    projects,
    workflows,
    automationRules,
    toggleAutomationRule,
    setCurrentProjectId,
    setActiveView,
    currentUser,
    language,
    toggleLanguage,
    theme,
    toggleTheme,
    showToast,
    t,
  } = useJira();

  const [fieldSearch, setFieldSearch] = useState('');

  const filteredFields = globalFieldCatalog.filter(
    f =>
      !fieldSearch.trim() ||
      f.name.toLowerCase().includes(fieldSearch.toLowerCase()) ||
      f.id.toLowerCase().includes(fieldSearch.toLowerCase()) ||
      f.type.toLowerCase().includes(fieldSearch.toLowerCase())
  );

  const tabs: {
    id: 'system' | 'work_items' | 'fields' | 'workflows' | 'automation' | 'personal';
    label: string;
    labelFa: string;
    icon: React.FC<{ className?: string }>;
  }[] = [
    { id: 'system', label: 'System & Banner', labelFa: 'سیستم و بنر اعلانات', icon: Sliders },
    { id: 'work_items', label: 'Work Items & Hierarchy', labelFa: 'انواع کار و سلسله‌مراتب', icon: Layers },
    { id: 'fields', label: `Fields (${globalFieldCatalog.length})`, labelFa: `فیلدها (${globalFieldCatalog.length})`, icon: Database },
    { id: 'workflows', label: 'Workflows', labelFa: 'گردش‌کارها', icon: GitBranch },
    { id: 'automation', label: 'Global Automation', labelFa: 'اتوماسیون سراسری', icon: Zap },
    { id: 'personal', label: 'Personal Settings', labelFa: 'تنظیمات شخصی', icon: UserCog },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            <span>{t.jiraAdmin}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {language === 'fa'
              ? 'کنسول مدیریت سراسری سیستم، سلسله‌مراتب انواع کار، فیلدها، گردش‌کارهای سازمانی و تنظیمات شخصی.'
              : 'Site-wide administration console for System Config, Work Types Hierarchy, Global Fields, Legacy Workflows, and Personal Preferences.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-1 bg-slate-200/70 dark:bg-slate-800/80 p-1 rounded-lg text-xs">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveAdminTab(tab.id)}
                className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition-colors ${
                  activeAdminTab === tab.id
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{language === 'fa' ? tab.labelFa : tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* System & Announcement Banner (P29, F63) */}
      {activeAdminTab === 'system' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {language === 'fa' ? 'پیکربندی عمومی سامانه' : 'General Configuration'}
            </h3>
            <div>
              <label className="block font-semibold mb-1">{language === 'fa' ? 'عنوان سامانه' : 'Site Title'}</label>
              <input
                type="text"
                value={siteConfig.siteTitle}
                onChange={e => updateSiteConfig({ siteTitle: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">{language === 'fa' ? 'منطقه زمانی پیش‌فرض' : 'Default Time Zone'}</label>
              <select
                value={siteConfig.timezone}
                onChange={e => updateSiteConfig({ timezone: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
              >
                <option value="GMT+03:30 Tehran">GMT+03:30 Tehran</option>
                <option value="UTC">UTC (Coordinated Universal Time)</option>
                <option value="GMT+01:00 Berlin">GMT+01:00 Berlin</option>
                <option value="GMT-08:00 Los Angeles">GMT-08:00 Los Angeles</option>
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-amber-500" />
                <span>{language === 'fa' ? 'بنر اعلانات سراسری (Announcement Banner)' : 'Announcement Banner'}</span>
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
              className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md resize-none"
            />
            <button
              onClick={() => {
                updateSiteConfig({ announcementEnabled: true });
                showToast('success', language === 'fa' ? 'تنظیمات سیستم ذخیره شد.' : 'System configuration saved.');
              }}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md"
            >
              {t.save}
            </button>
          </div>
        </div>
      )}

      {/* Work Items Hierarchy, Priorities, Resolutions & Link Types (P30, F64) */}
      {activeAdminTab === 'work_items' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {language === 'fa' ? 'سلسله‌مراتب انواع کار (Hierarchy)' : 'Work Type Hierarchy Levels'}
            </h3>
            {[
              { type: 'epic' as const, level: 'Level +1', label: 'Epic', desc: 'Portfolio & roadmap parent grouping.' },
              { type: 'story' as const, level: 'Level 0', label: 'Story', desc: 'End-user requirement.' },
              { type: 'feature' as const, level: 'Level 0', label: 'Feature', desc: 'Capability milestone.' },
              { type: 'task' as const, level: 'Level 0', label: 'Task', desc: 'Engineering or ops task.' },
              { type: 'bug' as const, level: 'Level 0', label: 'Bug', desc: 'Defect or incident.' },
              { type: 'subtask' as const, level: 'Level -1', label: 'Subtask', desc: 'Nested child deliverable.' },
            ].map(row => (
              <div key={row.type} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <IssueTypeIcon type={row.type} className="w-4 h-4" />
                  <div>
                    <div className="font-bold">{row.label}</div>
                    <div className="text-[11px] text-slate-400">{row.desc}</div>
                  </div>
                </div>
                <span className="font-mono font-bold text-slate-500">{row.level}</span>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t.priority}</h3>
              {(['highest', 'high', 'medium', 'low', 'lowest'] as const).map(p => (
                <div key={p} className="flex items-center gap-2 p-2 rounded border border-slate-100 dark:border-slate-800">
                  <PriorityIcon priority={p} className="w-4 h-4" />
                  <span className="font-semibold capitalize">{p}</span>
                </div>
              ))}
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {language === 'fa' ? 'انواع نتیجه و ارتباط تسک‌ها' : 'Resolutions & Work Item Link Types'}
              </h3>
              <div className="text-slate-600 dark:text-slate-300 space-y-1">
                <div>
                  <strong>Resolutions:</strong> Done, Won&apos;t Do, Duplicate, Cannot Reproduce
                </div>
                <div>
                  <strong>Link Types:</strong> Blocks / Is Blocked By · Cloners / Cloned By · Duplicates · Relates To
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Fields Catalog (P23, P30, F15, F50) */}
      {activeAdminTab === 'fields' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="font-bold text-sm text-slate-900 dark:text-white">
              {language === 'fa' ? 'کاتالوگ فیلدهای سیستم و سفارشی جیرا' : 'Global Jira Fields Catalog'}
            </div>
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={fieldSearch}
                onChange={e => setFieldSearch(e.target.value)}
                placeholder="Search fields..."
                className="w-full ps-8 pe-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md"
              />
            </div>
          </div>

          <table className="w-full text-start border-collapse">
            <thead className="bg-slate-100/80 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="p-3 text-start">Field Name</th>
                <th className="p-3 text-start">Field ID</th>
                <th className="p-3 text-start">Type</th>
                <th className="p-3 text-start">Scope</th>
                <th className="p-3 text-start">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {filteredFields.map(f => (
                <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="p-3 font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>{f.name}</span>
                    {f.locked && (
                      <span title="System Locked Field" className="inline-flex">
                        <Lock className="w-3 h-3 text-amber-500" />
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-mono text-[11px] text-blue-600 dark:text-blue-400">{f.id}</td>
                  <td className="p-3 text-slate-600 dark:text-slate-300">{f.type}</td>
                  <td className="p-3 font-mono text-[11px] uppercase text-slate-500">{f.scope}</td>
                  <td className="p-3 text-slate-500">{f.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Workflows & Company-Managed Legacy Workflows (P31, F42) */}
      {activeAdminTab === 'workflows' && (
        <div className="space-y-4 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {language === 'fa' ? 'گردش‌کارهای فعال فضاها (Team-Managed)' : 'Active Space Workflows (Editable)'}
            </h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {workflows.map(wf => {
                const proj = projects.find(p => p.id === wf.projectId);
                return (
                  <div key={wf.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">{wf.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Space: {proj?.key || wf.projectId} · {wf.statuses.length} statuses · {wf.transitions.length} transitions
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (proj) setCurrentProjectId(proj.id);
                        setActiveView('workflow');
                      }}
                      className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1"
                    >
                      <span>{t.editWorkflow}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {language === 'fa' ? 'گردش‌کارهای شرکتی / سیستمی (Legacy Workflows)' : 'Company-Managed & System Workflows (Section 6.6)'}
            </h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {initialLegacyWorkflows.map(lwf => (
                <div key={lwf.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold font-mono text-slate-900 dark:text-white">{lwf.name}</div>
                    <div className="text-[11px] text-slate-500">{lwf.description}</div>
                  </div>
                  <div className="text-end font-mono text-[11px] text-slate-400 shrink-0">
                    <div>{lwf.schemeType}</div>
                    <div>
                      {lwf.statusesCount} statuses · {lwf.transitionsCount} transitions
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Global Automation (F46) */}
      {activeAdminTab === 'automation' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 text-xs">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {language === 'fa' ? 'مدیریت قوانین اتوماسیون در کل فضاها' : 'Global Automation Rules Across Spaces'}
          </h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {automationRules.map(rule => {
              const proj = projects.find(p => p.id === rule.projectId);
              return (
                <div key={rule.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      <span className="font-mono text-blue-600 me-2">[{proj?.key || 'ALL'}]</span>
                      {language === 'fa' ? rule.nameFa : rule.name}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {language === 'fa' ? rule.descriptionFa : rule.description} ·{' '}
                      <span className="font-mono">{rule.executionsCount} runs</span>
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

      {/* Personal Settings (P28, F62) */}
      {activeAdminTab === 'personal' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 max-w-xl text-xs">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t.personalSettings}</h3>
          <div className="space-y-1">
            <div className="text-slate-400">Account</div>
            <div className="font-bold text-slate-900 dark:text-white">
              {language === 'fa' ? currentUser?.nameFa : currentUser?.name} ({currentUser?.email})
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">{language === 'fa' ? 'زبان رابط کاربری' : 'Language'}</label>
              <button
                onClick={toggleLanguage}
                className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-start"
              >
                {language === 'fa' ? 'فارسی (RTL) — تغییر به English' : 'English (LTR) — Switch to فارسی'}
              </button>
            </div>
            <div>
              <label className="block font-semibold mb-1">{language === 'fa' ? 'پوسته ظاهری' : 'Appearance'}</label>
              <button
                onClick={toggleTheme}
                className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-start capitalize"
              >
                {theme} mode
              </button>
            </div>
          </div>
          <div>
            <label className="block font-semibold mb-1">{language === 'fa' ? 'منطقه زمانی شما' : 'Your Time Zone'}</label>
            <div className="px-3 py-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 font-mono">
              {siteConfig.timezone}
            </div>
          </div>
          <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
            <span className="font-semibold">
              {language === 'fa' ? 'دریافت خلاصه ایمیل تغییرات' : 'Receive email activity digest'}
            </span>
            <input
              type="checkbox"
              checked={siteConfig.emailDigestEnabled}
              onChange={e => updateSiteConfig({ emailDigestEnabled: e.target.checked })}
              className="rounded border-slate-300 text-blue-600"
            />
          </label>
        </div>
      )}
    </div>
  );
};
