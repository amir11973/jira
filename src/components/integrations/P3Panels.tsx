/** Integration Center tabs for source control, webhooks / events and connection health. All data is server-owned. */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Copy, GitBranch, HeartPulse, Loader2, RefreshCw, RotateCcw, ShieldAlert, Trash2, Webhook } from 'lucide-react';
import { api, apiRequest, describeApiError } from '../../services/api';
import { useJira } from '../../context/JiraContext';
import { formatLocalizedDateTime, formatLocalizedNumber } from '../../utils/i18n';

type Notify = (type: 'success' | 'error', message: string) => void;
type Provider = 'jira' | 'confluence' | 'github' | 'gitlab';

interface Connection {
  id: string;
  provider: Provider;
  serverUrl: string;
  connected: boolean;
  healthStatus: 'healthy' | 'degraded' | 'unreachable' | 'needs_reauth';
  healthMessage?: string;
  lastHealthCheckAt: string | null;
  account: { displayName: string };
  tokenExpiresAt: string | null;
  tokenExpired: boolean;
  canRefreshToken: boolean;
  lastRefreshAt: string | null;
  lastRefreshError: string | null;
  rateLimit: { limit?: number; remaining?: number; resetAt?: string | null } | null;
}

interface Repo {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  enabled: boolean;
  syncProblem: string | null;
  sync: {
    status?: 'ok' | 'error' | 'running';
    lastSyncedAt?: string;
    error?: string | null;
    unavailable?: string[];
    counts?: Record<string, number>;
  } | null;
  openVulnerabilities: number;
}

interface ScmItem {
  kind: string;
  repoId: string;
  repo?: string;
  extId: string;
  state: string | null;
  issueKeys: string[];
  data: Record<string, string | number | undefined>;
}

interface Endpoint {
  id: string;
  provider: Provider;
  name: string;
  repoId: string | null;
  enabled: boolean;
  lastDeliveryAt: string | null;
  deliveryCount: number;
  path: string;
}

interface InboundEvent {
  id: number;
  provider: Provider;
  eventType: string;
  status: 'received' | 'retrying' | 'processed' | 'ignored' | 'failed';
  attempts: number;
  error: string | null;
  result: string | null;
  receivedAt: string;
}

interface HealthCheck {
  ts: string;
  status: Connection['healthStatus'];
  latencyMs: number | null;
  message: string | null;
}

interface SyncedLink {
  id: string;
  provider: string;
  externalKey: string;
  localEntityType: string;
  missingInSource?: boolean;
  pushError?: string | null;
  bidirectional?: boolean;
}

const card = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3';
const input = 'w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-xs';
const primary = 'px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold text-xs whitespace-nowrap disabled:opacity-50';
const secondary =
  'px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md font-semibold text-xs whitespace-nowrap disabled:opacity-50';
const th = 'p-2 text-start font-semibold text-slate-500';
const td = 'p-2 align-top';

const TONE: Record<string, string> = {
  healthy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  processed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  degraded: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  retrying: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  received: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  ignored: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};
