import { useState, type FormEvent } from 'react';
import { Copy, UserPlus } from 'lucide-react';
import { AccessDenied, btn, btnPrimary, ErrorPanel, inputCls, labelCls, Spinner } from '../components/ui';
import { errorMessage } from '../api';
import { usePermissions } from '../state/auth';
import { useToast } from '../state/toast';
import { useCreateInvitation, useInvitations, useRevokeInvitation, useSubteams } from '../state/queries';
import { fmtDate } from '../lib/format';
import type { Invitation, SubteamRole } from '../types';

const siteUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function roleSummary(roles: Record<string, SubteamRole>, names: Map<string, string>): string {
  return Object.entries(roles).map(([id, role]) => `${cap(role)} on ${names.get(id) ?? 'another subteam'}`).join(', ');
}

function messageFor(inv: { email: string; name: string; roles: Record<string, SubteamRole> }, names: Map<string, string>): string {
  const greeting = `Hi${inv.name ? ` ${inv.name}` : ''}, I’ve invited you to the SEV Team Wiki.`;
  const access = Object.keys(inv.roles).length ? ` You’ll start as: ${roleSummary(inv.roles, names)}.` : '';
  return `${greeting}${access} Open ${siteUrl()}, enter ${inv.email}, and type the 6-digit code we email you to sign in.`;
}

function statusOf(i: Invitation): 'joined' | 'expired' | 'pending' {
  if (i.acceptedAt) return 'joined';
  return Date.parse(i.expiresAt) < Date.now() ? 'expired' : 'pending';
}

export default function InviteView() {
  const toast = useToast();
  const perms = usePermissions();
  const { data: invites, isLoading, error, refetch } = useInvitations(perms.canInvite);
  const { data: subteams = [] } = useSubteams();
  const create = useCreateInvitation();
  const revoke = useRevokeInvitation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<Record<string, SubteamRole | ''>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [last, setLast] = useState<Invitation | null>(null);

  const names = new Map(subteams.map(s => [s.id, s.name] as const));
  // Admins can grant any role anywhere; everyone else only on subteams they lead (the database enforces this too).
  const assignable = subteams.filter(s => perms.isAdmin || perms.roleIn(s.id) === 'lead');

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => toast.success('Message copied'))
      .catch(() => toast.error('Couldn’t copy. Select the text and copy it by hand.'));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const chosen: Record<string, SubteamRole> = {};
    for (const [id, role] of Object.entries(roles)) if (role) chosen[id] = role;
    try {
      const inv = await create.mutateAsync({ email, name, roles: chosen });
      setLast(inv);
      setEmail('');
      setName('');
      setRoles({});
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  if (!perms.canInvite) {
    return <AccessDenied message="Only admins and subteam leads can invite people. Ask one of them to invite your teammate." />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><UserPlus size={26} aria-hidden className="text-red-700" />Invite a teammate</h1>
        <p className="mt-1 text-sm text-slate-600">
          Only invited people can sign up. Everyone can read the open subteams; choose subteam roles below to give them more.
          Invitations last 30 days.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="inv-name" className={labelCls}>Name (optional)</label>
            <input id="inv-name" value={name} onChange={e => setName(e.target.value)} maxLength={100} className={inputCls} />
          </div>
          <div>
            <label htmlFor="inv-email" className={labelCls}>Email</label>
            <input id="inv-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className={labelCls}>Subteam roles (optional)</legend>
          <>
              <p className="text-xs text-slate-600">
                {perms.isAdmin ? 'As an admin you can grant any role on any subteam.' : 'You can grant roles on the subteams you lead.'}
                {' '}Viewers can read, editors can also edit, leads can also manage the subteam.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {assignable.map(s => (
                  <label key={s.id} className="flex items-center justify-between gap-3 rounded border border-slate-200 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate font-medium text-slate-800">{s.name}</span>
                    <select
                      value={roles[s.id] ?? ''}
                      onChange={e => setRoles(r => ({ ...r, [s.id]: e.target.value as SubteamRole | '' }))}
                      className="rounded border border-slate-300 bg-white px-2 py-1"
                    >
                      <option value="">No role</option>
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="lead">Lead</option>
                    </select>
                  </label>
                ))}
              </div>
          </>
        </fieldset>

        {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-600">Inviting an address that already has a pending invitation of yours updates it.</p>
          <button type="submit" className={btnPrimary} disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Invite'}</button>
        </div>
      </form>

      {last && (
        <section role="status" aria-label="Invitation saved" className="space-y-2 rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          <p><b>{last.email}</b> can now sign up{Object.keys(last.roles).length ? ` (${roleSummary(last.roles, names)})` : ''}. We don’t email invitations, so send them this:</p>
          <textarea readOnly rows={4} value={messageFor(last, names)} className="w-full rounded border border-green-300 bg-white p-2 text-sm text-slate-800" />
          <button type="button" className={btn} onClick={() => copy(messageFor(last, names))}><Copy size={14} />Copy message</button>
        </section>
      )}

      <section aria-labelledby="inv-h" className="space-y-3">
        <h2 id="inv-h" className="text-base font-semibold text-slate-900">{perms.isAdmin ? 'All invitations' : 'Your invitations'}</h2>
        {isLoading && <Spinner />}
        {error && <ErrorPanel error={error} onRetry={() => { void refetch(); }} />}
        {invites && invites.length === 0 && <p className="text-sm text-slate-600">No invitations yet.</p>}
        {invites && invites.length > 0 && (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {invites.map(i => {
              const status = statusOf(i);
              const roleList = Object.entries(i.roles);
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{i.name || i.email}</p>
                    <p className="truncate text-xs text-slate-600">
                      {i.name ? `${i.email} · ` : ''}invited {fmtDate(i.createdAt)}{i.invitedBy ? ` by ${i.invitedBy.name}` : ''}
                    </p>
                    {roleList.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-1.5">
                        {roleList.map(([id, role]) => (
                          <span key={id} className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            {names.get(id) ?? 'Another subteam'}: {cap(role)}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${status === 'joined' ? 'bg-green-100 text-green-900' : status === 'expired' ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-900'}`}>
                      {status === 'joined' ? 'Joined' : status === 'expired' ? 'Expired' : 'Waiting'}
                    </span>
                    {status !== 'joined' && (
                      <>
                        {status === 'pending' && <button type="button" className={btn} onClick={() => copy(messageFor(i, names))}><Copy size={14} />Copy message</button>}
                        <button
                          type="button"
                          className={btn}
                          disabled={revoke.isPending}
                          onClick={() => { revoke.mutateAsync(i.id).then(() => toast.success('Invitation revoked')).catch(e => toast.error(errorMessage(e))); }}
                        >
                          Revoke
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
