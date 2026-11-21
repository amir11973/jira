import React, { useState } from 'react';
import { FileSpreadsheet, Send, CheckCircle2, ArrowRight } from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { IssueTypeIcon } from '../common/JiraIcons';

export const FormsView: React.FC = () => {
  const {
    currentProject,
    formTemplates,
    createIssue,
    setSelectedIssueId,
    setActiveView,
    showToast,
    language,
    t,
  } = useJira();

  const [selectedTemplateId, setSelectedTemplateId] = useState(formTemplates[0]?.id || 'tpl-feature');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [lastCreatedKey, setLastCreatedKey] = useState<{ id: string; key: string } | null>(null);

  const template = formTemplates.find(tpl => tpl.id === selectedTemplateId) || formTemplates[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!template) return;

    const summary = formValues.summary?.trim();
    if (!summary) return;

    const created = createIssue({
      type: template.defaultType,
      priority: template.defaultPriority,
      summary,
      description: formValues.description?.trim() || '',
      team: formValues.team || undefined,
      dueDate: formValues.dueDate || undefined,
      labels: ['form-intake', template.id.replace('tpl-', '')],
    });

    setFormValues({});
    setLastCreatedKey({ id: created.id, key: created.key });
    showToast(
      'success',
      language === 'fa'
        ? `فرم ثبت شد و تسک ${created.key} در فضای ${currentProject.key} ایجاد گردید.`
        : `Submitted! Created ${created.key} in ${currentProject.key}.`
    );
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            <span>{t.formsView}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {language === 'fa'
              ? 'فرم‌های استاندارد دریافت درخواست‌ها، گزارش باگ و رخدادهای عملیاتی برای ثبت خودکار در فضا.'
              : 'Standardized intake forms that automatically create structured work items in this space.'}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Template Selector */}
          <div className="lg:col-span-4 space-y-2">
            {formTemplates.map(tpl => {
              const isActive = tpl.id === template?.id;
              return (
                <button
                  key={tpl.id}
                  onClick={() => {
                    setSelectedTemplateId(tpl.id);
                    setFormValues({});
                    setLastCreatedKey(null);
                  }}
                  className={`w-full text-start p-3.5 rounded-xl border transition-all space-y-1 ${
                    isActive
                      ? 'bg-white dark:bg-slate-900 border-blue-500 ring-1 ring-blue-500 shadow-xs'
                      : 'bg-white/70 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IssueTypeIcon type={tpl.defaultType} className="w-4 h-4" />
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {language === 'fa' ? tpl.nameFa : tpl.name}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    {language === 'fa' ? tpl.descriptionFa : tpl.description}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Active Intake Form */}
          {template && (
            <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-2.5">
                  <IssueTypeIcon type={template.defaultType} className="w-5 h-5" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      {language === 'fa' ? template.nameFa : template.name}
                    </h2>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Space: {currentProject.key} · Type: {template.defaultType.toUpperCase()} · Priority: {template.defaultPriority.toUpperCase()}
                    </p>
                  </div>
                </div>
              </div>

              {lastCreatedKey && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {language === 'fa'
                        ? `درخواست با شناسه ${lastCreatedKey.key} ثبت شد.`
                        : `Work item ${lastCreatedKey.key} created.`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedIssueId(lastCreatedKey.id)}
                      className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                    >
                      {language === 'fa' ? 'مشاهده تسک' : 'Open item'}
                    </button>
                    <button
                      onClick={() => setActiveView('board')}
                      className="text-slate-600 dark:text-slate-300 flex items-center gap-1 hover:underline"
                    >
                      <span>{t.board}</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                {template.fields.map(field => (
                  <div key={field.id}>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {language === 'fa' ? field.labelFa : field.label}
                      {field.required && <span className="text-rose-500 ms-1">*</span>}
                    </label>
                    {field.type === 'textarea' ? (
                      <textarea
                        rows={4}
                        required={field.required}
                        value={formValues[field.id] || ''}
                        onChange={e => setFormValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500 resize-none"
                      />
                    ) : field.type === 'select' ? (
                      <select
                        required={field.required}
                        value={formValues[field.id] || ''}
                        onChange={e => setFormValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                      >
                        <option value="">{language === 'fa' ? 'انتخاب کنید...' : 'Select option...'}</option>
                        {field.options?.map(opt => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type}
                        required={field.required}
                        value={formValues[field.id] || ''}
                        onChange={e => setFormValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                      />
                    )}
                  </div>
                ))}

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md flex items-center gap-1.5 shadow-xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{language === 'fa' ? 'ارسال فرم و ایجاد تسک' : 'Submit Form'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
