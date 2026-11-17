import { useState, type FormEvent } from 'react';
import { Copy, UserPlus } from 'lucide-react';
import { btn, btnPrimary, ErrorPanel, inputCls, labelCls, Spinner } from '../components/ui';
import { errorMessage } from '../api';
import { usePermissions } from '../state/auth';
import { useToast } from '../state/toast';
import { useCreateInvitation, useInvitations, useRevokeInvitation } from '../state/queries';
import { fmtDate } from '../lib/format';
import type { Invitation } from '../types';

const siteUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}`;

const messageFor = (email: string, name: string) =>
  `Hi${name ? ` ${name}` : ''}, I’ve invited you to the SEV Team Wiki. Open ${siteUrl()}, enter ${email}, and type the 6-digit code we email you to sign in.`;

function statusOf(i: Invitation): 'joined' | 'expired' | 'pending' {
  if (i.acceptedAt) return 'joined';
  return Date.parse(i.expiresAt) < Date.now() ? 'expired' : 'pending';
}

export default function InviteView() {
  const toast = useToast();
  const perms = usePermissions();
  const { data: invites, isLoading, error, refetch } = useInvitations();
  const create = useCreateInvitation();
  const revoke = useRevokeInvitation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [last, setLast] = useState<{ email: string; name: string } | null>(null);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => toast.success('Message copied'))
      .catch(() => toast.error('Couldn’t copy. Select the text and copy it by hand.'));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const inv = await create.mutateAsync({ email, name });
      setLast({ email: inv.email, name: inv.name });
      setEmail('');
      setName('');
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><UserPlus size={26} aria-hidden className="text-red-700" />Invite a teammate</h1>
        <p className="mt-1 text-sm text-slate-600">
          Only invited people can sign up. They’ll be able to read the open subteams; an admin can add roles or restricted-subteam access afterwards.
          Invitations last 30 days.
        </p>
      </div>

      <form onSubmit={submit} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
        <div>
          <label htmlFor="inv-name" className={labelCls}>Name (optional)</label>
          <input id="inv-name" value={name} onChange={e => setName(e.target.value)} maxLength={100} className={inputCls} />
        </div>
        <div>
          <label htmlFor="inv-email" className={labelCls}>Email</label>
          <input id="inv-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
        </div>
        <button type="submit" className={btnPrimary} disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Invite'}</button>
        {formError && <p role="alert" className="text-sm text-red-700 sm:col-span-3">{formError}</p>}
      </form>

      {last && (
        <section role="status" aria-label="Invitation saved" className="space-y-2 rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          <p><b>{last.email}</b> can now sign up. We don’t email invitations, so send them this:</p>
          <textarea readOnly rows={3} value={messageFor(last.email, last.name)} className="w-full rounded border border-green-300 bg-white p-2 text-sm text-slate-800" />
          <button type="button" className={btn} onClick={() => copy(messageFor(last.email, last.name))}><Copy size={14} />Copy message</button>
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
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{i.name || i.email}</p>
                    <p className="truncate text-xs text-slate-600">
                      {i.name ? `${i.email} · ` : ''}invited {fmtDate(i.createdAt)}{i.invitedBy ? ` by ${i.invitedBy.name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${status === 'joined' ? 'bg-green-100 text-green-900' : status === 'expired' ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-900'}`}>
                      {status === 'joined' ? 'Joined' : status === 'expired' ? 'Expired' : 'Waiting'}
                    </span>
                    {status !== 'joined' && (
                      <>
                        {status === 'pending' && <button type="button" className={btn} onClick={() => copy(messageFor(i.email, i.name))}><Copy size={14} />Copy message</button>}
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
