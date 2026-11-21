import React, { useState } from 'react';
import { Zap, PlayCircle, History, BarChart2, Plus, CheckCircle2 } from 'lucide-react';
import { useJira } from '../../context/JiraContext';

const AUTOMATION_TEMPLATES = [
  {
    name: 'Auto-assign work item on In Progress',
    nameFa: 'تخصیص خودکار مسئول هنگام شروع کار',
    description: 'When an unassigned work item transitions to In Progress, assign it to the user performing the move.',
    descriptionFa: 'هنگام انتقال تسک بدون مسئول به «در حال انجام»، مسئولیت آن به کاربر اجراکننده سپرده شود.',
    trigger: 'issue_transitioned' as const,
    triggerTargetStatus: 'inprogress',
    action: 'auto_assign_mover' as const,
  },
  {
    name: 'Close parent Epic when all children are Done',
    nameFa: 'بستن خودکار اپیک پس از تکمیل تمام تسک‌های زیرمجموعه',
    description: 'Automatically mark the parent Epic as Done once every child Story/Task/Bug reaches Done.',
    descriptionFa: 'تغییر خودکار وضعیت اپیک والد به Done پس از اینکه تمام تسک‌های فرزند آن تکمیل شدند.',
    trigger: 'subtasks_all_done' as const,
    action: 'close_parent' as const,
  },
  {
    name: 'Clear Flagged impediment & set Resolution on Done',
    nameFa: 'پاک کردن پرچم مانع و ثبت نتیجه هنگام تکمیل',
    description: 'Ensure resolved items no longer carry a Flagged impediment marker and have Resolution = Done.',
    descriptionFa: 'حذف خودکار پرچم مانع و ثبت نتیجه تکمیل روی تسک‌هایی که به وضعیت نهایی می‌روند.',
    trigger: 'issue_transitioned' as const,
    triggerTargetStatus: 'done',
    action: 'unflag_issue' as const,
  },
];

export const AutomationView: React.FC = () => {
  const {
    currentProject,
    automationRules,
    automationAuditLogs,
    toggleAutomationRule,
    createAutomationRule,
    showToast,
    language,
    t,
  } = useJira();

  const [tab, setTab] = useState<'flows' | 'templates' | 'audit' | 'usage'>('flows');

  const projectRules = automationRules.filter(r => r.projectId === currentProject.id);
  const projectLogs = automationAuditLogs.filter(l => l.projectId === currentProject.id);
  const totalExecutions = projectRules.reduce((acc, r) => acc + r.executionsCount, 0);

  const handleActivateTemplate = (tpl: (typeof AUTOMATION_TEMPLATES)[0]) => {
    createAutomationRule({
      projectId: currentProject.id,
      name: tpl.name,
      nameFa: tpl.nameFa,
      description: tpl.description,
      descriptionFa: tpl.descriptionFa,
      trigger: tpl.trigger,
      triggerTargetStatus: tpl.triggerTargetStatus,
      action: tpl.action,
      enabled: true,
    });
    setTab('flows');
    showToast(
      'success',
      language === 'fa' ? 'قانون اتوماسیون از الگو فعال شد.' : 'Automation rule activated from template.'
    );
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            <span>{t.automationView} — {currentProject.key}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {language === 'fa'
              ? 'تعریف و پایش قوانین بدون‌کد (When / If / Then) برای خودکارسازی گردش‌کار فضا.'
              : 'No-code When / If / Then automation rules reacting to space transitions and roll-ups.'}
          </p>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800/80 p-1 rounded-lg text-xs">
          {[
            { id: 'flows', label: t.automationFlows, icon: PlayCircle },
            { id: 'templates', label: t.automationTemplates, icon: Plus },
            { id: 'audit', label: t.automationAudit, icon: History },
            { id: 'usage', label: t.automationUsage, icon: BarChart2 },
          ].map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id as any)}
                className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition-colors ${
                  tab === item.id
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Flows Tab */}
      {tab === 'flows' && (
        <div className="space-y-3">
          {projectRules.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-xs text-slate-400">
              {language === 'fa'
                ? 'هنوز قانونی برای این فضا فعال نشده است. از تب الگوها یک قانون اضافه کنید.'
                : 'No automation rules configured for this space yet. Add one from Templates.'}
            </div>
          ) : (
            projectRules.map(rule => (
              <div
                key={rule.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {language === 'fa' ? rule.nameFa : rule.name}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      · {rule.executionsCount} {language === 'fa' ? 'اجرا' : 'runs'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {language === 'fa' ? rule.descriptionFa : rule.description}
                  </p>
                  <div className="text-[11px] font-mono text-slate-400 pt-0.5">
                    TRIGGER: {rule.trigger}
                    {rule.triggerTargetStatus ? ` (${rule.triggerTargetStatus})` : ''} → ACTION: {rule.action}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => toggleAutomationRule(rule.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      rule.enabled
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {rule.enabled ? (language === 'fa' ? 'فعال' : 'Enabled') : language === 'fa' ? 'غیرفعال' : 'Disabled'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Templates Tab */}
      {tab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {AUTOMATION_TEMPLATES.map((tpl, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4 shadow-xs"
            >
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
                  <Zap className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {language === 'fa' ? tpl.nameFa : tpl.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {language === 'fa' ? tpl.descriptionFa : tpl.description}
                </p>
              </div>
              <button
                onClick={() => handleActivateTemplate(tpl)}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold transition-colors"
              >
                {language === 'fa' ? 'فعال‌سازی الگو در فضا' : 'Use Template'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Audit Log Tab */}
      {tab === 'audit' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
          <table className="w-full text-xs text-start border-collapse">
            <thead className="bg-slate-100/80 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
              <tr>
                <th className="p-3 text-start">{language === 'fa' ? 'زمان' : 'Time'}</th>
                <th className="p-3 text-start">{language === 'fa' ? 'قانون' : 'Rule'}</th>
                <th className="p-3 text-start">{language === 'fa' ? 'تسک' : 'Item'}</th>
                <th className="p-3 text-start">{language === 'fa' ? 'نتیجه' : 'Outcome'}</th>
                <th className="p-3 text-start">{language === 'fa' ? 'جزئیات' : 'Details'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {projectLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400 italic">
                    {language === 'fa' ? 'هنوز رویدادی در گزارش ممیزی ثبت نشده است.' : 'No audit logs yet.'}
                  </td>
                </tr>
              ) : (
                projectLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 font-mono text-slate-400">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-3 font-medium text-slate-800 dark:text-slate-200">{log.ruleName}</td>
                    <td className="p-3 font-mono font-semibold text-blue-600 dark:text-blue-400">
                      {log.issueKey}
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold uppercase text-[10px]">
                        <CheckCircle2 className="w-3 h-3" /> {log.status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">{log.details}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Usage Tab */}
      {tab === 'usage' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-1">
            <div className="text-xs text-slate-400">{language === 'fa' ? 'تعداد قوانین فعال' : 'Active Rules'}</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {projectRules.filter(r => r.enabled).length} / {projectRules.length}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-1">
            <div className="text-xs text-slate-400">{language === 'fa' ? 'مجموع اجراهای موفق' : 'Total Successful Runs'}</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {totalExecutions}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-1">
            <div className="text-xs text-slate-400">{language === 'fa' ? 'سهمیه ماهانه فضا' : 'Monthly Quota Used'}</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400">
              {Math.min(100, Math.round((totalExecutions / 500) * 100))}%
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
