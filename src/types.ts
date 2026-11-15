export type SystemRole = 'admin' | 'user';
export type SubteamRole = 'viewer' | 'editor' | 'lead';
export type UserStatus = 'active' | 'deactivated';
export type CarStatus = 'Active' | 'Concept' | 'Legacy';

export interface Car { id: string; name: string; status: CarStatus }
/** globalOnly subteams hold content that is not tied to a car (carId = null). */
export interface Subteam { id: string; name: string; restricted: boolean; globalOnly: boolean }
export interface Profile { id: string; name: string; email: string; systemRole: SystemRole; status: UserStatus }
export type Memberships = Record<string, SubteamRole>;
export interface Session { user: Profile; memberships: Memberships }
export interface PersonRef { id: string; name: string }

/** carId === null means "global" (shown under every car). */
export interface Folder { id: string; carId: string | null; subteamId: string; parentId: string | null; name: string }

export interface PageSummary {
  id: string;
  carId: string | null;
  subteamId: string;
  folderId: string | null;
  title: string;
  tags: string[];
  excerpt: string;
  version: number;
  updatedAt: string;
  updatedBy: PersonRef;
}
export interface Page extends PageSummary {
  content: string;
  externalLink: string;
  createdAt: string;
  createdBy: PersonRef;
}
export interface Revision {
  version: number;
  title: string;
  tags: string[];
  externalLink: string;
  content: string;
  createdAt: string;
  author: PersonRef;
  note?: string;
}

/** Lightweight listing for the sidebar and palette: no page bodies. */
export interface Tree { folders: Folder[]; pages: PageSummary[] }

/** Where something lives. folderId wins over subteamId/carId when set. */
export interface Location { carId: string | null; subteamId: string; folderId: string | null }

export interface PageInput { title: string; content: string; tags: string[]; externalLink: string }
export interface PageUpdate extends PageInput { location?: Location }
export interface SearchHit { page: PageSummary; snippet: string }
export interface AdminUser extends Profile { memberships: Memberships }
