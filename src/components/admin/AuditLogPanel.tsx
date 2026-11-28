import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, describeApiError } from '../../services/api';
import { useJira } from '../../context/JiraContext';

interface AuditEntry {
  id: number;
  ts: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  collection: string | null;
  entityId: string | null;
  status: string;
  summary: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  ip: string | null;
}

const statusTone: Record<string, string> = {
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  denied: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  failed: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
};

/** Administrator-only view of the server-side audit trail (auth events, data changes, denials). */
export const AuditLogPanel: React.FC = () => {
  const { language } = useJira();
  const fa = language === 'fa';
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [collection, setCollection] = useState('');
  const [nextBefore, setNextBefore] = useState<number | null>(null);

  const load = useCallback(
    async (append = false, before?: number | null) => {
      setLoading(true);
      setError('');
      try {
        const qs = new URLSearchParams({ limit: '50' });
        if (collection) qs.set('collection', collection);
        if (append && before) qs.set('before', String(before));
        const res = await api.get<{ entries: AuditEntry[]; nextBefore: number | null }>(`/api/audit?${qs.toString()}`);
        setEntries(prev => (append ? [...prev, ...res.entries] : res.entries));
        setNextBefore(res.entries.length >= 50 ? res.nextBefore : null);
      } catch (err) {
        setError(describeApiError(err));
      } finally {
        setLoading(false);
      }
    },
    [collection]
  );

  useEffect(() => {
    if (open) void load(false);
  }, [open, load]);

  return (
    <details
      className="border border-slate-200 dark:border-slate-800 rounded-xl"
      onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer select-none px-5 py-3 text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-600" />
        {fa ? 'گزارش حسابرسی (Audit Log)' : 'Audit Log'}
      </summary>
      <div className="px-5 pb-5 space-y-3">
        <div className="flex items-center gap-2">
          <select
            value={collection}
            onChange={e => setCollection(e.target.value)}
            className="px-2 py-1.5 bg-slate-50 dark:bg-[#22272B] border border-slate-300 dark:border-slate-700 rounded-md"
          >
            <option value="">{fa ? 'همه موجودیت‌ها' : 'All entities'}</option>
            {['users', 'projects', 'issues', 'workflows', 'sprints', 'teams', 'siteConfig'].map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            onClick={() => void load(false)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {fa ? 'بروزرسانی' : 'Refresh'}
          </button>
        </div>
        {error && <div className="text-rose-600">{error}</div>}
        <div className="overflow-x-auto max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
          <table className="w-full text-start">
            <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0">
              <tr className="text-[10px] uppercase text-slate-500">
                <th className="p-2 text-start">{fa ? 'زمان' : 'Time'}</th>
                <th className="p-2 text-start">{fa ? 'کاربر' : 'Actor'}</th>
                <th className="p-2 text-start">{fa ? 'عملیات' : 'Action'}</th>
                <th className="p-2 text-start">{fa ? 'وضعیت' : 'Status'}</th>
                <th className="p-2 text-start">{fa ? 'شرح' : 'Summary'}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-t border-slate-100 dark:border-slate-800 align-top">
                  <td className="p-2 whitespace-nowrap font-mono text-[11px]">{new Date(e.ts).toLocaleString()}</td>
                  <td className="p-2">
                    <div className="font-medium">{e.actorEmail || '—'}</div>
                    <div className="text-[10px] text-slate-400">{e.actorRole}</div>
                  </td>
                  <td className="p-2 font-mono text-[11px]">{e.action}</td>
                  <td className="p-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusTone[e.status] || ''}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="p-2">
                    {e.summary}
                    {e.changes && Object.keys(e.changes).length > 0 && (
                      <div className="mt-1 text-[10px] text-slate-500 font-mono break-all">
                        {Object.entries(e.changes)
                          .slice(0, 4)
                          .map(([k, v]) => `${k}: ${JSON.stringify(v.from) ?? '∅'} → ${JSON.stringify(v.to) ?? '∅'}`)
                          .join(' · ')}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && entries.length === 0 && (
            <div className="p-6 text-center text-slate-400">{fa ? 'رویدادی ثبت نشده است.' : 'No audit entries.'}</div>
          )}
        </div>
        {loading && (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            {fa ? 'در حال بارگذاری…' : 'Loading…'}
          </div>
        )}
        {nextBefore && !loading && (
          <button
            onClick={() => void load(true, nextBefore)}
            className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {fa ? 'نمایش موارد قدیمی‌تر' : 'Load older entries'}
          </button>
        )}
      </div>
    </details>
  );
};
