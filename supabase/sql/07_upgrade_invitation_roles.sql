-- =====================================================================
-- SEV Wiki, UPGRADE: subteam roles on invitations.
-- Only needed if you ALREADY ran 01 to 03 before this feature existed.
-- (Fresh installs get all of this from files 01 to 03; do not run this on them.)
-- Safe to run once. Existing invitations keep working with no roles.
-- =====================================================================

alter table public.invitations add column if not exists roles jsonb not null default '{}'::jsonb;
alter table public.invitations drop constraint if exists invitations_roles_is_object;
alter table public.invitations add constraint invitations_roles_is_object check (jsonb_typeof(roles) = 'object');

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

-- The signature changed (a third argument was added), so drop the old one before creating the new one.
drop function if exists public.invite_user(text, text);

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

-- New functions are executable by everyone by default; lock them down like the rest.
revoke execute on function public._can_assign_role(text), public._clean_invite_roles(jsonb), public._handle_new_user()
  from public, anon, authenticated;
revoke execute on function public.invite_user(text, text, jsonb) from public, anon;
grant  execute on function public.invite_user(text, text, jsonb) to authenticated;