const Badge: React.FC<{ value: string }> = ({ value }) => (
  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap ${TONE[value] || 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'}`}>
    {value.replace('_', ' ')}
  </span>
);

function usePanel(notify: Notify) {
  const { language, currentUser } = useJira();
  const isFa = language === 'fa';
  const t = (en: string, fa: string) => (isFa ? fa : en);
  const when = (v: string | null | undefined) => (v ? formatLocalizedDateTime(v, language) : '—');
  const num = (v: number) => formatLocalizedNumber(v, language);
  const isManager = currentUser?.role === 'admin' || currentUser?.role === 'product_owner';
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, action: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    try {
      await action();
      if (success) notify('success', success);
      return true;
    } catch (err) {
      notify('error', describeApiError(err));
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { t, when, num, isManager, busy, run };
}

/** Polls while the tab is open so background jobs become visible without a manual refresh. */
function usePolled<T>(url: string | null, every = 5000): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(v => v + 1), []);
  useEffect(() => {
    if (!url) return undefined;
    let live = true;
    const load = () =>
      api
        .get<T>(url)
        .then(d => {
          if (live) {
            setData(d);
            setError(null);
          }
        })
        .catch(err => live && setError(describeApiError(err)));
    void load();
    const timer = setInterval(load, every);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [url, every, tick]);
  return { data, error, reload };
}

const ManagersOnly: React.FC<{ text: string }> = ({ text }) => (
  <div className={`${card} text-xs text-slate-500 flex items-center gap-2`}>
    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
    <span>{text}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Source control
// ---------------------------------------------------------------------------

export const SourceControlPanel: React.FC<{ notify: Notify }> = ({ notify }) => {
  const { t, when, num, isManager, busy, run } = usePanel(notify);
  const connections = usePolled<{ connections: Connection[] }>('/api/integrations/connections');
  const repos = usePolled<{ repositories: Repo[] }>('/api/scm/repositories');
  const [kind, setKind] = useState<'pr' | 'deployment' | 'vulnerability' | 'branch' | 'commit'>('pr');
  const items = usePolled<{ items: ScmItem[] }>(`/api/scm/items?kind=${kind}&limit=50`);
  const summary = usePolled<{ open: number; bySeverity: Record<string, number> }>('/api/scm/vulnerabilities/summary', 15000);
  const [provider, setProvider] = useState<'github' | 'gitlab'>('github');
  const [apiUrl, setApiUrl] = useState('');
  const [token, setToken] = useState('');
  const scm = (connections.data?.connections || []).filter(c => c.provider === 'github' || c.provider === 'gitlab');

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(
      'connect',
      () => api.post('/api/integrations/scm/connect', { provider, apiUrl: apiUrl.trim() || undefined, token }),
      t('Account connected. Repository sync is queued.', 'حساب متصل شد و همگام‌سازی مخازن در صف قرار گرفت.')
    );
    if (ok) {
      setToken('');
      connections.reload();
      repos.reload();
    }
  };

  const tabs: Array<[typeof kind, string]> = [
    ['pr', t('Pull requests', 'درخواست‌های ادغام')],
    ['branch', t('Branches', 'شاخه‌ها')],
    ['commit', t('Commits', 'کامیت‌ها')],
    ['deployment', t('Deployments', 'استقرارها')],
    ['vulnerability', t('Vulnerabilities', 'آسیب‌پذیری‌ها')],
  ];

  return (
    <div className="space-y-4 text-xs">
      <div className={card}>
        <h2 className="text-sm font-bold flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-blue-600" />
          {t('Source control accounts', 'حساب‌های کنترل نسخه')}
        </h2>
        {scm.length === 0 && <p className="text-slate-500">{t('No GitHub or GitLab account is connected.', 'هیچ حساب GitHub یا GitLab متصل نیست.')}</p>}
        {scm.map(c => (
          <div key={c.id} className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-bold uppercase">{c.provider}</span>
            <Badge value={c.healthStatus} />
            <span>{c.account.displayName}</span>
            <span className="text-slate-400 font-mono break-all">{c.serverUrl}</span>
            {isManager && (
              <button
                className={secondary}
                disabled={busy !== null}
                onClick={() => {
                  if (!window.confirm(t(`Disconnect ${c.provider}? Synced links stay on work items.`, `اتصال ${c.provider} قطع شود؟`))) return;
                  void run('disconnect', () => api.del(`/api/integrations/connections/${c.provider}`)).then(() => connections.reload());
                }}
              >
                {t('Disconnect', 'قطع اتصال')}
              </button>
            )}
          </div>
        ))}
        {isManager ? (
          <form onSubmit={connect} className="grid gap-2 md:grid-cols-[140px_1fr_1fr_auto] items-end pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="space-y-1">
              <span className="text-slate-500">{t('Provider', 'سرویس')}</span>
              <select className={input} value={provider} onChange={e => setProvider(e.target.value as 'github' | 'gitlab')}>
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-slate-500">{t('API address (blank = cloud)', 'نشانی API (خالی = ابری)')}</span>
              <input
                className={input}
                dir="ltr"
                value={apiUrl}
                onChange={e => setApiUrl(e.target.value)}
                placeholder={provider === 'github' ? 'https://api.github.com' : 'https://gitlab.com'}
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500">{t('Access token (read access)', 'توکن دسترسی (فقط خواندن)')}</span>
              <input className={input} dir="ltr" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} />
            </label>
            <button className={primary} disabled={!token || busy !== null}>
              {busy === 'connect' ? <Loader2 className="w-4 h-4 animate-spin" /> : t('Connect', 'اتصال')}
            </button>
          </form>
        ) : (
          <p className="text-slate-500">{t('Only an administrator or product owner can connect accounts.', 'فقط مدیر یا مالک محصول می‌تواند حساب متصل کند.')}</p>
        )}
      </div>

      <div className={card}>
        <h3 className="font-bold">{t('Repositories', 'مخازن')}</h3>
        {repos.error && <p className="text-rose-600">{repos.error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className={th}>{t('Repository', 'مخزن')}</th>
                <th className={th}>{t('Sync', 'همگام‌سازی')}</th>
                <th className={th}>{t('Open alerts', 'هشدارهای باز')}</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(repos.data?.repositories || []).map(r => (
                <tr key={r.id}>
                  <td className={td}>
                    <div className="font-mono font-bold">{r.name}</div>
                    <div className="text-slate-400 font-mono break-all">{r.baseUrl}</div>
                  </td>
                  <td className={td}>
                    {r.syncProblem ? (
                      <span className="text-slate-500">{r.syncProblem}</span>
                    ) : r.sync ? (
                      <div className="space-y-1">
                        <Badge value={r.sync.status || 'received'} /> <span className="text-slate-500">{when(r.sync.lastSyncedAt)}</span>
                        {r.sync.error && <div className="text-rose-600">{r.sync.error}</div>}
                        {!!r.sync.unavailable?.length && (
                          <div className="text-amber-700 dark:text-amber-300">
                            {t('Token cannot read:', 'دسترسی توکن کافی نیست:')} {r.sync.unavailable.join(', ')}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-500">{t('Not synced yet', 'هنوز همگام نشده')}</span>
                    )}
                  </td>
                  <td className={`${td} tabular-nums font-bold ${r.openVulnerabilities ? 'text-rose-600' : ''}`}>{num(r.openVulnerabilities)}</td>
                  <td className={td}>
                    <button
                      className={secondary}
                      disabled={Boolean(r.syncProblem) || !r.enabled || busy !== null}
                      onClick={() => void run(`sync-${r.id}`, () => api.post(`/api/scm/repositories/${r.id}/sync`), t('Sync queued.', 'در صف قرار گرفت.')).then(() => repos.reload())}
                    >
                      <RefreshCw className="w-3.5 h-3.5 inline me-1" />
                      {t('Sync now', 'همگام‌سازی')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-slate-500">
          {t(
            'Add repositories under a space\'s Development tab. Work item keys in branch names, pull request titles and commit messages create links automatically.',
            'مخازن را در بخش Development فضا اضافه کنید. کلید کار در نام شاخه، عنوان درخواست ادغام و پیام کامیت پیوند می‌سازد.'
          )}
        </p>
      </div>

      <div className={card}>
        <div className="flex flex-wrap items-center gap-1.5">
          {tabs.map(([id, label]) => (
            <button key={id} onClick={() => setKind(id)} className={kind === id ? primary : secondary}>
              {label}
            </button>
          ))}
          {summary.data && summary.data.open > 0 && (
            <span className="ms-auto flex items-center gap-1.5 text-rose-600 font-semibold">
              <ShieldAlert className="w-4 h-4" />
              {['critical', 'high', 'medium', 'low'].filter(s => summary.data!.bySeverity[s]).map(s => `${num(summary.data!.bySeverity[s])} ${s}`).join(' · ')}
            </span>
          )}
        </div>
        {items.error && <p className="text-rose-600">{items.error}</p>}
        {(items.data?.items || []).length === 0 ? (
          <p className="text-slate-500">{t('Nothing synced yet.', 'هنوز داده‌ای همگام نشده است.')}</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.data!.items.map(i => {
              const d = i.data;
              const title =
                i.kind === 'pr' ? `#${d.number} ${d.title}`
                : i.kind === 'branch' ? String(d.name)
                : i.kind === 'commit' ? `${String(d.sha).slice(0, 7)} ${String(d.message).split('\n')[0]}`
                : i.kind === 'deployment' ? `${d.environment} · ${String(d.sha).slice(0, 7)}`
                : `${d.package}: ${d.summary}`;
              const state = i.kind === 'pr' && d.deployedAt ? 'deployed' : i.kind === 'vulnerability' ? `${d.severity} · ${i.state}` : i.state || '';
              return (
                <li key={`${i.repoId}-${i.extId}`} className="py-2 flex flex-wrap items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase">{state}</span>
                  {d.url ? (
                    <a href={String(d.url)} target="_blank" rel="noreferrer noopener" className="text-blue-600 hover:underline break-all">
                      {title}
                    </a>
                  ) : (
                    <span className="break-all">{title}</span>
                  )}
                  <span className="text-slate-400 font-mono">{i.repo}</span>
                  {i.issueKeys.map(k => (
                    <span key={k} className="font-mono font-bold text-indigo-600">{k}</span>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Webhooks and inbound events
// ---------------------------------------------------------------------------

export const WebhooksPanel: React.FC<{ notify: Notify }> = ({ notify }) => {
  const { t, when, num, isManager, busy, run } = usePanel(notify);
  const hooks = usePolled<{ webhooks: Endpoint[] }>(isManager ? '/api/integrations/webhooks' : null, 10000);
  const [statusFilter, setStatusFilter] = useState('');
  const events = usePolled<{ events: InboundEvent[] }>(isManager ? `/api/integrations/events?limit=50${statusFilter ? `&status=${statusFilter}` : ''}` : null);
  const repos = usePolled<{ repositories: Repo[] }>('/api/scm/repositories', 30000);
  const [provider, setProvider] = useState<Provider>('github');
  const [name, setName] = useState('');
  const [repoId, setRepoId] = useState('');
  const [issued, setIssued] = useState<{ url: string; secret: string; provider: Provider } | null>(null);
  const [payload, setPayload] = useState<{ id: number; text: string } | null>(null);

  if (!isManager) return <ManagersOnly text={t('Webhooks are managed by administrators and product owners.', 'مدیریت وب‌هوک‌ها با مدیر یا مالک محصول است.')} />;

  const howTo: Record<Provider, string> = {
    github: t('Repository settings > Webhooks: paste the URL and secret, content type application/json. Events: pushes, branch create/delete, pull requests, deployment statuses, Dependabot alerts.', 'در تنظیمات مخزن، نشانی و رمز را وارد کنید.'),
    gitlab: t('Project settings > Webhooks: paste the URL, use the secret as "Secret token". Events: push, merge request, deployment.', 'در تنظیمات پروژه، رمز را به عنوان Secret token وارد کنید.'),
    jira: t('Jira webhook: use the URL and set the secret (signed deliveries). Automation rules can instead send the header X-JF-Webhook-Token.', 'در وب‌هوک Jira نشانی و رمز را وارد کنید.'),
    confluence: t('Confluence webhook or automation: use the URL with the secret, or send the header X-JF-Webhook-Token.', 'در وب‌هوک Confluence نشانی و رمز را وارد کنید.'),
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await run('create', async () => {
      const res = await api.post<{ endpoint: Endpoint; secret: string }>('/api/integrations/webhooks', { provider, name, repoId: repoId || undefined });
      setIssued({ url: `${window.location.origin}${res.endpoint.path}`, secret: res.secret, provider });
      setName('');
      hooks.reload();
    });
  };

  const copy = (text: string) =>
    navigator.clipboard?.writeText(text).then(
      () => notify('success', t('Copied.', 'کپی شد.')),
      () => notify('error', t('Copy failed; select the text instead.', 'کپی ناموفق بود.'))
    );

  return (
    <div className="space-y-4 text-xs">
      <div className={card}>
        <h2 className="text-sm font-bold flex items-center gap-2">
          <Webhook className="w-4 h-4 text-blue-600" />
          {t('Webhook endpoints', 'نقاط دریافت وب‌هوک')}
        </h2>
        <form onSubmit={create} className="grid gap-2 md:grid-cols-[140px_1fr_1fr_auto] items-end">
          <label className="space-y-1">
            <span className="text-slate-500">{t('Source', 'منبع')}</span>
            <select className={input} value={provider} onChange={e => { setProvider(e.target.value as Provider); setRepoId(''); }}>
              <option value="github">GitHub</option>
              <option value="gitlab">GitLab</option>
              <option value="jira">Jira</option>
              <option value="confluence">Confluence</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-slate-500">{t('Name', 'نام')}</span>
            <input className={input} value={name} onChange={e => setName(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-slate-500">{t('Repository (optional)', 'مخزن (اختیاری)')}</span>
            <select className={input} value={repoId} onChange={e => setRepoId(e.target.value)} disabled={provider !== 'github' && provider !== 'gitlab'}>
              <option value="">{t('Any connected repository', 'هر مخزن متصل')}</option>
              {(repos.data?.repositories || []).filter(r => r.provider === provider).map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
          <button className={primary} disabled={!name.trim() || busy !== null}>{t('Create endpoint', 'ایجاد')}</button>
        </form>
        {issued && (
          <div className="border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 space-y-2">
            <p className="font-bold">{t('Copy the secret now. It is not shown again.', 'رمز را اکنون کپی کنید؛ دوباره نمایش داده نمی‌شود.')}</p>
            {[['URL', issued.url], [t('Secret', 'رمز'), issued.secret]].map(([label, value]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="w-14 text-slate-500 shrink-0">{label}</span>
                <code dir="ltr" className="font-mono break-all">{value}</code>
                <button type="button" className={secondary} onClick={() => void copy(value)} title={t('Copy', 'کپی')}>
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <p className="text-slate-600 dark:text-slate-300">{howTo[issued.provider]}</p>
            <button type="button" className={secondary} onClick={() => setIssued(null)}>{t('Done', 'تمام')}</button>
          </div>
        )}
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {(hooks.data?.webhooks || []).map(h => (
            <li key={h.id} className="py-2 flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold uppercase">{h.provider}</span>
              <span className="font-semibold">{h.name}</span>
              <Badge value={h.enabled ? 'ok' : 'ignored'} />
              <code dir="ltr" className="font-mono text-slate-400 break-all">{h.path}</code>
              <span className="text-slate-500">{num(h.deliveryCount)} {t('deliveries', 'تحویل')} · {when(h.lastDeliveryAt)}</span>
              <span className="ms-auto flex gap-1.5">
                <button className={secondary} onClick={() => void run('toggle', () => apiRequest('PATCH', `/api/integrations/webhooks/${h.id}`, { enabled: !h.enabled })).then(() => hooks.reload())}>
                  {h.enabled ? t('Disable', 'غیرفعال') : t('Enable', 'فعال')}
                </button>
                <button
                  className={secondary}
                  onClick={() => {
                    if (!window.confirm(t('Issue a new secret? Deliveries signed with the old one will be rejected.', 'رمز جدید صادر شود؟'))) return;
                    void run('rotate', async () => {
                      const res = await api.post<{ secret: string }>(`/api/integrations/webhooks/${h.id}/rotate`);
                      setIssued({ url: `${window.location.origin}${h.path}`, secret: res.secret, provider: h.provider });
                    });
                  }}
                >
                  {t('New secret', 'رمز جدید')}
                </button>
                <button
                  className={secondary}
                  title={t('Delete', 'حذف')}
                  onClick={() => {
                    if (!window.confirm(t(`Delete the webhook "${h.name}"?`, 'وب‌هوک حذف شود؟'))) return;
                    void run('delete', () => api.del(`/api/integrations/webhooks/${h.id}`)).then(() => hooks.reload());
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold">{t('Received events', 'رویدادهای دریافتی')}</h3>
          <select className={`${input} !w-40`} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">{t('All statuses', 'همه')}</option>
            {['received', 'retrying', 'processed', 'ignored', 'failed'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {events.error && <p className="text-rose-600">{events.error}</p>}
        {(events.data?.events || []).length === 0 ? (
          <p className="text-slate-500">{t('No deliveries yet.', 'هنوز رویدادی دریافت نشده.')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {events.data!.events.map(ev => (
                  <React.Fragment key={ev.id}>
                    <tr>
                      <td className={`${td} text-slate-500 whitespace-nowrap`}>{when(ev.receivedAt)}</td>
                      <td className={`${td} font-mono`}>{ev.provider} · {ev.eventType}</td>
                      <td className={td}><Badge value={ev.status} /></td>
                      <td className={td}>
                        {ev.error ? <span className="text-rose-600">{ev.error}</span> : ev.result}
                        {ev.attempts > 1 && <span className="text-slate-400"> ({num(ev.attempts)}×)</span>}
                      </td>
                      <td className={`${td} whitespace-nowrap text-end`}>
                        <button
                          className={secondary}
                          onClick={() => {
                            if (payload?.id === ev.id) return setPayload(null);
                            void run('payload', async () => {
                              const res = await api.get<{ event: { payload: unknown } }>(`/api/integrations/events/${ev.id}`);
                              setPayload({ id: ev.id, text: JSON.stringify(res.event.payload, null, 2).slice(0, 20000) });
                            });
                          }}
                        >
                          {t('Payload', 'محتوا')}
                        </button>{' '}
                        <button
                          className={secondary}
                          disabled={ev.status === 'received' || ev.status === 'retrying'}
                          title={t('Process this event again', 'پردازش دوباره')}
                          onClick={() => void run('replay', () => api.post(`/api/integrations/events/${ev.id}/replay`), t('Replay queued.', 'در صف قرار گرفت.')).then(() => events.reload())}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                    {payload?.id === ev.id && (
                      <tr>
                        <td colSpan={5} className={td}>
                          <pre dir="ltr" className="max-h-64 overflow-auto bg-slate-950 text-slate-100 rounded-md p-3 text-[11px]">{payload.text}</pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Health, tokens and synced records
// ---------------------------------------------------------------------------

const ConnectionHealthCard: React.FC<{ conn: Connection; notify: Notify; onChanged: () => void }> = ({ conn, notify, onChanged }) => {
  const { t, when, num, isManager, busy, run } = usePanel(notify);
  const history = usePolled<{ checks: HealthCheck[]; healthyPercent: number | null }>(`/api/integrations/${conn.provider}/health-history?limit=30`, 15000);
  const dot: Record<string, string> = { healthy: 'bg-emerald-500', degraded: 'bg-amber-500', unreachable: 'bg-rose-500', needs_reauth: 'bg-rose-700' };
  const rl = conn.rateLimit;
  return (
    <div className={card}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono font-bold uppercase text-sm">{conn.provider}</span>
        <Badge value={conn.healthStatus} />
        <span className="ms-auto flex gap-1.5">
          <button
            className={secondary}
            disabled={busy !== null}
            onClick={() => void run('check', () => api.post(`/api/integrations/${conn.provider}/health`)).then(() => { onChanged(); history.reload(); })}
          >
            {busy === 'check' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('Check now', 'بررسی اکنون')}
          </button>
          {conn.canRefreshToken && isManager && (
            <button
              className={secondary}
              disabled={busy !== null}
              onClick={() => void run('refresh', () => api.post(`/api/integrations/${conn.provider}/refresh-token`), t('Token refreshed.', 'توکن نوسازی شد.')).then(onChanged)}
            >
              {t('Refresh token', 'نوسازی توکن')}
            </button>
          )}
        </span>
      </div>
      <p>{conn.healthMessage}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-slate-500">
        <dt>{t('Last checked', 'آخرین بررسی')}</dt>
        <dd>{when(conn.lastHealthCheckAt)}</dd>
        <dt>{t('Access token', 'توکن دسترسی')}</dt>
        <dd className={conn.tokenExpired ? 'text-rose-600 font-semibold' : ''}>
          {conn.tokenExpiresAt ? `${t('expires', 'انقضا')} ${when(conn.tokenExpiresAt)}` : t('no expiry recorded', 'بدون تاریخ انقضا')}
        </dd>
        <dt>{t('Automatic refresh', 'نوسازی خودکار')}</dt>
        <dd>{conn.canRefreshToken ? `${t('on', 'فعال')} · ${when(conn.lastRefreshAt)}` : t('not configured', 'تنظیم نشده')}</dd>
        {conn.lastRefreshError && (
          <>
            <dt>{t('Last refresh error', 'خطای نوسازی')}</dt>
            <dd className="text-rose-600">{conn.lastRefreshError}</dd>
          </>
        )}
        <dt>{t('API rate limit', 'محدودیت نرخ API')}</dt>
        <dd>{rl?.remaining !== undefined ? `${num(rl.remaining)}${rl.limit ? ` / ${num(rl.limit)}` : ''}` : t('not reported', 'گزارش نشده')}</dd>
      </dl>
      {!!history.data?.checks.length && (
        <div className="space-y-1">
          <div className="flex gap-0.5" dir="ltr">
            {[...history.data.checks].reverse().map((c, i) => (
              <span key={`${c.ts}-${i}`} className={`h-4 w-1.5 rounded-sm ${dot[c.status]}`} title={`${when(c.ts)} · ${c.status} · ${c.latencyMs ?? '?'} ms · ${c.message || ''}`} />
            ))}
          </div>
          <div className="text-slate-500">
            {num(history.data.healthyPercent ?? 0)}% {t('healthy over the last', 'سالم در')} {num(history.data.checks.length)} {t('checks', 'بررسی اخیر')}
          </div>
        </div>
      )}
    </div>
  );
};

export const HealthPanel: React.FC<{ notify: Notify }> = ({ notify }) => {
  const { t, isManager, busy, run } = usePanel(notify);
  const connections = usePolled<{ connections: Connection[] }>('/api/integrations/connections', 10000);
  const links = usePolled<{ links: SyncedLink[] }>('/api/integrations/external-links', 10000);
  const [showOauth, setShowOauth] = useState(false);
  const [form, setForm] = useState({ provider: 'jira', serverUrl: '', secret: '', refreshToken: '', tokenUrl: '', clientId: '', clientSecret: '', expiresIn: '3600' });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [key]: e.target.value }));
  const attention = (links.data?.links || []).filter(l => l.pushError || l.missingInSource);
  const list = connections.data?.connections || [];

  const connectOauth = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(
      'oauth',
      () =>
        api.post(`/api/integrations/${form.provider}/connect`, {
          serverUrl: form.serverUrl,
          authMethod: 'oauth_bearer',
          secret: form.secret,
          refreshToken: form.refreshToken,
          expiresIn: Number(form.expiresIn) || undefined,
          oauth: { tokenUrl: form.tokenUrl, clientId: form.clientId, clientSecret: form.clientSecret || undefined },
        }),
      t('Connected. The token will be refreshed automatically.', 'متصل شد؛ توکن خودکار نوسازی می‌شود.')
    );
    if (ok) {
      setForm(f => ({ ...f, secret: '', refreshToken: '', clientSecret: '' }));
      setShowOauth(false);
      connections.reload();
    }
  };

  const fields: Array<[keyof typeof form, string, boolean]> = [
    ['serverUrl', t('API base address', 'نشانی پایه API'), false],
    ['secret', t('Access token', 'توکن دسترسی'), true],
    ['refreshToken', t('Refresh token', 'توکن نوسازی'), true],
    ['tokenUrl', t('Token URL', 'نشانی توکن'), false],
    ['clientId', t('Client id', 'شناسه کلاینت'), false],
    ['clientSecret', t('Client secret', 'رمز کلاینت'), true],
    ['expiresIn', t('Expires in (seconds)', 'انقضا (ثانیه)'), false],
  ];

  return (
    <div className="space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold flex items-center gap-2">
          <HeartPulse className="w-4 h-4 text-rose-500" />
          {t('Connection health', 'سلامت اتصال‌ها')}
        </h2>
        {isManager && (
          <button className={secondary} onClick={() => setShowOauth(v => !v)}>
            {t('Connect with OAuth 2.0 (auto refresh)', 'اتصال OAuth 2.0 با نوسازی خودکار')}
          </button>
        )}
      </div>
      {showOauth && (
        <form onSubmit={connectOauth} className={`${card} !space-y-0 grid gap-2 md:grid-cols-4`}>
          <label className="space-y-1">
            <span className="text-slate-500">{t('Service', 'سرویس')}</span>
            <select className={input} value={form.provider} onChange={set('provider')}>
              <option value="jira">Jira</option>
              <option value="confluence">Confluence</option>
            </select>
          </label>
          {fields.map(([key, label, secret]) => (
            <label key={key} className="space-y-1">
              <span className="text-slate-500">{label}</span>
              <input className={input} dir="ltr" type={secret ? 'password' : 'text'} autoComplete="off" value={form[key]} onChange={set(key)} />
            </label>
          ))}
          <div className="md:col-span-4 pt-2">
            <button className={primary} disabled={busy !== null || !form.serverUrl || !form.secret || !form.refreshToken || !form.tokenUrl || !form.clientId}>
              {t('Verify and connect', 'بررسی و اتصال')}
            </button>
          </div>
        </form>
      )}
      {connections.error && <p className="text-rose-600">{connections.error}</p>}
      {list.length === 0 && <div className={`${card} text-slate-500`}>{t('No integrations are connected yet.', 'هنوز اتصالی برقرار نشده است.')}</div>}
      <div className="grid gap-3 lg:grid-cols-2">
        {list.map(c => (
          <ConnectionHealthCard key={c.id} conn={c} notify={notify} onChanged={connections.reload} />
        ))}
      </div>

      <div className={card}>
        <h3 className="font-bold">{t('Synced records that need attention', 'رکوردهای نیازمند بررسی')}</h3>
        {attention.length === 0 ? (
          <p className="text-slate-500">{t('Every linked record is in order.', 'همه رکوردهای پیوندی مرتب هستند.')}</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {attention.map(l => (
              <li key={l.id} className="py-2 flex flex-wrap items-center gap-2">
                <span className="font-mono font-bold uppercase">{l.provider}</span>
                <span className="font-mono text-blue-600">{l.externalKey}</span>
                {l.missingInSource && <span className="text-amber-700 dark:text-amber-300">{t('Removed at the source; the local copy was kept.', 'در منبع حذف شده؛ نسخه محلی حفظ شد.')}</span>}
                {l.pushError && <span className="text-rose-600">{l.pushError}</span>}
                {isManager && !l.missingInSource && (
                  <button
                    className={`${secondary} ms-auto`}
                    disabled={busy !== null}
                    onClick={() => void run(l.id, () => api.post(`/api/integrations/external-links/${l.id}/sync`), t('Synced again.', 'دوباره همگام شد.')).then(() => links.reload())}
                  >
                    {t('Sync again', 'تلاش دوباره')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
