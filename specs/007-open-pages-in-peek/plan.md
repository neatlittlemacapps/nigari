# Implementation Plan: A view chooses how its pages open

**Branch**: `claude/vigilant-babbage-bvoiel` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md) | **Issue**: #177

**Input**: Feature specification from `/specs/007-open-pages-in-peek/spec.md`

## Summary

Each view stores `openIn` (`side_peek`, `center_peek`; missing = full page) beside its
filters (research R1). One server function validates it for REST `PUT
/api/collections/{id}` and MCP `set_view` (R2); `get_collection` already returns views
whole. In the browser a pure module decides what a click does (R3), `App.tsx` owns the
peeked row in the address (`?peek=`, R4), and a new `ui/SidePanel` draws the ordinary
`Editor` beside the view (R5, R6). The setting is a submenu of the view options menu
(R8). Centre peek ships in a follow-up pull request behind `centerPeekShipped` (R7).

## Technical Context

**Language/Version**: Go 1.27 (server, one package `server/`), TypeScript 5.6 + React 18 (`web/src/`)

**Primary Dependencies**: Go standard library + pure-Go SQLite; React, BlockNote, Yjs, `@base-ui/react` 1.9.0 in `web/src/ui/`. New dependencies: none

**Storage**: One SQLite file; writer `s.db`, read pool `s.rdb`. Schema change: none (views are JSON in `collections.views`)

**Testing**: `go test ./...` (`testServer`, `signedIn`, `callTool`), `npm run check` (new `check-peek.mjs`), Playwright in `web/tests/` (new `side-peek.mjs`), catalogue (`web/tests/catalog.mjs`)

**Target Platform**: One static binary (`CGO_ENABLED=0`); browser (desktop and phone widths), desktop shell, MCP clients

**Performance Goals**: no new query or request; opening a peek costs one page load as today; closing it does not reload the view's rows (SC-005); bundle stays under the 590,146 B gzip cap

**Constraints**: No external services. English source strings as keys. Agent parity. Design system: no new literals; new component in `web/src/ui/`.

**Scale/Scope**: a view's setting is one short string; one peek per tab

## Constitution Check

- I. One binary, no external services: ✅ no dependency, no schema change
- II. Agent parity: ✅ `set_view` gains `open_in` in the same change; `get_collection` returns it
- III. Gates are one function: ✅ `checkViewOpenIn` / `normalizeViewsOpenIn` called by both doors; the existing write gate on views runs first
- IV. Derive from code: ✅ `check-peek.mjs` asserts the click table; `check-wiki.mjs` covers the tool text; `check-surfaces.mjs` covers the new registry row
- V. English source: ✅ new strings through `t()`, German in `de.json`
- VI. Every surface, every time: ✅ table below, plus the new registry row
- VII. Measured, not assumed: ✅ no new query; bundle size measured in the PR

