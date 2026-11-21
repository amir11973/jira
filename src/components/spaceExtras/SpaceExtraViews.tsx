import React, { useState } from 'react';
import {
  Code2,
  GitPullRequest,
  ShieldAlert,
  Rocket,
  FileText,
  Plus,
  Calendar as CalendarIcon,
  Target,
  Archive,
  RotateCcw,
  Paperclip,
  Bookmark,
  ExternalLink,
  Trash2,
  ChevronLeft,
  ChevronRight,
  FolderGit2,
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { IssueTypeIcon, UserAvatar } from '../common/JiraIcons';

/* 1. Development & Delivery Metrics (P08, F31, F56) */
export const DevelopmentView: React.FC = () => {
  const { currentProject, issues, setSelectedIssueId, addIssueDevLink, language } = useJira();
  const [subTab, setSubTab] = useState<'prs' | 'repos' | 'vulns' | 'deploys'>('prs');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [targetIssueId, setTargetIssueId] = useState('');
  const [prTitle, setPrTitle] = useState('');
  const [prRepo, setPrRepo] = useState('nexus/auth-gateway');

  const projIssues = issues.filter(i => i.projectId === currentProject.id && !i.archived);
  const completedCount = projIssues.filter(i => i.status === 'done').length;
  const bugsCount = projIssues.filter(i => i.type === 'bug').length;

  const allDevLinks = projIssues.flatMap(iss =>
    (iss.devLinks || []).map(dl => ({ ...dl, issueId: iss.id, issueKey: iss.key, issueSummary: iss.summary }))
  );

  const openPrs = allDevLinks.filter(d => d.type === 'pr' && d.status === 'open');
  const deployments = allDevLinks.filter(d => d.status === 'deployed');

  const handleAddDevLink = (e: React.FormEvent) => {
    e.preventDefault();
    const issId = targetIssueId || projIssues[0]?.id;
    if (!issId || !prTitle.trim()) return;
    addIssueDevLink(issId, {
      type: 'pr',
      title: prTitle.trim(),
      status: 'open',
      repo: prRepo.trim() || 'nexus/core',
      url: `https://git.nexus-tech.io/${prRepo}/pull/new`,
    });
    setPrTitle('');
    setIsAddOpen(false);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Code2 className="w-5 h-5 text-blue-600" />
            <span>
              {language === 'fa' ? 'توسعه و شاخص‌های تحویل (Development)' : 'Development & Delivery Insights'}
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {language === 'fa'
              ? 'رهگیری Pull Requestها، مخازن کد، آسیب‌پذیری‌ها و نرخ استقرار متصل به تسک‌های فضا.'
              : 'Track pull requests, repositories, security vulnerabilities, deployments, and DORA metrics.'}
          </p>
        </div>

        <button
          onClick={() => setIsAddOpen(prev => !prev)}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{language === 'fa' ? 'اتصال PR به تسک' : 'Link Pull Request'}</span>
        </button>
      </div>

      {isAddOpen && (
        <form
          onSubmit={handleAddDevLink}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end text-xs"
        >
          <div>
            <label className="block font-semibold mb-1">{language === 'fa' ? 'تسک' : 'Work Item'}</label>
            <select
              value={targetIssueId || projIssues[0]?.id || ''}
              onChange={e => setTargetIssueId(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
            >
              {projIssues.map(i => (
                <option key={i.id} value={i.id}>
                  {i.key} — {i.summary.slice(0, 32)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-1">Repository</label>
            <input
              type="text"
              value={prRepo}
              onChange={e => setPrRepo(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">PR Title *</label>
            <input
              type="text"
              required
              value={prTitle}
              onChange={e => setPrTitle(e.target.value)}
              placeholder="PR #425: Harden JWT validation"
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
            />
          </div>
          <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-md">
            {language === 'fa' ? 'ثبت' : 'Attach PR'}
          </button>
        </form>
      )}

      {/* Delivery Key Metrics (Section 6.1 P08) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: language === 'fa' ? 'تکمیل‌شده' : 'Items completed', value: String(completedCount) },
          { label: language === 'fa' ? 'زمان چرخه PR' : 'PR cycle time', value: '14.2h' },
          { label: language === 'fa' ? 'زمان تحویل تغییر' : 'Lead time', value: '2.1d' },
          { label: language === 'fa' ? 'نرخ استقرار' : 'Deploy freq', value: `${deployments.length + 3}/wk` },
          { label: language === 'fa' ? 'باگ‌های باز' : 'Bugs tracked', value: String(bugsCount) },
          { label: language === 'fa' ? 'PRهای باز' : 'Open PRs', value: String(openPrs.length) },
        ].map((m, idx) => (
          <div
            key={idx}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5"
          >
            <div className="text-[11px] text-slate-500">{m.label}</div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Sub-navigation: Pull Requests / Repositories / Vulnerabilities / Deployments */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-5 text-xs font-semibold">
          {[
            { id: 'prs', label: `Pull requests (${allDevLinks.length})`, icon: GitPullRequest },
            { id: 'repos', label: 'Repositories (4)', icon: FolderGit2 },
            { id: 'vulns', label: 'Security alerts (1)', icon: ShieldAlert },
            { id: 'deploys', label: `Deployments (${deployments.length})`, icon: Rocket },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id as any)}
                className={`pb-2.5 border-b-2 flex items-center gap-1.5 ${
                  subTab === tab.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-500'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
          {(subTab === 'prs' || subTab === 'deploys') &&
            (subTab === 'prs' ? allDevLinks : deployments).map(item => (
              <div
                key={item.id}
                onClick={() => setSelectedIssueId(item.issueId)}
                className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-white truncate">{item.title}</div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    {item.repo} · Linked to <span className="text-blue-600 font-bold">{item.issueKey}</span>
                  </div>
                </div>
                <span
                  className={`font-mono text-[11px] uppercase font-bold ${
                    item.status === 'deployed'
                      ? 'text-emerald-600'
                      : item.status === 'merged'
                      ? 'text-purple-600'
                      : 'text-blue-600'
                  }`}
                >
                  {item.status}
                </span>
              </div>
            ))}

          {subTab === 'repos' &&
            ['nexus/auth-gateway', 'nexus/api-gateway', 'nexus/streaming-engine', 'nexus/mobile-app'].map(repo => (
              <div key={repo} className="p-3.5 flex items-center justify-between">
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{repo}</span>
                <span className="text-[11px] font-mono text-emerald-600 font-semibold">main · CI passing</span>
              </div>
            ))}

          {subTab === 'vulns' && (
            <div className="p-4 flex items-center justify-between">
              <div>
                <div className="font-bold text-amber-600">CVE-2026-4410 · Reverse Proxy Idle Timeout Misconfiguration</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Tracked under ENG-103 · Severity: Medium</div>
              </div>
              <span className="font-mono text-[11px] font-bold text-amber-600">OPEN</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* 2. Space Docs / Pages (P10, F55) */
export const DocsView: React.FC = () => {
  const { currentProject, createSpaceDoc, updateSpaceDoc, users, language, t } = useJira();
  const docs = currentProject.docs || [];
  const [selectedDocId, setSelectedDocId] = useState<string>(docs[0]?.id || '');
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  const activeDoc = docs.find(d => d.id === selectedDocId) || docs[0];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createSpaceDoc(currentProject.id, newTitle.trim(), newContent.trim());
    setNewTitle('');
    setNewContent('');
    setIsCreating(false);
  };

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-slate-50/50 dark:bg-slate-950">
      {/* Pages List Sidebar */}
      <div className="w-64 border-e border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-blue-600" />
            <span>{t.docsView}</span>
          </span>
          <button
            onClick={() => setIsCreating(true)}
            className="p-1 rounded bg-blue-600 text-white hover:bg-blue-700"
            title={language === 'fa' ? 'صفحه جدید' : 'New Page'}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
          {docs.length === 0 ? (
            <div className="p-4 text-center text-slate-400 italic">
              {language === 'fa' ? 'هنوز مستندی ثبت نشده است.' : 'No docs yet for this space.'}
            </div>
          ) : (
            docs.map(doc => (
              <button
                key={doc.id}
                onClick={() => {
                  setSelectedDocId(doc.id);
                  setIsCreating(false);
                }}
                className={`w-full text-start px-2.5 py-2 rounded-md font-medium truncate ${
                  activeDoc?.id === doc.id && !isCreating
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {doc.title}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Document Editor / Reader */}
      <div className="flex-1 overflow-y-auto p-6">
        {isCreating ? (
          <form onSubmit={handleCreate} className="max-w-3xl space-y-4 text-xs">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {language === 'fa' ? 'ایجاد مستند جدید فضا' : 'Create Space Document'}
            </h2>
            <input
              type="text"
              required
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder={language === 'fa' ? 'عنوان صفحه...' : 'Page title...'}
              className="w-full px-3 py-2 text-sm font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
            />
            <textarea
              rows={10}
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder={language === 'fa' ? 'متن مستندات، تصمیمات معماری یا دستورالعمل...' : 'Write architecture notes, runbooks, or meeting notes...'}
              className="w-full p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
            />
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-md">
                {t.save}
              </button>
              <button type="button" onClick={() => setIsCreating(false)} className="px-3 py-1.5 text-slate-500">
                {t.cancel}
              </button>
            </div>
          </form>
        ) : activeDoc ? (
          <div className="max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <input
                type="text"
                value={activeDoc.title}
                onChange={e => updateSpaceDoc(currentProject.id, activeDoc.id, e.target.value, activeDoc.content)}
                className="w-full text-lg font-bold bg-transparent focus:outline-none text-slate-900 dark:text-white"
              />
              <div className="text-[11px] font-mono text-slate-400 mt-1">
                Updated {new Date(activeDoc.updatedAt).toLocaleString()} · Author:{' '}
                {users.find(u => u.id === activeDoc.authorId)?.name || 'Team'}
              </div>
            </div>
            <textarea
              rows={12}
              value={activeDoc.content}
              onChange={e => updateSpaceDoc(currentProject.id, activeDoc.id, activeDoc.title, e.target.value)}
              className="w-full text-xs leading-relaxed bg-transparent focus:outline-none text-slate-700 dark:text-slate-300 resize-y"
            />
          </div>
        ) : (
          <div className="text-center py-12 text-xs text-slate-400">
            <button
              onClick={() => setIsCreating(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md font-semibold"
            >
              + {language === 'fa' ? 'اولین مستند را بسازید' : 'Create First Page'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/* 3. Space Calendar View (F27) */
export const CalendarView: React.FC = () => {
  const { currentProject, issues, setSelectedIssueId, openCreateModal, language, t } = useJira();
  const [monthOffset, setMonthOffset] = useState(0);

  // Anchor around Nov 2026 where seed dueDates live (2026-11-xx)
  const baseDate = new Date(2026, 10 + monthOffset, 1);
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const projIssues = issues.filter(i => i.projectId === currentProject.id && !i.archived);

  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, idx) => idx + 1),
  ];

  const monthLabel = baseDate.toLocaleString(language === 'fa' ? 'fa-IR' : 'en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/50 dark:bg-slate-950 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-blue-600" />
          <h1 className="text-base font-bold text-slate-900 dark:text-white">{monthLabel}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonthOffset(m => m - 1)}
            className="p-1.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMonthOffset(0)}
            className="px-2.5 py-1 text-xs font-semibold rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          >
            Nov 2026
          </button>
          <button
            onClick={() => setMonthOffset(m => m + 1)}
            className="p-1.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => openCreateModal()}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-semibold flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.createIssue}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-auto flex flex-col">
        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase text-slate-500 text-center py-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="flex-1 grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-100 dark:divide-slate-800/80">
          {cells.map((day, idx) => {
            const iso =
              day !== null
                ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                : '';
            const dayItems = day !== null ? projIssues.filter(i => i.dueDate === iso || i.startDate === iso) : [];
            return (
              <div key={idx} className="min-h-[92px] p-1.5 space-y-1">
                {day !== null && (
                  <>
                    <div className="text-[11px] font-mono font-semibold text-slate-500">{day}</div>
                    {dayItems.map(iss => (
                      <button
                        key={iss.id}
                        onClick={() => setSelectedIssueId(iss.id)}
                        className="w-full text-start px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-[10px] font-medium text-blue-700 dark:text-blue-300 truncate block"
                      >
                        <span className="font-mono font-bold me-1">{iss.key}</span>
                        {iss.summary}
                      </button>
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* 4. Space Goals View (F27) */
export const GoalsView: React.FC = () => {
  const { currentProject, goals, createGoal, updateGoalStatus, epics, issues, users, currentUser, t, language } =
    useJira();
  const [title, setTitle] = useState('');
  const [targetDate, setTargetDate] = useState('2026-12-31');
  const [isAdding, setIsAdding] = useState(false);

  const projGoals = goals.filter(g => g.projectId === currentProject.id);
  const projEpics = epics.filter(e => e.projectId === currentProject.id);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createGoal({
      projectId: currentProject.id,
      title: title.trim(),
      titleFa: title.trim(),
      ownerId: currentUser?.id || 'user-1',
      targetDate,
      status: 'on_track',
      linkedEpicIds: projEpics.slice(0, 1).map(x => x.id),
    });
    setTitle('');
    setIsAdding(false);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-emerald-600" />
            <span>{t.goalsView}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {language === 'fa'
              ? 'اهداف کلان و OKRهای متصل به اپیک‌های این فضا.'
              : 'Track space OKRs and strategic objectives rolled up from linked Epics.'}
          </p>
        </div>
        <button
          onClick={() => setIsAdding(prev => !prev)}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{language === 'fa' ? 'افزودن هدف' : 'New Goal'}</span>
        </button>
      </div>

      {isAdding && (
        <form
          onSubmit={handleCreate}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap gap-3 items-end text-xs"
        >
          <div className="flex-1 min-w-[220px]">
            <label className="block font-semibold mb-1">{language === 'fa' ? 'عنوان هدف' : 'Goal Title'} *</label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">{t.dueDate}</label>
            <input
              type="date"
              value={targetDate}
              onChange={e => setTargetDate(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
            />
          </div>
          <button type="submit" className="px-4 py-1.5 bg-emerald-600 text-white font-semibold rounded-md">
            {t.save}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {projGoals.map(goal => {
          const owner = users.find(u => u.id === goal.ownerId);
          const linkedIssues = issues.filter(i => goal.linkedEpicIds.includes(i.epicId || ''));
          const doneCount = linkedIssues.filter(i => i.status === 'done').length;
          const pct = linkedIssues.length > 0 ? Math.round((doneCount / linkedIssues.length) * 100) : 0;

          return (
            <div
              key={goal.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {language === 'fa' ? goal.titleFa : goal.title}
                </h3>
                <select
                  value={goal.status}
                  onChange={e => updateGoalStatus(goal.id, e.target.value as any)}
                  className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 font-semibold text-[11px]"
                >
                  <option value="on_track">On Track</option>
                  <option value="at_risk">At Risk</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono tabular-nums">
                  <span>{t.progress}</span>
                  <span>{pct}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5">
                  <UserAvatar user={owner} size="sm" />
                  <span>{owner ? (language === 'fa' ? owner.nameFa : owner.name) : ''}</span>
                </div>
                <span className="font-mono">Target: {goal.targetDate}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* 5. Archived Work Items View (F09) */
export const ArchivedWorkView: React.FC = () => {
  const { currentProject, issues, toggleArchiveIssue, setSelectedIssueId, t, language } = useJira();
  const archivedIssues = issues.filter(i => i.projectId === currentProject.id && i.archived);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Archive className="w-5 h-5 text-slate-500" />
          <span>{t.archivedView}</span>
          <span className="font-mono text-xs text-slate-400 tabular-nums">({archivedIssues.length})</span>
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {language === 'fa'
            ? 'تسک‌های آرشیوشده این فضا را مشاهده یا بازیابی کنید.'
            : 'Review and restore archived work items in this space.'}
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {archivedIssues.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400">
            {language === 'fa'
              ? 'هیچ تسکی در آرشیو این فضا نیست. از داخل پنجره تسک می‌توانید آن را آرشیو کنید.'
              : 'No archived work items in this space. Use the Archive button inside any work item to archive it.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {archivedIssues.map(iss => (
              <div key={iss.id} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                <button
                  onClick={() => setSelectedIssueId(iss.id)}
                  className="flex items-center gap-2.5 min-w-0 text-start"
                >
                  <IssueTypeIcon type={iss.type} className="w-4 h-4 shrink-0" />
                  <span className="font-mono font-bold text-blue-600">{iss.key}</span>
                  <span className="truncate font-medium text-slate-800 dark:text-slate-200">{iss.summary}</span>
                </button>
                <button
                  onClick={() => toggleArchiveIssue(iss.id)}
                  className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white font-semibold flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{t.restoreIssue}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* 6. Space Attachments View (F09) */
export const AttachmentsView: React.FC = () => {
  const { currentProject, issues, users, addIssueAttachment, setSelectedIssueId, t, language } = useJira();
  const projIssues = issues.filter(i => i.projectId === currentProject.id && !i.archived);
  const allAttachments = projIssues.flatMap(iss =>
    (iss.attachments || []).map(att => ({ ...att, issueId: iss.id, issueKey: iss.key }))
  );

  const [targetId, setTargetId] = useState(projIssues[0]?.id || '');
  const [fileName, setFileName] = useState('');

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    const issId = targetId || projIssues[0]?.id;
    if (!issId || !fileName.trim()) return;
    addIssueAttachment(issId, {
      name: fileName.trim(),
      size: '310 KB',
      mimeType: 'application/octet-stream',
    });
    setFileName('');
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Paperclip className="w-5 h-5 text-blue-600" />
          <span>{t.attachmentsView}</span>
          <span className="font-mono text-xs text-slate-400 tabular-nums">({allAttachments.length})</span>
        </h1>
      </div>

      <form
        onSubmit={handleUpload}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap gap-3 items-end text-xs"
      >
        <div>
          <label className="block font-semibold mb-1">{language === 'fa' ? 'تسک هدف' : 'Work Item'}</label>
          <select
            value={targetId || projIssues[0]?.id || ''}
            onChange={e => setTargetId(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
          >
            {projIssues.map(i => (
              <option key={i.id} value={i.id}>
                {i.key}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block font-semibold mb-1">{language === 'fa' ? 'نام فایل پیوست' : 'Attachment File Name'}</label>
          <input
            type="text"
            required
            value={fileName}
            onChange={e => setFileName(e.target.value)}
            placeholder="architecture-spec-v2.pdf"
            className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
          />
        </div>
        <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-md">
          + {language === 'fa' ? 'افزودن پیوست' : 'Attach File'}
        </button>
      </form>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-xs text-start border-collapse">
          <thead className="bg-slate-100/80 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500">
            <tr>
              <th className="p-3 text-start">{language === 'fa' ? 'نام فایل' : 'File'}</th>
              <th className="p-3 text-start">{language === 'fa' ? 'تسک' : 'Work Item'}</th>
              <th className="p-3 text-start">{language === 'fa' ? 'حجم' : 'Size'}</th>
              <th className="p-3 text-start">{language === 'fa' ? 'بارگذاری‌کننده' : 'Uploaded By'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {allAttachments.map(att => {
              const uploader = users.find(u => u.id === att.uploadedBy);
              return (
                <tr key={att.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="p-3 font-mono font-semibold text-slate-800 dark:text-slate-200">{att.name}</td>
                  <td className="p-3">
                    <button
                      onClick={() => setSelectedIssueId(att.issueId)}
                      className="font-mono font-bold text-blue-600 hover:underline"
                    >
                      {att.issueKey}
                    </button>
                  </td>
                  <td className="p-3 font-mono text-slate-500">{att.size}</td>
                  <td className="p-3 text-slate-600 dark:text-slate-300">
                    {uploader ? (language === 'fa' ? uploader.nameFa : uploader.name) : 'Team'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* 7. Space Shortcuts View (F09) */
export const ShortcutsView: React.FC = () => {
  const { currentProject, addSpaceShortcut, removeSpaceShortcut, t, language } = useJira();
  const shortcuts = currentProject.shortcuts || [];
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;
    addSpaceShortcut(currentProject.id, title.trim(), url.trim());
    setTitle('');
    setUrl('');
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Bookmark className="w-5 h-5 text-blue-600" />
          <span>{t.shortcutsView}</span>
        </h1>
      </div>

      <form
        onSubmit={handleAdd}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap gap-3 items-end text-xs"
      >
        <div className="flex-1 min-w-[180px]">
          <label className="block font-semibold mb-1">{language === 'fa' ? 'عنوان میانبر' : 'Shortcut Title'}</label>
          <input
            type="text"
            required
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Figma Design System"
            className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
          />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block font-semibold mb-1">URL</label>
          <input
            type="url"
            required
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://figma.com/file/..."
            className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
          />
        </div>
        <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-md">
          + {language === 'fa' ? 'افزودن میانبر' : 'Add Shortcut'}
        </button>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {shortcuts.map(sc => (
          <div
            key={sc.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between gap-2 text-xs"
          >
            <a href={sc.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 group">
              <div className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 truncate flex items-center gap-1.5">
                <span>{sc.title}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </div>
              <div className="font-mono text-[11px] text-slate-400 truncate mt-0.5">{sc.url}</div>
            </a>
            <button
              onClick={() => removeSpaceShortcut(currentProject.id, sc.id)}
              className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
