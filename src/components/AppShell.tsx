import { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useMatch } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import CommandPalette from './CommandPalette';
import { ErrorPanel, Spinner } from './ui';
import { ActiveCarProvider } from '../state/car';
import { useCars } from '../state/queries';
import { storage } from '../lib/storage';

const CAR_KEY = 'sev-wiki:last-car';

export default function AppShell() {
  const { data: cars, isLoading, error, refetch } = useCars();
  const match = useMatch('/c/:carId/*');
  const urlCarId = match?.params.carId;
  const { pathname } = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const activeCar = useMemo(() => {
    if (!cars?.length) return null;
    const stored = storage.get(CAR_KEY);
    return cars.find(c => c.id === urlCarId) ?? cars.find(c => c.id === stored) ?? cars[0];
  }, [cars, urlCarId]);

  useEffect(() => {
    if (activeCar && urlCarId === activeCar.id) storage.set(CAR_KEY, activeCar.id);
  }, [activeCar, urlCarId]);

  useEffect(() => { setNavOpen(false); }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(open => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (isLoading) return <Spinner label="Loading workspace…" />;
  if (error) return <ErrorPanel error={error} onRetry={() => { void refetch(); }} />;
  if (!activeCar) return <ErrorPanel error={new Error('No cars are set up yet. Ask an admin to add one.')} />;
  if (urlCarId && !cars?.some(c => c.id === urlCarId)) return <Navigate to="/" replace />;

  return (
    <ActiveCarProvider value={activeCar}>
      <div className="flex h-dvh bg-slate-50 text-slate-800">
        {navOpen && <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={() => setNavOpen(false)} aria-hidden />}
        <aside className={`fixed inset-y-0 left-0 z-30 w-72 shrink-0 transform border-r border-slate-200 bg-white transition-transform md:static md:translate-x-0 ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <Sidebar onOpenPalette={() => { setNavOpen(false); setPaletteOpen(true); }} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-red-800 px-3 py-2 text-white md:hidden">
            <button type="button" onClick={() => setNavOpen(true)} aria-label="Open navigation" className="rounded p-1.5 hover:bg-red-700"><Menu size={20} /></button>
            <span className="text-sm font-bold">SEV Team Wiki</span>
          </div>
          <main className="flex-1 overflow-y-auto p-4 md:p-8">
            <Outlet />
          </main>
        </div>
      </div>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </ActiveCarProvider>
  );
}
