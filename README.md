# SEV Team Wiki (frontend)

Vite + React + TypeScript + Tailwind 3. Everything talks to a `WikiApi` interface; today that is an in-memory mock
shaped like Supabase, so the real backend is a drop-in replacement.

```bash
npm install
npm run dev          # http://localhost:5173  (sign in with the "Mock mode" buttons)
npm run typecheck
npm run build
```

Deploy: push to `main`; `.github/workflows/deploy.yml` builds with `VITE_BASE=/<repo>/` and publishes to Pages.
Enable it under Settings > Pages > Source: GitHub Actions. Routing uses `HashRouter` (no server rewrites on Pages).

## Dev container (VS Code locally, or GitHub Codespaces)

- **Codespaces:** repo page > Code > Codespaces > Create. It installs dependencies and opens the app on port 5173.
- **Local VS Code:** install Docker and the "Dev Containers" extension, open the folder, then run
  "Dev Containers: Reopen in Container".
- Then `npm run dev` (it listens on all interfaces so the port can be forwarded).

You can also skip containers entirely: Node 20 (`.nvmrc`) and `npm install` are all you need.

## Layout

| Path | Purpose |
|---|---|
| `src/api/types.ts` | The `WikiApi` contract. Comments show the Supabase call each method becomes. |
| `src/api/mockApi.ts` | Mock "database": session checks, row visibility (RLS), validation, version conflicts, revisions, soft delete. |
| `src/api/mockDb.ts` | Seed data. |
| `src/api/index.ts` | The one line to change when Supabase is ready. |
| `src/state/` | Auth, toasts, active car, TanStack Query hooks (`queries.ts`). |
| `src/lib/` | Pure helpers: tree index, permissions hints, validation, search scoring, line diff. |
| `src/views/`, `src/components/` | UI. |

## Contract rules the Supabase version must keep

1. Every method rejects with `ApiError` (`auth | forbidden | not_found | conflict | validation`).
2. Restricted rows are never returned (RLS). The UI permission helpers are hints only.
3. `pages.update` / `rollback` take the version the editor started from and return `conflict` if it moved.
4. A page's car/subteam always comes from its folder (use a composite FK). Global content is `car_id = null`.
5. `tree()` returns summaries without page bodies; `pages.get` returns the body.
6. `dev` exists only on the mock.
7. Every revision stores title, tags, links, text AND location (car, subteam, folder). `rollback` restores all of them; if the old folder is deleted or not editable by the caller, the text and metadata are restored but the page keeps its current location (the revision note says so).
8. Page links are an ordered list of `{ url, name }` (a `jsonb` column or a `page_links` table); URLs must be http(s).

## Authoring notes

Markdown is rendered with `react-markdown` + sanitize; there is no `dangerouslySetInnerHTML`.
`$x$` and `$$x$$` are math, so write `\$` for a literal dollar sign.

## Linked documents

A page has an ordered list of links (`links: { url, name }[]`, up to 10). Each can have an optional display name.
Google Docs, Sheets, Slides and Drive files/folders are embedded inline as tabs beside the page notes
(`src/lib/embed.ts`), in a sandboxed iframe built from a vetted URL; viewers need access to the file in Google.
Every other link renders as a link card, because most sites block framing. Names are typed by hand for now;
a Google Picker or Drive API lookup can fill the same field later.

## Not done yet

Moving pages/folders between folders, page-to-page links and backlinks, attachments/images, table of contents,
read-only Legacy cars, lead-managed membership (admin only for now), dark mode (removed rather than half-supported).
