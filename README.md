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

## Authoring notes

Markdown is rendered with `react-markdown` + sanitize; there is no `dangerouslySetInnerHTML`.
`$x$` and `$$x$$` are math, so write `\$` for a literal dollar sign.

## Linked documents

A page's external link is embedded inline when it is a Google Doc, Sheet, Slides deck, or Drive file/folder
(`src/lib/embed.ts`). It appears as a tab next to the page notes, in a sandboxed iframe built from a vetted URL.
Viewers need access to the file in Google. Other links render as a link card, because most sites block framing.

## Not done yet

Moving pages/folders between folders, page-to-page links and backlinks, attachments/images, table of contents,
read-only Legacy cars, lead-managed membership (admin only for now), dark mode (removed rather than half-supported).
