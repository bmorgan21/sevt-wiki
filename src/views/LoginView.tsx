import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { useAuth } from '../state/auth';
import { btn, btnPrimary, inputCls, labelCls, Spinner } from '../components/ui';

export default function LoginView() {
  const { session, loading, signIn } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const dev = api.dev;
  const { data: personas = [] } = useQuery({ queryKey: ['dev', 'personas'], queryFn: () => (dev ? dev.personas() : Promise.resolve([])), enabled: !!dev });

  if (loading) return <Spinner />;
  if (session) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="rounded bg-red-800 px-1.5 py-1 text-xs font-bold text-white">MIT</span>
          <div>
            <h1 className="text-lg font-bold text-slate-900">SEV Team Wiki</h1>
            <p className="text-sm text-slate-600">Sign in with your team email</p>
          </div>
        </div>
        {sent ? (
          <p role="status" className="rounded bg-green-50 p-3 text-sm text-green-900">Check your inbox for a sign-in link.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label htmlFor="email" className={labelCls}>Email</label>
              <input id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="you@sev.mit.edu" />
            </div>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
          </form>
        )}
        {dev && (
          <div className="space-y-2 rounded border border-dashed border-amber-400 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-900">Mock mode: sign in as</p>
            <div className="flex flex-wrap gap-2">
              {personas.map(p => (
                <button key={p.id} type="button" className={btn} onClick={() => { dev.signInAs(p.id).catch(err => setError(errorMessage(err))); }}>
                  {p.name}{p.status !== 'active' ? ' (deactivated)' : ''}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
