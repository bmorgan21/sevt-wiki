# Supabase setup (about 30 minutes, all in the browser)

Sign-up is **invitation only**: nobody can create an account unless an existing member invited their email first.
You will create the very first invitation by hand (step 6) so the first admin can get in.

> **Honest caveat:** the SQL below was written and cross-checked by hand but has not been run against a live
> database yet. If a script errors, paste the error message to me and I'll fix it. Run on a fresh, empty project first.

## How it works

- **Reads** go straight to the database and are filtered by row-level security (RLS). A restricted page is never sent to
  a browser that isn't allowed to see it.
- **Writes** (create/edit/move/delete/restore, invite, admin actions) can only happen through database functions that check
  permissions, validate input, bump the page version and write the revision. The browser has no direct write access to any table.
- **Sign-in** is a 6-digit code emailed to you. A database trigger refuses to create an account unless the email has an open
  invitation, so the public "sign up" endpoint can't be used by strangers.

## 1. Create the project

1. supabase.com → New project. Pick a region near the team and set a strong database password (store it in a password manager).
2. Wait for it to finish provisioning.

## 2. Create the tables, functions and security rules

Open **SQL Editor → New query**. For each file below, paste the whole file, click **Run**, and wait for
"Success. No rows returned" before moving on. Run each file **once, in this order**:

| Order | File | What it does |
|---|---|---|
| 1 | `supabase/sql/01_schema.sql` | Types, tables, indexes |
| 2 | `supabase/sql/02_functions.sql` | All logic: permissions, page/folder/admin/invite functions, the invite gate |
| 3 | `supabase/sql/03_rls_and_grants.sql` | Turns on RLS, read policies, removes direct write access |
| 4 | `supabase/sql/04_seed_catalog.sql` | Your cars and subteams. **Edit the names first** if you want |

**Already set up the database earlier?** Don't re-run 01 to 03. Run the upgrade scripts you haven't yet, in order:
`07_upgrade_invitation_roles.sql` (subteam roles on invitations), then `08_upgrade_invite_leads_only.sql` (only admins and
leads may invite). Both are safe to run once. Fresh installs skip them (01 to 03 already include everything).

Made a mistake on a throwaway project? `supabase/sql/99_reset_DEV_ONLY.sql` wipes it so you can start again. Never run it on real data.

## 3. Configure sign-in (Authentication)

The dashboard menu names move around occasionally; use the search box if you can't find one.

