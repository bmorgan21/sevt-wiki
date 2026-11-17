import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api } from '../api';
import type { Location, PageInput, PageUpdate, SubteamRole, SystemRole, UserStatus } from '../types';

// ---------- reads ----------
export const useCars = () => useQuery({ queryKey: ['cars'], queryFn: () => api.catalog.cars(), staleTime: 5 * 60_000 });
export const useSubteams = () => useQuery({ queryKey: ['subteams'], queryFn: () => api.catalog.subteams() });
export const useTree = () => useQuery({ queryKey: ['tree'], queryFn: () => api.tree() });
export const usePage = (id: string | undefined) =>
  useQuery({ queryKey: ['page', id], queryFn: () => api.pages.get(id as string), enabled: !!id });
export const useRevisions = (id: string) => useQuery({ queryKey: ['revisions', id], queryFn: () => api.pages.revisions(id) });
export const useSearch = (q: string) =>
  useQuery({ queryKey: ['search', q], queryFn: () => api.pages.search(q), enabled: q.trim().length >= 2 });
export const useInvitations = () => useQuery({ queryKey: ['invitations'], queryFn: () => api.invitations.list() });
export const useAdminUsers = (enabled: boolean) =>
  useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.admin.users(), enabled });

// ---------- writes ----------
function useApiMutation<V, D>(fn: (v: V) => Promise<D>, invalidate: (d: D, v: V) => QueryKey[]) {
  const qc = useQueryClient();
  return useMutation<D, Error, V>({
    mutationFn: fn,
    onSuccess: (d, v) => { for (const queryKey of invalidate(d, v)) void qc.invalidateQueries({ queryKey }); },
  });
}

export const useCreatePage = () =>
  useApiMutation((v: { loc: Location; input: PageInput }) => api.pages.create(v.loc, v.input), () => [['tree'], ['search']]);

export const useUpdatePage = () =>
  useApiMutation(
    (v: { id: string; input: PageUpdate; expectedVersion: number }) => api.pages.update(v.id, v.input, v.expectedVersion),
    p => [['tree'], ['page', p.id], ['revisions', p.id], ['search']],
  );

export const useDeletePage = () =>
  useApiMutation((id: string) => api.pages.remove(id), () => [['tree'], ['search']]);

export const useDuplicatePage = () =>
  useApiMutation((v: { id: string; title: string }) => api.pages.duplicate(v.id, v.title), () => [['tree'], ['search']]);

export const useRollbackPage = () =>
  useApiMutation(
    (v: { id: string; toVersion: number; expectedVersion: number }) => api.pages.rollback(v.id, v.toVersion, v.expectedVersion),
    p => [['tree'], ['page', p.id], ['revisions', p.id], ['search']],
  );

export const useCreateFolder = () =>
  useApiMutation((v: { parent: Location; name: string }) => api.folders.create(v.parent, v.name), () => [['tree']]);
export const useRenameFolder = () =>
  useApiMutation((v: { id: string; name: string }) => api.folders.rename(v.id, v.name), () => [['tree']]);
export const useDeleteFolder = () =>
  useApiMutation((id: string) => api.folders.remove(id), () => [['tree'], ['search']]);

export const useCreateInvitation = () =>
  useApiMutation((v: { email: string; name: string }) => api.invitations.create(v.email, v.name), () => [['invitations']]);
export const useRevokeInvitation = () =>
  useApiMutation((id: string) => api.invitations.revoke(id), () => [['invitations']]);

const adminKeys = (): QueryKey[] => [['admin', 'users'], ['subteams'], ['tree']];
export const useSetMemberRole = () =>
  useApiMutation((v: { userId: string; subteamId: string; role: SubteamRole | null }) => api.admin.setMemberRole(v.userId, v.subteamId, v.role), adminKeys);
export const useSetUserStatus = () =>
  useApiMutation((v: { userId: string; status: UserStatus }) => api.admin.setUserStatus(v.userId, v.status), adminKeys);
export const useSetSystemRole = () =>
  useApiMutation((v: { userId: string; role: SystemRole }) => api.admin.setSystemRole(v.userId, v.role), adminKeys);
export const useSetSubteamRestricted = () =>
  useApiMutation((v: { subteamId: string; restricted: boolean }) => api.admin.setSubteamRestricted(v.subteamId, v.restricted), adminKeys);
