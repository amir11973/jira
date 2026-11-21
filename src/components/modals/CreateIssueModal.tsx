import React, { useState, useEffect } from 'react';
import { X, Flag } from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { IssueType, Priority } from '../../types/jira';
import { IssueTypeIcon, PriorityIcon } from '../common/JiraIcons';

export const CreateIssueModal: React.FC = () => {
  const {
    isCreateModalOpen,
    setIsCreateModalOpen,
    createModalDefaultSprintId,
    createIssue,
    currentProject,
    users,
    epics,
    sprints,
    t,
    language,
  } = useJira();

  const [issueType, setIssueType] = useState<IssueType>('story');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [epicId, setEpicId] = useState<string>('');
  const [sprintId, setSprintId] = useState<string>('');
  const [storyPoints, setStoryPoints] = useState<number>(3);
  const [labels, setLabels] = useState<string>('frontend, api');
  const [component, setComponent] = useState<string>('Core Engine');
  const [startDate, setStartDate] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [flagged, setFlagged] = useState<boolean>(false);

  useEffect(() => {
    if (isCreateModalOpen) {
      if (currentProject.features?.sprints === false) {
        setSprintId('');
      } else if (createModalDefaultSprintId !== undefined) {
        setSprintId(createModalDefaultSprintId || '');
      } else {
        const active = sprints.find(s => s.projectId === currentProject.id && s.status === 'active');
        setSprintId(active ? active.id : '');
      }
    }
  }, [isCreateModalOpen, createModalDefaultSprintId, sprints, currentProject.id, currentProject.features?.sprints]);

  if (!isCreateModalOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) return;

    createIssue({
      type: issueType,
      summary: summary.trim(),
      description: description.trim(),
      priority,
      assigneeId: assigneeId || null,
      epicId: epicId || null,
      sprintId: currentProject.features?.sprints === false ? null : sprintId ? sprintId : null,
      storyPoints: Number(storyPoints) || 0,
      labels: labels.split(',').map(s => s.trim()).filter(Boolean),
      components: component ? [component] : [],
      startDate: startDate || undefined,
      dueDate: dueDate || undefined,
      flagged,
    });

    setSummary('');
    setDescription('');
    setStartDate('');
    setDueDate('');
    setFlagged(false);
    setIsCreateModalOpen(false);
  };

  const projectEpics = epics.filter(e => e.projectId === currentProject.id);
  const projectSprints = sprints.filter(s => s.projectId === currentProject.id && s.status !== 'completed');

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">{t.createIssue}</h3>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
              {currentProject.key}
            </span>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(false)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {language === 'fa' ? 'نوع تسک (Work Type)' : 'Work Type'} *
              </label>
              <div className="relative">
                <select
                  value={issueType}
                  onChange={e => setIssueType(e.target.value as IssueType)}
                  className="w-full ps-8 pe-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500 font-medium text-slate-800 dark:text-slate-200"
                >
                  <option value="story">{t.storyType}</option>
                  <option value="feature">{t.featureType}</option>
                  <option value="task">{t.taskType}</option>
                  <option value="bug">{t.bugType}</option>
                  <option value="epic">{t.epicType}</option>
                </select>
                <div className="absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <IssueTypeIcon type={issueType} className="w-4 h-4" />
                </div>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.priority} *</label>
              <div className="relative">
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value as Priority)}
                  className="w-full ps-8 pe-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500 font-medium text-slate-800 dark:text-slate-200"
                >
                  <option value="highest">{t.highest}</option>
                  <option value="high">{t.high}</option>
                  <option value="medium">{t.medium}</option>
                  <option value="low">{t.low}</option>
                  <option value="lowest">{t.lowest}</option>
                </select>
                <div className="absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <PriorityIcon priority={priority} className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.summary} *</label>
            <input
              type="text"
              required
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder={language === 'fa' ? 'عنوان تسک به صورت واضح و گویا...' : 'Enter a clear summary...'}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.description}</label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={
                language === 'fa'
                  ? 'شرح نیازمندی‌ها، شرایط پذیرش (Acceptance Criteria) و جزئیات...'
                  : 'Describe the work, acceptance criteria, or repro steps...'
              }
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500 resize-none text-slate-800 dark:text-slate-200"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.assignee}</label>
              <select
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
              >
                <option value="">{language === 'fa' ? 'بدون مسئول (Unassigned)' : 'Unassigned'}</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {language === 'fa' ? u.nameFa : u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.storyPoints}</label>
              <select
                value={storyPoints}
                onChange={e => setStoryPoints(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500 font-mono"
              >
                {[1, 2, 3, 5, 8, 13, 21].map(pt => (
                  <option key={pt} value={pt}>
                    {pt} pts
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {currentProject.features?.sprints !== false && (
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.sprint}</label>
                <select
                  value={sprintId}
                  onChange={e => setSprintId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                >
                  <option value="">{language === 'fa' ? 'بک‌لاگ محصول (بدون اسپرینت)' : 'Product Backlog (No Sprint)'}</option>
                  {projectSprints.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.status === 'active' ? `(${language === 'fa' ? 'فعال' : 'Active'})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.epic}</label>
              <select
                value={epicId}
                onChange={e => setEpicId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
              >
                <option value="">{language === 'fa' ? 'بدون اپیک' : 'None (No Epic)'}</option>
                {projectEpics.map(e => (
                  <option key={e.id} value={e.id}>
                    {language === 'fa' ? e.nameFa : e.name} ({e.key})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.startDate}</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.dueDate}</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
              />
            </div>
            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={flagged}
                  onChange={e => setFlagged(e.target.checked)}
                  className="rounded border-slate-300 text-amber-600"
                />
                <Flag className="w-3.5 h-3.5 text-amber-500" />
                <span>{t.flagged}</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t.labels} ({language === 'fa' ? 'با کاما جدا کنید' : 'comma-separated'})
              </label>
              <input
                type="text"
                value={labels}
                onChange={e => setLabels(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.components}</label>
              <input
                type="text"
                value={component}
                onChange={e => setComponent(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="px-5 py-2 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-xs transition-colors"
            >
              {t.createIssue}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
