-- =====================================================================
-- SEV Wiki, UPGRADE: only admins and subteam leads may invite people.
-- Run once if you already set up the database. (Fresh installs get this from 02_functions.sql.)
-- If you have NOT yet run 07_upgrade_invitation_roles.sql, run 07 first, then this.
-- Existing grants are kept; no other changes.
-- =====================================================================

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

