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
  AlertTriangle,
  MessageSquare,
  Tag,
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { SpaceDocPage, RepositoryConnection } from '../../types/jira';
import { buildDevLinkUrl, isValidRef, refLabel, reposForProject } from '../../utils/devLinks';
import type { DevLinkType } from '../../utils/devLinks';
import { formatLocalizedDateTime, formatLocalizedNumber } from '../../utils/i18n';
import { IssueTypeIcon, UserAvatar } from '../common/JiraIcons';

/* 1. Development & Delivery Metrics (P08, F31, F56) */
export const DevelopmentView: React.FC = () => {
  const {
    currentProject,
    issues,
    setSelectedIssueId,
    addIssueDevLink,
    repositories,
    connectRepository,
    updateRepository,
    disconnectRepository,
    currentUser,
    showToast,
    language,
  } = useJira();
  const [subTab, setSubTab] = useState<'prs' | 'repos' | 'vulns' | 'deploys'>('prs');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [targetIssueId, setTargetIssueId] = useState('');
  const [prTitle, setPrTitle] = useState('');
  const [prRepo, setPrRepo] = useState('');
  const [linkType, setLinkType] = useState<DevLinkType>('pr');
  const [linkRef, setLinkRef] = useState('');
  const [repoForm, setRepoForm] = useState({
    name: '',
    provider: 'github' as RepositoryConnection['provider'],
    baseUrl: '',
    defaultBranch: 'main',
  });
  const canManageRepos = currentUser?.role === 'admin' || currentUser?.role === 'product_owner';
  const availableRepos = reposForProject(repositories, currentProject.id);
  const activeRepo = availableRepos.find(r => r.name === prRepo) || availableRepos[0];

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
    if (!issId || !activeRepo) return;
    if (!isValidRef(linkType, linkRef)) {
      showToast('error', language === 'fa' ? 'مقدار مرجع معتبر نیست.' : `Invalid ${refLabel(linkType).toLowerCase()}.`);
      return;
    }
    const ref = linkRef.trim().replace(/^#/, '');
    addIssueDevLink(issId, {
      type: linkType,
      title:
        prTitle.trim() ||
        (linkType === 'pr' ? `PR #${ref}` : linkType === 'branch' ? ref : `Commit ${ref.slice(0, 8)}`),
      status: 'open',
      repo: activeRepo.name,
      url: buildDevLinkUrl(activeRepo, linkType, ref),
    });
    setPrTitle('');
    setLinkRef('');
    setIsAddOpen(false);
  };

  const handleConnectRepo = (e: React.FormEvent) => {
    e.preventDefault();
    connectRepository({
      name: repoForm.name.trim(),
      provider: repoForm.provider,
      baseUrl: repoForm.baseUrl.trim(),
      defaultBranch: repoForm.defaultBranch.trim() || 'main',
      enabled: true,
      projectIds: [],
    });
    setRepoForm({ name: '', provider: 'github', baseUrl: '', defaultBranch: 'main' });
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
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end text-xs"
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
            {availableRepos.length === 0 ? (
              <div className="text-amber-600 py-1.5">
                {language === 'fa' ? 'ابتدا یک مخزن متصل کنید' : 'Connect a repository first (Repositories tab)'}
              </div>
            ) : (
              <select
                value={activeRepo?.name || ''}
                onChange={e => setPrRepo(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
              >
                {availableRepos.map(r => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="block font-semibold mb-1">{language === 'fa' ? 'نوع' : 'Type'}</label>
            <select
              value={linkType}
              onChange={e => setLinkType(e.target.value as DevLinkType)}
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
            >
              <option value="pr">Pull request</option>
              <option value="branch">Branch</option>
              <option value="commit">Commit</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-1">{refLabel(linkType)} *</label>
            <input
              type="text"
              required
              value={linkRef}
              onChange={e => setLinkRef(e.target.value)}
              placeholder={linkType === 'pr' ? '425' : linkType === 'branch' ? 'feature/eng-101' : 'a1b2c3d'}
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">{language === 'fa' ? 'عنوان' : 'Title'}</label>
            <input
              type="text"
              value={prTitle}
              onChange={e => setPrTitle(e.target.value)}
              placeholder="Harden JWT validation"
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
            />
          </div>
          <button type="submit" disabled={!activeRepo} className="px-4 py-1.5 bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-md">
            {language === 'fa' ? 'ثبت' : 'Link'}
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
            { id: 'repos', label: `Repositories (${repositories.length})`, icon: FolderGit2 },
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
                  <div className="font-semibold text-slate-900 dark:text-white truncate">
                    {item.title}
                    {item.url && /^https?:\/\//.test(item.url) && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="ms-2 text-[10px] font-normal text-blue-600 hover:underline"
                      >
                        open ↗
                      </a>
                    )}
                  </div>
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

          {subTab === 'repos' && (
            <>
              {repositories.length === 0 && (
                <div className="p-6 text-center text-slate-400 italic">
                  {language === 'fa' ? 'هنوز مخزنی متصل نشده است.' : 'No repositories connected yet.'}
                </div>
              )}
              {repositories.map(repo => (
                <div key={repo.id} className="p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">{repo.name}</div>
                    <div className="text-[11px] text-slate-400 font-mono truncate">
                      {repo.provider} · {repo.baseUrl} · {repo.defaultBranch || 'main'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[11px] font-mono font-semibold ${repo.enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {repo.enabled ? 'enabled' : 'disabled'}
                    </span>
                    {canManageRepos && (
                      <>
                        <button
                          onClick={() => updateRepository(repo.id, { enabled: !repo.enabled })}
                          className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          {repo.enabled ? (language === 'fa' ? 'غیرفعال' : 'Disable') : language === 'fa' ? 'فعال' : 'Enable'}
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(language === 'fa' ? 'اتصال این مخزن قطع شود؟' : `Disconnect ${repo.name}?`)) {
                              disconnectRepository(repo.id);
                            }
                          }}
                          className="px-2 py-1 rounded border border-rose-300 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        >
                          {language === 'fa' ? 'قطع اتصال' : 'Disconnect'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {canManageRepos && (
                <form onSubmit={handleConnectRepo} className="p-4 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end bg-slate-50/60 dark:bg-slate-900/60">
                  <div>
                    <label className="block font-semibold mb-1">{language === 'fa' ? 'نام (org/repo)' : 'Name (org/repo)'}</label>
                    <input
                      required
                      value={repoForm.name}
                      onChange={e => setRepoForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="nexus/billing"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Provider</label>
                    <select
                      value={repoForm.provider}
                      onChange={e => setRepoForm(f => ({ ...f, provider: e.target.value as RepositoryConnection['provider'] }))}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                    >
                      <option value="github">GitHub</option>
                      <option value="gitlab">GitLab</option>
                      <option value="bitbucket">Bitbucket</option>
                      <option value="generic">Generic</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-semibold mb-1">{language === 'fa' ? 'آدرس مخزن' : 'Repository URL'}</label>
                    <input
                      required
                      type="url"
                      value={repoForm.baseUrl}
                      onChange={e => setRepoForm(f => ({ ...f, baseUrl: e.target.value }))}
                      placeholder="https://github.com/nexus/billing"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                    />
                  </div>
                  <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-md">
                    {language === 'fa' ? 'اتصال مخزن' : 'Connect repository'}
                  </button>
                </form>
              )}
            </>
          )}

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

/* 2. Space Docs / Pages (P10, F55, Confluence Rich Knowledge Base) */
export const DocsView: React.FC = () => {
  const { currentProject, createSpaceDoc, updateSpaceDoc, users, language, t } = useJira();
  const docs = currentProject.docs || [];
  const [selectedDocId, setSelectedDocId] = useState<string>(docs[0]?.id || '');
  const [isCreating, setIsCreating] = useState(false);
  const [isEditingDoc, setIsEditingDoc] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  const activeDoc = docs.find(d => d.id === selectedDocId) || docs[0];
  const docById = new Map(docs.map(d => [d.id, d]));

  const rootDocs = docs.filter(d => !d.parentId || !docById.has(d.parentId));
  const childrenByParent = new Map<string, SpaceDocPage[]>();
  docs.forEach(d => {
    if (d.parentId && docById.has(d.parentId)) {
      const list = childrenByParent.get(d.parentId) || [];
      list.push(d);
      childrenByParent.set(d.parentId, list);
    }
  });

  const renderTreeNodes = (nodes: SpaceDocPage[], depth = 0): React.ReactNode =>
    nodes.map(doc => {
      const children = childrenByParent.get(doc.id) || [];
      return (
        <div key={doc.id} className="space-y-0.5">
          <button
            onClick={() => {
              setSelectedDocId(doc.id);
              setIsCreating(false);
              setIsEditingDoc(false);
            }}
            style={{ paddingInlineStart: `${10 + depth * 14}px` }}
            className={`w-full text-start pe-2.5 py-2 rounded-md font-medium truncate flex items-center justify-between gap-1.5 ${
              activeDoc?.id === doc.id && !isCreating
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span className="truncate">
              {depth > 0 ? '↳ ' : ''}
              {doc.title}
            </span>
            {doc.version && doc.version > 1 && (
              <span className="text-[10px] font-mono text-slate-400 shrink-0">
                v{formatLocalizedNumber(doc.version, language)}
              </span>
            )}
          </button>
          {children.length > 0 && depth < 5 && renderTreeNodes(children, depth + 1)}
        </div>
      );
    });

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
      {/* Hierarchical Pages Tree Sidebar */}
      <div className="w-72 border-e border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-blue-600" />
            <span>{t.docsView}</span>
            <span className="text-[11px] font-mono text-slate-400 tabular-nums">
              ({formatLocalizedNumber(docs.length, language)})
            </span>
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
            renderTreeNodes(rootDocs)
          )}
        </div>
      </div>

      {/* Document Reader / Safe Structured Renderer / Editor */}
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
          <div className="max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
            {/* Breadcrumb Ancestors & Metadata Header */}
            <div className="border-b border-slate-100 dark:border-slate-800 pb-4 space-y-2">
              {activeDoc.ancestors && activeDoc.ancestors.length > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 flex-wrap">
                  {activeDoc.ancestors.map((anc, idx) => (
                    <React.Fragment key={`${anc.id}-${idx}`}>
                      <span>{anc.title}</span>
                      <span>/</span>
                    </React.Fragment>
                  ))}
                  <span className="text-slate-600 dark:text-slate-300 font-medium">{activeDoc.title}</span>
                </div>
              )}

              <div className="flex items-start justify-between gap-3">
                <input
                  type="text"
                  value={activeDoc.title}
                  onChange={e => updateSpaceDoc(currentProject.id, activeDoc.id, e.target.value, activeDoc.content)}
                  className="flex-1 text-lg font-bold bg-transparent focus:outline-none text-slate-900 dark:text-white"
                />
                <div className="flex items-center gap-2 shrink-0">
                  {activeDoc.sourceUrl && /^https?:/i.test(activeDoc.sourceUrl) && (
                    <a
                      href={activeDoc.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 text-[11px] font-semibold rounded border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>{language === 'fa' ? 'منبع اصلی' : 'Source Page'}</span>
                    </a>
                  )}
                  {activeDoc.structuredBlocks && activeDoc.structuredBlocks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsEditingDoc(prev => !prev)}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                    >
                      {isEditingDoc
                        ? language === 'fa'
                          ? 'نمای ساختاریافته'
                          : 'Rich Reader'
                        : language === 'fa'
                        ? 'ویرایش متن'
                        : 'Edit Markdown'}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
                <span>
                  {language === 'fa' ? 'به‌روزرسانی:' : 'Updated:'}{' '}
                  {formatLocalizedDateTime(activeDoc.updatedAt, language)}
                </span>
                <span>·</span>
                <span>
                  {language === 'fa' ? 'نویسنده:' : 'Author:'}{' '}
                  {users.find(u => u.id === activeDoc.authorId)?.[language === 'fa' ? 'nameFa' : 'name'] || 'Team'}
                </span>
                {activeDoc.version && (
                  <>
                    <span>·</span>
                    <span className="tabular-nums">
                      {language === 'fa' ? 'نسخه' : 'Version'} {formatLocalizedNumber(activeDoc.version, language)}
                    </span>
                  </>
                )}
                {activeDoc.sourceProvider && (
                  <>
                    <span>·</span>
                    <span className="uppercase text-slate-500">{activeDoc.sourceProvider}</span>
                  </>
                )}
              </div>

              {activeDoc.labels && activeDoc.labels.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px] text-slate-500">
                  <Tag className="w-3 h-3 text-slate-400" />
                  {activeDoc.labels.map((lbl, idx) => (
                    <span key={`${lbl}-${idx}`} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
                      {lbl}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Conversion Warnings from Confluence XHTML Parser */}
            {activeDoc.conversionWarnings && activeDoc.conversionWarnings.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>
                    {language === 'fa'
                      ? 'یادداشت‌های تبدیل محتوای Confluence'
                      : 'Content Conversion Warnings'}
                  </span>
                </div>
                <ul className="list-disc ps-5 space-y-0.5 text-[11px]">
                  {activeDoc.conversionWarnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Safe Structured Blocks Renderer OR Markdown Editor */}
            {!isEditingDoc && activeDoc.structuredBlocks && activeDoc.structuredBlocks.length > 0 ? (
              <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {activeDoc.structuredBlocks.map((block, idx) => {
                  if (block.type === 'heading') {
                    const cls =
                      block.level <= 2
                        ? 'text-base font-bold text-slate-900 dark:text-white pt-2'
                        : 'text-sm font-bold text-slate-800 dark:text-slate-100 pt-1';
                    return (
                      <div key={idx} className={cls}>
                        {block.text}
                      </div>
                    );
                  }
                  if (block.type === 'paragraph') {
                    return <p key={idx}>{block.text}</p>;
                  }
                  if (block.type === 'quote') {
                    return (
                      <blockquote
                        key={idx}
                        className="ps-3 border-s-2 border-blue-500 text-slate-600 dark:text-slate-400 italic"
                      >
                        {block.text}
                      </blockquote>
                    );
                  }
                  if (block.type === 'code') {
                    return (
                      <pre
                        key={idx}
                        dir="ltr"
                        className="p-3 rounded-lg bg-slate-950 text-slate-100 font-mono text-[11px] overflow-x-auto"
                      >
                        {block.code}
                      </pre>
                    );
                  }
                  if (block.type === 'list') {
                    const TagName = block.ordered ? 'ol' : 'ul';
                    return (
                      <TagName
                        key={idx}
                        className={`${block.ordered ? 'list-decimal' : 'list-disc'} ps-5 space-y-1`}
                      >
                        {block.items.map((it, i2) => (
                          <li key={i2}>{it}</li>
                        ))}
                      </TagName>
                    );
                  }
                  if (block.type === 'table') {
                    return (
                      <div key={idx} className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                        <table className="w-full text-xs text-start border-collapse">
                          <thead className="bg-slate-50 dark:bg-slate-800/70">
                            <tr>
                              {block.headers.map((h, hi) => (
                                <th key={hi} className="px-3 py-2 font-semibold border-b border-slate-200 dark:border-slate-800 text-start">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {block.rows.map((row, ri) => (
                              <tr key={ri}>
                                {row.map((cell, ci) => (
                                  <td key={ci} className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  }
                  if (block.type === 'image') {
                    return (
                      <div key={idx} className="p-2 rounded border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                        <span className="font-semibold">Image:</span> {block.alt}{' '}
                        <span className="font-mono text-slate-400">({block.url})</span>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={idx}
                      className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-[11px]"
                    >
                      <span className="font-mono font-semibold text-slate-500">[{block.macroName}]</span>{' '}
                      <span>{block.fallbackText}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <textarea
                rows={12}
                value={activeDoc.content}
                onChange={e => updateSpaceDoc(currentProject.id, activeDoc.id, activeDoc.title, e.target.value)}
                className="w-full text-xs leading-relaxed bg-transparent focus:outline-none text-slate-700 dark:text-slate-300 resize-y"
              />
            )}

            {/* Attachments & Comments Footer */}
            {(activeDoc.attachments?.length || activeDoc.comments?.length) ? (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {activeDoc.attachments && activeDoc.attachments.length > 0 && (
                  <div className="space-y-2">
                    <div className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                      <span>{language === 'fa' ? 'پیوست‌ها' : 'Attachments'}</span>
                    </div>
                    <div className="space-y-1">
                      {activeDoc.attachments.map(att => (
                        <div key={att.id} className="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
                          <span className="truncate font-medium">{att.name}</span>
                          <span className="font-mono text-[10px] text-slate-400 shrink-0">{att.size}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeDoc.comments && activeDoc.comments.length > 0 && (
                  <div className="space-y-2">
                    <div className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                      <span>{language === 'fa' ? 'نظرات صفحه' : 'Page Comments'}</span>
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {activeDoc.comments.map(c => (
                        <div key={c.id} className="p-2 rounded bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 space-y-0.5">
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span className="font-semibold text-slate-700 dark:text-slate-200">{c.author}</span>
                            <span className="font-mono">{formatLocalizedDateTime(c.createdAt, language)}</span>
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-slate-300">{c.text}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
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

/* 4. Space Goals View lives in components/goals/GoalsView.tsx (P2: live progress, dependencies, milestones). */
export { GoalsView } from '../goals/GoalsView';

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
  const { currentProject, issues, users, uploadIssueAttachment, setSelectedIssueId, t, language } = useJira();
  const projIssues = issues.filter(i => i.projectId === currentProject.id && !i.archived);
  const allAttachments = projIssues.flatMap(iss =>
    (iss.attachments || []).map(att => ({ ...att, issueId: iss.id, issueKey: iss.key }))
  );

  const [targetId, setTargetId] = useState(projIssues[0]?.id || '');
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const issId = targetId || projIssues[0]?.id;
    if (!issId || !pickedFile) return;
    setUploading(true);
    const ok = await uploadIssueAttachment(issId, pickedFile);
    setUploading(false);
    if (ok) {
      setPickedFile(null);
      if (fileRef.current) fileRef.current.value = '';
    }
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
          <label className="block font-semibold mb-1">{language === 'fa' ? 'فایل' : 'File'}</label>
          <input
            ref={fileRef}
            type="file"
            required
            onChange={e => setPickedFile(e.target.files?.[0] || null)}
            className="w-full px-3 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
          />
        </div>
        <button
          type="submit"
          disabled={uploading || !pickedFile}
          className="px-4 py-1.5 bg-blue-600 disabled:opacity-60 text-white font-semibold rounded-md"
        >
          {uploading ? (language === 'fa' ? 'در حال بارگذاری…' : 'Uploading…') : `+ ${language === 'fa' ? 'افزودن پیوست' : 'Attach File'}`}
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
                  <td className="p-3 font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {att.downloadUrl ? (
                      <a href={att.downloadUrl} download={att.name} className="text-blue-600 hover:underline">
                        {att.name}
                      </a>
                    ) : (
                      att.name
                    )}
                  </td>
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
