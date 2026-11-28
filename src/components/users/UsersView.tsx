import React, { useState } from 'react';
import { 
  Users, UserPlus, Search, Filter, Shield, 
  Check, X, Edit, Trash2, Power, Briefcase, Mail, UserCheck, KeyRound, Copy 
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import { User } from '../../types/jira';
import { UserAvatar } from '../common/JiraIcons';

export const UsersView: React.FC = () => {
  const { 
    users, currentUser, createUser, updateUser, 
    deleteUser, toggleUserStatus, issues, t, language,
    issuedCredentials, dismissIssuedCredentials, resetUserPassword, showToast,
  } = useJira();
  const isAdmin = currentUser?.role === 'admin';

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Modals state
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Add/Edit Form State
  const [name, setName] = useState('');
  const [nameFa, setNameFa] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<User['role']>('developer');
  const [department, setDepartment] = useState('Engineering');
  const [avatarColor, setAvatarColor] = useState('bg-blue-600 text-white');

  const avatarColorOptions = [
    { label: 'Blue', value: 'bg-blue-600 text-white' },
    { label: 'Indigo', value: 'bg-indigo-600 text-white' },
    { label: 'Emerald', value: 'bg-emerald-600 text-white' },
    { label: 'Purple', value: 'bg-purple-600 text-white' },
    { label: 'Amber', value: 'bg-amber-600 text-white' },
    { label: 'Rose', value: 'bg-rose-600 text-white' },
    { label: 'Sky', value: 'bg-sky-600 text-white' },
  ];

  const handleOpenAdd = () => {
    setName('');
    setNameFa('');
    setEmail('');
    setPassword('');
    setRole('developer');
    setDepartment('Engineering');
    setAvatarColor('bg-blue-600 text-white');
    setIsAddUserOpen(true);
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setName(user.name);
    setNameFa(user.nameFa);
    setEmail(user.email);
    setRole(user.role);
    setDepartment(user.department || 'Engineering');
    setAvatarColor(user.avatarColor);
  };

  const handleSaveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && email.trim()) {
      createUser({
        name: name.trim(),
        nameFa: nameFa.trim() || name.trim(),
        email: email.trim(),
        password: password || undefined,
        role,
        department,
        avatar: (name.trim().slice(0, 2)).toUpperCase(),
        avatarColor,
        status: 'active',
        joinedDate: new Date().toISOString().split('T')[0],
      });
      setIsAddUserOpen(false);
    }
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUser && name.trim()) {
      updateUser(editingUser.id, {
        name: name.trim(),
        nameFa: nameFa.trim() || name.trim(),
        email: email.trim(),
        role,
        department,
        avatarColor,
      });
      setEditingUser(null);
    }
  };

  const handleDeleteUser = (userId: string) => {
    if (window.confirm(t.confirmDeleteUser)) {
      deleteUser(userId);
    }
  };

  // Filtered list
  const filteredUsers = users.filter(user => {
    if (roleFilter !== 'all' && user.role !== roleFilter) return false;
    if (statusFilter !== 'all' && (user.status || 'active') !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = user.name.toLowerCase().includes(q);
      const matchNameFa = user.nameFa.toLowerCase().includes(q);
      const matchEmail = user.email.toLowerCase().includes(q);
      const matchDept = user.department?.toLowerCase().includes(q);
      if (!matchName && !matchNameFa && !matchEmail && !matchDept) return false;
    }
    return true;
  });

  const activeCount = users.filter(u => u.status !== 'inactive').length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <span>{t.usersTitle}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {language === 'fa' 
              ? 'مدیریت کاربران، اعضای تیم، نقش‌های دسترسی و نظارت بر وظایف محول‌شده.' 
              : 'Manage team directory, workspace roles, access permissions, and active workload.'}
          </p>
        </div>

        {isAdmin && (<button
          onClick={handleOpenAdd}
          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>{t.addUser}</span>
        </button>)}
      </div>

      {/* One-time credentials issued by the server (temporary passwords) */}
      {issuedCredentials.length > 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="font-bold text-amber-800 dark:text-amber-200 flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              <span>{language === 'fa' ? 'رمز عبور موقت (فقط یک‌بار نمایش داده می‌شود)' : 'Temporary passwords (shown only once)'}</span>
            </div>
            <button onClick={dismissIssuedCredentials} className="text-amber-700 hover:text-amber-900"><X className="w-4 h-4" /></button>
          </div>
          {issuedCredentials.map(c => (
            <div key={c.userId} className="flex items-center gap-3 font-mono">
              <span className="text-slate-700 dark:text-slate-200">{c.email}</span>
              <code className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 select-all">{c.temporaryPassword}</code>
              <button
                onClick={() => { void navigator.clipboard?.writeText(c.temporaryPassword); showToast('success', language === 'fa' ? 'کپی شد' : 'Copied'); }}
                className="p-1 text-amber-700 hover:text-amber-900"
              ><Copy className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <p className="text-amber-700 dark:text-amber-300">{language === 'fa' ? 'کاربر باید هنگام اولین ورود رمز عبور را تغییر دهد.' : 'The user must change this password at first sign-in.'}</p>
        </div>
      )}

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1 shadow-xs">
          <div className="text-[11px] text-slate-400 uppercase font-semibold">{language === 'fa' ? 'کل اعضای تیم' : 'Total Members'}</div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">{users.length}</div>
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1 shadow-xs">
          <div className="text-[11px] text-slate-400 uppercase font-semibold">{t.activeUser}</div>
          <div className="text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{activeCount}</div>
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1 shadow-xs">
          <div className="text-[11px] text-slate-400 uppercase font-semibold">{language === 'fa' ? 'توسعه‌دهندگان' : 'Developers'}</div>
          <div className="text-xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400">
            {users.filter(u => u.role === 'developer').length}
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1 shadow-xs">
          <div className="text-[11px] text-slate-400 uppercase font-semibold">{language === 'fa' ? 'مدیران محصول و سیستم' : 'Admins & PO'}</div>
          <div className="text-xl font-bold font-mono tabular-nums text-purple-600 dark:text-purple-400">
            {users.filter(u => u.role === 'admin' || u.role === 'product_owner').length}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="relative min-w-[220px] flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'fa' ? 'جستجوی نام کاربر، ایمیل یا واحد...' : 'Search by name, email, or department...'}
              className="w-full ps-9 pe-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none"
            >
              <option value="all">{language === 'fa' ? 'همه نقش‌ها' : 'All Roles'}</option>
              <option value="admin">Admin</option>
              <option value="product_owner">Product Owner</option>
              <option value="developer">Developer</option>
              <option value="qa">QA Engineer</option>
              <option value="designer">Designer</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none"
            >
              <option value="all">{language === 'fa' ? 'همه وضعیت‌ها' : 'All Statuses'}</option>
              <option value="active">{t.activeUser}</option>
              <option value="inactive">{t.inactiveUser}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <table className="w-full text-xs text-start border-collapse">
          <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
            <tr>
              <th className="p-3.5 text-start">{language === 'fa' ? 'کاربر' : 'User'}</th>
              <th className="p-3.5 text-start">{t.emailAddress}</th>
              <th className="p-3.5 text-start">{t.userRole}</th>
              <th className="p-3.5 text-start">{t.userDepartment}</th>
              <th className="p-3.5 text-start">{t.assignedIssues}</th>
              <th className="p-3.5 text-start">{t.userStatus}</th>
              <th className="p-3.5 text-end">{language === 'fa' ? 'عملیات' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {filteredUsers.map((user) => {
              const assignedCount = issues.filter(i => i.assigneeId === user.id).length;
              const isCurrent = currentUser?.id === user.id;
              const isActive = (user.status || 'active') === 'active';

              return (
                <tr key={user.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                  {/* Avatar & Names */}
                  <td className="p-3.5">
                    <div className="flex items-center gap-3">
                      <UserAvatar user={user} size="md" />
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{language === 'fa' ? user.nameFa : user.name}</span>
                          {isCurrent && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-semibold">
                              {language === 'fa' ? 'شما' : 'You'}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {language === 'fa' ? user.name : user.nameFa}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Email */}
                  <td className="p-3.5 font-mono text-slate-600 dark:text-slate-400">
                    {user.email}
                  </td>

                  {/* Role */}
                  <td className="p-3.5">
                    <span className={`px-2 py-0.5 rounded font-semibold text-[10px] uppercase tracking-wide ${
                      user.role === 'admin' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' :
                      user.role === 'product_owner' ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300' :
                      user.role === 'developer' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300' :
                      user.role === 'qa' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' :
                      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      {user.role.replace('_', ' ')}
                    </span>
                  </td>

                  {/* Department */}
                  <td className="p-3.5 text-slate-600 dark:text-slate-300">
                    {user.department || 'Engineering'}
                  </td>

                  {/* Assigned Issues */}
                  <td className="p-3.5">
                    <span className="font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                      {assignedCount} {language === 'fa' ? 'تسک' : 'issues'}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="p-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      <span>{isActive ? t.activeUser : t.inactiveUser}</span>
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="p-3.5 text-end">
                    {isAdmin && (<div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => void resetUserPassword(user.id)}
                        title={language === 'fa' ? 'بازنشانی رمز عبور' : 'Reset password'}
                        className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => toggleUserStatus(user.id)}
                        title={isActive ? 'Deactivate' : 'Activate'}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(user)}
                        title={t.edit}
                        className="p-1 rounded text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      {!isCurrent && (
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          title={t.delete}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredUsers.length === 0 && (
          <div className="p-8 text-center text-xs text-slate-400">
            {language === 'fa' ? 'هیچ کاربری با فیلترهای انتخابی یافت نشد.' : 'No users match your filters.'}
          </div>
        )}
      </div>

      {/* Add New User Modal */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-600" />
                <span>{t.addUser}</span>
              </h3>
              <button 
                onClick={() => setIsAddUserOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAdd} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t.nameEn} *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t.nameFa}
                  </label>
                  <input
                    type="text"
                    value={nameFa}
                    onChange={(e) => setNameFa(e.target.value)}
                    placeholder="e.g. جان دو"
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t.emailAddress} *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john.doe@company.com"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {language === 'fa' ? 'رمز عبور اولیه (اختیاری)' : 'Initial password (optional)'}
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={language === 'fa' ? 'خالی بگذارید تا رمز موقت ساخته شود' : 'Leave empty to generate a temporary password'}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t.userRole}
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                  >
                    <option value="developer">Developer</option>
                    <option value="qa">QA Engineer</option>
                    <option value="product_owner">Product Owner</option>
                    <option value="designer">Designer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t.userDepartment}
                  </label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="Engineering"
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.avatarColor}
                </label>
                <div className="flex items-center gap-2">
                  {avatarColorOptions.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAvatarColor(opt.value)}
                      className={`w-6 h-6 rounded-full flex items-center justify-center ${opt.value.split(' ')[0]} ${avatarColor === opt.value ? 'ring-2 ring-offset-2 ring-blue-600' : ''}`}
                    >
                      {avatarColor === opt.value && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(false)}
                  className="px-3.5 py-1.5 text-slate-500 hover:text-slate-700"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md shadow-xs"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Edit className="w-4 h-4 text-blue-600" />
                <span>{t.editUser}: {editingUser.name}</span>
              </h3>
              <button 
                onClick={() => setEditingUser(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t.nameEn}
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t.nameFa}
                  </label>
                  <input
                    type="text"
                    value={nameFa}
                    onChange={(e) => setNameFa(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t.emailAddress}
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t.userRole}
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                  >
                    <option value="developer">Developer</option>
                    <option value="qa">QA Engineer</option>
                    <option value="product_owner">Product Owner</option>
                    <option value="designer">Designer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t.userDepartment}
                  </label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.avatarColor}
                </label>
                <div className="flex items-center gap-2">
                  {avatarColorOptions.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAvatarColor(opt.value)}
                      className={`w-6 h-6 rounded-full flex items-center justify-center ${opt.value.split(' ')[0]} ${avatarColor === opt.value ? 'ring-2 ring-offset-2 ring-blue-600' : ''}`}
                    >
                      {avatarColor === opt.value && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-3.5 py-1.5 text-slate-500 hover:text-slate-700"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md shadow-xs"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
