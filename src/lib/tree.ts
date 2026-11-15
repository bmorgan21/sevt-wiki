import type { Car, Folder, Location, PageSummary, Subteam, Tree } from '../types';

/** Items with carId null are global and show under every car. */
export const inCar = (itemCarId: string | null, activeCarId: string) => itemCarId === null || itemCarId === activeCarId;

const key = (subteamId: string, parentId: string | null) => `${subteamId}|${parentId ?? ''}`;

function push<T>(map: Map<string, T[]>, k: string, v: T) {
  const arr = map.get(k);
  if (arr) arr.push(v);
  else map.set(k, [v]);
}

export function buildIndex(tree: Tree) {
  const foldersById = new Map(tree.folders.map(f => [f.id, f] as const));
  const pagesById = new Map(tree.pages.map(p => [p.id, p] as const));
  const childFolders = new Map<string, Folder[]>();
  const childPages = new Map<string, PageSummary[]>();
  for (const f of tree.folders) push(childFolders, key(f.subteamId, f.parentId), f);
  for (const p of tree.pages) push(childPages, key(p.subteamId, p.folderId), p);
  childFolders.forEach(v => v.sort((a, b) => a.name.localeCompare(b.name)));
  childPages.forEach(v => v.sort((a, b) => a.title.localeCompare(b.title)));

  /** Root → leaf. Guarded against cycles. */
  const ancestry = (folderId: string | null): Folder[] => {
    const path: Folder[] = [];
    const seen = new Set<string>();
    let cur = folderId ? foldersById.get(folderId) : undefined;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      path.unshift(cur);
      cur = cur.parentId ? foldersById.get(cur.parentId) : undefined;
    }
    return path;
  };

  return {
    folders: tree.folders,
    pages: tree.pages,
    foldersById,
    pagesById,
    ancestry,
    foldersIn: (subteamId: string, parentId: string | null, carId: string) =>
      (childFolders.get(key(subteamId, parentId)) ?? []).filter(f => inCar(f.carId, carId)),
    pagesIn: (subteamId: string, folderId: string | null, carId: string) =>
      (childPages.get(key(subteamId, folderId)) ?? []).filter(p => inCar(p.carId, carId)),
    hasContent: (subteamId: string, carId: string) =>
      tree.folders.some(f => f.subteamId === subteamId && inCar(f.carId, carId)) ||
      tree.pages.some(p => p.subteamId === subteamId && inCar(p.carId, carId)),
    descendantCounts: (folderId: string) => {
      let folders = 0;
      let pages = 0;
      const stack = [folderId];
      const seen = new Set<string>();
      while (stack.length) {
        const id = stack.pop() as string;
        if (seen.has(id)) continue;
        seen.add(id);
        const f = foldersById.get(id);
        if (!f) continue;
        pages += (childPages.get(key(f.subteamId, id)) ?? []).length;
        for (const c of childFolders.get(key(f.subteamId, id)) ?? []) { folders++; stack.push(c.id); }
      }
      return { folders, pages };
    },
  };
}
export type TreeIndex = ReturnType<typeof buildIndex>;

const cache = new WeakMap<Tree, TreeIndex>();
/** Memoised per tree object, so every component can call it without re-indexing. */
export function getIndex(tree: Tree): TreeIndex {
  let idx = cache.get(tree);
  if (!idx) { idx = buildIndex(tree); cache.set(tree, idx); }
  return idx;
}

export interface Crumb { label: string; to?: string; badge?: string }

export function buildCrumbs(index: TreeIndex, car: Car, subteam: Subteam | undefined, folderId: string | null, tail?: string): Crumb[] {
  const crumbs: Crumb[] = [{ label: car.name, to: `/c/${car.id}` }];
  if (subteam) crumbs.push({ label: subteam.name, to: `/c/${car.id}/s/${subteam.id}`, badge: subteam.globalOnly ? 'Global' : undefined });
  for (const f of index.ancestry(folderId)) crumbs.push({ label: f.name, to: `/c/${car.id}/f/${f.id}` });
  if (tail) crumbs.push({ label: tail });
  return crumbs;
}

export interface LocationOption { value: string; label: string; loc: Location }

/** Places the user may put a page, scoped to one car (plus global content). */
export function locationOptions(index: TreeIndex, subteams: Subteam[], canEdit: (subteamId: string) => boolean, carId: string): LocationOption[] {
  const out: LocationOption[] = [];
  for (const sub of subteams) {
    if (!canEdit(sub.id)) continue;
    out.push({
      value: `s:${sub.id}`,
      label: `${sub.name} (top level)`,
      loc: { carId: sub.globalOnly ? null : carId, subteamId: sub.id, folderId: null },
    });
    for (const f of index.folders) {
      if (f.subteamId !== sub.id || !inCar(f.carId, carId)) continue;
      const path = index.ancestry(f.id).map(a => a.name).join(' / ');
      out.push({ value: `f:${f.id}`, label: `${sub.name} / ${path}`, loc: { carId: f.carId, subteamId: sub.id, folderId: f.id } });
    }
  }
  return out;
}
