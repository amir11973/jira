import React, { useState } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { Sprint } from '../../types/jira';

interface CompleteSprintModalProps {
  sprint: Sprint | null;
  isOpen: boolean;
  onClose: () => void;
}

export const CompleteSprintModal: React.FC<CompleteSprintModalProps> = ({ sprint, isOpen, onClose }) => {
  const { issues, sprints, completeSprint, t, language, currentProject } = useJira();
  
  if (!isOpen || !sprint) return null;

  const sprintIssues = issues.filter(i => i.sprintId === sprint.id);
  const completedIssues = sprintIssues.filter(i => i.status === 'done');
  const openIssues = sprintIssues.filter(i => i.status !== 'done');
  
  const plannedSprints = sprints.filter(s => s.projectId === currentProject.id && s.id !== sprint.id && s.status === 'planned');

  const [destinationSprintId, setDestinationSprintId] = useState<string>(
    plannedSprints.length > 0 ? plannedSprints[0].id : 'backlog'
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    completeSprint(sprint.id, destinationSprintId === 'backlog' ? null : destinationSprintId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in duration-150">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
              {t.completeSprint}: {sprint.name}
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div className="space-y-2">
            <p className="text-slate-600 dark:text-slate-300">
              {language === 'fa' 
                ? `این اسپرینت شامل ${sprintIssues.length} تسک است:` 
                : `This sprint contains ${sprintIssues.length} issues:`}
            </p>

            <ul className="list-disc list-inside space-y-1 text-slate-500">
              <li className="text-emerald-600 dark:text-emerald-400 font-medium">
                <strong>{completedIssues.length}</strong> {language === 'fa' ? 'تسک تکمیل شده' : 'issues completed'}
              </li>
              <li className="text-amber-600 dark:text-amber-400 font-medium">
                <strong>{openIssues.length}</strong> {language === 'fa' ? 'تسک ناتمام باز' : 'open issues remaining'}
              </li>
            </ul>
          </div>

          {openIssues.length > 0 && (
            <div className="pt-2">
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {language === 'fa' ? 'انتقال تسک‌های ناتمام به:' : 'Move open issues to:'}
              </label>
              <select
                value={destinationSprintId}
                onChange={(e) => setDestinationSprintId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
              >
                {plannedSprints.map(ps => (
                  <option key={ps.id} value={ps.id}>
                    {ps.name} ({language === 'fa' ? 'اسپرینت بعدی' : 'Next sprint'})
                  </option>
                ))}
                <option value="backlog">{language === 'fa' ? 'بک‌لاگ محصول (Backlog)' : 'Product Backlog'}</option>
              </select>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-xs"
            >
              {t.completeSprint}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
