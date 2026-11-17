import { createClient } from '@supabase/supabase-js';
import type { WikiApi } from './types';
import { ApiError } from './errors';
import { toApiError, type DbError } from './supabaseErrors';
import type {
  AdminUser, Car, Folder, Invitation, Memberships, Page, PageLink, PageSummary, PersonRef,
  Profile, Revision, SearchHit, Session, Subteam, SubteamRole, SystemRole, UserStatus,
} from '../types';

// ---------- row shapes as PostgREST returns them ----------
interface PersonRow { id: string; name: string }
interface SummaryRow {
  id: string; car_id: string | null; subteam_id: string; folder_id: string | null; title: string;
  tags: string[]; excerpt: string; version: number; updated_at: string; updated_by: PersonRow | null;
}
interface PageRow extends SummaryRow {
  content: string; links: PageLink[] | null; created_at: string; created_by: PersonRow | null;
}
interface RevisionRow {
  version: number; title: string; content: string; tags: string[]; links: PageLink[] | null;
  car_id: string | null; subteam_id: string; folder_id: string | null; note: string | null;
  created_at: string; author: PersonRow | null;
}
interface FolderRow { id: string; car_id: string | null; subteam_id: string; parent_id: string | null; name: string }
interface ProfileRow { id: string; email: string; name: string; system_role: SystemRole; status: UserStatus }
interface InvitationRow {
  id: string; email: string; name: string; roles: Record<string, SubteamRole> | null; created_at: string; expires_at: string; accepted_at: string | null;
  invited_by: PersonRow | null;
}
interface SearchRow {
  id: string; car_id: string | null; subteam_id: string; folder_id: string | null; title: string; tags: string[];
  excerpt: string; version: number; updated_at: string; updated_by_id: string | null; updated_by_name: string | null; snippet: string;
}

// Never select `fts` (large, useless to the browser). The embedded `profiles!<fk>` joins are named after the
// foreign keys created in supabase/sql/01_schema.sql.
const SUMMARY_COLS =
  'id,car_id,subteam_id,folder_id,title,tags,excerpt,version,updated_at,updated_by:profiles!pages_updated_by_fkey(id,name)';
const PAGE_COLS =
  'id,car_id,subteam_id,folder_id,title,content,excerpt,tags,links,version,created_at,updated_at,' +
  'created_by:profiles!pages_created_by_fkey(id,name),updated_by:profiles!pages_updated_by_fkey(id,name)';
const REVISION_COLS =
  'version,title,content,tags,links,car_id,subteam_id,folder_id,note,created_at,author:profiles!page_revisions_author_id_fkey(id,name)';
const FOLDER_COLS = 'id,car_id,subteam_id,parent_id,name';
const INVITATION_COLS =
  'id,email,name,roles,created_at,expires_at,accepted_at,invited_by:profiles!invitations_invited_by_fkey(id,name)';

const person = (p: PersonRow | null): PersonRef => p ?? { id: '', name: 'Former member' };
const cleanLinks = (links: PageLink[] | null): PageLink[] =>
  (links ?? []).map(l => ({ url: String(l.url ?? ''), name: String(l.name ?? '') }));

