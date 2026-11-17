-- =====================================================================
-- SEV Wiki, step 5 of 5: create the FIRST admin.
-- Sign-up is invitation-only, so the very first invitation has to be inserted by hand.
-- 1. Replace the email and name below (use an inbox you can read).
-- 2. Run this in the SQL Editor.
-- 3. Open the site, enter that email, and type the code that arrives.
--    Your account is created on the spot with admin rights.
-- If you already tried signing in with this email, delete that user first:
--    Authentication > Users > (user) > Delete user.
-- =====================================================================

insert into public.invitations (email, name, system_role)
values ('you@example.com', 'Your Name', 'admin');
