import React, { useState } from 'react';
import { Users, Database, Plus, X, Server, CheckCircle2 } from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { UserAvatar } from '../common/JiraIcons';

export const TeamsView: React.FC = () => {
  const { teams, createTeam, users, issues, setSelectedIssueId, t, language } = useJira();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [leadId, setLeadId] = useState(users[0]?.id || 'user-1');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    createTeam({
      name: teamName.trim(),
      nameFa: teamName.trim(),
      description: teamDesc.trim() || 'Cross-functional product delivery team.',
      leadId,
      memberIds: [leadId],
    });
    setTeamName('');
    setTeamDesc('');
    setIsCreateOpen(false);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" />
            <span>{t.teamsView}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {language === 'fa'
              ? 'مدیریت تیم‌های فنی و ارتباط مستقیم با تسک‌های مرتبط (فیلد Team).'
              : 'Browse cross-functional teams, leads, members, and linked work items.'}
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 self-start"
        >
          <Plus className="w-4 h-4" />
          <span>{language === 'fa' ? 'ایجاد تیم جدید' : 'Create Team'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {teams.map(tm => {
          const lead = users.find(u => u.id === tm.leadId);
          const teamIssues = issues.filter(i => !i.archived && i.team === tm.name);
          const members = users.filter(u => tm.memberIds.includes(u.id));

          return (
            <div
              key={tm.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {language === 'fa' ? tm.nameFa : tm.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{tm.description}</p>
                </div>
                <span className="font-mono text-xs tabular-nums font-bold text-purple-600 dark:text-purple-400">
                  {teamIssues.length} {t.issuesCount}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">{t.lead}:</span>
                  <UserAvatar user={lead} size="sm" />
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {lead ? (language === 'fa' ? lead.nameFa : lead.name) : ''}
                  </span>
                </div>
                <div className="flex items-center -space-x-1.5">
                  {members.map(m => (
                    <UserAvatar key={m.id} user={m} size="sm" className="ring-2 ring-white dark:ring-slate-900" />
                  ))}
                </div>
              </div>

              {teamIssues.length > 0 && (
                <div className="pt-2 space-y-1">
                  {teamIssues.slice(0, 3).map(iss => (
                    <button
                      key={iss.id}
                      onClick={() => setSelectedIssueId(iss.id)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs text-start"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-mono font-semibold text-blue-600 shrink-0">{iss.key}</span>
                        <span className="truncate text-slate-700 dark:text-slate-300">{iss.summary}</span>
                      </div>
                      <span className="font-mono text-[10px] uppercase text-slate-400 shrink-0">{iss.status}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <h3 className="font-bold text-sm">{language === 'fa' ? 'تیم جدید' : 'Create Team'}</h3>
              <button type="button" onClick={() => setIsCreateOpen(false)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block font-semibold mb-1">{language === 'fa' ? 'نام تیم' : 'Team Name'} *</label>
              <input
                type="text"
                required
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                placeholder="Security Operations"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">{t.description}</label>
              <textarea
                rows={2}
                value={teamDesc}
                onChange={e => setTeamDesc(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md resize-none"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">{t.lead}</label>
              <select
                value={leadId}
                onChange={e => setLeadId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {language === 'fa' ? u.nameFa : u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIsCreateOpen(false)} className="px-3 py-1.5 text-slate-500">
                {t.cancel}
              </button>
              <button type="submit" className="px-4 py-1.5 bg-purple-600 text-white font-semibold rounded-md">
                {t.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export const AssetsView: React.FC = () => {
  const { assets, createAsset, users, issues, setSelectedIssueId, t, language } = useJira();
  const [schemaFilter, setSchemaFilter] = useState<string>('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [assetName, setAssetName] = useState('');
  const [assetSchema, setAssetSchema] = useState<'Services' | 'Servers' | 'Databases' | 'Cloud Clusters'>('Services');
  const [assetEnv, setAssetEnv] = useState<'Production' | 'Staging' | 'Dev'>('Production');

  const filtered = assets.filter(a => schemaFilter === 'all' || a.schema === schemaFilter);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetName.trim()) return;
    createAsset({
      key: `AST-${assets.length + 105}`,
      name: assetName.trim(),
      schema: assetSchema,
      status: 'Active',
      ownerId: users[0]?.id || 'user-1',
      environment: assetEnv,
      linkedIssueKeys: [],
    });
    setAssetName('');
    setIsAddOpen(false);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-amber-600" />
            <span>{t.assetsView}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {language === 'fa'
              ? 'فهرست دارایی‌ها، سرویس‌ها، سرورها و پایگاه‌داده‌های CMDB متصل به تسک‌ها.'
              : 'ITSM & Engineering CMDB asset schemas (Services, Servers, Databases, Cloud Clusters) linked to work items.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={schemaFilter}
            onChange={e => setSchemaFilter(e.target.value)}
            className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md text-xs"
          >
            <option value="all">{language === 'fa' ? 'همه اسکیماها' : 'All Schemas'}</option>
            <option value="Services">Services</option>
            <option value="Databases">Databases</option>
            <option value="Servers">Servers</option>
            <option value="Cloud Clusters">Cloud Clusters</option>
          </select>

          <button
            onClick={() => setIsAddOpen(true)}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-xs font-semibold flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{language === 'fa' ? 'ثبت دارایی جدید' : 'Create Object'}</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-xs text-start border-collapse">
          <thead className="bg-slate-100/80 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500">
            <tr>
              <th className="p-3 text-start">Key</th>
              <th className="p-3 text-start">{language === 'fa' ? 'نام شیء / سرویس' : 'Object Name'}</th>
              <th className="p-3 text-start">Schema</th>
              <th className="p-3 text-start">Environment</th>
              <th className="p-3 text-start">{t.status}</th>
              <th className="p-3 text-start">{language === 'fa' ? 'تسک‌های متصل' : 'Linked Work Items'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {filtered.map(ast => (
              <tr key={ast.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="p-3 font-mono font-bold text-amber-600">{ast.key}</td>
                <td className="p-3 font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Server className="w-3.5 h-3.5 text-slate-400" />
                  <span>{ast.name}</span>
                </td>
                <td className="p-3 text-slate-600 dark:text-slate-400">{ast.schema}</td>
                <td className="p-3 font-mono text-[11px]">{ast.environment}</td>
                <td className="p-3">
                  <span
                    className={`inline-flex items-center gap-1 font-semibold text-[11px] ${
                      ast.status === 'Active' ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    {ast.status}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1.5">
                    {ast.linkedIssueKeys.map(k => {
                      const target = issues.find(i => i.key === k);
                      return (
                        <button
                          key={k}
                          onClick={() => target && setSelectedIssueId(target.id)}
                          className="font-mono text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {k}
                        </button>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleAdd}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <h3 className="font-bold text-sm">{language === 'fa' ? 'افزودن دارایی CMDB' : 'Create CMDB Object'}</h3>
              <button type="button" onClick={() => setIsAddOpen(false)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block font-semibold mb-1">{language === 'fa' ? 'نام سرویس / سرور' : 'Object Name'} *</label>
              <input
                type="text"
                required
                value={assetName}
                onChange={e => setAssetName(e.target.value)}
                placeholder="Kafka Event Broker Cluster"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Schema</label>
                <select
                  value={assetSchema}
                  onChange={e => setAssetSchema(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  <option value="Services">Services</option>
                  <option value="Servers">Servers</option>
                  <option value="Databases">Databases</option>
                  <option value="Cloud Clusters">Cloud Clusters</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Environment</label>
                <select
                  value={assetEnv}
                  onChange={e => setAssetEnv(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  <option value="Production">Production</option>
                  <option value="Staging">Staging</option>
                  <option value="Dev">Dev</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIsAddOpen(false)} className="px-3 py-1.5 text-slate-500">
                {t.cancel}
              </button>
              <button type="submit" className="px-4 py-1.5 bg-amber-600 text-white font-semibold rounded-md">
                {t.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
