-- =====================================================================
-- SEV Wiki, step 2 of 5: functions, triggers, and the invite gate.
-- All write access goes through the functions below (they check permissions
-- explicitly). Error codes PT401/403/404/409/422 are read by the app.
-- =====================================================================

-- ---------- identity & permission helpers ----------
create or replace function public.is_active_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'active');
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active' and p.system_role = 'admin'
  );
$$;

-- Admins see everything. Others see open subteams, plus restricted ones they belong to.
create or replace function public.can_view_subteam(p_subteam_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid()) and me.status = 'active'
      and (
        me.system_role = 'admin'
        or exists (select 1 from public.subteams s where s.id = p_subteam_id and not s.restricted)
        or exists (select 1 from public.memberships m where m.user_id = me.id and m.subteam_id = p_subteam_id)
      )
  );
$$;

create or replace function public.can_edit_subteam(p_subteam_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid()) and me.status = 'active'
      and (
        me.system_role = 'admin'
        or exists (
          select 1 from public.memberships m
          where m.user_id = me.id and m.subteam_id = p_subteam_id and m.role in ('editor', 'lead')
        )
      )
  );
$$;

-- POLICY: only admins and subteam leads (of any subteam) may invite people.
-- To let any active member invite instead, replace the select below with: select public.is_active_member();
create or replace function public.can_invite() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active'
      and (
        p.system_role = 'admin'
        or exists (select 1 from public.memberships m where m.user_id = p.id and m.role = 'lead')
      )
  );
$$;

create or replace function public._require_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sign in to continue.' using errcode = 'PT401';
  end if;
  if not exists (select 1 from public.profiles p where p.id = uid and p.status = 'active') then
    raise exception 'This account is not active.' using errcode = 'PT403';
  end if;
  return uid;
end $$;

create or replace function public._require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public._require_user();
begin
  if not public.is_admin() then
    raise exception 'Only admins can do that.' using errcode = 'PT403';
  end if;
  return uid;
end $$;

-- ---------- input cleaning ----------
create or replace function public._clean_title(p_title text) returns text
language plpgsql immutable set search_path = '' as $$
declare t text := btrim(coalesce(p_title, ''));
begin
  if t = '' then raise exception 'Add a title.' using errcode = 'PT422'; end if;
  if char_length(t) > 200 then raise exception 'Titles can be at most 200 characters.' using errcode = 'PT422'; end if;
  return t;
end $$;

create or replace function public._clean_folder_name(p_name text) returns text
language plpgsql immutable set search_path = '' as $$
declare t text := btrim(coalesce(p_name, ''));
begin
  if t = '' then raise exception 'Add a folder name.' using errcode = 'PT422'; end if;
  if char_length(t) > 100 then raise exception 'Folder names can be at most 100 characters.' using errcode = 'PT422'; end if;
  return t;
end $$;

create or replace function public._clean_content(p_content text) returns text
language plpgsql immutable set search_path = '' as $$
declare c text := coalesce(p_content, '');
begin
  if char_length(c) > 200000 then raise exception 'This page is too long to save.' using errcode = 'PT422'; end if;
  return c;
end $$;

create or replace function public._clean_tags(p_tags text[]) returns text[]
language plpgsql immutable set search_path = '' as $$
declare t text; result text[] := '{}';
begin
  foreach t in array coalesce(p_tags, '{}'::text[]) loop
    t := regexp_replace(lower(btrim(t)), '\s+', '-', 'g');
    if t = '' or t = any (result) then continue; end if;
    if char_length(t) > 40 then raise exception 'Tags can be at most 40 characters.' using errcode = 'PT422'; end if;
    result := result || t;
  end loop;
  if coalesce(array_length(result, 1), 0) > 20 then
    raise exception 'Use at most 20 tags.' using errcode = 'PT422';
  end if;
  return result;
end $$;

