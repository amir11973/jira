import React, { useState } from 'react';
import { LayoutDashboard, Plus, Star, Users, X, BarChart3, Clock } from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { IssueTypeIcon, PriorityIcon } from '../common/JiraIcons';

export const DashboardsView: React.FC = () => {
  const {
    dashboards,
    createDashboard,
    toggleStarDashboard,
    updateDashboard,
    projects,
    issues,
    users,
    currentUser,
    setSelectedIssueId,
    setActiveQuickModal,
    t,
    language,
  } = useJira();

  const [selectedDashId, setSelectedDashId] = useState(dashboards[0]?.id || 'dash-default');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [spaceFilter, setSpaceFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [dashName, setDashName] = useState('');
  const [dashDesc, setDashDesc] = useState('');
  const [dashSpaceId, setDashSpaceId] = useState('');
  const [shareOpen, setShareOpen] = useState(false);

  const filteredDashboards = dashboards.filter(d => {
    if (ownerFilter !== 'all' && d.ownerId !== ownerFilter) return false;
    if (spaceFilter !== 'all' && d.projectId !== spaceFilter) return false;
    return true;
  });

  const activeDash =
    dashboards.find(d => d.id === selectedDashId) || filteredDashboards[0] || dashboards[0];

  const scopedIssues = issues.filter(i => {
    if (i.archived) return false;
    if (activeDash?.projectId && i.projectId !== activeDash.projectId) return false;
    return true;
  });

  const assignedToMe = scopedIssues.filter(i => i.assigneeId === currentUser?.id);
  const statusCounts = [
    { id: 'todo', label: 'To Do', count: scopedIssues.filter(i => i.status === 'todo').length, color: 'bg-slate-400' },
    { id: 'inprogress', label: 'In Progress', count: scopedIssues.filter(i => i.status === 'inprogress').length, color: 'bg-blue-600' },
    { id: 'review', label: 'In Review', count: scopedIssues.filter(i => i.status === 'review').length, color: 'bg-purple-600' },
    { id: 'done', label: 'Done', count: scopedIssues.filter(i => i.status === 'done').length, color: 'bg-emerald-600' },
  ];

  const priorityCounts = [
    { id: 'highest', label: t.highest, count: scopedIssues.filter(i => i.priority === 'highest').length, color: 'bg-rose-600' },
    { id: 'high', label: t.high, count: scopedIssues.filter(i => i.priority === 'high').length, color: 'bg-orange-500' },
    { id: 'medium', label: t.medium, count: scopedIssues.filter(i => i.priority === 'medium').length, color: 'bg-amber-500' },
    { id: 'low', label: t.low, count: scopedIssues.filter(i => i.priority === 'low').length, color: 'bg-emerald-500' },
    { id: 'lowest', label: t.lowest, count: scopedIssues.filter(i => i.priority === 'lowest').length, color: 'bg-blue-500' },
  ];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dashName.trim()) return;
    const created = createDashboard({
      name: dashName.trim(),
      description: dashDesc.trim() || 'Custom reporting dashboard',
      projectId: dashSpaceId || undefined,
    });
    setSelectedDashId(created.id);
    setDashName('');
    setDashDesc('');
    setIsCreateOpen(false);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-emerald-600" />
            <span>{t.dashboardsView}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {language === 'fa'
              ? 'ساخت و اشتراک‌گذاری داشبوردهای مدیریتی با گجت‌های تعاملی وضعیت و آمار.'
              : 'View Default dashboard or create shared executive dashboards with interactive gadgets.'}
          </p>
        </div>

        <button
          onClick={() => setActiveQuickModal('create_dashboard')}
          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 self-start"
        >
          <Plus className="w-4 h-4" />
          <span>{language === 'fa' ? 'ایجاد داشبورد' : 'Create dashboard'}</span>
        </button>
      </div>

      {/* Filters & Dashboard Directory Strip */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {filteredDashboards.map(d => (
              <button
                key={d.id}
                onClick={() => setSelectedDashId(d.id)}
                className={`px-3 py-1.5 rounded-lg border font-semibold flex items-center gap-1.5 transition-colors ${
                  activeDash?.id === d.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                <Star
                  onClick={e => {
                    e.stopPropagation();
                    toggleStarDashboard(d.id);
                  }}
                  className={`w-3.5 h-3.5 ${d.starred ? 'fill-amber-400 text-amber-400' : 'opacity-60'}`}
                />
                <span>{d.name}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={ownerFilter}
              onChange={e => setOwnerFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md"
            >
              <option value="all">{language === 'fa' ? 'همه مالکان' : 'Owner: All'}</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {language === 'fa' ? u.nameFa : u.name}
                </option>
              ))}
            </select>
            <select
              value={spaceFilter}
              onChange={e => setSpaceFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md"
            >
              <option value="all">{language === 'fa' ? 'همه فضاها' : 'Space: All'}</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.key}
                </option>
              ))}
            </select>
          </div>
        </div>

        {activeDash && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>{activeDash.description}</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                Viewers: <strong className="text-slate-700 dark:text-slate-300">{activeDash.viewers}</strong>
              </span>
              <span>
                Editors: <strong className="text-slate-700 dark:text-slate-300">{activeDash.editors}</strong>
              </span>
              {(activeDash.ownerId === currentUser?.id || currentUser?.role === 'admin') && (
                <button
                  onClick={() => setShareOpen(o => !o)}
                  className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300"
                >
                  {language === 'fa' ? 'اشتراک‌گذاری' : 'Share'}
                </button>
              )}
            </div>
          </div>
        )}

        {activeDash && shareOpen && (activeDash.ownerId === currentUser?.id || currentUser?.role === 'admin') && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {(() => {
              const labels = { private: 'Private', team: 'My teams', organization: 'My organization' } as const;
              return (
                <>
                  <div className="space-y-1.5">
                    <label className="block font-semibold">{language === 'fa' ? 'چه کسی می‌تواند ببیند' : 'Who can view'}</label>
                    <select
                      value={activeDash.viewScope || 'private'}
                      onChange={e => {
                        const v = e.target.value as 'private' | 'team' | 'organization';
                        updateDashboard(activeDash.id, { viewScope: v, viewers: labels[v] });
                      }}
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                    >
                      <option value="private">Private (only me)</option>
                      <option value="team">My teams</option>
                      <option value="organization">Whole organization</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block font-semibold">{language === 'fa' ? 'چه کسی می‌تواند ویرایش کند' : 'Who can edit'}</label>
                    <select
                      value={activeDash.editScope || 'private'}
                      onChange={e => {
                        const v = e.target.value as 'private' | 'team' | 'organization';
                        updateDashboard(activeDash.id, { editScope: v, editors: labels[v] });
                      }}
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                    >
                      <option value="private">Only me</option>
                      <option value="team">My teams</option>
                      <option value="organization">Whole organization</option>
                    </select>
                  </div>
                </>
              );
            })()}
            <div className="space-y-1.5">
              <label className="block font-semibold">{language === 'fa' ? 'افراد مشخص' : 'Specific people'}</label>
              <div className="max-h-28 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-md divide-y divide-slate-100 dark:divide-slate-800">
                {users
                  .filter(u => u.id !== activeDash.ownerId && (u.status || 'active') === 'active')
                  .map(u => {
                    const shared = (activeDash.sharedWithUserIds || []).includes(u.id);
                    const editor = (activeDash.editorUserIds || []).includes(u.id);
                    return (
                      <div key={u.id} className="flex items-center justify-between px-2.5 py-1">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={shared || editor}
                            onChange={e =>
                              updateDashboard(activeDash.id, {
                                sharedWithUserIds: e.target.checked
                                  ? [...(activeDash.sharedWithUserIds || []), u.id]
                                  : (activeDash.sharedWithUserIds || []).filter(x => x !== u.id),
                                editorUserIds: e.target.checked
                                  ? activeDash.editorUserIds || []
                                  : (activeDash.editorUserIds || []).filter(x => x !== u.id),
                              })
                            }
                          />
                          <span>{language === 'fa' ? u.nameFa : u.name}</span>
                        </label>
                        <label className="flex items-center gap-1 text-[11px] text-slate-500">
                          <input
                            type="checkbox"
                            checked={editor}
                            onChange={e =>
                              updateDashboard(activeDash.id, {
                                sharedWithUserIds: Array.from(new Set([...(activeDash.sharedWithUserIds || []), u.id])),
                                editorUserIds: e.target.checked
                                  ? [...(activeDash.editorUserIds || []), u.id]
                                  : (activeDash.editorUserIds || []).filter(x => x !== u.id),
                              })
                            }
                          />
                          {language === 'fa' ? 'ویرایش' : 'edit'}
                        </label>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Gadgets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gadget 1: Assigned to Me */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white">
              {language === 'fa' ? 'تسک‌های محول‌شده به من' : 'Assigned to Me'}
            </h3>
            <span className="font-mono text-xs tabular-nums text-slate-400">{assignedToMe.length}</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70 max-h-64 overflow-y-auto">
            {assignedToMe.slice(0, 7).map(iss => (
              <div
                key={iss.id}
                onClick={() => setSelectedIssueId(iss.id)}
                className="py-2 flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 px-1 rounded cursor-pointer text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <IssueTypeIcon type={iss.type} className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-mono font-semibold text-blue-600 dark:text-blue-400 shrink-0">{iss.key}</span>
                  <span className="truncate text-slate-700 dark:text-slate-300">{iss.summary}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <PriorityIcon priority={iss.priority} className="w-3.5 h-3.5" />
                  <span className="font-mono text-[10px] uppercase text-slate-500">{iss.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gadget 2: Issue Status Statistics */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
              <span>{language === 'fa' ? 'آمار وضعیت تسک‌ها' : 'Work Item Status Statistics'}</span>
            </h3>
            <span className="font-mono text-xs tabular-nums text-slate-400">{scopedIssues.length} total</span>
          </div>
          <div className="space-y-3 pt-1">
            {statusCounts.map(st => {
              const pct = scopedIssues.length > 0 ? Math.round((st.count / scopedIssues.length) * 100) : 0;
              return (
                <div key={st.id} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{st.label}</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-600 dark:text-slate-400">
                      {st.count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${st.color} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gadget 3: Priority Distribution */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white">{t.priorityBreakdown}</h3>
          </div>
          <div className="space-y-2.5">
            {priorityCounts.map(pr => {
              const pct = scopedIssues.length > 0 ? Math.round((pr.count / scopedIssues.length) * 100) : 0;
              return (
                <div key={pr.id} className="flex items-center gap-3 text-xs">
                  <span className="w-24 truncate text-slate-600 dark:text-slate-300">{pr.label}</span>
                  <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${pr.color} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-14 text-end font-mono tabular-nums text-slate-500">{pr.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gadget 4: Recent Activity Stream */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>{language === 'fa' ? 'آخرین به‌روزرسانی‌ها' : 'Activity Stream'}</span>
            </h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70 max-h-56 overflow-y-auto">
            {scopedIssues
              .slice()
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
              .slice(0, 6)
              .map(iss => (
                <div
                  key={iss.id}
                  onClick={() => setSelectedIssueId(iss.id)}
                  className="py-2 flex items-center justify-between gap-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 px-1 rounded cursor-pointer"
                >
                  <div className="truncate">
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400 me-2">{iss.key}</span>
                    <span className="text-slate-700 dark:text-slate-300">{iss.summary}</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400 shrink-0">
                    {new Date(iss.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Create Dashboard Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                {language === 'fa' ? 'ایجاد داشبورد جدید' : 'Create Dashboard'}
              </h3>
              <button type="button" onClick={() => setIsCreateOpen(false)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block font-semibold mb-1">{language === 'fa' ? 'نام داشبورد' : 'Dashboard Name'} *</label>
              <input
                type="text"
                required
                value={dashName}
                onChange={e => setDashName(e.target.value)}
                placeholder="Q4 Executive Delivery"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">{t.description}</label>
              <textarea
                rows={2}
                value={dashDesc}
                onChange={e => setDashDesc(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md resize-none"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">{language === 'fa' ? 'فضای مرتبط (اختیاری)' : 'Scope to Space (Optional)'}</label>
              <select
                value={dashSpaceId}
                onChange={e => setDashSpaceId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                <option value="">All Spaces</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.key} — {language === 'fa' ? p.nameFa : p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setIsCreateOpen(false)} className="px-3 py-1.5 text-slate-500">
                {t.cancel}
              </button>
              <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-md">
                {t.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
