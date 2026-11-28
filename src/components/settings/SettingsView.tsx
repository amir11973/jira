import React, { useState, useEffect } from 'react';
import {
  Settings,
  Users,
  RotateCcw,
  Check,
  FolderKanban,
  Bell,
  Sliders,
  Layers,
  AlertTriangle,
  Database,
  ShieldCheck,
  GitBranch,
  ExternalLink,
  Mail,
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { UserAvatar, IssueTypeIcon } from '../common/JiraIcons';
import { globalFieldCatalog } from '../../data/mockData';

export const SettingsView: React.FC = () => {
  const {
    currentProject,
    updateProject,
    updateProjectFeatures,
    updateProjectNotifications,
    toggleSpacePolicy,
    users,
    resetToDemoData,
    setActiveView,
    setActiveAdminTab,
    showToast,
    t,
    language,
  } = useJira();

  const [activeTab, setActiveTab] = useState<
    'details' | 'access' | 'notifications' | 'features' | 'worktypes' | 'fields' | 'policies'
  >('details');
  const [resetSuccess, setResetSuccess] = useState(false);

  const [name, setName] = useState(currentProject.name);
  const [nameFa, setNameFa] = useState(currentProject.nameFa);
  const [category, setCategory] = useState(currentProject.category);
  const [description, setDescription] = useState(currentProject.description);
  const [leadId, setLeadId] = useState(currentProject.leadId);

  useEffect(() => {
    setName(currentProject.name);
    setNameFa(currentProject.nameFa);
    setCategory(currentProject.category);
    setDescription(currentProject.description);
    setLeadId(currentProject.leadId);
  }, [currentProject]);

  const features = currentProject.features || {
    sprints: true,
    estimation: true,
    standups: true,
    forms: true,
    releases: true,
  };

  const notifications = currentProject.notifications || {
    onCreated: true,
    onTransitioned: true,
    onCommented: true,
    onAssigned: true,
    senderName: `JiraFlow Bot (${currentProject.key})`,
  };

  const policies = currentProject.policies || [];

  const handleSaveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    updateProject(currentProject.id, { name, nameFa, category, description, leadId });
    showToast('success', language === 'fa' ? 'مشخصات فضا ذخیره شد.' : 'Space details saved.');
  };

  const handleReset = () => {
    if (
      window.confirm(
        language === 'fa'
          ? 'آیا مطمئن هستید که می‌خواهید تمام اطلاعات را به داده‌های اولیه بازگردانید؟'
          : 'Are you sure you want to restore demo data?'
      )
    ) {
      void resetToDemoData();
    }
  };

  const spaceEmailAudit = [
    { id: 'em-1', to: 'sarah.chen@nexus-tech.io', subject: `[${currentProject.key}-101] Assigned to you`, event: 'Issue Assigned', status: 'Delivered' },
    { id: 'em-2', to: 'parsa@nexus-tech.io', subject: `[${currentProject.key}-105] Transitioned to Done`, event: 'Workflow Transition', status: 'Delivered' },
    { id: 'em-3', to: 'ali.rostami@nexus-tech.io', subject: `[${currentProject.key}-103] New comment mentioned you`, event: 'Comment Added', status: 'Delivered' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            <span>
              {t.settingsTitle} — {currentProject.key}
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {language === 'fa'
              ? 'مدیریت مشخصات فضا، دسترسی‌ها، اعلان‌ها، قابلیت‌های فعال، فیلدها و خط‌مشی‌ها.'
              : 'Manage space details, access roles, notifications, feature toggles, fields, and governance policies.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-1 bg-slate-200/70 dark:bg-slate-800/80 p-1 rounded-lg text-xs">
          {[
            { id: 'details', label: t.projectDetails, icon: FolderKanban },
            { id: 'access', label: t.membersAndRoles, icon: Users },
            { id: 'notifications', label: t.notificationsTab, icon: Bell },
            { id: 'features', label: t.featuresToggles, icon: Sliders },
            { id: 'worktypes', label: t.workTypesFields, icon: Layers },
            { id: 'fields', label: t.fieldsTab, icon: Database },
            { id: 'policies', label: t.policiesTab, icon: ShieldCheck },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {resetSuccess && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{t.dataResetSuccess}</span>
        </div>
      )}

      {/* Details Tab */}
      {activeTab === 'details' && (
        <form
          onSubmit={handleSaveDetails}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4 text-xs"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">{t.projectName} (EN)</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">{t.projectName} (FA)</label>
              <input
                type="text"
                value={nameFa}
                onChange={e => setNameFa(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">{t.projectKey}</label>
              <input
                type="text"
                disabled
                value={currentProject.key}
                className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono font-bold text-blue-600"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">{t.projectLead}</label>
              <select
                value={leadId}
                onChange={e => setLeadId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {language === 'fa' ? u.nameFa : u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold mb-1">{language === 'fa' ? 'دسته‌بندی' : 'Category'}</label>
              <input
                type="text"
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold mb-1">{t.description}</label>
              <textarea
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md">
              {t.save}
            </button>
          </div>
        </form>
      )}

      {/* Access & Roles Tab */}
      {activeTab === 'access' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {users.map(u => (
              <div key={u.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <UserAvatar user={u} size="md" />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {language === 'fa' ? u.nameFa : u.name}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                  </div>
                </div>
                <span className="font-mono font-semibold uppercase text-[11px] text-slate-600 dark:text-slate-300">
                  {u.role.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notifications Tab + Space Email Audit */}
      {activeTab === 'notifications' && (
        <div className="space-y-4 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
            <div>
              <label className="block font-semibold mb-1">{language === 'fa' ? 'نام فرستنده اعلان' : 'Sender Name'}</label>
              <input
                type="text"
                value={notifications.senderName}
                onChange={e => updateProjectNotifications(currentProject.id, { senderName: e.target.value })}
                className="w-full max-w-md px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>
            <div className="space-y-2.5 pt-2">
              {[
                { key: 'onCreated', label: language === 'fa' ? 'هنگام ایجاد تسک جدید' : 'Work item created' },
                { key: 'onTransitioned', label: language === 'fa' ? 'هنگام تغییر وضعیت در گردش‌کار' : 'Work item transitioned' },
                { key: 'onCommented', label: language === 'fa' ? 'هنگام ثبت دیدگاه جدید' : 'Comment added' },
                { key: 'onAssigned', label: language === 'fa' ? 'هنگام تغییر مسئول انجام' : 'Assignee updated' },
              ].map(item => (
                <label key={item.key} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{item.label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean((notifications as any)[item.key])}
                    onChange={e =>
                      updateProjectNotifications(currentProject.id, { [item.key]: e.target.checked } as any)
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-3">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-600" />
              <span>{language === 'fa' ? 'گزارش ایمیل‌های ارسالی فضا (Space Email Audit)' : 'Space Email Dispatch Audit'}</span>
            </h3>
            <table className="w-full text-start border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-2.5 text-start">Recipient</th>
                  <th className="p-2.5 text-start">Subject</th>
                  <th className="p-2.5 text-start">Event</th>
                  <th className="p-2.5 text-start">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {spaceEmailAudit.map(em => (
                  <tr key={em.id}>
                    <td className="p-2.5 font-mono text-slate-600 dark:text-slate-400">{em.to}</td>
                    <td className="p-2.5 font-medium text-slate-800 dark:text-slate-200">{em.subject}</td>
                    <td className="p-2.5 text-slate-500">{em.event}</td>
                    <td className="p-2.5 font-semibold text-emerald-600 dark:text-emerald-400">{em.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Features Toggles Tab */}
      {activeTab === 'features' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-3 text-xs">
          {[
            {
              key: 'sprints',
              title: language === 'fa' ? 'اسپرینت‌ها و بک‌لاگ (Sprints & Backlog)' : 'Sprints & Backlog',
              desc: language === 'fa'
                ? 'نیازمند فعال بودن تب بک‌لاگ است. در صورت غیرفعال شدن، تخته به حالت جریان پیوسته کانبان (Kanban) تبدیل می‌شود.'
                : 'Requires Backlog view enabled. Disable to operate this space as a continuous Kanban flow.',
            },
            {
              key: 'estimation',
              title: language === 'fa' ? 'امتیاز تخمین (Story Points Estimation)' : 'Story Points Estimation',
              desc: language === 'fa' ? 'نمایش و محاسبه امتیازهای اسپرینت روی کارت‌ها و نمودارها.' : 'Show estimation points on board cards and velocity charts.',
            },
            {
              key: 'forms',
              title: language === 'fa' ? 'فرم‌های پذیرش درخواست (Intake Forms)' : 'Intake Forms',
              desc: language === 'fa' ? 'نمایش بخش فرم‌های استاندارد در منوی فضای کاری.' : 'Enable structured intake forms in space navigation.',
            },
            {
              key: 'releases',
              title: language === 'fa' ? 'مدیریت نسخه‌ها و انتشار (Releases)' : 'Releases & Versions',
              desc: language === 'fa' ? 'فعال‌سازی ردیابی نسخه‌های نرم‌افزاری و تاریخ انتشار.' : 'Track Fix Versions and release milestones.',
            },
          ].map(feat => (
            <label
              key={feat.key}
              className="flex items-center justify-between gap-4 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
            >
              <div>
                <div className="font-bold text-slate-900 dark:text-white">{feat.title}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{feat.desc}</div>
              </div>
              <input
                type="checkbox"
                checked={Boolean((features as any)[feat.key])}
                onChange={e =>
                  updateProjectFeatures(currentProject.id, { [feat.key]: e.target.checked } as any)
                }
                className="w-4 h-4 rounded border-slate-300 text-blue-600"
              />
            </label>
          ))}
        </div>
      )}

      {/* Work Types Tab */}
      {activeTab === 'worktypes' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white">
              {language === 'fa' ? 'سلسله‌مراتب انواع کار و گردش‌کار' : 'Work Type Hierarchy & Workflow'}
            </h3>
            <button
              onClick={() => setActiveView('workflow')}
              className="px-3 py-1.5 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-semibold flex items-center gap-1.5"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>{t.editWorkflow}</span>
            </button>
          </div>
          <div className="space-y-2">
            {[
              { type: 'epic' as const, level: '+1', name: 'Epic', desc: 'Large initiative grouping Stories, Features, Tasks, and Bugs.' },
              { type: 'story' as const, level: '0', name: 'Story', desc: 'Standard user-facing deliverable.' },
              { type: 'feature' as const, level: '0', name: 'Feature', desc: 'Product capability tracked across releases.' },
              { type: 'task' as const, level: '0', name: 'Task', desc: 'Technical or operational work item.' },
              { type: 'bug' as const, level: '0', name: 'Bug', desc: 'Software defect or production incident.' },
              { type: 'subtask' as const, level: '-1', name: 'Sub-task', desc: 'Granular child item nested under a Level 0 work item.' },
            ].map(wt => (
              <div
                key={wt.type}
                className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800"
              >
                <div className="flex items-center gap-2.5">
                  <IssueTypeIcon type={wt.type} className="w-4 h-4" />
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">{wt.name}</div>
                    <div className="text-[11px] text-slate-500">{wt.desc}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] font-bold text-slate-500">Level {wt.level}</span>
                  <button
                    onClick={() => setActiveView('workflow')}
                    className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                  >
                    {t.editWorkflow}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fields Tab (F38) */}
      {activeTab === 'fields' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">
                {language === 'fa' ? 'فیلدهای فعال در فضا' : 'Space Fields Configuration'}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {language === 'fa'
                  ? 'مدیریت کامل طرح‌واره‌ها و فیلدهای سراسری در بخش مدیریت سامانه انجام می‌شود.'
                  : 'Global custom fields and locked system attributes are managed centrally in Jira Admin.'}
              </p>
            </div>
            <button
              onClick={() => {
                setActiveAdminTab('fields');
                setActiveView('jira_admin');
              }}
              className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1.5"
            >
              <span>{language === 'fa' ? 'رفتن به صفحه Fields در مدیریت سامانه' : 'Go to the Fields page'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-start border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-2.5 text-start">Field</th>
                  <th className="p-2.5 text-start">ID</th>
                  <th className="p-2.5 text-start">Type</th>
                  <th className="p-2.5 text-start">Scope</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {globalFieldCatalog.slice(0, 12).map(f => (
                  <tr key={f.id}>
                    <td className="p-2.5 font-semibold text-slate-800 dark:text-slate-200">
                      {f.name} {f.locked && <span className="text-[10px] text-amber-600 font-mono ms-1">[LOCKED]</span>}
                    </td>
                    <td className="p-2.5 font-mono text-slate-500">{f.id}</td>
                    <td className="p-2.5 text-slate-600 dark:text-slate-400">{f.type}</td>
                    <td className="p-2.5 text-slate-500">{f.scope}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Policies Tab (F66) */}
      {activeTab === 'policies' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-3 text-xs">
          <h3 className="font-bold text-slate-900 dark:text-white">
            {language === 'fa' ? 'خط‌مشی‌های حاکمیتی فضا (Space Policies)' : 'Space Governance Policies'}
          </h3>
          {policies.length === 0 ? (
            <div className="text-slate-400 italic py-4">
              {language === 'fa' ? 'خط‌مشی فعالی برای این فضا تعریف نشده است.' : 'No policies configured for this space.'}
            </div>
          ) : (
            policies.map(pol => (
              <label
                key={pol.id}
                className="flex items-center justify-between gap-4 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    {language === 'fa' ? pol.titleFa : pol.title}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{pol.description}</div>
                </div>
                <input
                  type="checkbox"
                  checked={pol.enabled}
                  onChange={() => toggleSpacePolicy(currentProject.id, pol.id)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600"
                />
              </label>
            ))
          )}
        </div>
      )}

      {/* Factory Reset Section */}
      <div className="bg-rose-50/40 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-bold text-sm">
          <AlertTriangle className="w-4 h-4" />
          <span>{t.resetDemoData}</span>
        </div>
        <p className="text-xs text-rose-800/80 dark:text-rose-300/80">
          {language === 'fa'
            ? 'با بازنشانی داده‌ها، تمام تسک‌ها، گردش‌کارها، اتوماسیون‌ها و اسپرینت‌های ایجاد شده به حالت پیش‌فرض نمونه بازگردانی می‌شوند.'
            : 'Reset all customized issues, workflows, automation rules, and sprints back to initial seed demo data.'}
        </p>
        <button
          onClick={handleReset}
          className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{t.resetDemoData}</span>
        </button>
      </div>
    </div>
  );
};
