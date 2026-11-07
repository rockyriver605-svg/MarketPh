import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Shield, Search, Ban, RotateCcw, Store, History, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import type { Profile, UserRole, RoleChangeHistoryEntry } from '@/types';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { formatDate } from '@/lib/utils';

interface UserWithRole extends Profile {
  role: UserRole;
  secondary_role: UserRole | null;
  email?: string;
}

export function AdminUsersPage() {
  const { user, role } = useAuth();
  const canManage = role === 'administrator' || role === 'super_admin';
  const isSuperAdmin = role === 'super_admin';
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [history, setHistory] = useState<RoleChangeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'users' | 'history'>('users');
  const [actingOn, setActingOn] = useState<UserWithRole | null>(null);
  const [action, setAction] = useState<'role' | 'suspend' | 'restore' | 'seller' | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>('buyer');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [usersRes, histRes] = await Promise.all([
      supabase.from('profiles').select('*, user_roles!inner(role, secondary_role)').order('created_at', { ascending: false }),
      supabase.rpc('admin_list_role_history', { p_limit: 100, p_offset: 0 }),
    ]);
    setLoading(false);
    if (usersRes.error) {
      setLoadError('Could not load users. Try again.');
      return;
    }
    const rows = (usersRes.data ?? []) as unknown as Array<Profile & { user_roles: { role: UserRole; secondary_role: UserRole | null } }>;
    setUsers(rows.map((r) => ({ ...r, role: r.user_roles.role, secondary_role: r.user_roles.secondary_role })));
    setHistory((histRes.data as RoleChangeHistoryEntry[]) ?? []);
  }, []);

  useEffect(() => {
    if (user && canManage) load();
  }, [user, canManage, load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) =>
      u.display_name?.toLowerCase().includes(term) ||
      u.username?.toLowerCase().includes(term) ||
      u.id.includes(term),
    );
  }, [users, search]);

  const openAction = (u: UserWithRole, act: typeof action) => {
    setActingOn(u);
    setAction(act);
    setActionError(null);
    setNotice(null);
    setReason('');
    setSelectedRole(u.role);
  };

  const closeAction = () => {
    setActingOn(null);
    setAction(null);
    setActionError(null);
    setReason('');
    setBusy(false);
  };

  const handleConfirm = async () => {
    if (!actingOn || !action) return;
    setBusy(true);
    setActionError(null);
    try {
      if (action === 'role') {
        const { error: err } = await supabase.rpc('set_user_role', {
          p_user_id: actingOn.id,
          p_new_role: selectedRole,
          p_reason: reason.trim() || null,
        });
        if (err) throw err;
        setNotice(`Role for ${actingOn.display_name} set to ${selectedRole}.`);
      } else if (action === 'seller') {
        const { error: err } = await supabase.rpc('activate_user_as_seller', { p_user_id: actingOn.id });
        if (err) throw err;
        setNotice(`${actingOn.display_name} can now sell on MariMarket.`);
      } else if (action === 'suspend') {
        if (!reason.trim()) {
          setActionError('A reason is required to suspend an account.');
          setBusy(false);
          return;
        }
        const { error: err } = await supabase.rpc('suspend_user', { p_user_id: actingOn.id, p_reason: reason.trim() });
        if (err) throw err;
        setNotice(`${actingOn.display_name} has been suspended.`);
      } else if (action === 'restore') {
        const { error: err } = await supabase.rpc('restore_user', { p_user_id: actingOn.id });
        if (err) throw err;
        setNotice(`${actingOn.display_name} has been restored.`);
      }
      closeAction();
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed. Check your permissions.');
      setBusy(false);
    }
  };

  const roleChoices: UserRole[] = isSuperAdmin
    ? ['buyer', 'seller', 'moderator', 'administrator', 'super_admin']
    : ['buyer', 'seller', 'moderator'];

  if (!user) {
    return <div className="container-app py-16 text-center"><Button onClick={() => navigate('/signin')}>Sign In</Button></div>;
  }

  if (!canManage) {
    return (
      <div className="container-app py-12">
        <EmptyState icon={<Shield className="h-8 w-8" />} title="Access denied" description="Only administrators can manage users." />
      </div>
    );
  }

  return (
    <div className="container-app py-8 animate-fade-in">
      <button onClick={() => navigate('/admin')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to administration
      </button>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-900">User Management</h1>
        <p className="text-sm text-brand-500 mt-1">Manage roles, suspend or restore accounts, and review the role change log.</p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-brand-100">
        {(['users', 'history'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${tab === t ? 'text-brand-700 border-brand-600' : 'text-brand-400 border-transparent hover:text-brand-600'}`}>
            {t === 'users' ? 'Users' : 'Role History'}
          </button>
        ))}
      </div>

      {notice && <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-sm text-emerald-800">{notice}</div>}

      {tab === 'users' && (
        <>
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or username..."
              aria-label="Search users"
              className="w-full max-w-md rounded-lg border border-brand-200 bg-white py-2.5 pl-9 pr-3 text-sm text-brand-900 placeholder:text-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>

          {loadError ? (
            <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
              {loadError}
              <Button variant="ghost" size="sm" onClick={load}>Retry</Button>
            </div>
          ) : loading ? (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 bg-cream-100 rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<Users className="h-8 w-8" />} title="No users found" description={search ? 'Try a different search.' : 'No users have signed up yet.'} />
          ) : (
            <div className="space-y-2">
              {filtered.map((u) => (
                <div key={u.id} className="bg-white rounded-xl border border-brand-100 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-brand-900 truncate">{u.display_name}</p>
                      <Badge variant={u.account_status === 'suspended' ? 'error' : 'success'}>
                        {u.account_status}
                      </Badge>
                      <Badge variant="info">{u.role}</Badge>
                      {u.secondary_role && <Badge variant="default">+ {u.secondary_role}</Badge>}
                    </div>
                    <p className="text-xs text-brand-400 mt-0.5">@{u.username} · joined {formatDate(u.created_at)}</p>
                    {u.suspended_at && <p className="text-xs text-red-600 mt-1">Suspended: {u.suspension_reason}</p>}
                  </div>
                  <div className="flex gap-2">
                    {(u.role === 'buyer' || (u.role !== 'seller' && u.secondary_role !== 'seller')) && (
                      <Button size="sm" variant="outline" onClick={() => openAction(u, 'seller')}>
                        <Store className="h-4 w-4" /> Make seller
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openAction(u, 'role')}>
                      <Shield className="h-4 w-4" /> Role
                    </Button>
                    {u.account_status === 'suspended' ? (
                      <Button size="sm" variant="outline" onClick={() => openAction(u, 'restore')}>
                        <RotateCcw className="h-4 w-4" /> Restore
                      </Button>
                    ) : (
                      <Button size="sm" variant="danger" onClick={() => openAction(u, 'suspend')}>
                        <Ban className="h-4 w-4" /> Suspend
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'history' && (
        <div>
          {history.length === 0 ? (
            <EmptyState icon={<History className="h-8 w-8" />} title="No role changes yet" description="Role changes, suspensions, and restorations will be logged here." />
          ) : (
            <div className="bg-white rounded-xl border border-brand-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-cream-50 text-brand-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Date</th>
                    <th className="text-left px-4 py-3 font-medium">Action</th>
                    <th className="text-left px-4 py-3 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-100">
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="px-4 py-3 text-brand-600 whitespace-nowrap">{formatDate(h.created_at)}</td>
                      <td className="px-4 py-3 text-brand-800">
                        <span className="font-medium">{h.previous_role}</span> &rarr; <span className="font-medium">{h.new_role}</span>
                      </td>
                      <td className="px-4 py-3 text-brand-500">{h.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal open={actingOn !== null && action === 'role'} onClose={closeAction} title={`Change role — ${actingOn?.display_name ?? ''}`} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-brand-800 mb-1.5">New role</label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as UserRole)}
              className="w-full h-10 px-3 rounded-lg border border-brand-200 bg-white text-sm"
            >
              {roleChoices.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {!isSuperAdmin && <p className="text-xs text-brand-400 mt-1">Only a super admin can assign administrator roles.</p>}
          </div>
          <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          {actionError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{actionError}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeAction}>Cancel</Button>
            <Button onClick={handleConfirm} loading={busy}>Save role</Button>
          </div>
        </div>
      </Modal>

      <Modal open={actingOn !== null && action === 'suspend'} onClose={closeAction} title={`Suspend — ${actingOn?.display_name ?? ''}`} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-brand-600">This user will be signed out and unable to sign in until restored.</p>
          <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} required />
          {actionError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{actionError}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeAction}>Cancel</Button>
            <Button variant="danger" onClick={handleConfirm} loading={busy}>Suspend account</Button>
          </div>
        </div>
      </Modal>

      <Modal open={actingOn !== null && action === 'restore'} onClose={closeAction} title={`Restore — ${actingOn?.display_name ?? ''}`} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-brand-600">This will restore the account to active status.</p>
          {actionError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{actionError}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeAction}>Cancel</Button>
            <Button onClick={handleConfirm} loading={busy}>Restore account</Button>
          </div>
        </div>
      </Modal>

      <Modal open={actingOn !== null && action === 'seller'} onClose={closeAction} title={`Activate seller — ${actingOn?.display_name ?? ''}`} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-brand-600">This user will be able to create a storefront and list products while keeping their buyer account.</p>
          {actionError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{actionError}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeAction}>Cancel</Button>
            <Button onClick={handleConfirm} loading={busy}>Activate seller</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Input({ label, value, onChange, required }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-brand-800 mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={onChange}
        required={required}
        className="w-full h-10 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      />
    </div>
  );
}
