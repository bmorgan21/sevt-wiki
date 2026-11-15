import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Loader2, Lock, SearchX } from 'lucide-react';
import { ApiError, errorMessage } from '../api';

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700';
const base = `inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded disabled:opacity-50 disabled:cursor-not-allowed ${focus}`;

export const btn = `${base} border border-slate-300 bg-white text-slate-800 hover:bg-slate-100`;
export const btnPrimary = `${base} bg-red-800 text-white hover:bg-red-900`;
export const btnDanger = `${base} bg-red-700 text-white hover:bg-red-800`;
export const inputCls = `w-full px-3 py-2 text-sm bg-white rounded border border-slate-300 focus:outline-none focus:border-red-700 focus:ring-2 focus:ring-red-700/30`;
export const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-slate-600">
      <Loader2 className="animate-spin" size={18} aria-hidden />
      {label}
    </div>
  );
}

function Panel({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="max-w-md mx-auto py-16 text-center space-y-3">
      <div className="mx-auto w-fit text-slate-400" aria-hidden>{icon}</div>
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      <div className="text-sm text-slate-600 space-y-3">{children}</div>
    </div>
  );
}

export function NotFoundPanel({ what = 'page' }: { what?: string }) {
  return (
    <Panel icon={<SearchX size={36} />} title={`We can't find that ${what}`}>
      <p>It may have been moved or deleted, or you may not have access to it.</p>
      <Link to="/" className={btn}>Back to the home page</Link>
    </Panel>
  );
}

export function AccessDenied({ message = 'You need admin access to view this page.' }: { message?: string }) {
  return (
    <Panel icon={<Lock size={36} />} title="Access restricted">
      <p>{message}</p>
    </Panel>
  );
}

export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const notFound = error instanceof ApiError && error.code === 'not_found';
  if (notFound) return <NotFoundPanel />;
  return (
    <Panel icon={<AlertTriangle size={36} />} title="Something went wrong">
      <p>{errorMessage(error)}</p>
      {onRetry && <button type="button" onClick={onRetry} className={btn}>Try again</button>}
    </Panel>
  );
}