Re-checked after Phase 1 design: unchanged.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | New `server/viewopen.go`: `checkViewOpenIn(view)` and `normalizeViewsOpenIn(raw)` (R2): known value, not on a form view, `center_peek` refused while `centerPeekShipped` is false, `full_page` stored as no key. Gates unchanged and first: changing a view needs write access to the database. No `audit` or `fireWebhook`: neither view-save path calls them today, and a view setting changes no page content; adding them for all view changes is out of scope (#178) | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | No change: a key inside the existing `collections.views` JSON, written by the existing statements | backend |
| REST routes (`server/server.go`, middleware) | No new route. `PUT /api/collections/{id}` runs `normalizeViewsOpenIn` on the views half and answers 400 `invalid_view_open_in` on a bad value, storing nothing | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | `set_view` takes `open_in` (`full_page`, `side_peek`; `center_peek` once shipped), through `applyViewSpec` → `checkViewOpenIn`; description says what each value does and that forms have none. `get_collection` already returns views whole: description mentions `openIn`. No page text returned, so no new `wrapUntrusted`. Read scope: `set_view` already refused | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: open to agents | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | New `web/src/peek.ts` (`rowOpenAction`, R3); `pageOpen.ts` `openCollectionRow` takes `openIn` and `onPeek`; every call site (`CollectionView`, `ListView`, `GalleryView`, calendar, timeline, board cards) passes the view's setting; the spec 005 toast's **Open** too. `App.tsx`: `peekId` in the address and history state (R4). New `components/PeekPanel.tsx` mounts `Editor` with `container="peek"` (R5; `inDialog` becomes `container`). New `components/ViewOpenMenu.tsx`: **Open pages in** radio group in the view options menu, hidden for forms (R8). Keyboard: open with Enter on a row, Escape closes, focus returns to the row. Light and dark checked | ui |
| Translations (`t()`, `de.json` required, `es.json`) | "Open pages in", "Full page", "Side peek", "Center peek" (follow-up), "Open as full page", "Close", "This page is no longer available." (if not present). German in `de.json`, Spanish reported | i18n |
| Server error codes (`web/src/serverErrors.ts`) | New code `invalid_view_open_in` (400) with an entry in `serverErrors.ts` | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots) | `wiki/collections.md` new § "How rows open" (under § Rows are pages); `wiki/mcp-tools.md` §§ set_view, get_collection; `docs/what-it-does.md` one line. Screenshots: whichever `check-wiki.mjs` lists as stale from `CollectionView.tsx` and `Editor.tsx` changes, retaken with `shoot-wiki.mjs`; a new shot of a side peek if `wiki/collections.md` gets one | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | `server/viewopen_test.go`: table test for `checkViewOpenIn` (each value, unknown, form view, centre peek while unshipped, full page stored as no key); REST PUT and MCP `set_view` set and read back; refusals on both doors store nothing; read-scope token refused (existing gate); SC-004 parity test doing both doors on one view. `parity_property_test.go`: act `set view open mode`. `check-peek.mjs`: every row of the R3 table. Playwright `web/tests/side-peek.mjs`: US1 scenarios 1–4 and 6, reload with `?peek`, Back closes, a Full page view still navigates (SC-003). `tabs.mjs` and `trash-navigation.mjs` unchanged | test |
| Performance (query plans, payload size, per-request work) | No new query or request; the setting rides on the views the collection load returns. Closing a peek unmounts one editor and leaves the view's rows in memory. Bundle gzip measured against 590,146 B | perf |
| Manifest (`capabilities.json`, `gapBudget`, `parity_property_test.go`) | No new route or tool; `collections` already lists `PUT /api/collections/{id}` and `set_view`. No new gap; `gapBudget` stays 10. One parity act added | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets) | New `ui/SidePanel.tsx` + `.css` (R6): README entry, catalogue section, light and dark. New tokens (component tier): `side-panel.width` 720px, `side-panel.layer` 90; `--shadow-overlay`. Buttons are `ui/Button`/`IconButton` (no new raw `<button>`); no hand-built `role="dialog"`. Budgets only go down | ui |
| Storage budgets (`bench_world_test.go`, p95 in spec 002 research) | No change: no new or changed query on a hot path | perf |
| Page containers (new registry row, R5) | Added to `.specify/memory/surfaces.md` by this plan: a page now renders in a full page, a side peek (and a centre peek in the follow-up). This feature makes every existing page control work in the peek through the shared `Editor` | ui |

**Parity statement**: Agents can do this over MCP via `set_view` with `open_in`, with the
same checks as `PUT /api/collections/{id}`. Both doors call `checkViewOpenIn`.
`get_collection` returns the value as a person's browser receives it.

**Manifest**: unchanged routes and tools; no new gap; `gapBudget` stays 10.

**Registry**: new row *Page containers* (tag `ui`, Since 2026-10-28, introduced by spec
007): "A page renders in more than one container: full page, side peek, centre peek. A
new page-level control (top bar, panel, page menu, keyboard shortcut) works in each, or
the plan says why not." Since is the day after this plan so the plans of specs 005 and
006, dated 2026-10-27, are not asked about a concept that did not exist when they were
written; this plan answers it anyway (row above).

## Project Structure

### Documentation (this feature)

```text
specs/007-open-pages-in-peek/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/rest.md, contracts/mcp.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
server/
├── viewopen.go          # new: checkViewOpenIn, normalizeViewsOpenIn, centerPeekShipped
├── viewopen_test.go     # new
├── collections.go       # handlePutCollection: normalize the views half
├── mcp.go               # set_view: open_in (schema, dispatch), get_collection description
├── mcp_schema.go        # viewSpec.OpenIn, applyViewSpec
└── parity_property_test.go
web/tokens/component.tokens.json   # side-panel.width, side-panel.layer
web/src/
├── peek.ts              # new: rowOpenAction
├── pageOpen.ts          # openCollectionRow(openIn, onPeek)
├── App.tsx              # peekId, ?peek=, history state
├── serverErrors.ts      # invalid_view_open_in
├── ui/SidePanel.tsx, ui/SidePanel.css, ui/README.md   # new component
├── components/PeekPanel.tsx      # new
├── components/ViewOpenMenu.tsx   # new
├── components/Editor.tsx         # container prop (page | dialog | peek)
├── components/CollectionView.tsx, ListView.tsx, GalleryView.tsx  # pass openIn / onPeek
├── types.ts             # View.openIn
└── locales/de.json, es.json
web/catalog/             # SidePanel section
web/scripts/check-peek.mjs        # new, in npm run check
web/tests/side-peek.mjs           # new, in web/tests/package.json
wiki/collections.md, wiki/mcp-tools.md, docs/what-it-does.md
.specify/memory/surfaces.md       # Page containers
docs/decisions.md                 # per-view, peek beats the account preference
```

**Structure Decision**: one small server file for the rule, one pure module for the click
decision, one design-system component for the panel and two small components the big
files import. `App.tsx` changes only where it already owns the address.

## Complexity Tracking

None. No principle is bent.