create or replace function public._clean_links(p_links jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare item jsonb; u text; n text; result jsonb := '[]'::jsonb; seen text[] := '{}';
begin
  if p_links is null or jsonb_typeof(p_links) <> 'array' then return '[]'::jsonb; end if;
  for item in select value from jsonb_array_elements(p_links) loop
    u := btrim(coalesce(item ->> 'url', ''));
    n := btrim(coalesce(item ->> 'name', ''));
    if u = '' and n = '' then continue; end if;
    if u = '' then raise exception 'Add a URL for "%".', n using errcode = 'PT422'; end if;
    if char_length(u) > 2000 or u !~* '^https?://[^[:space:]]+$' then
      raise exception '"%" is not a valid link. Links must start with http:// or https://.', left(u, 80) using errcode = 'PT422';
    end if;
    if char_length(n) > 100 then raise exception 'Link names can be at most 100 characters.' using errcode = 'PT422'; end if;
    if u = any (seen) then raise exception 'The same link is added more than once.' using errcode = 'PT422'; end if;
    seen := seen || u;
    result := result || jsonb_build_object('url', u, 'name', n);
  end loop;
  if jsonb_array_length(result) > 10 then raise exception 'Add at most 10 links.' using errcode = 'PT422'; end if;
  return result;
end $$;

-- Plain-text preview of markdown (the app shows this on cards and in the sidebar search).
create or replace function public.make_excerpt(md text, max_len int default 160) returns text
language sql immutable set search_path = '' as $$
  select case when char_length(t.v) > max_len then left(t.v, max_len - 1) || '…' else t.v end
  from (
    select btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      coalesce(md, ''),
      '```.*?```', ' ', 'g'),
      '\$\$.*?\$\$', ' ', 'g'),
      '!?\[([^]]*)\]\([^)]*\)', '\1', 'g'),
      '[#>*_`~|-]+', ' ', 'g'),
      '\s+', ' ', 'g')) as v
  ) t;
$$;

-- ---------- location rules ----------
-- Works out the true (car, subteam, folder) for a request. A folder always wins over what the caller sent,
-- so a page can never disagree with the folder it lives in.
create or replace function public._resolve_location(p_car_id text, p_subteam_id text, p_folder_id uuid)
returns public.page_location language plpgsql stable set search_path = '' as $$
declare f public.folders; s public.subteams;
begin
  if p_folder_id is not null then
    select * into f from public.folders x where x.id = p_folder_id and x.deleted_at is null;
    if not found then raise exception 'Folder not found.' using errcode = 'PT404'; end if;
    return row(f.car_id, f.subteam_id, f.id)::public.page_location;
  end if;
  select * into s from public.subteams x where x.id = p_subteam_id;
  if not found then raise exception 'Subteam not found.' using errcode = 'PT404'; end if;
  if s.global_only then
    return row(null::text, s.id, null::uuid)::public.page_location;
  end if;
  if p_car_id is null or not exists (select 1 from public.cars c where c.id = p_car_id) then
    raise exception 'Choose a car for this subteam.' using errcode = 'PT422';
  end if;
  return row(p_car_id, s.id, null::uuid)::public.page_location;
end $$;

-- Safety net for any write path: derive car/subteam from the parent folder.
create or replace function public._pages_location_guard() returns trigger
language plpgsql set search_path = '' as $$
declare f public.folders; s public.subteams;
begin
  if new.folder_id is not null then
    select * into f from public.folders x where x.id = new.folder_id;
    if not found then raise exception 'Folder not found.' using errcode = 'PT404'; end if;
    new.subteam_id := f.subteam_id;
    new.car_id := f.car_id;
  end if;
  select * into s from public.subteams x where x.id = new.subteam_id;
  if not found then raise exception 'Subteam not found.' using errcode = 'PT404'; end if;
  if s.global_only then
    new.car_id := null;
  elsif new.car_id is null then
    raise exception 'Choose a car for this subteam.' using errcode = 'PT422';
  end if;
  return new;
end $$;

