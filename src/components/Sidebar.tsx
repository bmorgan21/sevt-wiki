import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FileText, Folder, Globe, LogOut, Lock, Search, Settings } from 'lucide-react';
import { api } from '../api';
import { useAuth, usePermissions } from '../state/auth';
import { useActiveCar } from '../state/car';
import { useToast } from '../state/toast';
import { useCars, useSubteams, useTree } from '../state/queries';
import { getIndex, type TreeIndex } from '../lib/tree';
import { errorMessage } from '../api';

interface RowProps {
  to: string;
  active: boolean;
  icon: ReactNode;
  label: string;
  trailing?: ReactNode;
  toggle?: { open: boolean; onClick: () => void };
}
function NavRow({ to, active, icon, label, trailing, toggle }: RowProps) {
  return (
    <div className={`flex items-center rounded text-sm ${active ? 'bg-red-50 font-semibold text-red-800' : 'text-slate-700 hover:bg-slate-100'}`}>
      {toggle ? (
        <button type="button" onClick={toggle.onClick} aria-expanded={toggle.open} aria-label={toggle.open ? `Collapse ${label}` : `Expand ${label}`} className="rounded p-1.5 text-slate-500 hover:bg-slate-200">
          {toggle.open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      ) : <span className="w-[26px] shrink-0" />}
      <Link to={to} aria-current={active ? 'page' : undefined} className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pr-2">
        {icon}
        <span className="truncate">{label}</span>
        {trailing}
      </Link>
    </div>
  );
}

interface TreeProps {
  index: TreeIndex;
  carId: string;
  subteamId: string;
  parentId: string | null;
  expanded: Record<string, boolean>;
  toggle: (key: string) => void;
  pathname: string;
}
function TreeChildren({ index, carId, subteamId, parentId, expanded, toggle, pathname }: TreeProps) {
  const folders = index.foldersIn(subteamId, parentId, carId);
  const pages = index.pagesIn(subteamId, parentId, carId);
  return (
    <div className="ml-3 mt-0.5 space-y-0.5 border-l border-slate-200 pl-1">
      {folders.map(f => {
        const hasKids = index.foldersIn(subteamId, f.id, carId).length + index.pagesIn(subteamId, f.id, carId).length > 0;
        const open = !!expanded[`f:${f.id}`];
        const to = `/c/${carId}/f/${f.id}`;
        return (
          <div key={f.id}>
            <NavRow
              to={to}
              active={pathname === to}
              icon={<Folder size={14} className="shrink-0 text-slate-500" />}
              label={f.name}
              toggle={hasKids ? { open, onClick: () => toggle(`f:${f.id}`) } : undefined}
            />
            {open && hasKids && <TreeChildren index={index} carId={carId} subteamId={subteamId} parentId={f.id} expanded={expanded} toggle={toggle} pathname={pathname} />}
          </div>
        );
      })}
      {pages.map(p => {
        const to = `/c/${carId}/p/${p.id}`;
        return <NavRow key={p.id} to={to} active={pathname === to} icon={<FileText size={13} className="shrink-0 text-slate-500" />} label={p.title} />;
      })}
    </div>
  );
}

function DevPersonaSwitcher() {
  const dev = api.dev;
  const { session } = useAuth();
  const toast = useToast();
  const { data: personas = [] } = useQuery({ queryKey: ['dev', 'personas'], queryFn: () => (dev ? dev.personas() : Promise.resolve([])), enabled: !!dev });
  if (!dev) return null;
  return (
    <label className="mt-3 block rounded border border-dashed border-amber-400 bg-amber-50 p-2 text-xs text-amber-900">
      Dev only: switch persona
      <select
        className="mt-1 w-full rounded border border-amber-300 bg-white px-2 py-1 text-sm text-slate-800"
        value={session?.user.id ?? ''}
        onChange={e => { dev.signInAs(e.target.value).catch(err => toast.error(errorMessage(err))); }}
      >
        {personas.map(p => <option key={p.id} value={p.id}>{p.name} ({p.systemRole}{p.status !== 'active' ? ', deactivated' : ''})</option>)}
      </select>
    </label>
  );
}

export default function Sidebar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const { session, signOut } = useAuth();
  const perms = usePermissions();
  const car = useActiveCar();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: cars = [] } = useCars();
  const { data: subteams = [] } = useSubteams();
  const { data: tree } = useTree();
  const index = tree ? getIndex(tree) : null;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');
  const lastPath = useRef('');

  const toggle = (k: string) => setExpanded(prev => ({ ...prev, [k]: !prev[k] }));

  // Reveal the current location when the URL changes (not on every data refresh).
  useEffect(() => {
    if (!index || lastPath.current === pathname) return;
    lastPath.current = pathname;
    const m = /^\/c\/[^/]+\/(s|f|p)\/([^/]+)/.exec(pathname);
    if (!m) return;
    const [, kind, id] = m;
    let subteamId: string | null = null;
    let folderId: string | null = null;
    if (kind === 's') subteamId = id;
    else if (kind === 'f') {
      const f = index.foldersById.get(id);
      if (f) { subteamId = f.subteamId; folderId = f.id; }
    } else {
      const p = index.pagesById.get(id);
      if (p) { subteamId = p.subteamId; folderId = p.folderId; }
    }
    if (!subteamId) return;
    const open: Record<string, boolean> = { [`s:${subteamId}`]: true };
    for (const f of index.ancestry(folderId)) open[`f:${f.id}`] = true;
    setExpanded(prev => ({ ...prev, ...open }));
  }, [index, pathname]);

  const visible = subteams.filter(sub => {
    if (perms.isAdmin) return true;
    const role = perms.roleIn(sub.id);
    if (role && role !== 'viewer') return true;
    return !!index?.hasContent(sub.id, car.id);
  });

  return (
    <div className="flex h-full flex-col">
      <div className="bg-red-800 p-4 text-white">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="rounded bg-white px-1.5 py-1 text-xs font-bold text-red-800">MIT</span>
            <span>
              <span className="block text-sm font-bold">SEV Team Wiki</span>
              <span className="block text-xs text-red-100">Solar Electric Vehicle</span>
            </span>
          </Link>
          {perms.isAdmin && (
            <Link to="/admin" aria-label="Admin settings" className="rounded p-1.5 hover:bg-red-700"><Settings size={18} /></Link>
          )}
        </div>
        <label className="mt-3 block text-xs font-medium text-red-100">
          Car
          <select
            value={car.id}
            onChange={e => navigate(`/c/${e.target.value}`)}
            className="mt-1 w-full rounded border border-red-600 bg-red-900 px-2.5 py-1.5 text-sm font-semibold text-white"
          >
            {cars.map(c => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
          </select>
        </label>
      </div>

      <div className="space-y-2 border-b border-slate-200 p-3">
        <form
          role="search"
          onSubmit={e => { e.preventDefault(); if (q.trim()) navigate(`/c/${car.id}/search?q=${encodeURIComponent(q.trim())}`); }}
          className="relative"
        >
          <Search size={15} aria-hidden className="absolute left-2.5 top-2.5 text-slate-500" />
          <input
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search page contents"
            aria-label="Search page contents"
            className="w-full rounded border border-slate-300 bg-slate-50 py-2 pl-8 pr-3 text-sm focus:border-red-700 focus:outline-none focus:ring-2 focus:ring-red-700/30"
          />
        </form>
        <button type="button" onClick={onOpenPalette} className="flex w-full items-center justify-between rounded border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
          <span>Jump to a page or folder</span>
          <kbd className="rounded border border-slate-300 bg-white px-1.5 text-xs">Ctrl/⌘ K</kbd>
        </button>
      </div>

      <nav aria-label="Workspace" className="flex-1 space-y-0.5 overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold text-slate-600">
          <span>{car.name} and global</span>
          <Globe size={12} aria-hidden />
        </div>
        {!index && <p className="px-1 text-sm text-slate-500">Loading…</p>}
        {index && visible.length === 0 && <p className="px-1 text-sm text-slate-500">Nothing here yet.</p>}
        {index && visible.map(sub => {
          const hasKids = index.foldersIn(sub.id, null, car.id).length + index.pagesIn(sub.id, null, car.id).length > 0;
          const open = !!expanded[`s:${sub.id}`];
          const to = `/c/${car.id}/s/${sub.id}`;
          return (
            <div key={sub.id}>
              <NavRow
                to={to}
                active={pathname === to}
                icon={sub.globalOnly ? <Globe size={14} className="shrink-0 text-blue-700" /> : <Folder size={14} className="shrink-0 text-red-700" />}
                label={sub.name}
                trailing={sub.restricted ? <Lock size={12} aria-label="Restricted" className="ml-auto shrink-0 text-amber-700" /> : undefined}
                toggle={hasKids ? { open, onClick: () => toggle(`s:${sub.id}`) } : undefined}
              />
              {open && hasKids && <TreeChildren index={index} carId={car.id} subteamId={sub.id} parentId={null} expanded={expanded} toggle={toggle} pathname={pathname} />}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{session?.user.name}</div>
            <div className="truncate text-xs text-slate-600">{perms.isAdmin ? 'Admin' : 'Member'} · {session?.user.email}</div>
          </div>
          <button type="button" onClick={() => { void signOut(); }} aria-label="Sign out" className="rounded p-1.5 text-slate-600 hover:bg-slate-200"><LogOut size={16} /></button>
        </div>
        {api.dev && <DevPersonaSwitcher />}
      </div>
    </div>
  );
}
