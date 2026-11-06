import React, { useState } from 'react';
import { X, Play } from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { Sprint } from '../../types/jira';

interface StartSprintModalProps {
  sprint: Sprint | null;
  isOpen: boolean;
  onClose: () => void;
}

export const StartSprintModal: React.FC<StartSprintModalProps> = ({ sprint, isOpen, onClose }) => {
  const { startSprint, t, language } = useJira();
  const [durationWeeks, setDurationWeeks] = useState(2);
  const [goal, setGoal] = useState(sprint?.goal || '');

  if (!isOpen || !sprint) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startSprint(sprint.id, durationWeeks, goal);
    onClose();
  };

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(startDate.getDate() + (durationWeeks * 7));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in duration-150">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Play className="w-5 h-5 text-emerald-600 fill-emerald-600" />
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
              {t.startSprint}: {sprint.name}
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
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t.sprint}
            </label>
            <input
              type="text"
              disabled
              value={sprint.name}
              className="w-full px-3 py-1.5 bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-md text-slate-500 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {language === 'fa' ? 'طول دوره اسپرینت' : 'Duration'}
            </label>
            <select
              value={durationWeeks}
              onChange={(e) => setDurationWeeks(parseInt(e.target.value, 10))}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
            >
              <option value={1}>{language === 'fa' ? '۱ هفته' : '1 week'}</option>
              <option value={2}>{language === 'fa' ? '۲ هفته (پیش‌فرض اسکرام)' : '2 weeks (Scrum standard)'}</option>
              <option value={3}>{language === 'fa' ? '۳ هفته' : '3 weeks'}</option>
              <option value={4}>{language === 'fa' ? '۴ هفته' : '4 weeks'}</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3 text-slate-600 dark:text-slate-400">
            <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded border border-slate-200 dark:border-slate-800">
              <span className="block text-[10px] text-slate-400">{language === 'fa' ? 'تاریخ شروع' : 'Start Date'}</span>
              <span className="font-mono">{startDate.toLocaleDateString()}</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded border border-slate-200 dark:border-slate-800">
              <span className="block text-[10px] text-slate-400">{language === 'fa' ? 'تاریخ پایان' : 'End Date'}</span>
              <span className="font-mono">{endDate.toLocaleDateString()}</span>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t.sprintGoal}
            </label>
            <textarea
              rows={3}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={language === 'fa' ? 'هدف اصلی تیم در این دوره اسپرینت...' : 'What are we aiming to achieve in this sprint?'}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-xs"
            >
              {t.startSprint}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
