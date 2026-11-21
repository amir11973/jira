import React, { useState } from 'react';
import { Filter, Search, Trash2, ArrowUpRight, Bookmark, Plus } from 'lucide-react';
import { useJira } from '../../context/JiraContext';

export const FiltersDirectoryView: React.FC = () => {
  const {
    savedFilters,
    saveFilter,
    deleteSavedFilter,
    users,
    currentUser,
    setPendingJqlQuery,
    setActiveView,
    t,
    language,
  } = useJira();

  const [searchText, setSearchText] = useState('');
  const [newName, setNewName] = useState('');
  const [newJql, setNewJql] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const defaultFilters = [
    { id: 'def-1', name: t.myOpenIssues, jql: `assignee = "${currentUser?.email || 'currentUser()'}" AND status != done` },
    { id: 'def-2', name: t.reportedByMe, jql: `reporter = "${currentUser?.email || 'currentUser()'}"` },
    { id: 'def-3', name: t.allIssues, jql: 'ORDER BY updated DESC' },
    { id: 'def-4', name: language === 'fa' ? 'تسک‌های باز' : 'Open work items', jql: 'status != done ORDER BY priority DESC' },
    { id: 'def-5', name: t.doneThisWeek, jql: 'status = done ORDER BY updated DESC' },
    { id: 'def-6', name: t.viewedRecently, jql: 'ORDER BY updated DESC' },
    { id: 'def-7', name: t.createdRecently, jql: 'ORDER BY created DESC' },
    { id: 'def-8', name: t.updatedRecently, jql: 'ORDER BY updated DESC' },
    { id: 'def-9', name: t.criticalBugs, jql: 'type = bug AND priority = highest' },
  ];

  const runInJqlView = (jql: string) => {
    setPendingJqlQuery(jql);
    setActiveView('issues');
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newJql.trim()) return;
    saveFilter(newName.trim(), newJql.trim());
    setNewName('');
    setNewJql('');
    setIsCreating(false);
  };

  const filteredSaved = savedFilters.filter(
    f =>
      !searchText.trim() ||
      f.name.toLowerCase().includes(searchText.toLowerCase()) ||
      f.jql.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Filter className="w-5 h-5 text-blue-600" />
            <span>{t.filtersDirectory}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {language === 'fa'
              ? 'فیلترهای پیش‌فرض جیرا و فیلترهای JQL ذخیره‌شده توسط تیم شما.'
              : 'Access all 9 Jira default filters and manage saved JQL filters.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveView('issues')}
            className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-xs font-semibold"
          >
            {t.issuesAndFilters}
          </button>
          <button
            onClick={() => setIsCreating(prev => !prev)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.saveFilter}</span>
          </button>
        </div>
      </div>

      {isCreating && (
        <form
          onSubmit={handleCreate}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end text-xs"
        >
          <div>
            <label className="block font-semibold mb-1">{language === 'fa' ? 'نام فیلتر' : 'Filter Name'}</label>
            <input
              type="text"
              required
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Sprint 24 High Priority"
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">JQL</label>
            <input
              type="text"
              required
              value={newJql}
              onChange={e => setNewJql(e.target.value)}
              placeholder="priority = high AND status != done"
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-md">
              {t.save}
            </button>
            <button type="button" onClick={() => setIsCreating(false)} className="px-3 py-1.5 text-slate-500">
              {t.cancel}
            </button>
          </div>
        </form>
      )}

      {/* 9 Default Filters Grid */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{t.presets} (9)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {defaultFilters.map(df => (
            <button
              key={df.id}
              onClick={() => runInJqlView(df.jql)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-400 rounded-xl p-3.5 text-start transition-all group space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-blue-600">
                  {df.name}
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
              </div>
              <div className="font-mono text-[10px] text-slate-400 truncate">{df.jql}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Saved Filters Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
            <Bookmark className="w-4 h-4 text-blue-600" />
            <span>{t.savedFilters}</span>
            <span className="font-mono text-slate-400">({filteredSaved.length})</span>
          </div>
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder={language === 'fa' ? 'جستجوی فیلترها...' : 'Search saved filters...'}
              className="w-full ps-8 pe-3 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs"
            />
          </div>
        </div>

        <table className="w-full text-xs text-start border-collapse">
          <thead className="bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
            <tr>
              <th className="p-3 text-start">{language === 'fa' ? 'نام فیلتر' : 'Filter Name'}</th>
              <th className="p-3 text-start">JQL</th>
              <th className="p-3 text-start">{language === 'fa' ? 'مالک' : 'Owner'}</th>
              <th className="p-3 text-start">{language === 'fa' ? 'دسترسی' : 'Access'}</th>
              <th className="p-3 text-end">{t.actions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {filteredSaved.map(sf => {
              const owner = users.find(u => u.id === sf.ownerId);
              return (
                <tr key={sf.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="p-3">
                    <button
                      onClick={() => runInJqlView(sf.jql)}
                      className="font-bold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {sf.name}
                    </button>
                  </td>
                  <td className="p-3 font-mono text-[11px] text-slate-500">{sf.jql}</td>
                  <td className="p-3 text-slate-700 dark:text-slate-300">
                    {owner ? (language === 'fa' ? owner.nameFa : owner.name) : 'Admin'}
                  </td>
                  <td className="p-3 font-mono text-[11px] uppercase text-slate-500">
                    {sf.shareScope || 'team'}
                  </td>
                  <td className="p-3 text-end">
                    <button
                      onClick={() => deleteSavedFilter(sf.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded"
                      title={t.delete}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
