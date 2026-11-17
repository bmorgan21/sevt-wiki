-- =====================================================================
-- Optional checks. Run AFTER your first admin has signed in. Each block is independent:
-- run one at a time. They run inside a transaction that is rolled back.
-- =====================================================================

-- 1) Signed-out visitors (anon) must get "permission denied" for every table. Expect an error.
begin;
  set local role anon;
  select count(*) from public.pages;
rollback;

-- 2) What a signed-in member sees. Replace the uuid with a real user id from public.profiles.
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000000', 'role', 'authenticated')::text, true);
  select count(*) from public.pages;            -- expect 0 for an unknown user id
  select public.is_admin(), public.is_active_member();   -- expect false, false
rollback;

-- 3) Writes straight to tables must fail even for signed-in users. Expect "permission denied".
begin;
  set local role authenticated;
  insert into public.pages (subteam_id, title) values ('sub-aero', 'sneaky');
rollback;

-- 4) The sign-up gate: this must fail with "Sign-ups are by invitation only." (nothing is created).
begin;
  insert into auth.users (id, email) values (gen_random_uuid(), 'stranger@example.com');
rollback;

-- 5) Every table should have RLS on. Expect rls_enabled = true on all rows.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by 1;