const toSummary = (r: SummaryRow): PageSummary => ({
  id: r.id, carId: r.car_id, subteamId: r.subteam_id, folderId: r.folder_id, title: r.title,
  tags: r.tags ?? [], excerpt: r.excerpt ?? '', version: r.version, updatedAt: r.updated_at, updatedBy: person(r.updated_by),
});
const toPage = (r: PageRow): Page => ({
  ...toSummary(r), content: r.content, links: cleanLinks(r.links), createdAt: r.created_at, createdBy: person(r.created_by),
});
const toRevision = (r: RevisionRow): Revision => ({
  version: r.version, title: r.title, content: r.content, tags: r.tags ?? [], links: cleanLinks(r.links),
  carId: r.car_id, subteamId: r.subteam_id, folderId: r.folder_id, note: r.note ?? undefined,
  createdAt: r.created_at, author: person(r.author),
});
const toFolder = (r: FolderRow): Folder => ({
  id: r.id, carId: r.car_id, subteamId: r.subteam_id, parentId: r.parent_id, name: r.name,
});
const toProfile = (r: ProfileRow): Profile => ({
  id: r.id, email: r.email, name: r.name, systemRole: r.system_role, status: r.status,
});
const toInvitation = (r: InvitationRow): Invitation => ({
  id: r.id, email: r.email, name: r.name, invitedBy: r.invited_by, roles: r.roles ?? {}, createdAt: r.created_at,
  expiresAt: r.expires_at, acceptedAt: r.accepted_at,
});

// ---------- url hygiene ----------
/** Reads (and removes) an error Supabase Auth put in the URL, e.g. an expired sign-in link. */
function readAuthRedirectError(): string | null {
  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.startsWith('#error') ? url.hash.slice(1) : '');
  const message = url.searchParams.get('error_description') ?? hashParams.get('error_description');
  if (message) {
    ['error', 'error_code', 'error_description'].forEach(k => url.searchParams.delete(k));
    if (url.hash.startsWith('#error')) url.hash = '';
    window.history.replaceState(null, '', url.toString());
  }
  return message;
}
function stripCodeParam(): void {
  const url = new URL(window.location.href);
  if (url.searchParams.has('code')) {
    url.searchParams.delete('code');
    window.history.replaceState(null, '', url.toString());
  }
}

type Result = { data: unknown; error: DbError | null };

