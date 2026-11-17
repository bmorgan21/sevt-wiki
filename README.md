# SEV Team Wiki

Vite + React + TypeScript + Tailwind frontend, Supabase backend (Postgres + Auth), hosted on GitHub Pages.
Sign-up is invitation-only.

## Run it

```bash
npm install
npm run dev:mock     # in-memory fake backend with demo data, no setup needed
npm run dev          # real Supabase (needs .env.local, see docs/SUPABASE_SETUP.md)
npm run typecheck
npm run build
```

**Going live:** follow [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md). The SQL is in `supabase/sql/` and is run, in order,
in the Supabase SQL Editor.

Deploy: push to `main`; `.github/workflows/deploy.yml` builds with `VITE_BASE=/<repo>/` and publishes to Pages
(Settings > Pages > Source: GitHub Actions). Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as repository **variables**.
Routing uses `HashRouter` because Pages has no server-side rewrites. Production builds contain no mock code or demo data.

## Dev container (VS Code locally, or GitHub Codespaces)

- **Codespaces:** repo page > Code > Codespaces > Create. It installs dependencies and forwards port 5173.
- **Local VS Code:** install Docker and the "Dev Containers" extension, then "Dev Containers: Reopen in Container".
- Or skip containers: Node 20 (`.nvmrc`) and `npm install` are all you need.

## Layout

| Path | Purpose |
|---|---|
| `supabase/sql/` | Database: schema, functions, RLS, seed, first-admin bootstrap, verification |
| `docs/SUPABASE_SETUP.md` | Console walkthrough |
| `src/api/types.ts` | The `WikiApi` contract the UI talks to |
| `src/api/supabaseApi.ts` | Real implementation (supabase-js) |
| `src/api/mockApi.ts`, `mockDb.ts` | In-memory implementation for development and tests |
| `src/api/supabaseErrors.ts` | Maps database errors (PT401/403/404/409/422, 23505...) to `ApiError` |
| `src/api/index.ts` | Chooses the backend (`VITE_BACKEND=mock` => mock, otherwise Supabase) |
| `src/state/` | Auth, toasts, active car, TanStack Query hooks |
| `src/lib/` | Pure helpers: tree index, validation, search scoring, diffs, embeds |
| `src/views/`, `src/components/` | UI |

## Contract rules (both backends follow these)

1. Every method rejects with `ApiError` (`auth | forbidden | not_found | conflict | validation`).
2. Restricted rows are never returned (RLS). The UI permission helpers are hints only.
3. `pages.update` / `rollback` take the version the editor started from and return `conflict` if it moved.
4. A page's car/subteam always comes from its folder. Global content is `car_id = null`.
5. `tree()` returns summaries without page bodies; `pages.get` returns the body.
6. Every revision stores title, tags, links, text and location. `rollback` restores all of them; if the old folder is gone or
   not editable by the caller, the page keeps its location and the revision note says so.
7. Page links are an ordered list of `{ url, name }` (max 10); URLs must be http(s).
8. Browsers cannot write to tables. All writes are database functions that check permissions.
9. `dev` and the persona switcher exist only on the mock.

## Authoring notes

Markdown is rendered with `react-markdown` + sanitize; there is no `dangerouslySetInnerHTML`.
`$x$` and `$$x$$` are math, so write `\$` for a literal dollar sign.
Google Docs/Sheets/Slides and Drive files/folders linked on a page are embedded as tabs; other links become cards.

## Not done yet

Automatic invitation emails, moving pages/folders between folders, page-to-page links and backlinks, attachments/images,
table of contents, read-only Legacy cars, lead-managed membership (admin only for now), dark mode.
