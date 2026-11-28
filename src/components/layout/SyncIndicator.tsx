import React from 'react';
import { Cloud, CloudOff, Loader2, AlertTriangle } from 'lucide-react';
import { useJira } from '../../context/JiraContext';

/** Shows whether local edits have been persisted to the server. */
export const SyncIndicator: React.FC = () => {
  const { syncStatus, retrySync, language } = useJira();
  const fa = language === 'fa';

  let icon = <Cloud className="w-4 h-4" />;
  let label = fa ? 'ذخیره شد' : 'Saved';
  let tone = 'text-slate-400 dark:text-slate-500';
  let title = syncStatus.lastSavedAt
    ? `${fa ? 'آخرین ذخیره' : 'Last saved'}: ${new Date(syncStatus.lastSavedAt).toLocaleTimeString()}`
    : fa
    ? 'همه تغییرات روی سرور ذخیره شده‌اند'
    : 'All changes are stored on the server';

  if (syncStatus.state === 'saving') {
    icon = <Loader2 className="w-4 h-4 animate-spin" />;
    label = fa ? 'در حال ذخیره…' : 'Saving…';
    tone = 'text-blue-600 dark:text-blue-400';
    title = fa ? `${syncStatus.pending} تغییر در حال ذخیره` : `${syncStatus.pending} change(s) being saved`;
  } else if (syncStatus.state === 'offline') {
    icon = <CloudOff className="w-4 h-4" />;
    label = fa ? 'آفلاین' : 'Offline';
    tone = 'text-amber-600 dark:text-amber-400';
    title =
      (syncStatus.lastError || (fa ? 'اتصال برقرار نیست' : 'Connection lost')) +
      (fa ? ' — برای تلاش مجدد کلیک کنید' : ' — click to retry');
  } else if (syncStatus.state === 'error') {
    icon = <AlertTriangle className="w-4 h-4" />;
    label = fa ? 'خطا در ذخیره' : 'Save failed';
    tone = 'text-rose-600 dark:text-rose-400';
    title = (syncStatus.lastError || '') + (fa ? ' — برای تلاش مجدد کلیک کنید' : ' — click to retry');
  }

  const clickable = syncStatus.state === 'offline' || syncStatus.state === 'error';

  return (
    <button
      type="button"
      onClick={clickable ? retrySync : undefined}
      title={title}
      aria-live="polite"
      className={`hidden md:flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-md ${tone} ${
        clickable ? 'hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer' : 'cursor-default'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
};