export function createSupabaseApi(url: string, anonKey: string): WikiApi {
  let notice: string | null = readAuthRedirectError();

  const supabase = createClient(url, anonKey, {
    // PKCE keeps tokens out of the URL, which matters because the app uses hash routing.
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  let currentUserId: string | null = null;

  const must = async (q: PromiseLike<Result>): Promise<unknown> => {
    const { data, error } = await q;
    if (error) throw toApiError(error);
    return data;
  };
  const rpc = (fn: string, args: Record<string, unknown>) => must(supabase.rpc(fn, args));

  /** PostgREST returns at most 1000 rows per request, so read big tables in pages. */
  async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<Result>): Promise<T[]> {
    const size = 1000;
    const out: T[] = [];
    for (let from = 0; ; from += size) {
      const rows = ((await must(build(from, from + size - 1))) ?? []) as T[];
      out.push(...rows);
      if (rows.length < size) break;
    }
    return out;
  }

  async function loadSession(userId: string): Promise<Session | null> {
    const profRows = (await must(
      supabase.from('profiles').select('id,email,name,system_role,status').eq('id', userId).limit(1),
    )) as ProfileRow[] | null;
    const row = profRows?.[0];
    if (!row) {
      notice = 'No profile exists for that account. Ask a teammate to invite you.';
      await supabase.auth.signOut();
      return null;
    }
    if (row.status !== 'active') {
      notice = 'This account has been deactivated. Ask an admin to reactivate it.';
      await supabase.auth.signOut();
      return null;
    }
    const memberRows = ((await must(
      supabase.from('memberships').select('subteam_id,role').eq('user_id', userId),
    )) ?? []) as Array<{ subteam_id: string; role: SubteamRole }>;
    const memberships: Memberships = {};
    memberRows.forEach(m => { memberships[m.subteam_id] = m.role; });
    return { user: toProfile(row), memberships };
  }

  const pageById = async (id: string): Promise<Page> => {
    const rows = (await must(
      supabase.from('pages').select(PAGE_COLS).eq('id', id).is('deleted_at', null).limit(1),
    )) as unknown as PageRow[] | null;
    if (!rows?.length) throw new ApiError('not_found', 'Page not found.');
    return toPage(rows[0]);
  };
  const folderById = async (id: string): Promise<Folder> => {
    const rows = (await must(supabase.from('folders').select(FOLDER_COLS).eq('id', id).limit(1))) as FolderRow[] | null;
    if (!rows?.length) throw new ApiError('not_found', 'Folder not found.');
    return toFolder(rows[0]);
  };
  const invitationById = async (id: string): Promise<Invitation> => {
    const rows = (await must(supabase.from('invitations').select(INVITATION_COLS).eq('id', id).limit(1))) as unknown as InvitationRow[] | null;
    if (!rows?.length) throw new ApiError('not_found', 'Invitation not found.');
    return toInvitation(rows[0]);
  };

  const api: WikiApi = {
    isMock: false,

    auth: {
      async getSession() {
        const { data, error } = await supabase.auth.getSession();
        stripCodeParam();
        if (error) throw toApiError(error);
        if (!data.session) return null;
        const session = await loadSession(data.session.user.id);
        currentUserId = session?.user.id ?? null;
        return session;
      },

      async signInWithEmail(email) {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
        });
        if (error) {
          // The database refuses sign-ups that have no invitation. Look identical to success so the
          // login form can't be used to find out who is (or isn't) on the team.
          if (/database error saving new user/i.test(error.message)) return;
          throw toApiError(error);
        }
      },

      async verifyEmailCode(email, code) {
        const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
        if (error) throw new ApiError('auth', 'That code is invalid or has expired. Request a new one.');
      },

      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw toApiError(error);
      },

      onChange(cb) {
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return;
          // Don't call back into supabase from inside this handler (it can deadlock); defer a tick.
          setTimeout(() => {
            void (async () => {
              try {
                if (!session) { currentUserId = null; cb(null); return; }
                if (session.user.id === currentUserId) return; // same person (tab refocus, user update)
                const s = await loadSession(session.user.id);
                currentUserId = s?.user.id ?? null;
                cb(s);
              } catch {
                cb(null);
              }
            })();
          }, 0);
        });
        return () => data.subscription.unsubscribe();
      },

      takeNotice() {
        const n = notice;
        notice = null;
        return n;
      },
    },

    catalog: {
      async cars(): Promise<Car[]> {
        const rows = (await must(supabase.from('cars').select('id,name,status').order('sort_order').order('name'))) as Car[] | null;
        return rows ?? [];
      },
      async subteams(): Promise<Subteam[]> {
        const rows = ((await must(
          supabase.from('subteams').select('id,name,restricted,global_only').order('sort_order').order('name'),
        )) ?? []) as Array<{ id: string; name: string; restricted: boolean; global_only: boolean }>;
        return rows.map(r => ({ id: r.id, name: r.name, restricted: r.restricted, globalOnly: r.global_only }));
      },
    },

    async tree() {
      const [folders, pages] = await Promise.all([
        fetchAll<FolderRow>((a, b) => supabase.from('folders').select(FOLDER_COLS).is('deleted_at', null).order('id').range(a, b)),
        fetchAll<SummaryRow>((a, b) => supabase.from('pages').select(SUMMARY_COLS).is('deleted_at', null).order('id').range(a, b)),
      ]);
      return { folders: folders.map(toFolder), pages: pages.map(toSummary) };
    },

    pages: {
      get: pageById,

      async create(loc, input) {
        const id = (await rpc('create_page', {
          p_car_id: loc.carId, p_subteam_id: loc.subteamId, p_folder_id: loc.folderId,
          p_title: input.title, p_content: input.content, p_tags: input.tags, p_links: input.links,
        })) as string;
        return pageById(id);
      },

      async update(id, input, expectedVersion) {
        const move = !!input.location;
        await rpc('save_page', {
          p_id: id, p_expected_version: expectedVersion,
          p_title: input.title, p_content: input.content, p_tags: input.tags, p_links: input.links,
          p_move: move,
          p_car_id: input.location?.carId ?? null,
          p_subteam_id: input.location?.subteamId ?? null,
          p_folder_id: input.location?.folderId ?? null,
        });
        return pageById(id);
      },

      async remove(id) { await rpc('delete_page', { p_id: id }); },

      async duplicate(id, title) {
        const newId = (await rpc('duplicate_page', { p_id: id, p_title: title })) as string;
        return pageById(newId);
      },

      async revisions(id): Promise<Revision[]> {
        // Make sure the page itself is visible, so a hidden page reads as "not found" rather than "no history".
        await pageById(id);
        const rows = ((await must(
          supabase.from('page_revisions').select(REVISION_COLS).eq('page_id', id).order('version', { ascending: false }),
        )) ?? []) as unknown as RevisionRow[];
        return rows.map(toRevision);
      },

      async rollback(id, toVersion, expectedVersion) {
        await rpc('rollback_page', { p_id: id, p_to_version: toVersion, p_expected_version: expectedVersion });
        return pageById(id);
      },

      async search(q): Promise<SearchHit[]> {
        if (q.trim().length < 2) return [];
        const rows = ((await rpc('search_pages', { q })) ?? []) as SearchRow[];
        return rows.map(r => ({
          page: toSummary({
            id: r.id, car_id: r.car_id, subteam_id: r.subteam_id, folder_id: r.folder_id, title: r.title, tags: r.tags,
            excerpt: r.excerpt, version: r.version, updated_at: r.updated_at,
            updated_by: r.updated_by_id ? { id: r.updated_by_id, name: r.updated_by_name ?? 'Former member' } : null,
          }),
          snippet: (r.snippet ?? '').replace(/[«»]/g, '').replace(/\s+/g, ' ').trim(),
        }));
      },
    },

    folders: {
      async create(parent, name) {
        const id = (await rpc('create_folder', {
          p_car_id: parent.carId, p_subteam_id: parent.subteamId, p_parent_id: parent.folderId, p_name: name,
        })) as string;
        return folderById(id);
      },
      async rename(id, name) {
        await rpc('rename_folder', { p_id: id, p_name: name });
        return folderById(id);
      },
      async remove(id) { await rpc('delete_folder', { p_id: id }); },
    },

    admin: {
      async users(): Promise<AdminUser[]> {
        const rows = ((await must(
          supabase.from('profiles').select('id,email,name,system_role,status,memberships(subteam_id,role)').order('name'),
        )) ?? []) as unknown as Array<ProfileRow & { memberships: Array<{ subteam_id: string; role: SubteamRole }> }>;
        return rows.map(r => {
          const memberships: Memberships = {};
          (r.memberships ?? []).forEach(m => { memberships[m.subteam_id] = m.role; });
          return { ...toProfile(r), memberships };
        });
      },
      async setMemberRole(userId, subteamId, role) {
        await rpc('admin_set_member_role', { p_user_id: userId, p_subteam_id: subteamId, p_role: role });
      },
      async setUserStatus(userId, status) {
        await rpc('admin_set_user_status', { p_user_id: userId, p_status: status });
      },
      async setSystemRole(userId, role) {
        await rpc('admin_set_system_role', { p_user_id: userId, p_role: role });
      },
      async setSubteamRestricted(subteamId, restricted) {
        await rpc('admin_set_subteam_restricted', { p_subteam_id: subteamId, p_restricted: restricted });
      },
    },

    invitations: {
      async list() {
        const rows = ((await must(
          supabase.from('invitations').select(INVITATION_COLS).order('created_at', { ascending: false }).limit(200),
        )) ?? []) as unknown as InvitationRow[];
        return rows.map(toInvitation);
      },
      async create(email, name, roles) {
        const id = (await rpc('invite_user', { p_email: email, p_name: name, p_roles: roles })) as string;
        return invitationById(id);
      },
      async revoke(id) { await rpc('revoke_invitation', { p_id: id }); },
    },
  };
  return api;
}
