-- =====================================================================
-- DANGER: deletes everything this app created (all pages, folders, profiles, invitations).
-- For a throwaway dev project only. It does NOT delete users in Authentication > Users.
-- =====================================================================
drop trigger if exists auth_users_guard on auth.users;
drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.page_revisions, public.pages, public.folders, public.invitations,
  public.memberships, public.profiles, public.subteams, public.cars cascade;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname = any (array[
      'is_active_member','is_admin','can_view_subteam','can_edit_subteam','can_invite','make_excerpt',
      'search_pages','create_page','save_page','delete_page','duplicate_page','rollback_page',
      'create_folder','rename_folder','delete_folder','admin_set_member_role','admin_set_user_status',
      'admin_set_system_role','admin_set_subteam_restricted','invite_user','revoke_invitation',
      '_require_user','_require_admin','_clean_title','_clean_folder_name','_clean_content','_clean_tags',
      '_clean_links','_resolve_location','_pages_location_guard','_folders_location_guard','_pages_derive',
      '_invitations_normalize','_write_revision','_auth_users_guard','_handle_new_user'
    ])
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end $$;

drop type if exists public.page_location, public.car_status, public.user_status,
  public.subteam_role, public.system_role cascade;
