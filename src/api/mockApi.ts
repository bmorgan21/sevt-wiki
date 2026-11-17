import type {
  AdminUser, Car, Folder, Invitation, Location, Page, PageInput, PageSummary, PageUpdate, PersonRef, Profile,
  Revision, SearchHit, Session, Subteam, SubteamRole, SystemRole, Tree, UserStatus,
} from '../types';
import type { WikiApi } from './types';
import { ApiError } from './errors';
import { createSeedDb, type InviteRow, type PageRow } from './mockDb';
import { canEditSubteam, canInvite, canViewSubteam, isAdmin } from '../lib/permissions';
import { makeExcerpt } from '../lib/text';
import { makeSnippet, searchScore, tokenize } from '../lib/search';
import { normalizeLinks, normalizeTags, validateFolderName, validatePageInput } from '../lib/validation';
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
    ...toSummary(p), content: p.content, links: p.links.map(l => ({ ...l })), createdAt: p.createdAt, createdBy: personRef(p.createdBy),
  });
  const pushRevision = (p: PageRow, note?: string) => {
    db.revisions.push({
      pageId: p.id, version: p.version, title: p.title, content: p.content, tags: [...p.tags],
      links: p.links.map(l => ({ ...l })),
      carId: p.carId, subteamId: p.subteamId, folderId: p.folderId, createdAt: p.updatedAt, authorId: p.updatedBy, note,
    });
  };
  const checked = (input: PageInput): PageInput => {
    const clean: PageInput = { title: input.title.trim(), content: input.content, tags: normalizeTags(input.tags), links: normalizeLinks(input.links) };
    const err = validatePageInput(clean);
    if (err) throw new ApiError('validation', err);
    return clean;
  };

  const toInvitation = (i: InviteRow): Invitation => ({
    id: i.id, email: i.email, name: i.name, invitedBy: i.invitedBy ? personRef(i.invitedBy) : null,
    roles: { ...i.roles }, createdAt: i.createdAt, expiresAt: i.expiresAt, acceptedAt: i.acceptedAt,
  });

  const api: WikiApi = {
    isMock: true,

    auth: {
      async getSession() { await wait(); return currentSession(); },
      async signInWithEmail(email) {
        await wait();
        const e = email.trim().toLowerCase();
        let profile = db.profiles.find(p => p.email.toLowerCase() === e);
        if (!profile) {
          // Mirrors the database gate: an open invitation creates the account on first sign-in.
          const inv = db.invitations.find(i => i.email === e && !i.acceptedAt && Date.parse(i.expiresAt) > Date.now());
          if (!inv) throw new ApiError('auth', 'No account or invitation uses that email.');
          profile = { id: newId('u'), name: inv.name || e.split('@')[0], email: e, systemRole: inv.systemRole, status: 'active' };
          db.profiles.push(profile);
          db.memberships[profile.id] = Object.fromEntries(Object.entries(inv.roles).filter(([id]) => subteamOf(id)));
          inv.acceptedAt = nowIso();
        }
        signInProfile(profile);
      },
      async verifyEmailCode() { /* the mock signs in immediately, so there is nothing to verify */ },
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
        const clean = checked({ title, content: src.content, tags: src.tags, links: src.links });
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
            version: r.version, title: r.title, tags: [...r.tags], links: r.links.map(l => ({ ...l })),
            carId: r.carId, subteamId: r.subteamId, folderId: r.folderId, content: r.content,
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
        const current: Location = { carId: row.carId, subteamId: row.subteamId, folderId: row.folderId };
        // Put the page back where that version lived, if the place still exists and the caller may edit it.
        const wanted: Location = { carId: rev.carId, subteamId: rev.subteamId, folderId: rev.folderId };
        let target = current;
        let placed = true;
        if (!sameSpot(wanted, current)) {
          try {
            const resolved = resolveLocation(wanted);
            if (canEditSubteam(s.user, s.memberships, resolved.subteamId)) target = resolved;
            else placed = false;
          } catch {
            placed = false;
          }
        }
        if (titleTaken(target, rev.title, row.id)) throw new ApiError('validation', `Another page is already called “${rev.title}” in that location.`);
        Object.assign(row, target, {
          title: rev.title, content: rev.content, tags: [...rev.tags], links: rev.links.map(l => ({ ...l })),
          version: row.version + 1, updatedAt: nowIso(), updatedBy: s.user.id,
        });
        pushRevision(row, placed ? `Restored from v${toVersion}` : `Restored from v${toVersion} (its original location is unavailable, so the page stayed where it was)`);
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

    invitations: {
      async list() {
        await wait();
        const s = requireSession();
        return db.invitations
          .filter(i => isAdmin(s.user) || i.invitedBy === s.user.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(toInvitation);
      },
      async create(email, name, roles) {
        await wait();
        const s = requireSession();
        if (!canInvite(s.user, s.memberships)) throw new ApiError('forbidden', 'Only admins and subteam leads can invite people.');
        const e = email.trim().toLowerCase();
        if (e.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new ApiError('validation', 'Enter a valid email address.');
        if (db.profiles.some(p => p.email.toLowerCase() === e)) throw new ApiError('validation', 'That person already has an account.');
        // Admins may grant any role on any subteam; everyone else only on subteams they lead.
        const canAssign = (subteamId: string) => isAdmin(s.user) || s.memberships[subteamId] === 'lead';
        const clean: Record<string, SubteamRole> = {};
        for (const [subteamId, role] of Object.entries(roles ?? {})) {
          if (!role) continue;
          if (!['viewer', 'editor', 'lead'].includes(role)) throw new ApiError('validation', 'Choose viewer, editor or lead.');
          if (!subteamOf(subteamId)) throw new ApiError('validation', 'That subteam doesn’t exist.');
          if (!canAssign(subteamId)) throw new ApiError('forbidden', 'You can only invite people to subteams you lead.');
          clean[subteamId] = role;
        }
        const open = db.invitations.find(i => i.email === e && !i.acceptedAt);
        const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
        if (open) {
          if (open.invitedBy !== s.user.id && !isAdmin(s.user)) {
            throw new ApiError('forbidden', 'Someone else has already invited that address. Ask them, or an admin, to change the invitation.');
          }
          // Replace the roles this person may manage; keep any they may not (e.g. set earlier by an admin).
          const merged = { ...clean };
          for (const [k, v] of Object.entries(open.roles)) if (!canAssign(k)) merged[k] = v;
          if (name.trim()) open.name = name.trim().slice(0, 100);
          open.roles = merged;
          open.expiresAt = expiresAt;
          return toInvitation(open);
        }
        if (!isAdmin(s.user) && db.invitations.filter(i => i.invitedBy === s.user.id && !i.acceptedAt).length >= 25) {
          throw new ApiError('validation', 'You have 25 invitations waiting. Revoke some or wait for people to join.');
        }
        const row: InviteRow = {
          id: newId('inv'), email: e, name: name.trim().slice(0, 100), systemRole: 'user',
          invitedBy: s.user.id, roles: clean, createdAt: nowIso(), expiresAt, acceptedAt: null,
        };
        db.invitations.push(row);
        return toInvitation(row);
      },
      async revoke(id) {
        await wait();
        const s = requireSession();
        const i = db.invitations.find(x => x.id === id && !x.acceptedAt);
        if (!i) throw new ApiError('not_found', 'Invitation not found.');
        if (i.invitedBy !== s.user.id && !isAdmin(s.user)) throw new ApiError('forbidden', 'Only the person who invited them, or an admin, can revoke this.');
        db.invitations.splice(db.invitations.indexOf(i), 1);
      },
    },

    dev: {
      async personas() { await wait(); return db.profiles.map(p => ({ ...p })); },
      async signInAs(id) { await wait(); signInProfile(db.profiles.find(p => p.id === id)); },
    },
  };
  return api;
}