1. **Sign-in providers → Email:** enabled. Leave **"Allow new users to sign up" ON**. That sounds wrong, but our database trigger is
   what blocks uninvited sign-ups, and invited people are created through this same path. (If you turn sign-ups off here,
   invited people can't join.)
   Turn off every other provider, and turn **Anonymous sign-ins OFF**.
2. **Email OTP:** length 6, expiry 3600 seconds (defaults).
3. **URL Configuration:**
   - **Site URL:** `https://YOUR-USERNAME.github.io/YOUR-REPO/` (with the trailing slash)
   - **Redirect URLs:** add the same URL plus `http://localhost:5173/**` and, if you use Codespaces, `https://*-5173.app.github.dev/**`
4. **Email templates:** edit both **Magic Link** and **Confirm signup** so the email shows the code. Replace the body with:

   ```html
   <h2>Your SEV wiki sign-in code</h2>
   <p>Enter this code to sign in:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
   <p>It expires in 1 hour. If you didn't ask for it, you can ignore this email.</p>
   ```
   Both are needed: brand-new invited people receive "Confirm signup"; returning people receive "Magic Link".
5. **Custom SMTP (do not skip):** Supabase's built-in email sender is only meant for testing. It is heavily rate-limited and,
   as far as I know, only delivers to members of your own Supabase organization, so invited teammates would never get their code.
   Set up SMTP with a provider such as Resend, Postmark, Amazon SES or your school's mail relay
   (**Authentication → SMTP settings**), then send yourself a test.

## 4. Connect the app

1. **Project Settings → API:** copy the **Project URL** and the **anon** (or "publishable") key. Both are safe in the browser.
   Never use the `service_role` / secret key in this app.
2. Local development: copy `.env.example` to `.env.local` and fill in both values, then `npm run dev`.
3. GitHub Pages: in your repo go to **Settings → Secrets and variables → Actions → Variables** and add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (as *variables*, not secrets). Push to `main`; the workflow builds the site.

Try the UI with no backend at any time: `npm run dev:mock`.

## 5. Check the security rules (optional but recommended)

- **Advisors → Security Advisor** (or "Database → Advisors"): there should be no "RLS disabled" warnings on `public` tables.
- Run the blocks in `supabase/sql/06_verify.sql` one at a time after step 7. Each one is meant to either return the stated
  result or fail with "permission denied".

## 6. Create the first admin

1. Open `supabase/sql/05_bootstrap_first_admin.sql`, put **your** email and name in, and run it. This is the "first invitation".
2. If you already tried to sign in with that email earlier, delete that user first (**Authentication → Users**).

## 7. Sign in

1. Open the site (or `npm run dev`), enter your email, and click **Email me a code**.
2. Type the 6-digit code. Your account is created with admin rights.
3. Open **Invite a teammate** in the sidebar to add people and, optionally, give them subteam roles (viewer, editor or lead)
   that are applied the moment they sign up. Invitations are not emailed automatically: the page gives you a message to copy
   and send. They enter their email on the login page and get a code.
4. Use the **gear icon (Admin)** to give people editor/lead roles and to grant access to restricted subteams.

## Day-to-day operations

| I want to… | Do this |
|---|---|
| Add someone | Admins and subteam leads: sidebar → Invite a teammate, and pick their subteam roles (see "Who can invite") |
| Make someone an admin | Admin page → Site role. Or in SQL: `update public.profiles set system_role = 'admin' where lower(email) = 'them@example.com';` |
| Remove someone's access | Admin page → Deactivate (instant: their data access stops on the next request) |
| Delete a person entirely | **Authentication → Users → Delete user** (their profile and memberships go with them; pages they wrote stay, attributed to "Former member") |
| Rename / add a car or subteam | Edit rows in **Table Editor → cars / subteams**, or run an `insert`/`update` in the SQL Editor |
| Lost all admins | Delete the old user in Authentication → Users, then run `05_bootstrap_first_admin.sql` again |

## Who can invite

**Only admins and subteam leads** can invite people. The "Invite a teammate" link is hidden for everyone else, and the
database refuses the request even if someone calls it directly. When inviting, **admins can give any role (viewer, editor, lead) on any subteam**. **Everyone else can only give roles on
subteams they lead.** This is enforced in the database (`invite_user`), not just hidden in the form. Other rules:

- Re-inviting an address that already has a pending invitation updates it. Only the person who created it, or an admin, can
  change it. A lead's edit replaces only the roles on subteams they lead, so roles an admin added elsewhere are kept.
- Roles are applied when the invitee first signs in. Changing an invitation after that has no effect; use the Admin page.
- If someone stops being a lead, they can no longer invite, but invitations they already sent stay valid and they can still revoke them.

## Policy knobs

- **Who may invite:** `public.can_invite()` in `02_functions.sql` allows admins and leads of any subteam. To let any active
  member invite instead, replace its body with `select public.is_active_member();` (the comment above it says so) and re-run just
  that function. People invited without roles only see *unrestricted* subteams until a lead or admin gives them roles.
- **Who can see the team directory:** all active members can see each other's names and emails (needed for "edited by").
- **Invitation expiry:** 30 days, set where `invitations.expires_at` defaults in `01_schema.sql`.

## Known limits

- Invitation emails aren't sent automatically; only sign-in codes are.
- Sign-in codes need working SMTP (step 3.5). Resends are limited by Supabase to roughly one per minute per address.
- Free Supabase projects pause after a period of inactivity and have no automatic backups; check the current terms before
  relying on it for important data, and consider the paid plan with daily backups.
- Page text is capped at 200,000 characters, 10 links per page, 20 tags per page.
- Search matches whole words/stems (Postgres full-text search), not partial words like the mock does.
- Folders can't be moved yet, and there is no file/image upload.
