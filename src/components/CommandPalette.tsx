import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Folder, Search } from 'lucide-react';
import { useActiveCar } from '../state/car';
import { useCars, useSubteams, useTree } from '../state/queries';
import { getIndex, inCar } from '../lib/tree';
import { fuzzyScore } from '../lib/search';

interface Item { key: string; kind: 'folder' | 'page' | 'search'; title: string; path: string; to: string; carId: string | null }

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const car = useActiveCar();
  const navigate = useNavigate();
  const { data: cars = [] } = useCars();
  const { data: subteams = [] } = useSubteams();
  const { data: tree } = useTree();
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const all = useMemo<Item[]>(() => {
    if (!tree) return [];
    const index = getIndex(tree);
    const subById = new Map(subteams.map(s => [s.id, s] as const));
    const carName = (id: string | null) => (id === null ? 'Global' : cars.find(c => c.id === id)?.name ?? id);
    const items: Item[] = [];
    // Only real combinations: global-only subteams once, others once per car.
    for (const sub of subteams) {
      const carIds: Array<string | null> = sub.globalOnly ? [null] : cars.map(c => c.id);
      for (const cid of carIds) {
        items.push({ key: `root:${sub.id}:${cid}`, kind: 'folder', title: `${sub.name} (top level)`, path: `${carName(cid)}/${sub.name}`, to: `/c/${cid ?? car.id}/s/${sub.id}`, carId: cid });
      }
    }
    for (const f of tree.folders) {
      const sub = subById.get(f.subteamId);
      if (!sub) continue;
      const trail = index.ancestry(f.id).map(a => a.name).join('/');
      items.push({ key: `f:${f.id}`, kind: 'folder', title: f.name, path: `${carName(f.carId)}/${sub.name}/${trail}`, to: `/c/${f.carId ?? car.id}/f/${f.id}`, carId: f.carId });
    }
    for (const p of tree.pages) {
      const sub = subById.get(p.subteamId);
      if (!sub) continue;
      const trail = index.ancestry(p.folderId).map(a => a.name).join('/');
      items.push({ key: `p:${p.id}`, kind: 'page', title: p.title, path: `${carName(p.carId)}/${sub.name}/${trail ? trail + '/' : ''}${p.title}`, to: `/c/${p.carId ?? car.id}/p/${p.id}`, carId: p.carId });
    }
    return items;
  }, [tree, subteams, cars, car.id]);

  const results = useMemo<Item[]>(() => {
    const raw = query.trim();
    const q = raw.replace(/\s*\/\s*/g, '/');
    let list: Item[];
    if (!q) {
      list = all.filter(i => inCar(i.carId, car.id)).sort((a, b) => a.path.localeCompare(b.path)).slice(0, 30);
    } else {
      list = all
        .map(item => ({ item, score: fuzzyScore(item.path, q) }))
        .filter((x): x is { item: Item; score: number } => x.score !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 50)
        .map(x => x.item);
    }
    if (raw.length >= 2) {
      list = [...list, { key: 'search', kind: 'search', title: `Search page contents for “${raw}”`, path: 'Full-text search', to: `/c/${car.id}/search?q=${encodeURIComponent(raw)}`, carId: null }];
    }
    return list;
  }, [all, query, car.id]);

  const active = Math.min(sel, Math.max(results.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    navigate(item.to);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(Math.min(active + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(Math.max(active - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/50 p-4 pt-24" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Jump to a page or folder" className="flex max-h-[60vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center border-b border-slate-200 px-4 py-3">
          <Search size={18} aria-hidden className="mr-3 text-slate-500" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={results[active] ? `palette-${results[active].key}` : undefined}
            value={query}
            onChange={e => { setQuery(e.target.value); setSel(0); }}
            onKeyDown={onKeyDown}
            placeholder="Type a path, e.g. sol/bat/bms"
            aria-label="Jump to a page or folder"
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          <kbd className="ml-2 rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-500">Esc</kbd>
        </div>
        <div ref={listRef} id="palette-list" role="listbox" className="flex-1 space-y-0.5 overflow-y-auto bg-slate-50 p-2">
          {results.length === 0 && <div className="p-4 text-center text-sm text-slate-600">No matches.</div>}
          {results.map((item, i) => {
            const on = i === active;
            return (
              <div
                key={item.key}
                id={`palette-${item.key}`}
                data-index={i}
                role="option"
                aria-selected={on}
                onClick={() => go(item)}
                onMouseEnter={() => setSel(i)}
                className={`flex cursor-pointer items-center rounded px-3 py-2 ${on ? 'bg-red-800 text-white' : 'text-slate-800 hover:bg-slate-200'}`}
              >
                {item.kind === 'page' ? <FileText size={16} aria-hidden /> : item.kind === 'folder' ? <Folder size={16} aria-hidden /> : <Search size={16} aria-hidden />}
                <div className="ml-3 min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{item.title}</div>
                  <div className={`truncate text-xs ${on ? 'text-red-100' : 'text-slate-600'}`}>{item.path}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
