import type {
  AdminUser, Car, Folder, Invitation, Location, Page, PageInput, PageUpdate, Profile, Revision,
  SearchHit, Session, Subteam, SubteamRole, SystemRole, Tree, UserStatus,
} from '../types';

/**
 * The only surface the UI talks to. The mock implements it in memory; the real one
 * will wrap supabase-js. Rules both must follow:
 *  - Every method rejects with ApiError.
 *  - Permissions are enforced HERE (RLS in Supabase), never trusted from the UI.
 *    Restricted rows are not returned at all, so the UI cannot leak them.
 *  - Writes that edit existing pages take the version the editor started from and
 *    reject with code 'conflict' if it moved (optimistic locking).
 */
export interface WikiApi {
  readonly isMock: boolean;

  auth: {
    getSession(): Promise<Session | null>;             // supabase.auth.getSession() + profiles/memberships select
    /** Emails a 6-digit code. Must look the same whether or not the address is invited (no account enumeration). */
    signInWithEmail(email: string): Promise<void>;     // supabase.auth.signInWithOtp({ email })
    verifyEmailCode(email: string, code: string): Promise<void>; // supabase.auth.verifyOtp({ email, token, type: 'email' })
    /** One-time message for the login screen (expired link, deactivated account...). */
    takeNotice?(): string | null;
    signOut(): Promise<void>;                          // supabase.auth.signOut()
    onChange(cb: (s: Session | null) => void): () => void; // supabase.auth.onAuthStateChange
  };

  catalog: {
    cars(): Promise<Car[]>;                            // from('cars').select()
    subteams(): Promise<Subteam[]>;                    // from('subteams').select()  (RLS hides restricted ones)
  };

  tree(): Promise<Tree>;                               // folders + pages WITHOUT content (select id,title,excerpt,...)

  pages: {
    get(id: string): Promise<Page>;                    // from('pages').select('*').eq('id', id).single()
    create(loc: Location, input: PageInput): Promise<Page>;                          // rpc('create_page')
    update(id: string, input: PageUpdate, expectedVersion: number): Promise<Page>;   // rpc('save_page'): checks version, writes revision
    remove(id: string): Promise<void>;                 // soft delete: update deleted_at
    duplicate(id: string, title: string): Promise<Page>;                             // rpc('duplicate_page')
    revisions(id: string): Promise<Revision[]>;        // from('page_revisions').select().eq('page_id', id)
    // rpc('rollback_page'): restores title, tags, links, text AND location as a new version.
    // If the old folder is gone or not editable by the caller, the page keeps its current location.
    rollback(id: string, toVersion: number, expectedVersion: number): Promise<Page>;
    search(q: string): Promise<SearchHit[]>;           // textSearch on a tsvector column
  };

  folders: {
    create(parent: Location, name: string): Promise<Folder>;
    rename(id: string, name: string): Promise<Folder>;
    remove(id: string): Promise<void>;                 // soft delete incl. descendants
  };

  admin: {
    users(): Promise<AdminUser[]>;
    setMemberRole(userId: string, subteamId: string, role: SubteamRole | null): Promise<void>;
    setUserStatus(userId: string, status: UserStatus): Promise<void>;
    setSystemRole(userId: string, role: SystemRole): Promise<void>;
    setSubteamRestricted(subteamId: string, restricted: boolean): Promise<void>;
  };

  invitations: {
    list(): Promise<Invitation[]>;                     // RLS: admins see all, others see their own
    create(email: string, name: string): Promise<Invitation>; // rpc('invite_user')
    revoke(id: string): Promise<void>;                 // rpc('revoke_invitation')
  };

  /** Only the mock provides this. Never ship it against a real backend. */
  dev?: {
    personas(): Promise<Profile[]>;
    signInAs(userId: string): Promise<void>;
  };
}
