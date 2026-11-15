import type {
  AdminUser, Car, Folder, Location, Page, PageInput, PageSummary, PageUpdate, PersonRef, Profile,
  Revision, SearchHit, Session, Subteam, SubteamRole, SystemRole, Tree, UserStatus,
} from '../types';
import type { WikiApi } from './types';
import { ApiError } from './errors';
import { createSeedDb, type PageRow } from './mockDb';
import { canEditSubteam, canViewSubteam, isAdmin } from '../lib/permissions';
import { makeExcerpt } from '../lib/text';
import { makeSnippet, searchScore, tokenize } from '../lib/search';
import { normalizeTags, validateFolderName, validatePageInput } from '../lib/validation';
import { storage } from '../lib/storage';

const LATENCY_MS = 120;
const SESSION_KEY = 'sev-wiki:mock-session';
const wait = () => new Promise<void>(resolve => setTimeout(resolve, LATENCY_MS));

/**
 * In-memory stand-in for Supabase. It deliberately plays the role of the DATABASE:
 * it checks the session, applies row-level visibility, validates input, bumps versions
 * and writes revisions, so UI code written against it carries over to the real backend.
 * State resets on reload (except the signed-in persona).
 */
export function createMockApi(): WikiApi {
  const db = createSeedDb();
  let userId: string | null = storage.get(SESSION_KEY);
  const listeners = new Set<(s: Session | null) => void>();

  const nowIso = () => new Date().toISOString();
  const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  const personRef = (id: string): PersonRef => ({ id, name: db.profiles.find(p => p.id === id)?.name ?? 'Unknown user' });

  // ---------- session ----------
  const currentSession = (): Session | null => {
    const user = db.profiles.find(p => p.id === userId);
    if (!user || user.status !== 'active') return null;
    return { user: { ...user }, memberships: { ...(db.memberships[user.id] ?? {}) } };
  };
  const requireSession = (): Session => {
    const s = currentSession();
    if (!s) throw new ApiError('auth', 'Sign in to continue.');
    return s;
  };
  const requireAdmin = (): Session => {
    const s = requireSession();
    if (!isAdmin(s.user)) throw new ApiError('forbidden', 'Only admins can do that.');
    return s;
  };
  const emit = () => {
    const s = currentSession();
    listeners.forEach(cb => cb(s));
  };
  const setUser = (id: string | null) => {
    userId = id;
    if (id) storage.set(SESSION_KEY, id);
    else storage.remove(SESSION_KEY);
    emit();
  };
  const signInProfile = (profile: Profile | undefined) => {
    if (!profile) throw new ApiError('auth', 'No account uses that email. Ask an admin to invite you.');
    if (profile.status !== 'active') throw new ApiError('auth', 'This account has been deactivated.');
    setUser(profile.id);
  };

  // ---------- row-level rules (RLS) ----------
  const subteamOf = (id: string): Subteam | undefined => db.subteams.find(s => s.id === id);
  const canSee = (s: Session, subteamId: string) => {
    const sub = subteamOf(subteamId);
    return !!sub && canViewSubteam(s.user, s.memberships, sub);
  };
  const assertEdit = (s: Session, subteamId: string) => {
    if (!subteamOf(subteamId)) throw new ApiError('not_found', 'Subteam not found.');
    if (!canEditSubteam(s.user, s.memberships, subteamId)) {
      throw new ApiError('forbidden', 'You need editor access in this subteam to do that.');
    }
  };
  const livePage = (id: string) => db.pages.find(p => p.id === id && !p.deletedAt);
  const liveFolder = (id: string) => db.folders.find(f => f.id === id && !f.deletedAt);
  const visiblePage = (s: Session, id: string): PageRow => {
    const p = livePage(id);
    if (!p || !canSee(s, p.subteamId)) throw new ApiError('not_found', 'Page not found.');
    return p;
  };

  /** Derives the true (car, subteam, folder) triple, so rows can never disagree with their folder. */
  const resolveLocation = (loc: Location): Location => {
    if (loc.folderId) {
      const f = liveFolder(loc.folderId);
      if (!f) throw new ApiError('not_found', 'Folder not found.');
      return { carId: f.carId, subteamId: f.subteamId, folderId: f.id };
    }
    const sub = subteamOf(loc.subteamId);
    if (!sub) throw new ApiError('not_found', 'Subteam not found.');
    if (sub.globalOnly) return { carId: null, subteamId: sub.id, folderId: null };
    if (!loc.carId || !db.cars.some(c => c.id === loc.carId)) throw new ApiError('validation', 'Choose a car for this subteam.');
    return { carId: loc.carId, subteamId: sub.id, folderId: null };
  };
  const sameSpot = (a: Location, b: Location) => a.carId === b.carId && a.subteamId === b.subteamId && a.folderId === b.folderId;
  const titleTaken = (loc: Location, title: string, exceptId?: string) =>
    db.pages.some(p => !p.deletedAt && p.id !== exceptId && sameSpot(p, loc) && p.title.toLowerCase() === title.trim().toLowerCase());
  const folderNameTaken = (loc: Location, name: string, exceptId?: string) =>
    db.folders.some(f => !f.deletedAt && f.id !== exceptId && f.carId === loc.carId && f.subteamId === loc.subteamId && f.parentId === loc.folderId && f.name.toLowerCase() === name.trim().toLowerCase());
  const assertVersion = (p: PageRow, expected: number) => {
    if (p.version !== expected) {
      throw new ApiError('conflict', `${personRef(p.updatedBy).name} saved version ${p.version} while you were editing.`, { currentVersion: p.version });
    }
  };

  // ---------- mappers ----------
  const toSummary = (p: PageRow): PageSummary => ({
    id: p.id, carId: p.carId, subteamId: p.subteamId, folderId: p.folderId, title: p.title, tags: [...p.tags],
    excerpt: makeExcerpt(p.content), version: p.version, updatedAt: p.updatedAt, updatedBy: personRef(p.updatedBy),
  });
  const toPage = (p: PageRow): Page => ({
    ...toSummary(p), content: p.content, externalLink: p.externalLink, createdAt: p.createdAt, createdBy: personRef(p.createdBy),
  });
  const pushRevision = (p: PageRow, note?: string) => {
    db.revisions.push({
      pageId: p.id, version: p.version, title: p.title, content: p.content, tags: [...p.tags],
      externalLink: p.externalLink, createdAt: p.updatedAt, authorId: p.updatedBy, note,
    });
  };
  const checked = (input: PageInput): PageInput => {
    const clean: PageInput = { title: input.title.trim(), content: input.content, tags: normalizeTags(input.tags), externalLink: input.externalLink.trim() };
    const err = validatePageInput(clean);
    if (err) throw new ApiError('validation', err);
    return clean;
  };

  const api: WikiApi = {
    isMock: true,

    auth: {
      async getSession() { await wait(); return currentSession(); },
      async signInWithEmail(email) {
        await wait();
        signInProfile(db.profiles.find(p => p.email.toLowerCase() === email.trim().toLowerCase()));
      },
      async signOut() { await wait(); setUser(null); },
      onChange(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    },

    catalog: {
      async cars(): Promise<Car[]> { await wait(); requireSession(); return db.cars.map(c => ({ ...c })); },
      async subteams(): Promise<Subteam[]> {
        await wait();
        const s = requireSession();
        return db.subteams.filter(sub => canViewSubteam(s.user, s.memberships, sub)).map(sub => ({ ...sub }));
      },
    },

    async tree(): Promise<Tree> {
      await wait();
      const s = requireSession();
      const folders: Folder[] = db.folders
        .filter(f => !f.deletedAt && canSee(s, f.subteamId))
        .map(({ deletedAt: _d, ...f }) => f);
      const pages = db.pages.filter(p => !p.deletedAt && canSee(s, p.subteamId)).map(toSummary);
      return { folders, pages };
    },

    pages: {
      async get(id) { await wait(); return toPage(visiblePage(requireSession(), id)); },

      async create(loc, input) {
        await wait();
        const s = requireSession();
        const clean = checked(input);
        const target = resolveLocation(loc);
        assertEdit(s, target.subteamId);
        if (titleTaken(target, clean.title)) throw new ApiError('validation', 'A page with this title already exists here.');
        const at = nowIso();
        const row: PageRow = {
          id: newId('p'), ...target, ...clean, version: 1,
          createdAt: at, createdBy: s.user.id, updatedAt: at, updatedBy: s.user.id, deletedAt: null,
        };
        db.pages.push(row);
        pushRevision(row);
        return toPage(row);
      },

      async update(id, input: PageUpdate, expectedVersion) {
        await wait();
        const s = requireSession();
        const row = visiblePage(s, id);
        assertEdit(s, row.subteamId);
        assertVersion(row, expectedVersion);
        const { location, ...fields } = input;
        const clean = checked(fields);
        const target: Location = location ? resolveLocation(location) : { carId: row.carId, subteamId: row.subteamId, folderId: row.folderId };
        if (location) assertEdit(s, target.subteamId);
        if (titleTaken(target, clean.title, row.id)) throw new ApiError('validation', 'A page with this title already exists here.');
        Object.assign(row, target, clean, { version: row.version + 1, updatedAt: nowIso(), updatedBy: s.user.id });
        pushRevision(row);
        return toPage(row);
      },

      async remove(id) {
        await wait();
        const s = requireSession();
        const row = visiblePage(s, id);
        assertEdit(s, row.subteamId);
        row.deletedAt = nowIso();
      },

      async duplicate(id, title) {
        await wait();
        const s = requireSession();
        const src = visiblePage(s, id);
        assertEdit(s, src.subteamId);
        const clean = checked({ title, content: src.content, tags: src.tags, externalLink: src.externalLink });
        const loc: Location = { carId: src.carId, subteamId: src.subteamId, folderId: src.folderId };
        if (titleTaken(loc, clean.title)) throw new ApiError('validation', 'A page with this title already exists here.');
        const at = nowIso();
        const row: PageRow = { id: newId('p'), ...loc, ...clean, version: 1, createdAt: at, createdBy: s.user.id, updatedAt: at, updatedBy: s.user.id, deletedAt: null };
        db.pages.push(row);
        pushRevision(row, `Duplicated from "${src.title}"`);
        return toPage(row);
      },

      async revisions(id): Promise<Revision[]> {
        await wait();
        visiblePage(requireSession(), id);
        return db.revisions
          .filter(r => r.pageId === id)
          .sort((a, b) => b.version - a.version)
          .map(r => ({
            version: r.version, title: r.title, tags: [...r.tags], externalLink: r.externalLink, content: r.content,
            createdAt: r.createdAt, author: personRef(r.authorId), note: r.note,
          }));
      },

      async rollback(id, toVersion, expectedVersion) {
        await wait();
        const s = requireSession();
        const row = visiblePage(s, id);
        assertEdit(s, row.subteamId);
        assertVersion(row, expectedVersion);
        const rev = db.revisions.find(r => r.pageId === id && r.version === toVersion);
        if (!rev) throw new ApiError('not_found', 'That version no longer exists.');
        const loc: Location = { carId: row.carId, subteamId: row.subteamId, folderId: row.folderId };
        if (titleTaken(loc, rev.title, row.id)) throw new ApiError('validation', `Another page is already called "${rev.title}" here.`);
        Object.assign(row, { title: rev.title, content: rev.content, tags: [...rev.tags], externalLink: rev.externalLink, version: row.version + 1, updatedAt: nowIso(), updatedBy: s.user.id });
        pushRevision(row, `Restored from v${toVersion}`);
        return toPage(row);
      },

      async search(q): Promise<SearchHit[]> {
        await wait();
        const s = requireSession();
        const tokens = tokenize(q);
        if (q.trim().length < 2 || !tokens.length) return [];
        return db.pages
          .filter(p => !p.deletedAt && canSee(s, p.subteamId))
          .map(p => ({ p, score: searchScore(p, tokens) }))
          .filter(x => x.score > 0)
          .sort((a, b) => b.score - a.score || b.p.updatedAt.localeCompare(a.p.updatedAt))
          .slice(0, 50)
          .map(x => ({ page: toSummary(x.p), snippet: makeSnippet(x.p.content, tokens) }));
      },
    },

    folders: {
      async create(parent, name) {
        await wait();
        const s = requireSession();
        const err = validateFolderName(name);
        if (err) throw new ApiError('validation', err);
        const target = resolveLocation(parent);
        assertEdit(s, target.subteamId);
        if (folderNameTaken(target, name)) throw new ApiError('validation', 'A folder with this name already exists here.');
        const row = { id: newId('f'), carId: target.carId, subteamId: target.subteamId, parentId: target.folderId, name: name.trim(), deletedAt: null };
        db.folders.push(row);
        const { deletedAt: _d, ...folder } = row;
        return folder;
      },
      async rename(id, name) {
        await wait();
        const s = requireSession();
        const row = liveFolder(id);
        if (!row || !canSee(s, row.subteamId)) throw new ApiError('not_found', 'Folder not found.');
        assertEdit(s, row.subteamId);
        const err = validateFolderName(name);
        if (err) throw new ApiError('validation', err);
        if (folderNameTaken({ carId: row.carId, subteamId: row.subteamId, folderId: row.parentId }, name, id)) {
          throw new ApiError('validation', 'A folder with this name already exists here.');
        }
        row.name = name.trim();
        const { deletedAt: _d, ...folder } = row;
        return folder;
      },
      async remove(id) {
        await wait();
        const s = requireSession();
        const row = liveFolder(id);
        if (!row || !canSee(s, row.subteamId)) throw new ApiError('not_found', 'Folder not found.');
        assertEdit(s, row.subteamId);
        const at = nowIso();
        const doomed = new Set<string>([id]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const f of db.folders) {
            if (!f.deletedAt && f.parentId && doomed.has(f.parentId) && !doomed.has(f.id)) { doomed.add(f.id); grew = true; }
          }
        }
        db.folders.forEach(f => { if (doomed.has(f.id)) f.deletedAt = at; });
        db.pages.forEach(p => { if (p.folderId && doomed.has(p.folderId)) p.deletedAt = at; });
      },
    },

    admin: {
      async users(): Promise<AdminUser[]> {
        await wait();
        requireAdmin();
        return db.profiles.map(p => ({ ...p, memberships: { ...(db.memberships[p.id] ?? {}) } }));
      },
      async setMemberRole(targetId: string, subteamId: string, role: SubteamRole | null) {
        await wait();
        requireAdmin();
        if (!db.profiles.some(p => p.id === targetId)) throw new ApiError('not_found', 'User not found.');
        if (!subteamOf(subteamId)) throw new ApiError('not_found', 'Subteam not found.');
        const m = db.memberships[targetId] ?? {};
        if (role) m[subteamId] = role;
        else delete m[subteamId];
        db.memberships[targetId] = m;
      },
      async setUserStatus(targetId: string, status: UserStatus) {
        await wait();
        const s = requireAdmin();
        if (targetId === s.user.id && status !== 'active') throw new ApiError('validation', "You can't deactivate your own account.");
        const p = db.profiles.find(x => x.id === targetId);
        if (!p) throw new ApiError('not_found', 'User not found.');
        p.status = status;
      },
      async setSystemRole(targetId: string, role: SystemRole) {
        await wait();
        const s = requireAdmin();
        if (targetId === s.user.id && role !== 'admin') throw new ApiError('validation', "You can't remove your own admin access.");
        const p = db.profiles.find(x => x.id === targetId);
        if (!p) throw new ApiError('not_found', 'User not found.');
        p.systemRole = role;
      },
      async setSubteamRestricted(subteamId: string, restricted: boolean) {
        await wait();
        requireAdmin();
        const sub = subteamOf(subteamId);
        if (!sub) throw new ApiError('not_found', 'Subteam not found.');
        sub.restricted = restricted;
      },
    },

    dev: {
      async personas() { await wait(); return db.profiles.map(p => ({ ...p })); },
      async signInAs(id) { await wait(); signInProfile(db.profiles.find(p => p.id === id)); },
    },
  };
  return api;
}
