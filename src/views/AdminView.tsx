import { Shield } from 'lucide-react';
import { AccessDenied, btn, ErrorPanel, Spinner } from '../components/ui';
import { errorMessage } from '../api';
import { useAuth, usePermissions } from '../state/auth';
import { useToast } from '../state/toast';
import {
  useAdminUsers, useSetMemberRole, useSetSubteamRestricted, useSetSystemRole, useSetUserStatus, useSubteams,
} from '../state/queries';
import type { SubteamRole, SystemRole } from '../types';

export default function AdminView() {
  const perms = usePermissions();
  const { session } = useAuth();
  const toast = useToast();
  const { data: users, isLoading, error, refetch } = useAdminUsers(perms.isAdmin);
  const { data: subteams = [] } = useSubteams();
  const setRole = useSetMemberRole();
  const setStatus = useSetUserStatus();
  const setSystem = useSetSystemRole();
  const setRestricted = useSetSubteamRestricted();

  if (!perms.isAdmin) return <AccessDenied />;
  if (isLoading) return <Spinner />;
  if (error || !users) return <ErrorPanel error={error} onRetry={() => { void refetch(); }} />;

  const run = async (p: Promise<unknown>, ok: string) => {
    try { await p; toast.success(ok); } catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Shield size={26} aria-hidden className="text-red-700" />Admin</h1>

      <section aria-labelledby="users-h" className="space-y-3">
        <h2 id="users-h" className="text-base font-semibold text-slate-900">People and subteam access</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
              <tr>
                <th scope="col" className="p-3">Person</th>
                <th scope="col" className="p-3">Site role</th>
                {subteams.map(s => <th key={s.id} scope="col" className="p-3">{s.name}</th>)}
                <th scope="col" className="p-3">Account</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const self = u.id === session?.user.id;
                return (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0">
                    <th scope="row" className="p-3 font-normal">
                      <span className="block font-semibold text-slate-900">{u.name}</span>
                      <span className="block text-xs text-slate-600">{u.email}</span>
                    </th>
                    <td className="p-3">
                      <select
                        aria-label={`Site role for ${u.name}`}
                        value={u.systemRole}
                        disabled={self}
                        onChange={e => { void run(setSystem.mutateAsync({ userId: u.id, role: e.target.value as SystemRole }), `Updated ${u.name}’s site role`); }}
                        className="rounded border border-slate-300 bg-white px-2 py-1"
                      >
                        <option value="user">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    {subteams.map(s => (
                      <td key={s.id} className="p-3">
                        <select
                          aria-label={`${s.name} role for ${u.name}`}
                          value={u.memberships[s.id] ?? ''}
                          onChange={e => { void run(setRole.mutateAsync({ userId: u.id, subteamId: s.id, role: (e.target.value || null) as SubteamRole | null }), `Updated ${u.name}’s ${s.name} access`); }}
                          className="rounded border border-slate-300 bg-white px-2 py-1"
                        >
                          <option value="">No role</option>
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                          <option value="lead">Lead</option>
                        </select>
                      </td>
                    ))}
                    <td className="p-3">
                      <button
                        type="button"
                        className={btn}
                        disabled={self}
                        title={self ? "You can't change your own account here" : undefined}
                        onClick={() => { void run(setStatus.mutateAsync({ userId: u.id, status: u.status === 'active' ? 'deactivated' : 'active' }), u.status === 'active' ? `Deactivated ${u.name}` : `Reactivated ${u.name}`); }}
                      >
                        {u.status === 'active' ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="subteams-h" className="space-y-3">
        <h2 id="subteams-h" className="text-base font-semibold text-slate-900">Subteam visibility</h2>
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {subteams.map(s => (
            <li key={s.id} className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                <p className="text-xs text-slate-600">{s.globalOnly ? 'Global: not tied to a car' : 'Per car'}</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={s.restricted}
                  onChange={e => { void run(setRestricted.mutateAsync({ subteamId: s.id, restricted: e.target.checked }), `${s.name} is now ${e.target.checked ? 'restricted' : 'open to everyone'}`); }}
                />
                Restricted to members
              </label>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
