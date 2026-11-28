import React, { useState } from 'react';
import { AlertTriangle, KeyRound, Layers, Loader2, LogOut, RefreshCw } from 'lucide-react';
import { useJira } from '../../context/JiraContext';

const shell =
  'min-h-screen w-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100';

/** Shown while the session cookie is validated and the workspace is loaded from the server. */
export const BootScreen: React.FC = () => {
  const { language } = useJira();
  return (
    <div className={shell} role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
          <Layers className="w-7 h-7" />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{language === 'fa' ? 'در حال بارگذاری فضای کاری…' : 'Loading your workspace…'}</span>
        </div>
      </div>
    </div>
  );
};

/** Shown when the server cannot be reached / returns an unexpected error during bootstrap. */
export const BootErrorScreen: React.FC = () => {
  const { bootError, retryBoot, language } = useJira();
  const fa = language === 'fa';
  return (
    <div className={shell}>
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-2xl p-6 shadow-xl space-y-4 text-center">
        <AlertTriangle className="w-10 h-10 text-rose-600 mx-auto" />
        <h1 className="text-base font-bold">{fa ? 'بارگذاری فضای کاری ممکن نشد' : 'Could not load the workspace'}</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 break-words">{bootError}</p>
        <button
          onClick={retryBoot}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
        >
          <RefreshCw className="w-4 h-4" />
          {fa ? 'تلاش مجدد' : 'Try again'}
        </button>
      </div>
    </div>
  );
};

/** Forced password change (first sign-in with a temporary / admin-set password). */
export const ChangePasswordView: React.FC = () => {
  const { changePassword, logout, currentUser, language } = useJira();
  const fa = language === 'fa';
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== confirm) {
      setError(fa ? 'رمز عبور جدید و تکرار آن یکسان نیستند.' : 'The new passwords do not match.');
      return;
    }
    setBusy(true);
    const res = await changePassword(current, next);
    setBusy(false);
    if (!res.ok) setError(res.error || (fa ? 'تغییر رمز ناموفق بود.' : 'Could not change the password.'));
  };

  const input =
    'w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 text-xs';

  return (
    <div className={shell}>
      <form
        onSubmit={submit}
        className="max-w-sm w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl space-y-4"
      >
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-blue-600" />
          <h1 className="text-base font-bold">{fa ? 'تعیین رمز عبور جدید' : 'Set a new password'}</h1>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {fa
            ? `برای ادامه (${currentUser?.email}) باید رمز عبور موقت خود را تغییر دهید. حداقل ۸ نویسه شامل حرف و عدد.`
            : `Before continuing (${currentUser?.email}) you must replace your temporary password. At least 8 characters with a letter and a digit.`}
        </p>
        {error && (
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-lg text-xs text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder={fa ? 'رمز عبور فعلی' : 'Current password'}
          value={current}
          onChange={e => setCurrent(e.target.value)}
          className={input}
        />
        <input
          type="password"
          required
          autoComplete="new-password"
          placeholder={fa ? 'رمز عبور جدید' : 'New password'}
          value={next}
          onChange={e => setNext(e.target.value)}
          className={input}
        />
        <input
          type="password"
          required
          autoComplete="new-password"
          placeholder={fa ? 'تکرار رمز عبور جدید' : 'Repeat new password'}
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          className={input}
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-xs font-semibold"
        >
          {busy ? (fa ? 'در حال ذخیره…' : 'Saving…') : fa ? 'ذخیره و ادامه' : 'Save and continue'}
        </button>
        <button
          type="button"
          onClick={() => void logout()}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          <LogOut className="w-3.5 h-3.5" />
          {fa ? 'خروج' : 'Sign out'}
        </button>
      </form>
    </div>
  );
};
