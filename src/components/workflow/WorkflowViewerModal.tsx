import React, { useState } from 'react';
import { X, GitBranch, ArrowRight, ShieldAlert, CheckCircle2, Edit2 } from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { getAvailableTransitions } from '../../utils/workflowEngine';

export const WorkflowViewerModal: React.FC = () => {
  const {
    workflowViewerIssueId,
    setWorkflowViewerIssueId,
    setWorkflowReturnIssueId,
    setSelectedIssueId,
    setActiveView,
    issues,
    currentWorkflow,
    currentUser,
    language,
    t,
  } = useJira();

  const [showLabels, setShowLabels] = useState(true);

  if (!workflowViewerIssueId) return null;
  const issue = issues.find(i => i.id === workflowViewerIssueId);
  if (!issue) return null;

  const available = getAvailableTransitions(issue, currentUser, currentWorkflow, language);

  const handleEditWorkflow = () => {
    setWorkflowReturnIssueId(issue.id);
    setWorkflowViewerIssueId(null);
    setSelectedIssueId(null);
    setActiveView('workflow');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <GitBranch className="w-5 h-5 text-purple-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t.workflowViewer} — <span className="font-mono text-blue-600">{issue.key}</span>
              </h3>
              <p className="text-[11px] text-slate-400">{currentWorkflow.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={e => setShowLabels(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              <span>{t.transitionLabels}</span>
            </label>

            <button
              onClick={handleEditWorkflow}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>{t.editWorkflow}</span>
            </button>

            <button
              onClick={() => setWorkflowViewerIssueId(null)}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Diagram Canvas */}
        <div className="p-6 bg-slate-50/70 dark:bg-slate-950/70 space-y-6">
          {/* START -> Statuses flow */}
          <div className="flex flex-wrap items-center justify-center gap-4 py-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 flex items-center justify-center text-[10px] font-bold font-mono">
                START
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </div>

            {currentWorkflow.statuses.map((st, idx) => {
              const isCurrent = st.id === issue.status;
              const transitionsToThis = currentWorkflow.transitions.filter(tr => tr.toStatusId === st.id && tr.fromStatusId !== 'start');
              const ruleCount = transitionsToThis.reduce((acc, tr) => acc + tr.rules.length, 0);

              return (
                <React.Fragment key={st.id}>
                  <div
                    className={`relative px-4 py-3 rounded-xl border-2 min-w-[140px] text-center transition-all ${
                      isCurrent
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 shadow-md ring-4 ring-blue-500/15'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="text-[10px] font-mono text-slate-400 uppercase mb-0.5">
                      {st.category} {st.numericId ? `(#${st.numericId})` : ''}
                    </div>
                    <div className="text-xs font-bold uppercase text-slate-900 dark:text-white">
                      {language === 'fa' ? st.nameFa : st.name}
                    </div>
                    {isCurrent && (
                      <div className="mt-1 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                        ● {language === 'fa' ? 'وضعیت فعلی' : 'Current Status'}
                      </div>
                    )}
                    {showLabels && ruleCount > 0 && (
                      <div className="mt-1 text-[10px] font-mono text-amber-600 dark:text-amber-400">
                        {ruleCount} {language === 'fa' ? 'قانون فعال' : 'rule(s)'}
                      </div>
                    )}
                  </div>
                  {idx < currentWorkflow.statuses.length - 1 && (
                    <div className="flex flex-col items-center">
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                      {showLabels && (
                        <span className="text-[9px] font-mono text-slate-400">any</span>
                      )}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Reachable Transitions for this item */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {language === 'fa'
                ? `انتقال‌های قابل دسترس از وضعیت فعلی (${issue.status})`
                : `Available Transitions from "${issue.status}"`}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {available.map(({ transition, statusObj, restrictResult }) => (
                <div
                  key={transition.id}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      → {language === 'fa' ? statusObj.nameFa : statusObj.name}
                      <span className="text-[10px] font-mono text-slate-400 ms-1.5">
                        ({transition.fromStatusId === 'any' ? 'Any status' : transition.fromStatusId} · #{transition.numericId})
                      </span>
                    </div>
                    {!restrictResult.allowed && (
                      <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">
                        {restrictResult.reason}
                      </div>
                    )}
                  </div>
                  {restrictResult.allowed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
