import React, { useState } from 'react';
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
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { StatusCategory, WorkflowRuleKind, WorkflowTransition } from '../../types/jira';
import { WORKFLOW_RULE_CATALOG, RuleCatalogItem } from '../../utils/workflowEngine';
import { IssueTypeIcon } from '../common/JiraIcons';

export const WorkflowEditorView: React.FC = () => {
  const {
    currentProject,
    currentWorkflow,
    workflowReturnIssueId,
    setWorkflowReturnIssueId,
    setSelectedIssueId,
    setActiveView,
    addWorkflowStatus,
    addWorkflowTransition,
    addWorkflowRule,
    removeWorkflowRule,
    removeWorkflowTransition,
    showToast,
    language,
    t,
  } = useJira();

  const [viewMode, setViewMode] = useState<'diagram' | 'text'>('diagram');
  const [showLabels, setShowLabels] = useState(true);
  const [selectedTransitionId, setSelectedTransitionId] = useState<string>(
    currentWorkflow.transitions[1]?.id || currentWorkflow.transitions[0]?.id || ''
  );

  // Add Status modal
  const [isAddStatusOpen, setIsAddStatusOpen] = useState(false);
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusNameFa, setNewStatusNameFa] = useState('');
  const [newStatusCategory, setNewStatusCategory] = useState<StatusCategory>('inprogress');

  // Add Transition modal
  const [isAddTransitionOpen, setIsAddTransitionOpen] = useState(false);
  const [newTrName, setNewTrName] = useState('');
  const [newTrFrom, setNewTrFrom] = useState('any');
  const [newTrTo, setNewTrTo] = useState(currentWorkflow.statuses[0]?.id || 'todo');

  // Add Rule modal (12 rule catalog)
  const [isAddRuleOpen, setIsAddRuleOpen] = useState(false);
  const [ruleTab, setRuleTab] = useState<'all' | WorkflowRuleKind>('all');
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<RuleCatalogItem | null>(null);
  const [ruleConfig, setRuleConfig] = useState<Record<string, string>>({});

  const selectedTransition: WorkflowTransition | undefined =
    currentWorkflow.transitions.find(tr => tr.id === selectedTransitionId) ||
    currentWorkflow.transitions[0];

  const handleBackToItem = () => {
    const id = workflowReturnIssueId;
    setWorkflowReturnIssueId(null);
    setActiveView('board');
    if (id) setSelectedIssueId(id);
  };

  const handleCreateStatus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStatusName.trim()) return;
    addWorkflowStatus({
      name: newStatusName.trim(),
      nameFa: newStatusNameFa.trim() || newStatusName.trim(),
      category: newStatusCategory,
    });
    setNewStatusName('');
    setNewStatusNameFa('');
    setIsAddStatusOpen(false);
    showToast('success', language === 'fa' ? 'وضعیت جدید به گردش‌کار اضافه شد.' : 'Status added to workflow.');
  };

  const handleCreateTransition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrName.trim()) return;
    const created = addWorkflowTransition({
      name: newTrName.trim(),
      nameFa: newTrName.trim(),
      fromStatusId: newTrFrom,
      toStatusId: newTrTo,
    });
    setSelectedTransitionId(created.id);
    setNewTrName('');
    setIsAddTransitionOpen(false);
    showToast('success', language === 'fa' ? 'انتقال جدید ایجاد شد.' : 'Transition created.');
  };

  const openRulePicker = (item: RuleCatalogItem) => {
    setSelectedCatalogItem(item);
    const defaults: Record<string, string> = {};
    item.configSchema.forEach(c => {
      defaults[c.key] = c.defaultValue;
    });
    setRuleConfig(defaults);
  };

  const handleConfirmAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransition || !selectedCatalogItem) return;
    addWorkflowRule(selectedTransition.id, {
      kind: selectedCatalogItem.kind,
      type: selectedCatalogItem.type,
      label: selectedCatalogItem.name,
      labelFa: selectedCatalogItem.nameFa,
      config: ruleConfig,
    });
    setSelectedCatalogItem(null);
    setIsAddRuleOpen(false);
    showToast('success', language === 'fa' ? 'قانون به انتقال اضافه شد.' : 'Rule attached to transition.');
  };

  const filteredCatalog = WORKFLOW_RULE_CATALOG.filter(
    r => ruleTab === 'all' || r.kind === ruleTab
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/50 dark:bg-slate-950">
      {/* Top Toolbar */}
      <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 space-y-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {workflowReturnIssueId && (
              <button
                onClick={handleBackToItem}
                className="px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t.backToItem}</span>
              </button>
            )}
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-purple-600" />
                <span>{t.workflowEditor} — {currentProject.key}</span>
              </h1>
              <p className="text-[11px] text-slate-400">{currentWorkflow.name}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Diagram / Text Toggle */}
            <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-md">
              <button
                onClick={() => setViewMode('diagram')}
                className={`px-2.5 py-1 rounded font-semibold ${
                  viewMode === 'diagram'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-500'
                }`}
              >
                {t.diagramView}
              </button>
              <button
                onClick={() => setViewMode('text')}
                className={`px-2.5 py-1 rounded font-semibold ${
                  viewMode === 'text'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-500'
                }`}
              >
                {t.textView}
              </button>
            </div>

            <button
              onClick={() => setIsAddStatusOpen(true)}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-md font-semibold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.addStatus}</span>
            </button>

            <button
              onClick={() => setIsAddTransitionOpen(true)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.addTransition}</span>
            </button>
          </div>
        </div>

        {/* Shared Work Types Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
            <span className="font-semibold">
              {language === 'fa' ? 'انواع کار مشترک در این گردش‌کار:' : 'Shared work types:'}
            </span>
            {(['story', 'subtask', 'task', 'feature', 'bug', 'epic'] as const).map(wt => (
              <span key={wt} className="inline-flex items-center gap-1 capitalize text-slate-700 dark:text-slate-300">
                <IssueTypeIcon type={wt} className="w-3.5 h-3.5" />
                <span>{wt}</span>
              </span>
            ))}
          </div>

          <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={e => setShowLabels(e.target.checked)}
              className="rounded border-slate-300 text-blue-600"
            />
            <span>{t.transitionLabels}</span>
          </label>
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Diagram or Text Transitions */}
        <div className="lg:col-span-7 space-y-4">
          {viewMode === 'diagram' ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6 shadow-xs">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {language === 'fa' ? 'نمای وضعیت‌ها و انتقال‌ها' : 'Statuses & Transitions Diagram'}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 flex items-center justify-center text-[9px] font-bold font-mono shrink-0">
                  START
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                {currentWorkflow.statuses.map(st => (
                  <div
                    key={st.id}
                    className="px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 min-w-[120px]"
                  >
                    <div className="text-[10px] font-mono text-slate-400 uppercase">{st.category}</div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {language === 'fa' ? st.nameFa : st.name}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {language === 'fa' ? 'برای ویرایش قوانین روی یک انتقال کلیک کنید:' : 'Select a transition to configure rules:'}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {currentWorkflow.transitions.map(tr => {
                    const isSelected = selectedTransition?.id === tr.id;
                    return (
                      <button
                        key={tr.id}
                        onClick={() => setSelectedTransitionId(tr.id)}
                        className={`p-3 rounded-lg border text-start text-xs transition-all flex items-center justify-between ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 ring-1 ring-blue-500'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">
                            {language === 'fa' ? tr.nameFa : tr.name}
                            {showLabels && (
                              <span className="ms-1.5 font-mono text-[10px] text-slate-400">
                                #{tr.numericId}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                            {tr.fromStatusId} → {tr.toStatusId}
                          </div>
                        </div>
                        <span className="font-mono text-[11px] font-bold text-purple-600 dark:text-purple-400">
                          {tr.rules.length} {language === 'fa' ? 'قانون' : 'rules'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-xs text-start border-collapse">
                <thead className="bg-slate-100/80 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                  <tr>
                    <th className="p-3 text-start">ID</th>
                    <th className="p-3 text-start">{language === 'fa' ? 'نام انتقال' : 'Transition'}</th>
                    <th className="p-3 text-start">{language === 'fa' ? 'مبدأ → مقصد' : 'From → To'}</th>
                    <th className="p-3 text-start">{language === 'fa' ? 'قوانین' : 'Rules'}</th>
                    <th className="p-3 text-end"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {currentWorkflow.transitions.map(tr => (
                    <tr
                      key={tr.id}
                      onClick={() => setSelectedTransitionId(tr.id)}
                      className={`cursor-pointer ${
                        selectedTransition?.id === tr.id
                          ? 'bg-blue-50/70 dark:bg-blue-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="p-3 font-mono text-slate-400">#{tr.numericId}</td>
                      <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                        {language === 'fa' ? tr.nameFa : tr.name}
                      </td>
                      <td className="p-3 font-mono text-slate-500">
                        {tr.fromStatusId} → {tr.toStatusId}
                      </td>
                      <td className="p-3 font-mono">{tr.rules.length}</td>
                      <td className="p-3 text-end">
                        {tr.fromStatusId !== 'start' && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              removeWorkflowTransition(tr.id);
                            }}
                            className="text-slate-400 hover:text-rose-500 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Transition Inspector & Rules */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4 h-fit">
          {selectedTransition ? (
            <>
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-400">
                    Transition #{selectedTransition.numericId}
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {language === 'fa' ? selectedTransition.nameFa : selectedTransition.name}
                    <span className="ms-2 text-xs font-mono font-normal text-slate-500">
                      ({selectedTransition.fromStatusId} → {selectedTransition.toStatusId})
                    </span>
                  </h3>
                </div>
                {selectedTransition.fromStatusId !== 'start' && (
                  <button
                    onClick={() => {
                      setSelectedCatalogItem(null);
                      setIsAddRuleOpen(true);
                    }}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-xs font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t.addRule}</span>
                  </button>
                )}
              </div>

              <div className="space-y-2.5">
                {selectedTransition.rules.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                    {language === 'fa'
                      ? 'هیچ قانونی روی این انتقال تنظیم نشده است. با دکمه «افزودن قانون» یکی از ۱۲ قانون موتور گردش‌کار را اضافه کنید.'
                      : 'No rules attached. Click "+ Add rule" to attach Restrict, Validate, or Perform actions.'}
                  </div>
                ) : (
                  selectedTransition.rules.map(rule => (
                    <div
                      key={rule.id}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-start justify-between gap-2 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          {rule.kind === 'restrict' && <Shield className="w-3.5 h-3.5 text-amber-500" />}
                          {rule.kind === 'validate' && <CheckSquare className="w-3.5 h-3.5 text-rose-500" />}
                          {rule.kind === 'perform' && <Zap className="w-3.5 h-3.5 text-emerald-500" />}
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {language === 'fa' ? rule.labelFa : rule.label}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {Object.entries(rule.config)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(' · ')}
                        </div>
                      </div>
                      <button
                        onClick={() => removeWorkflowRule(selectedTransition.id, rule.id)}
                        className="text-slate-400 hover:text-rose-500 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Add Status Modal */}
      {isAddStatusOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateStatus}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t.addStatus}</h3>
              <button type="button" onClick={() => setIsAddStatusOpen(false)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block font-semibold mb-1">{language === 'fa' ? 'نام وضعیت (انگلیسی)' : 'Status Name (EN)'} *</label>
              <input
                type="text"
                required
                value={newStatusName}
                onChange={e => setNewStatusName(e.target.value)}
                placeholder="e.g. QA Testing"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">{language === 'fa' ? 'نام فارسی' : 'Persian Name (FA)'}</label>
              <input
                type="text"
                value={newStatusNameFa}
                onChange={e => setNewStatusNameFa(e.target.value)}
                placeholder="مثلاً تست کنترل کیفیت"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">{language === 'fa' ? 'دسته‌بندی وضعیت' : 'Status Category'}</label>
              <select
                value={newStatusCategory}
                onChange={e => setNewStatusCategory(e.target.value as StatusCategory)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                <option value="todo">To Do (Gray)</option>
                <option value="inprogress">In Progress (Blue)</option>
                <option value="done">Done (Green)</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setIsAddStatusOpen(false)} className="px-3 py-1.5 text-slate-500">
                {t.cancel}
              </button>
              <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-md">
                {t.save}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Transition Modal */}
      {isAddTransitionOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateTransition}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t.addTransition}</h3>
              <button type="button" onClick={() => setIsAddTransitionOpen(false)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block font-semibold mb-1">{language === 'fa' ? 'نام انتقال' : 'Transition Name'} *</label>
              <input
                type="text"
                required
                value={newTrName}
                onChange={e => setNewTrName(e.target.value)}
                placeholder="e.g. Ready for Release"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">{language === 'fa' ? 'از وضعیت' : 'From Status'}</label>
                <select
                  value={newTrFrom}
                  onChange={e => setNewTrFrom(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  <option value="any">Any status</option>
                  {currentWorkflow.statuses.map(s => (
                    <option key={s.id} value={s.id}>
                      {language === 'fa' ? s.nameFa : s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">{language === 'fa' ? 'به وضعیت' : 'To Status'}</label>
                <select
                  value={newTrTo}
                  onChange={e => setNewTrTo(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  {currentWorkflow.statuses.map(s => (
                    <option key={s.id} value={s.id}>
                      {language === 'fa' ? s.nameFa : s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setIsAddTransitionOpen(false)} className="px-3 py-1.5 text-slate-500">
                {t.cancel}
              </button>
              <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-md">
                {t.save}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Rule Modal (12 Rules Catalog) */}
      {isAddRuleOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden text-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t.addRule} — {selectedTransition && (language === 'fa' ? selectedTransition.nameFa : selectedTransition.name)}
              </h3>
              <button onClick={() => setIsAddRuleOpen(false)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {!selectedCatalogItem ? (
              <>
                <div className="px-5 pt-3 flex flex-wrap gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-3">
                  {[
                    { id: 'all', label: t.allRules },
                    { id: 'restrict', label: t.restrictRules },
                    { id: 'validate', label: t.validateRules },
                    { id: 'perform', label: t.performRules },
                  ].map(tabItem => (
                    <button
                      key={tabItem.id}
                      onClick={() => setRuleTab(tabItem.id as any)}
                      className={`px-3 py-1 rounded-md font-semibold ${
                        ruleTab === tabItem.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {tabItem.label}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-2">
                  {filteredCatalog.map(item => (
                    <button
                      key={item.type}
                      onClick={() => openRulePicker(item)}
                      className="w-full text-start p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-950/30 transition-all space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {language === 'fa' ? item.nameFa : item.name}
                        </span>
                        <span className="text-[10px] font-mono uppercase text-slate-400">
                          {item.kind} · {item.classicEquivalent}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {language === 'fa' ? item.purposeFa : item.purpose}
                      </p>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <form onSubmit={handleConfirmAddRule} className="p-5 space-y-4">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                  <div className="font-bold text-slate-900 dark:text-white">
                    {language === 'fa' ? selectedCatalogItem.nameFa : selectedCatalogItem.name}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {language === 'fa' ? selectedCatalogItem.purposeFa : selectedCatalogItem.purpose}
                  </p>
                </div>

                {selectedCatalogItem.configSchema.map(cfg => (
                  <div key={cfg.key}>
                    <label className="block font-semibold mb-1">
                      {language === 'fa' ? cfg.labelFa : cfg.label}
                    </label>
                    {cfg.options ? (
                      <select
                        value={ruleConfig[cfg.key] || cfg.defaultValue}
                        onChange={e => setRuleConfig(prev => ({ ...prev, [cfg.key]: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                      >
                        {cfg.options.map(o => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={ruleConfig[cfg.key] ?? cfg.defaultValue}
                        onChange={e => setRuleConfig(prev => ({ ...prev, [cfg.key]: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                      />
                    )}
                  </div>
                ))}

                <div className="flex justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCatalogItem(null)}
                    className="px-3 py-1.5 text-slate-500"
                  >
                    ← {language === 'fa' ? 'بازگشت به فهرست قوانین' : 'Back to catalog'}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-md"
                  >
                    {t.addRule}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
