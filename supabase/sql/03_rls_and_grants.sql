-- =====================================================================
-- SEV Wiki, step 3 of 5: row-level security and privileges.
-- Reads go through RLS. There are NO insert/update/delete policies on purpose:
-- the browser can only write through the functions in 02_functions.sql.
-- =====================================================================

alter table public.cars           enable row level security;
alter table public.subteams       enable row level security;
alter table public.profiles       enable row level security;
alter table public.memberships    enable row level security;
alter table public.invitations    enable row level security;
alter table public.folders        enable row level security;
alter table public.pages          enable row level security;
alter table public.page_revisions enable row level security;

create policy cars_select on public.cars
  for select to authenticated
  using ((select public.is_active_member()));

create policy subteams_select on public.subteams
  for select to authenticated
  using (public.can_view_subteam(id));

-- Active members can see the team directory. Anyone can read their own row (so a deactivated user
-- gets a clear "deactivated" message instead of an error).
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_active_member()));

create policy memberships_select on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy invitations_select on public.invitations
  for select to authenticated
  using ((select public.is_admin()) or invited_by = (select auth.uid()));

create policy folders_select on public.folders
  for select to authenticated
  using (deleted_at is null and public.can_view_subteam(subteam_id));

create policy pages_select on public.pages
  for select to authenticated
  using (deleted_at is null and public.can_view_subteam(subteam_id));

create policy page_revisions_select on public.page_revisions
  for select to authenticated
  using (exists (
    select 1 from public.pages p
    where p.id = page_revisions.page_id and p.deleted_at is null and public.can_view_subteam(p.subteam_id)
  ));

-- ---------- privileges ----------
-- Tables: signed-out visitors get nothing; signed-in users may only read (RLS filters rows).
revoke all on all tables in schema public from anon, authenticated;
grant select on
  public.cars, public.subteams, public.profiles, public.memberships, public.invitations,
  public.folders, public.pages, public.page_revisions
to authenticated;

-- Functions: only signed-in users may call the public API. Internal helpers (names starting with _)
-- can be called by other functions here but not directly from the browser.
revoke execute on all functions in schema public from public, anon, authenticated;
grant  execute on function
  public.is_active_member(), public.is_admin(), public.can_view_subteam(text), public.can_edit_subteam(text),
  public.can_invite(),
  public.create_page(text, text, uuid, text, text, text[], jsonb),
  public.save_page(uuid, int, text, text, text[], jsonb, boolean, text, text, uuid),
  public.delete_page(uuid),
  public.duplicate_page(uuid, text),
  public.rollback_page(uuid, int, int),
  public.create_folder(text, text, uuid, text),
  public.rename_folder(uuid, text),
  public.delete_folder(uuid),
  public.search_pages(text),
  public.admin_set_member_role(uuid, text, public.subteam_role),
  public.admin_set_user_status(uuid, public.user_status),
  public.admin_set_system_role(uuid, public.system_role),
  public.admin_set_subteam_restricted(text, boolean),
  public.invite_user(text, text),
  public.revoke_invitation(uuid)
to authenticated;
-- search_pages / make_excerpt run as the caller; make_excerpt is a pure text helper.
grant execute on function public.make_excerpt(text, int) to authenticated;
