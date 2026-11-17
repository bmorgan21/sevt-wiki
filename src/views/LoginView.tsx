import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { useAuth } from '../state/auth';
import { btn, btnPrimary, inputCls, labelCls, Spinner } from '../components/ui';

const RESEND_SECONDS = 60;

export default function LoginView() {
  const { session, loading, signIn, verifyCode } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const dev = api.dev;
  const { data: personas = [] } = useQuery({ queryKey: ['dev', 'personas'], queryFn: () => (dev ? dev.personas() : Promise.resolve([])), enabled: !!dev });

  // Messages left by the auth layer (expired link, deactivated account). In an effect so React's
  // dev-mode double render can't swallow the one-time message.
  useEffect(() => {
    const n = api.auth.takeNotice?.();
    if (n) setNotice(n);
  }, []);

  useEffect(() => {
    if (step !== 'code') return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [step]);

  if (loading) return <Spinner />;
  if (session) return <Navigate to={from} replace />;

  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const requestCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(email);
      setStep('code');
      setCode('');
      setNow(Date.now());
      setResendAt(Date.now() + RESEND_SECONDS * 1000);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = (e: FormEvent) => { e.preventDefault(); void requestCode(); };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyCode(email, code);
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

        {notice && <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{notice}</p>}

        {step === 'email' ? (
          <form onSubmit={submitEmail} className="space-y-3">
            <div>
              <label htmlFor="email" className={labelCls}>Email</label>
              <input id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="you@example.com" />
            </div>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>{busy ? 'Sending…' : 'Email me a code'}</button>
            <p className="text-xs text-slate-600">New here? You need an invitation from a current member. Ask them to invite this email address first.</p>
          </form>
        ) : (
          <form onSubmit={submitCode} className="space-y-3">
            <p role="status" className="text-sm text-slate-700">
              If <b>{email}</b> is invited or already has an account, we’ve emailed it a sign-in code. It can take a minute to arrive.
            </p>
            <div>
              <label htmlFor="code" className={labelCls}>Code from the email</label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={10}
                required
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                className={`${inputCls} text-center font-mono text-lg tracking-widest`}
                placeholder="123456"
              />
            </div>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={busy || code.length < 6} className={`${btnPrimary} w-full`}>{busy ? 'Checking…' : 'Sign in'}</button>
            <div className="flex items-center justify-between text-sm">
              <button type="button" className="text-red-800 hover:underline" onClick={() => { setStep('email'); setError(null); }}>Use a different email</button>
              <button type="button" className="text-red-800 hover:underline disabled:text-slate-500 disabled:no-underline" disabled={busy || wait > 0} onClick={() => { void requestCode(); }}>
                {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
              </button>
            </div>
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
