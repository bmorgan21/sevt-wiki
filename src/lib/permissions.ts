import type { Memberships, Profile, Subteam } from '../types';

// UI hints only. The API enforces the same rules server-side (RLS in Supabase).

export const isAdmin = (user: Profile) => user.systemRole === 'admin' && user.status === 'active';

/** Admins and leads of any subteam may invite people. */
export function canInvite(user: Profile, memberships: Memberships): boolean {
  if (user.status !== 'active') return false;
  return user.systemRole === 'admin' || Object.values(memberships).includes('lead');
}

export function canViewSubteam(user: Profile, memberships: Memberships, sub: Subteam): boolean {
  if (user.status !== 'active') return false;
  if (user.systemRole === 'admin') return true;
  return !sub.restricted || !!memberships[sub.id];
}

export function canEditSubteam(user: Profile, memberships: Memberships, subteamId: string): boolean {
  if (user.status !== 'active') return false;
  if (user.systemRole === 'admin') return true;
  const role = memberships[subteamId];
  return role === 'editor' || role === 'lead';
}
