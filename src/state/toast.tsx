import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Check, X } from 'lucide-react';

type Kind = 'success' | 'error';
interface ToastItem { id: number; kind: Kind; message: string }
interface ToastApi { success: (message: string) => void; error: (message: string) => void }

const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, number>());
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems(xs => xs.filter(x => x.id !== id));
  }, []);

  const push = useCallback((kind: Kind, message: string) => {
    const id = nextId.current++;
    setItems(xs => [...xs.slice(-2), { id, kind, message }]);
    timers.current.set(id, window.setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 3500));
  }, [dismiss]);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(h => window.clearTimeout(h));
  }, []);

  const api = useMemo<ToastApi>(() => ({
    success: m => push('success', m),
    error: m => push('error', m),
  }), [push]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
        {items.map(t => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${t.kind === 'error' ? 'bg-red-800' : 'bg-slate-900'}`}
          >
            {t.kind === 'error' ? <AlertCircle size={16} className="mt-0.5 shrink-0" /> : <Check size={16} className="mt-0.5 shrink-0 text-green-400" />}
            <span className="flex-1">{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="opacity-70 hover:opacity-100"><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(ToastCtx);
  if (!v) throw new Error('useToast must be used inside ToastProvider');
  return v;
}