create or replace function public._folders_location_guard() returns trigger
language plpgsql set search_path = '' as $$
declare p public.folders; s public.subteams;
begin
  if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id then
    raise exception 'Moving folders is not supported yet.' using errcode = 'PT422';
  end if;
  if new.parent_id is not null then
    select * into p from public.folders x where x.id = new.parent_id;
    if not found then raise exception 'Parent folder not found.' using errcode = 'PT404'; end if;
    new.subteam_id := p.subteam_id;
    new.car_id := p.car_id;
  end if;
  select * into s from public.subteams x where x.id = new.subteam_id;
  if not found then raise exception 'Subteam not found.' using errcode = 'PT404'; end if;
  if s.global_only then
    new.car_id := null;
  elsif new.car_id is null then
    raise exception 'Choose a car for this subteam.' using errcode = 'PT422';
  end if;
  return new;
end $$;

create or replace function public._pages_derive() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.excerpt := public.make_excerpt(new.content);
  new.fts := setweight(to_tsvector('english', coalesce(new.title, '')), 'A')
          || setweight(to_tsvector('english', coalesce(array_to_string(new.tags, ' '), '')), 'B')
          || setweight(to_tsvector('english', coalesce(new.content, '')), 'C');
  return new;
end $$;

create or replace function public._invitations_normalize() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.email := lower(btrim(new.email));
  return new;
end $$;

create trigger pages_01_location_guard before insert or update on public.pages
  for each row execute function public._pages_location_guard();
create trigger pages_02_derive before insert or update on public.pages
  for each row execute function public._pages_derive();
create trigger folders_01_location_guard before insert or update on public.folders
  for each row execute function public._folders_location_guard();
create trigger invitations_01_normalize before insert or update on public.invitations
  for each row execute function public._invitations_normalize();

create or replace function public._write_revision(p public.pages, p_note text) returns void
language sql security definer set search_path = '' as $$
  insert into public.page_revisions
    (page_id, version, title, content, tags, links, car_id, subteam_id, folder_id, author_id, note, created_at)
  values
    (p.id, p.version, p.title, p.content, p.tags, p.links, p.car_id, p.subteam_id, p.folder_id, p.updated_by, p_note, p.updated_at);
$$;

