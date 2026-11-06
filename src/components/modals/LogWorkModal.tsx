import React, { useState } from 'react';
import { X, Clock } from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { formatMinutes } from '../../utils/i18n';

interface LogWorkModalProps {
  issueId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const LogWorkModal: React.FC<LogWorkModalProps> = ({ issueId, isOpen, onClose }) => {
  const { issues, addWorklog, t, language } = useJira();
  const issue = issues.find(i => i.id === issueId);

  const [hours, setHours] = useState('1');
  const [minutes, setMinutes] = useState('30');
  const [comment, setComment] = useState('');

  if (!isOpen || !issue) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const totalMinutes = (parseInt(hours || '0', 10) * 60) + parseInt(minutes || '0', 10);
    if (totalMinutes > 0) {
      addWorklog(issueId, totalMinutes, comment.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in duration-150">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
              {t.logWork}: <span className="font-mono text-blue-600 dark:text-blue-400">{issue.key}</span>
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs space-y-1">
            <div className="text-slate-500">{t.summary}:</div>
            <div className="font-medium text-slate-800 dark:text-slate-200 truncate">{issue.summary}</div>
            <div className="flex items-center gap-3 text-slate-500 pt-1">
              <span>{t.remaining}: <strong className="text-slate-700 dark:text-slate-300 font-mono">{formatMinutes(issue.remainingEstimateMinutes, language)}</strong></span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {t.timeSpent} *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                    {language === 'fa' ? 'ساعت' : 'hours'}
                  </span>
                </div>
              </div>
              <div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                    {language === 'fa' ? 'دقیقه' : 'min'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {t.workDescription}
            </label>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={language === 'fa' ? 'توضیحات کاری که انجام داده‌اید...' : 'Brief summary of what was accomplished...'}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-xs"
            >
              {t.logWork}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
