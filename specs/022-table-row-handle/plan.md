# Implementation Plan: Every table row has a drag handle, a + and a row menu

**Branch**: `claude/spec-022-row-handle` | **Date**: 2026-11-22 | **Spec**: [spec.md](spec.md) | **Issue**: #370; #4

**Input**: Feature specification from `/specs/022-table-row-handle/spec.md`

## Summary

A row's place in a database is its page's `position`, one order per database
(Q1). One server function, `placePage`, puts a page before or after a sibling
by writing one midpoint (R1). People reach it through a new
`POST /api/pages/{id}/place`, the + and Duplicate through `after` on create and
duplicate (R3), agents through `after` / `before` on `update_page` and
`create_page`, which closes parity gap `pages.order` (#4).

In the table, a new `rowDrag.ts` (pure part + pointer hook, like
`columnDrag.ts`) drags a row by a handle in the title cell, draws one line per
gap, and in a sorted view removes the sort as the person's own change (R4,
spec 013's bar). A new row actions list (`actions/rowActions.ts`) draws the
row menu and, from now on, the board card's menu (R6). Shortcuts `mod+/` and
`mod+shift+↑/↓` go through `keys.ts` (R7).

Two pull requests:
1. **Server and agents**: `placePage`, the route, `after` on create and
   duplicate, the MCP arguments, the manifest, tests, wiki for the tools.
2. **Interface**: the handle, +, drag, row menu, keyboard, touch, board card
   menu from the list, translations, wiki page and screenshots.

PR 2 starts after the owner has seen the handle as a picture (R8) and
answered the two open decisions (R4 who loses the sort; R5 the handle on a
phone). PR 1 does not depend on either.

## Technical Context

**Language/Version**: Go 1.27 (server, one package `server/`), TypeScript 5.6 + React 18 (`web/src/`)

**Primary Dependencies**: Go standard library + pure-Go SQLite; Mantine, BlockNote, Yjs in the frontend. New dependencies: none

**Storage**: One SQLite file. Schema change: none (R9: an index only if the benchmark asks for one). A row's order is its existing `position`.

**Testing**: `go test ./...` (`order_test.go` new, parity acts, `credential_audit_test.go`), `npm run check` (new `check-rowdrag.mjs`, `check-content-actions.mjs` and `check-keys.mjs` extended), Playwright `web/tests/row-handle.mjs` (new), `board-drag`/card menu specs rerun

**Target Platform**: One static binary (`CGO_ENABLED=0`); browser, desktop shell, MCP clients

**Performance Goals**: a move writes one row; p95 of a move on the seeded workspace's largest database within the write budget (SC-002, R9). A drag step does one hit test against cached row boxes and a style change only when the spot changes.

**Constraints**: No external services. English source strings, de/es/nl. Agent parity (constitution II).

**Scale/Scope**: table views of any size (rows load in steps of 100, all of them); trees of sub-items; embeds in documents.

## CodeGraph

- `codegraph explore "table view row rendering, row actions menu, row position reorder, view sort"` and on `TableView`:
  - `TableView` (`CollectionView.tsx`) has one caller, `CollectionView`, and already hosts `useColumnDrag`. The row drag joins it as a second hook from its own module (frontend rule: no new behaviour inline).
  - No row menu exists in the table; `openRow`/`useOpenRow` is the only row action.
- `codegraph callers CardMenu`: drawn by `BoardView` (`renderColumns`), defined in `CollectionMenus.tsx`. Its items move to the row actions list (R6).
- `codegraph explore "handlePatchPage position update_page mcp handleReindexSiblings capabilities pages.order"`:
  - `handleUpdatePage` takes a raw `position` and bumps `updated_at` on every write; a position-only write logs nothing. Its one browser caller for positions is the sidebar.
  - `handleReindexSiblings` has one caller (its route) and holds the renumbering `placePage` reuses.
  - `mcpUpdatePageMeta` (3 callers: `mcpCall`, `mcpDatabaseTemplates`, a test) has no position. The move goes into `mcpCall`'s `update_page` branch beside `parent_id`, through `placePage`, not into `mcpUpdatePageMeta`.
- `codegraph callers handleCreatePage` / `handleDuplicatePage`: only their routes. Both put a new page at `MAX(position) + 1`; `ingest.go` and `import_csv.go` do the same, so ties are rare (R1).
- `codegraph explore "mergeViewState withPersonalEdit hasPersonalChange PersonalViewState sort"`: `sort: null` in a person's state already means "no sort for me", and the lock leaves personal sort open (`FilterSortControls` stays under a lock, FR-009). R4 needs no server change.
- Text search: `idx_pages_parent` is the only index on `pages` used by the move (R9); `--editor-drop-line-width` exists (2px); `mod+/` and `mod+shift+arrow*` are not bound in `keys.ts`.

## Constitution Check

- I. One binary, no external services ✅ nothing new to run.
- II. Agent parity ✅ `update_page` and `create_page` take `after`/`before`; `pages.order` becomes `allowed`, `gapBudget` 10 → 9, a parity act pair.
- III. Gates are one function ✅ `placePage` holds the checks; both doors call it.
- IV. Derive from code ✅ `rowDrag.ts` and `rowActions.ts` are pure, each with its check.
- V. English source ✅ new strings get de/es/nl.
- VI. Every surface, every time ✅ table below.
- VII. Measured, not assumed ✅ the move is benchmarked before an index is considered (R9); drag step cost measured with the #810 probe.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | New `placePage` (`server/order.go`): `canWrite` then `credentialMayEnter` on the page, the anchor a live readable sibling, `reorder_page` in the activity log from the REST door (an agent's call is logged by `mcpCall`), `fireWebhook("page.updated")`, `rowChanged`. Create and duplicate call it after their insert. | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | One read of the anchor's neighbour on `idx_pages_parent`; the renumbering of `handleReindexSiblings` reused. No new index unless R9's benchmark asks. | backend |
| REST routes (`server/server.go`, middleware) | `POST /api/pages/{id}/place` behind `auth`. `POST /api/pages` and `POST /api/pages/{id}/duplicate` accept `after`/`before`. | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | `update_page`: `after`, `before` (a sibling's id), `view_id`; `create_page`: `after`, `before`. Descriptions say they order siblings and change no view's sort. Read scope refused by `mcpCall`; the anchor is checked in `placePage`. | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: nothing closed; the move opens to agents. | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | `rowDrag.ts` (new), `components/RowHandle.tsx` (new: handle, +, tooltip, row menu), `TableView` renders them in the title cell. Board `CardMenu` drawn from `rowActions.ts`. Light and dark; keyboard `mod+/`, `mod+shift+↑/↓`. | ui |
| Translations (`t()`, `de.json` and `nl.json` required, `es.json`) | Tooltip, menu items (Open in, side peek, centre peek, Comment, "Edited {time} by {name}"), the drag's screen-reader announcement, the shortcut sheet lines: de, es, nl. | i18n |
| Server error codes (`web/src/serverErrors.ts`) | `anchor_not_sibling` gets an entry. | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots) | `mcp-tools.md` (`update_page`, `create_page` arguments), `pages.md` (order), `views.md` table section (handle, menu, manual order, sort), shortcut list; table screenshots retaken. `docs/what-it-does.md`: rows can be reordered by hand and by agents. | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | `order_test.go`: before/after, ties renumbered, self, trashed or foreign anchor, read scope, other workspace, workspace closed to agents (REST and `callTool`); `updated_at` untouched; audit entry. Parity act pair. `credential_audit_test.go` gets the new args. `check-rowdrag.mjs`, `check-content-actions.mjs` (row list), `check-keys.mjs`. Playwright `row-handle.mjs`: drag, sorted view, tree, filter, menu by click/right-click/keys, +, Alt+, touch emulation. | test |
| Performance (query plans, payload size, per-request work) | A move: one neighbour read, one write. `EXPLAIN QUERY PLAN` in the PR. The menu's "last edited by" is one `GET /api/audit?page=` when it opens, not per row. | perf |
| Manifest (`capabilities.json`, `gapBudget`, parity acts) | `pages.order`: `allowed`, rest `POST /api/pages/{id}/place` (and the existing reindex route), mcp `update_page`; `gapBudget` 10 → 9; `parityActs` pair. | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets, catalogue) | Handle and + are `ui/Button` (icon, low emphasis, small); the line uses `--color-focus` and `--editor-drop-line-width`; no new literal, budgets unchanged. No new `ui/` component. | ui |
| Storage budgets (benchmarks on the seeded workspace, p95 budgets, read time limit) | New benchmark: a move in the seeded workspace's largest database, against the write budget (R9). | perf |
| Page containers | Tables in a full page, a side peek and a centre peek all show the handle (it lives in `TableView`); the row menu's "Open in" offers the peeks the container allows. | ui |
| Aggregation | No change: no property type. | backend |
| Stored data | No upgrade step: `position` exists; its values change as today's sidebar moves change them. | backend |
| Outside names | No change. The new route and arguments are additions. | backend |
| Menu icons | New functions `openIn`, `openInSidePeek`, `openInCenterPeek`, `addRowBelow`, each with an icon of its own; reused: `open`, `openInNewTab`, `editProperty`, `commentsPanel`, `favorite`, `copyLink`, `duplicate`, `moveToTrash`. | ui |
| View lock | No change: no view is written by a move; a sort removed by a drag is personal state, which the lock leaves open (R4). | backend |
| Cross-origin requests | No change: the new route is a POST, judged by `ServeHTTP`. | backend |
| Embedded views | A drag in an embed's own view removes the embed scope's sort (personal), and moves the row in the database's order; the drag sends the embed's view as `viewId`. | ui |
| Content actions | New list `web/src/actions/rowActions.ts` (places `table`, `boardCard`); the table's row menu and the board's card menu are both built from it; left-out actions carry reasons; `check-content-actions.mjs` covers rows. | ui |