-- ---------- pages ----------
create or replace function public.create_page(
  p_car_id text, p_subteam_id text, p_folder_id uuid,
  p_title text, p_content text, p_tags text[], p_links jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public._require_user();
  v_title text := public._clean_title(p_title);
  v_content text := public._clean_content(p_content);
  v_tags text[] := public._clean_tags(p_tags);
  v_links jsonb := public._clean_links(p_links);
  loc public.page_location;
  pg public.pages;
begin
  loc := public._resolve_location(p_car_id, p_subteam_id, p_folder_id);
  if not public.can_edit_subteam(loc.subteam_id) then
    raise exception 'You need editor access in this subteam to do that.' using errcode = 'PT403';
  end if;
  insert into public.pages (car_id, subteam_id, folder_id, title, content, tags, links, created_by, updated_by)
  values (loc.car_id, loc.subteam_id, loc.folder_id, v_title, v_content, v_tags, v_links, me, me)
  returning * into pg;
  perform public._write_revision(pg, null);
  return pg.id;
end $$;

-- Optimistic locking: p_expected_version must match, otherwise PT409 with the current version in `detail`.
create or replace function public.save_page(
  p_id uuid, p_expected_version int,
  p_title text, p_content text, p_tags text[], p_links jsonb,
  p_move boolean default false, p_car_id text default null, p_subteam_id text default null, p_folder_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public._require_user();
  v_title text := public._clean_title(p_title);
  v_content text := public._clean_content(p_content);
  v_tags text[] := public._clean_tags(p_tags);
  v_links jsonb := public._clean_links(p_links);
  pg public.pages;
  loc public.page_location;
  who text;
begin
  select * into pg from public.pages x where x.id = p_id and x.deleted_at is null for update;
  if not found or not public.can_view_subteam(pg.subteam_id) then
    raise exception 'Page not found.' using errcode = 'PT404';
  end if;
  if not public.can_edit_subteam(pg.subteam_id) then
    raise exception 'You need editor access in this subteam to do that.' using errcode = 'PT403';
  end if;
  if pg.version <> p_expected_version then
    select name into who from public.profiles where id = pg.updated_by;
    raise exception '% saved version % while you were editing.', coalesce(who, 'Someone'), pg.version
      using errcode = 'PT409', detail = pg.version::text;
  end if;
  if p_move then
    loc := public._resolve_location(p_car_id, p_subteam_id, p_folder_id);
    if not public.can_edit_subteam(loc.subteam_id) then
      raise exception 'You need editor access in the destination subteam.' using errcode = 'PT403';
    end if;
  else
    loc := row(pg.car_id, pg.subteam_id, pg.folder_id)::public.page_location;
  end if;
  update public.pages p set
    car_id = loc.car_id, subteam_id = loc.subteam_id, folder_id = loc.folder_id,
    title = v_title, content = v_content, tags = v_tags, links = v_links,
    version = p.version + 1, updated_at = now(), updated_by = me
  where p.id = p_id
  returning * into pg;
  perform public._write_revision(pg, null);
  return pg.id;
end $$;

create or replace function public.delete_page(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare pg public.pages;
begin
  perform public._require_user();
  select * into pg from public.pages x where x.id = p_id and x.deleted_at is null for update;
  if not found or not public.can_view_subteam(pg.subteam_id) then
    raise exception 'Page not found.' using errcode = 'PT404';
  end if;
  if not public.can_edit_subteam(pg.subteam_id) then
    raise exception 'You need editor access in this subteam to do that.' using errcode = 'PT403';
  end if;
  update public.pages set deleted_at = now() where id = p_id;
end $$;

create or replace function public.duplicate_page(p_id uuid, p_title text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public._require_user();
  v_title text := public._clean_title(p_title);
  src public.pages;
  dup public.pages;
begin
  select * into src from public.pages x where x.id = p_id and x.deleted_at is null;
  if not found or not public.can_view_subteam(src.subteam_id) then
    raise exception 'Page not found.' using errcode = 'PT404';
  end if;
  if not public.can_edit_subteam(src.subteam_id) then
    raise exception 'You need editor access in this subteam to do that.' using errcode = 'PT403';
  end if;
  insert into public.pages (car_id, subteam_id, folder_id, title, content, tags, links, created_by, updated_by)
  values (src.car_id, src.subteam_id, src.folder_id, v_title, src.content, src.tags, src.links, me, me)
  returning * into dup;
  perform public._write_revision(dup, 'Duplicated from "' || src.title || '"');
  return dup.id;
end $$;

-- Restores title, text, tags, links AND location as a new version. If the old folder is gone, or the caller
-- cannot edit where it was, the page keeps its current location and the revision note says so.
create or replace function public.rollback_page(p_id uuid, p_to_version int, p_expected_version int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public._require_user();
  pg public.pages;
  rev public.page_revisions;
  target public.page_location;
  wanted public.page_location;
  placed boolean := true;
  who text;
  v_note text;
begin
  select * into pg from public.pages x where x.id = p_id and x.deleted_at is null for update;
  if not found or not public.can_view_subteam(pg.subteam_id) then
    raise exception 'Page not found.' using errcode = 'PT404';
  end if;
  if not public.can_edit_subteam(pg.subteam_id) then
    raise exception 'You need editor access in this subteam to do that.' using errcode = 'PT403';
  end if;
  if pg.version <> p_expected_version then
    select name into who from public.profiles where id = pg.updated_by;
    raise exception '% saved version % while you were editing.', coalesce(who, 'Someone'), pg.version
      using errcode = 'PT409', detail = pg.version::text;
  end if;
  select * into rev from public.page_revisions r where r.page_id = p_id and r.version = p_to_version;
  if not found then raise exception 'That version no longer exists.' using errcode = 'PT404'; end if;

  target := row(pg.car_id, pg.subteam_id, pg.folder_id)::public.page_location;
  wanted := row(rev.car_id, rev.subteam_id, rev.folder_id)::public.page_location;
  if wanted is distinct from target then
    begin
      wanted := public._resolve_location(wanted.car_id, wanted.subteam_id, wanted.folder_id);
      if public.can_edit_subteam(wanted.subteam_id) then
        target := wanted;
      else
        placed := false;
      end if;
    exception when others then
      placed := false;
    end;
  end if;

  update public.pages p set
    car_id = target.car_id, subteam_id = target.subteam_id, folder_id = target.folder_id,
    title = rev.title, content = rev.content, tags = rev.tags, links = rev.links,
    version = p.version + 1, updated_at = now(), updated_by = me
  where p.id = p_id
  returning * into pg;

  v_note := 'Restored from v' || p_to_version::text;
  if not placed then
    v_note := v_note || ' (its original location is unavailable, so the page stayed where it was)';
  end if;
  perform public._write_revision(pg, v_note);
  return pg.id;
end $$;

-- ---------- folders ----------
create or replace function public.create_folder(p_car_id text, p_subteam_id text, p_parent_id uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public._require_user();
  v_name text := public._clean_folder_name(p_name);
  loc public.page_location;
  new_id uuid;
begin
  loc := public._resolve_location(p_car_id, p_subteam_id, p_parent_id);
  if not public.can_edit_subteam(loc.subteam_id) then
    raise exception 'You need editor access in this subteam to do that.' using errcode = 'PT403';
  end if;
  insert into public.folders (car_id, subteam_id, parent_id, name, created_by)
  values (loc.car_id, loc.subteam_id, loc.folder_id, v_name, me)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.rename_folder(p_id uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text := public._clean_folder_name(p_name); f public.folders;
begin
  perform public._require_user();
  select * into f from public.folders x where x.id = p_id and x.deleted_at is null;
  if not found or not public.can_view_subteam(f.subteam_id) then
    raise exception 'Folder not found.' using errcode = 'PT404';
  end if;
  if not public.can_edit_subteam(f.subteam_id) then
    raise exception 'You need editor access in this subteam to do that.' using errcode = 'PT403';
  end if;
  update public.folders set name = v_name where id = p_id;
end $$;

-- Soft-deletes the folder, every subfolder, and every page inside them.
create or replace function public.delete_folder(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.folders; ids uuid[];
begin
  perform public._require_user();
  select * into f from public.folders x where x.id = p_id and x.deleted_at is null;
  if not found or not public.can_view_subteam(f.subteam_id) then
    raise exception 'Folder not found.' using errcode = 'PT404';
  end if;
  if not public.can_edit_subteam(f.subteam_id) then
    raise exception 'You need editor access in this subteam to do that.' using errcode = 'PT403';
  end if;
  with recursive tree as (
    select x.id from public.folders x where x.id = p_id
    union all
    select c.id from public.folders c join tree t on c.parent_id = t.id where c.deleted_at is null
  )
  select array_agg(id) into ids from tree;
  update public.folders set deleted_at = now() where id = any (ids) and deleted_at is null;
  update public.pages   set deleted_at = now() where folder_id = any (ids) and deleted_at is null;
end $$;

-- ---------- search (security invoker: row-level security applies) ----------
create or replace function public.search_pages(q text)
returns table (
  id uuid, car_id text, subteam_id text, folder_id uuid, title text, tags text[], excerpt text,
  version int, updated_at timestamptz, updated_by_id uuid, updated_by_name text, snippet text, rank real
)
language sql stable set search_path = '' as $$
  with query as (select websearch_to_tsquery('english', q) as tsq)
  select p.id, p.car_id, p.subteam_id, p.folder_id, p.title, p.tags, p.excerpt, p.version, p.updated_at,
         p.updated_by, u.name,
         ts_headline('english', p.content, query.tsq, 'MaxFragments=1, MaxWords=25, MinWords=10, StartSel=«, StopSel=»'),
         ts_rank(p.fts, query.tsq)
  from public.pages p
  cross join query
  left join public.profiles u on u.id = p.updated_by
  where p.deleted_at is null
    and char_length(btrim(q)) between 2 and 200
    and p.fts @@ query.tsq
  order by ts_rank(p.fts, query.tsq) desc, p.updated_at desc
  limit 50;
$$;

-- ---------- admin ----------
create or replace function public.admin_set_member_role(p_user_id uuid, p_subteam_id text, p_role public.subteam_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_admin();
  if p_role is null then
    delete from public.memberships where user_id = p_user_id and subteam_id = p_subteam_id;
  else
    insert into public.memberships (user_id, subteam_id, role) values (p_user_id, p_subteam_id, p_role)
    on conflict (user_id, subteam_id) do update set role = excluded.role;
  end if;
end $$;

create or replace function public.admin_set_user_status(p_user_id uuid, p_status public.user_status) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public._require_admin();
begin
  if p_user_id = me and p_status <> 'active' then
    raise exception 'You can''t deactivate your own account.' using errcode = 'PT422';
  end if;
  update public.profiles set status = p_status where id = p_user_id;
  if not found then raise exception 'User not found.' using errcode = 'PT404'; end if;
end $$;

create or replace function public.admin_set_system_role(p_user_id uuid, p_role public.system_role) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public._require_admin();
begin
  if p_user_id = me and p_role <> 'admin' then
    raise exception 'You can''t remove your own admin access.' using errcode = 'PT422';
  end if;
  update public.profiles set system_role = p_role where id = p_user_id;
  if not found then raise exception 'User not found.' using errcode = 'PT404'; end if;
end $$;

create or replace function public.admin_set_subteam_restricted(p_subteam_id text, p_restricted boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_admin();
  update public.subteams set restricted = p_restricted where id = p_subteam_id;
  if not found then raise exception 'Subteam not found.' using errcode = 'PT404'; end if;
end $$;

-- ---------- invitations ----------
-- Who may grant a role on a subteam: admins on any subteam, everyone else only on subteams they lead.
create or replace function public._can_assign_role(p_subteam_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid()) and me.status = 'active'
      and (
        me.system_role = 'admin'
        or exists (
          select 1 from public.memberships m
          where m.user_id = me.id and m.subteam_id = p_subteam_id and m.role = 'lead'
        )
      )
  );
$$;

-- Validates {"subteam-id": "role"} for an invitation. Blank roles are ignored.
create or replace function public._clean_invite_roles(p_roles jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare k text; v text; result jsonb := '{}'::jsonb;
begin
  if p_roles is null or jsonb_typeof(p_roles) <> 'object' then return '{}'::jsonb; end if;
  for k, v in select key, value #>> '{}' from jsonb_each(p_roles) loop
    if v is null or v = '' then continue; end if;
    if v not in ('viewer', 'editor', 'lead') then
      raise exception 'Choose viewer, editor or lead.' using errcode = 'PT422';
    end if;
    if not exists (select 1 from public.subteams s where s.id = k) then
      raise exception 'That subteam doesn''t exist.' using errcode = 'PT422';
    end if;
    if not public._can_assign_role(k) then
      raise exception 'You can only invite people to subteams you lead.' using errcode = 'PT403';
    end if;
    result := result || jsonb_build_object(k, v);
  end loop;
  return result;
end $$;

create or replace function public.invite_user(p_email text, p_name text default '', p_roles jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public._require_user();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := left(btrim(coalesce(p_name, '')), 100);
  v_roles jsonb;
  merged jsonb;
  k text;
  inv public.invitations;
  inv_id uuid;
begin
  if not public.can_invite() then
    raise exception 'Only admins and subteam leads can invite people.' using errcode = 'PT403';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address.' using errcode = 'PT422';
  end if;
  if exists (select 1 from public.profiles where lower(email) = v_email) then
    raise exception 'That person already has an account.' using errcode = 'PT422';
  end if;
  -- Admins may grant any role on any subteam; everyone else only on subteams they lead.
  v_roles := public._clean_invite_roles(p_roles);

  select * into inv from public.invitations i where i.email = v_email and i.accepted_at is null for update;
  if found then
    -- Re-inviting updates the existing invitation, but only its owner or an admin may change it.
    if inv.invited_by is distinct from me and not public.is_admin() then
      raise exception 'Someone else has already invited that address. Ask them, or an admin, to change the invitation.'
        using errcode = 'PT403';
    end if;
    -- Replace the roles this person may manage; keep any they may not (e.g. set earlier by an admin).
    merged := v_roles;
    for k in select jsonb_object_keys(inv.roles) loop
      if not public._can_assign_role(k) then
        merged := merged || jsonb_build_object(k, inv.roles ->> k);
      end if;
    end loop;
    update public.invitations
       set name = case when v_name <> '' then v_name else name end,
           roles = merged,
           expires_at = now() + interval '30 days'
     where id = inv.id;
    return inv.id;
  end if;

  if not public.is_admin()
     and (select count(*) from public.invitations where invited_by = me and accepted_at is null) >= 25 then
    raise exception 'You have 25 invitations waiting. Revoke some or wait for people to join.' using errcode = 'PT422';
  end if;
  insert into public.invitations (email, name, roles, invited_by) values (v_email, v_name, v_roles, me) returning id into inv_id;
  return inv_id;
end $$;

create or replace function public.revoke_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public._require_user(); inv public.invitations;
begin
  select * into inv from public.invitations where id = p_id and accepted_at is null;
  if not found then raise exception 'Invitation not found.' using errcode = 'PT404'; end if;
  if inv.invited_by is distinct from me and not public.is_admin() then
    raise exception 'Only the person who invited them, or an admin, can revoke this.' using errcode = 'PT403';
  end if;
  delete from public.invitations where id = p_id;
end $$;

-- ---------- the invite gate on sign-up ----------
-- Runs when Supabase Auth tries to create a user. No open invitation for that email = no account.
create or replace function public._auth_users_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null or not exists (
    select 1 from public.invitations i
    where i.email = lower(new.email) and i.accepted_at is null and i.expires_at > now()
  ) then
    raise exception 'Sign-ups are by invitation only.' using errcode = 'PT403';
  end if;
  return new;
end $$;

-- After the user exists: build their profile from the invitation and mark it used.
create or replace function public._handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare inv public.invitations;
begin
  select * into inv from public.invitations i
   where i.email = lower(new.email) and i.accepted_at is null
   order by i.created_at desc limit 1 for update;
  insert into public.profiles (id, email, name, system_role)
  values (
    new.id, lower(new.email),
    coalesce(nullif(btrim(inv.name), ''), split_part(new.email, '@', 1)),
    coalesce(inv.system_role, 'user')
  );
  -- Grant the subteam roles chosen when they were invited (skips subteams that no longer exist).
  insert into public.memberships (user_id, subteam_id, role)
  select new.id, r.key, r.value::public.subteam_role
  from jsonb_each_text(coalesce(inv.roles, '{}'::jsonb)) r
  join public.subteams s on s.id = r.key
  where r.value in ('viewer', 'editor', 'lead')
  on conflict (user_id, subteam_id) do nothing;
  update public.invitations set accepted_at = now() where id = inv.id;
  return new;
end $$;

drop trigger if exists auth_users_guard on auth.users;
create trigger auth_users_guard before insert on auth.users
  for each row execute function public._auth_users_guard();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public._handle_new_user();
