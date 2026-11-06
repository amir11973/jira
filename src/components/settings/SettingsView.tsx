import React, { useState } from 'react';
import { 
  Settings, Users, Shield, RotateCcw, Check, 
  FolderKanban, GitBranch, AlertTriangle 
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { UserAvatar } from '../common/JiraIcons';

export const SettingsView: React.FC = () => {
  const { currentProject, users, statuses, resetToDemoData, t, language } = useJira();
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleReset = () => {
    if (window.confirm(language === 'fa' ? 'آیا مطمئن هستید که می‌خواهید تمام اطلاعات را به داده‌های اولیه بازگردانید؟' : 'Are you sure you want to restore demo data?')) {
      resetToDemoData();
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 3000);
    }
  };

  const projectLead = users.find(u => u.id === currentProject.leadId) || users[0];

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          <span>{t.settingsTitle}</span>
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {language === 'fa' 
            ? 'تنظیمات مشخصات پروژه، اعضای تیم و دسترسی‌ها، گردش کار و مدیریت داده‌ها.' 
            : 'Manage project metadata, team roles, board workflow, and demo presets.'}
        </p>
      </div>

      {resetSuccess && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{t.dataResetSuccess}</span>
        </div>
      )}

      {/* Project Details Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <FolderKanban className="w-4 h-4 text-blue-600" />
          <span>{t.projectDetails}</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t.projectName}
            </label>
            <input
              type="text"
              disabled
              value={language === 'fa' ? currentProject.nameFa : currentProject.name}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-semibold text-slate-800 dark:text-slate-200"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t.projectKey}
            </label>
            <input
              type="text"
              disabled
              value={currentProject.key}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono font-bold text-blue-600 dark:text-blue-400"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t.projectLead}
            </label>
            <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md">
              <UserAvatar user={projectLead} size="sm" />
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {language === 'fa' ? projectLead.nameFa : projectLead.name} ({projectLead.email})
              </span>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {language === 'fa' ? 'دسته‌بندی پروژه' : 'Category'}
            </label>
            <input
              type="text"
              disabled
              value={currentProject.category}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-600 dark:text-slate-400"
            />
          </div>
        </div>

        <div>
          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 text-xs">
            {t.description}
          </label>
          <p className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-md border border-slate-200/60 dark:border-slate-800">
            {currentProject.description}
          </p>
        </div>
      </div>

      {/* Team Members & Roles */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-emerald-600" />
          <span>{t.membersAndRoles}</span>
        </h3>

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

              <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold uppercase text-[10px]">
                {u.role.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Workflow & Statuses */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-purple-600" />
          <span>{t.workflowStatuses}</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          {statuses.map(st => (
            <div key={st.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 space-y-1">
              <div className="font-bold uppercase text-slate-800 dark:text-slate-200">
                {language === 'fa' ? st.nameFa : st.name}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">Category: {st.category}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Factory Reset Section */}
      <div className="bg-rose-50/40 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-bold text-sm">
          <AlertTriangle className="w-4 h-4" />
          <span>{t.resetDemoData}</span>
        </div>
        <p className="text-xs text-rose-800/80 dark:text-rose-300/80">
          {language === 'fa'
            ? 'با بازنشانی داده‌ها، تمام تسک‌ها، لاگ‌های کاری و اسپرینت‌های ایجاد شده به حالت پیش‌فرض و استاندارد نمونه بازگردانی می‌شوند.'
            : 'Reset all customized issues, worklogs, and sprints back to initial seed demo data.'}
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