**New concepts**: None for the registry. A row's manual order is the page order that exists; the row actions list follows the Content actions row.

**Parity statement**: Agents can do this over MCP via `update_page` with `after` or `before` (and `create_page` with the same), with the same checks as `POST /api/pages/{id}/place`, because both call `placePage`.

## Project Structure

### Documentation (this feature)

```text
specs/022-table-row-handle/
├── plan.md
├── research.md          # R1–R9
├── contracts/place.md   # the route and the tool arguments
└── tasks.md             # /speckit-tasks
```

`data-model.md` skipped: no new entity or stored shape (the spec's Key Entities cover it). `quickstart.md` skipped: the Playwright spec is the walk-through.

### Source Code (repository root)

**Files touched**:
- `server/`: `order.go` (new), `order_test.go` (new), `pages.go` (create), `lifecycle.go` (duplicate), `server.go` (route), `mcp.go` (`update_page`, `create_page`), `parity_property_test.go`, `credential_audit_test.go`, `bench_world_test.go`.
- `web/src/`: `rowDrag.ts` (new), `components/RowHandle.tsx` (new), `actions/rowActions.ts` (new), `actions/rowActionReasons.ts` (new), `components/CollectionView.tsx` (`TableView`, two hooks and the handle), `components/CollectionMenus.tsx` (`CardMenu` from the list), `components/BoardView.tsx`, `menuIcons.ts`, `keys.ts` users, `api.ts`, `serverErrors.ts`, `styles.css`, `locales/{de,es,nl}.json`.
- `web/scripts/`: `check-rowdrag.mjs` (new), `check-content-actions.mjs`, `check-keys.mjs`.
- `web/tests/`: `row-handle.mjs` (new).
- `capabilities.json`, `wiki/`, `docs/decisions.md`, `docs/what-it-does.md`.

## Complexity Tracking

None.
