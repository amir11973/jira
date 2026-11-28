import React, { useState } from 'react';
import { 
  Layers, Lock, Mail, ArrowRight, ArrowLeft, 
  Check, Shield, Users, Sparkles, Moon, Sun, Globe 
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { User } from '../../types/jira';
import { UserAvatar } from '../common/JiraIcons';

export const LoginView: React.FC = () => {
  const {
    authConfig, login, language, toggleLanguage,
    theme, toggleTheme, t, showToast,
  } = useJira();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const signIn = async (mail: string, pass: string) => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    const result = await login(mail.trim(), pass);
    if (!result.ok) {
      setError(result.error || (language === 'fa' ? 'ورود ناموفق بود' : 'Sign-in failed'));
      showToast('error', result.error || 'Sign-in failed');
    }
    setSubmitting(false);
  };

  const handleManualLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError(language === 'fa' ? 'ایمیل و رمز عبور را وارد نمایید' : 'Please enter your email and password');
      return;
    }
    void signIn(email, password);
  };

  return (
    <div className="min-h-screen w-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none">
      {/* Top Bar with Language and Theme */}
      <header className="h-14 px-6 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
            <Layers className="w-5 h-5" />
          </div>
          <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white">
            {t.appName}
          </span>
          <span className="hidden sm:inline-block text-[11px] px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-mono font-medium">
            Agile Enterprise
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Language toggle */}
          <button
            onClick={toggleLanguage}
            title={language === 'fa' ? 'Switch to English' : 'تغییر به زبان فارسی'}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          >
            <Globe className="w-4 h-4 text-slate-500" />
            <span className="font-mono text-xs uppercase">{language === 'fa' ? 'FA' : 'EN'}</span>
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Login Content */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Direct Credentials Form (5 cols) */}
          <div className={`lg:col-span-5 ${authConfig.demoMode ? '' : 'lg:col-start-4'} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6`}>
            <div className="space-y-1">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                {t.loginTitle}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.loginSubtitle}
              </p>
            </div>

            {error && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                {error}
              </div>
            )}

            <form onSubmit={handleManualLogin} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.emailAddress}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError('');
                    }}
                    placeholder="name@company.com"
                    autoComplete="username"
                    className="w-full ps-9 pe-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.password}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full ps-9 pe-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span>{submitting ? (language === 'fa' ? 'در حال ورود…' : 'Signing in…') : t.loginButton}</span>
                {language === 'fa' ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              </button>
            </form>

            {authConfig.demoMode && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 text-center">
                {language === 'fa'
                  ? 'نسخه آزمایشی: رمز عبور همه کاربران نمونه «password123» است.'
                  : 'Demo environment: every sample user uses the password "password123".'}
              </div>
            )}
          </div>

          {/* Right Column: demo quick sign-in (only when the server runs in demo mode) */}
          {authConfig.demoMode && (
          <div className="lg:col-span-7 space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-xs uppercase tracking-wider">
                <Users className="w-4 h-4" />
                <span>{t.quickLogin}</span>
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t.orLoginAs}
              </h2>
            </div>

            {/* Grid of Team Member Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {authConfig.demoAccounts.map((account) => { const user = account as unknown as User; return (
                <button
                  key={user.id}
                  onClick={() => void signIn(user.email, 'password123')}
                  disabled={submitting}
                  className="flex items-center gap-3 p-3 bg-white dark:bg-slate-900 hover:bg-blue-50/60 dark:hover:bg-blue-950/40 border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 rounded-xl transition-all shadow-xs text-start group cursor-pointer"
                >
                  <UserAvatar user={user} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-xs text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                      {language === 'fa' ? user.nameFa : user.name}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate font-mono">
                      {user.email}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {user.role.replace('_', ' ')}
                      </span>
                      {user.department && (
                        <span className="text-[9px] text-slate-400 truncate">
                          · {user.department}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 text-blue-600 transition-opacity">
                    {language === 'fa' ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                  </div>
                </button>
              ); })}
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-slate-400 border-t border-slate-200 dark:border-slate-800">
        JiraFlow Agile Project Management Suite · v2.4
      </footer>
    </div>
  );
};
