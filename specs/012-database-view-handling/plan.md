# Implementation Plan: Database views read comfortably and handle the way people expect

**Branch**: the helper stream's branch (named in its first prompt) | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md) | **Issue**: epic #426 (#131, #132, #133, #270, #280)

**Input**: Feature specification from `/specs/012-database-view-handling/spec.md`

## Summary

Five changes to how a database view looks and handles, in two pull requests
(R12).

**PR 1:**
- Table text moves onto the type scale: 14px cells, 13px headers (R1).
- A table column moves by dragging its header, or from a new header menu.
  The order is stored on the view as `colOrder`, beside `colWidths`, checked
  by the shared `normalizeViews` and settable by agents through `set_view`'s
  new `column_order` (R2–R6).
- A board drag shows a placeholder where the card will land, which is the
  place the view's sort gives it (R7).

**PR 2:**
- The toolbar's **Properties**, **⋯**, **Columns** and per-view `<select>`s
  become one **Settings** menu, built from the existing `ui/Menu` (R8). It has
  no Layout item (R9), and embedded databases get no Settings button (R10).
- In a document, the embedded database's toolbar folds away until it is
  hovered or focused, with CSS only (R11).

## Technical Context

**Language/Version**: TypeScript 5.6 + React 18 (`web/src/`); Go 1.27 (`server/viewopen.go`, `server/mcp.go`, `server/mcp_schema.go`)

**Primary Dependencies**: `@base-ui/react` 1.9.0 through the existing `ui/Menu`; `lucide-react` (icons for six new menu functions). New dependencies: none

**Storage**: one optional key, `colOrder`, inside a table view's JSON; no upgrade step (R3)

**Testing**: Go tests in `server/` for `normalizeViews`' `colOrder` rules (accept, drop unknown ids, refuse a non-table view and a non-array) through REST and `callTool`, including the read-scope refusal, and a parity pair. New checks: `check-columndrag.mjs` (which gap), `check-boarddrag.mjs` (`dropIndex`). New Playwright specs: `column-order.mjs`, `board-drop-marker.mjs`, `view-settings.mjs`, `embed-toolbar-fold.mjs`. Existing specs updated where they press Properties, View options or the `<select>`s: `database-toolbar-menus`, `embeds`, `menu-icons`, `menu-keyboard`, `people`, `side-peek`, and the `fixture.mjs` helper. `catalog.mjs` for `MenuSubmenu`'s `value`

**Target Platform**: browser at desktop and phone widths; the desktop shell (same frontend)

**Performance Goals**: no new query or request. Column order is computed per render from two short lists. `dropIndex` sorts one column's cards per pointer move, bounded by the column's size (a 500-card column checked in `check-boarddrag.mjs` for time). Bundle under `check-bundle.mjs`'s cap, measured in each PR

**Constraints**: English source; design system (tokens only; `rawButtons` and `fontSize` budgets go down, never up); one icon per menu function (`check-menu-icons.mjs`); `CGO_ENABLED=0` unaffected

**Scale/Scope**: 5 issues, 2 PRs, 1 stored key, 1 MCP argument, 6 menu functions, about 15 strings

## CodeGraph

Index checked with `codegraph status` ("Index is up to date") before each round.

- `codegraph explore "ViewDef handlePutCollection set_view delete_view colWidths boardDrag audit"`:
  - `ViewDef` (`web/src/types.ts`) has 38 callers across 11 files; `colOrder` is optional, so none has to change.
  - `handlePutCollection` is called from `server.go` and tested via `prefs_http_test.go` and `upgrade_test.go`.
  - The view rules both doors share are `normalizeViews` in `server/viewopen.go`, where `colOrder` belongs (R4).
  - `pageUiState.ts` is per-browser memory; not used here, kept for spec 013 (#279).
- `codegraph explore "colWidths TableView column header resize ColumnsControl"`:
  - `CollectionView → TableView → ColHead`. `ColHead` (`CollectionView.tsx:2270`) is a label and a `.col-resize` handle with no menu. `startResize` already stops propagation, so a header drag can sit beside it (R5).
  - `ColumnsControl` (`CollectionView.tsx:2552`), the property-visibility control, has one caller: the toolbar. It moves into Settings (R8).
  - No test reaches `TableView`, `ColHead` or `ColumnsControl` within three caller hops (graph). The browser specs that use them were found by text search.
- `codegraph explore "groupColourTokens …"` (from #278, same session): not relevant here.
- Board: `useBoardDrag` (`boardDrag.ts`) has one caller, the board in `CollectionView.tsx:2027`, which hands it `onDrop(rowId, groupBy, toCol)`. The marker needs the column's sorted cards at that call site (R7).
- `MCP set_view` (`server/mcp.go:425`) takes no width or order argument today. Agents cannot set `colWidths`, so `column_order` is a new argument, not an extension of one (R4).
- Not from the graph:
  - the toolbar's markup (read in `CollectionView.tsx:778–960`);
  - the menu functions taken (`menuIcons.ts`: `Settings2` is `workspaceSettings`, `TableProperties` is `embedCollection`, `ListTree` is `tableOfContents`);
  - the `fontSize` budget (374, `check-tokens.mjs --measure`);
  - the German comment at `CollectionView.tsx:2026` (R13).

## Constitution Check

- I. One binary, no external services: ✅ no dependency, no service.
- II. Agent parity: ✅ column order is settable and readable over MCP (`set_view` `column_order`, `get_collection`). The board marker, Settings menu, text size and fold are presentation of what agents already do. No new gap.
- III. Gates are one function: ✅ `colOrder` is checked in `normalizeViews`, which REST and MCP both call. No permission changes; `canWrite` and the read-scope refusal stand.
- IV. Derive from code: ✅ `check-columndrag.mjs` and `check-boarddrag.mjs` for the pure parts; budgets lowered to measured counts; `check-menu-icons.mjs` covers the new menus.
- V. English source: ✅ new strings through `t()` with `de`/`es`/`nl`. The German comment found is filed and fixed separately (R13).
- VI. Every surface, every time: ✅ table below. No new registry row: nothing here is a concept later features must answer for.
- VII. Measured, not assumed: ✅ bundle and budgets measured in each PR; `dropIndex` on a 500-card column measured in its check.

Re-checked after Phase 1 design: unchanged.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | `normalizeViews` (`server/viewopen.go`) validates `colOrder`: table only, array of strings, unknown ids and repeats dropped (R4). Both doors already call it. No gate changes. `audit` for view changes is spec 013's (#178). No webhook: no page content changes | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | No change: `colOrder` lives in the view JSON already stored with the collection; no table, column or index | backend |
| REST routes (`server/server.go`, middleware) | No change: `PUT /api/collections/{id}` carries `colOrder` in its existing `views` half. New error code `invalid_view_column_order` (400) | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | `set_view` gains `column_order` (array of property ids, `[]` clears), mapped to `colOrder` in `server/mcp_schema.go` and checked by `normalizeViews`; its description says so. `get_collection` already returns view JSON, so `colOrder` is readable there. Read scope still refused on `set_view` (existing gate, tested again) | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: nothing closed or opened | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | **PR 1:**<br>• Table CSS on tokens (R1).<br>• `ColHead` gains a header menu (`ui/Menu`, click and right-click) with Move left, Move right and Hide in view, plus a drag from its label (`columnDrag.ts`, R5–R6).<br>• `TableView` draws columns by `colOrder`.<br>• The board draws a target column style and a placeholder at `dropIndex(...)` (R7).<br>**PR 2:**<br>• One Settings `IconButton` opening a `ui/Menu` with View settings and Database settings (R8). `ColumnsControl`, the **Properties** button, the **⋯** menu and the three `<select>`s leave the toolbar.<br>• `ViewActionItems` and `ViewOpenMenu` move inside the menu.<br>• No Settings in embeds (R10).<br>• Fold-away CSS for `.collection--embed` (R11).<br>• The board's empty-state sentence changes (R13).<br>**Keyboard:** the header menu's Move keeps focus on the header; Settings: Escape returns focus and Tab stays inside (from `ui/Menu`). Checked in light and dark | ui |
| Translations (`t()`, `de.json`/`es.json`/`nl.json`) | About 15 new strings (list in [contracts/ui.md](contracts/ui.md)), German, Spanish and Dutch; strings that only the removed controls used are removed from the three files ("Properties" where unused elsewhere, "View options", "Start: (none)", "End: (none)", "No sub-items" and the like) | i18n |
| Server error codes (`web/src/serverErrors.ts`) | New entry for `invalid_view_column_order`, with its sentence translated | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots, `docs/what-it-does.md`) | `wiki/views.md`: moving columns, the board marker, the Settings menu (replacing every mention of Properties, ⋯ and the dropdowns), and the folding toolbar in documents. `wiki/collections.md`: where Edit properties is now. `wiki/mcp-tools.md`: `set_view` `column_order`. `docs/what-it-does.md`: a line on per-view column order. Screenshots: every shot `check-wiki.mjs` lists as stale is retaken with `shoot-wiki.mjs` (the toolbar is in many collection shots) | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | **Go:** `colOrder` accepted on a table view and refused on a board view and as a non-array, through REST and `callTool`; unknown ids dropped; read scope refused on `set_view`; the parity pair (see Manifest).<br>**Checks:** `check-columndrag.mjs`, `check-boarddrag.mjs`, in `npm run check`.<br>**Playwright:** `column-order.mjs` (drag, the menu by keyboard, reload, other view unchanged, resize still works, an agent's order shown); `board-drop-marker.mjs` (the placeholder at the sorted place; drop lands there; touch; reduced motion); `view-settings.mjs` (every old action reachable, values shown, Escape and focus, the phone sheet, none in an embed); `embed-toolbar-fold.mjs` (hidden at rest, shown on hover and Tab, stays while a menu is open, always shown with `hasTouch`, "Filtered" at rest, nothing moves).<br>**Updated:** the specs listed in Technical Context. Each new test is mutation-checked against the old code | test |
| Performance (query plans, payload size, per-request work) | No query and no request. `dropIndex` is bounded by one column's cards; measured on 500 in its check. Bundle measured against the cap in both PRs | perf |
| Manifest (`capabilities.json`, `gapBudget`, `parity_property_test.go`) | No new route or tool, so no new entry; `gapBudget` unchanged. `parity_property_test.go` gains a pair of acts, "set a view's column order" (REST PUT with `colOrder`, MCP `set_view` with `column_order`), which must agree on access | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets) | Table sizes on `--font-size-md`/`--font-size-sm`. `fontSize` budget lowered by the literals removed. Settings is an `IconButton`; the header menu and Settings are `ui/Menu`. `MenuSubmenu` gains `value` (README and catalogue updated, light and dark). Marker and target styles from existing tokens; no new colour. `rawButtons` lowered by the toolbar buttons removed (the count measured after PR 2) | ui |
| Storage budgets (`bench_world_test.go`, p95 in spec 002 research) | No change: no query | perf |
| Page containers (full page, side peek, centre peek) | A database shown inside a row's peek is a full collection view and gets the same Settings button and header menus. The Settings menu (`layer.dropdown` 200) draws over a side peek (`side-panel.layer` 90), as spec 010's menus do; checked from a peek in `view-settings.mjs`. Fold-away applies only to embeds in documents, in every container | ui |
| Aggregation (`server/aggregate.go`) | No change: no property type | backend |
| Stored data (`server/upgrade_steps.go`) | No upgrade step: `colOrder` is optional, and no stored view is rewritten (R3). An earlier step is not touched. A view without `colOrder` draws as today, which the Go test also checks | backend |
| Outside names (env vars, cookies, storage keys, …) | No change: `colOrder` is a new key, not a renamed one; no outside name changes | backend |
| Menu icons (`ui/Menu`, `menuIcons.ts`, `check-menu-icons.mjs`) | Two new menus (column header, Settings), both `ui/Menu`. Six new functions (`hideInView`, `propertyVisibility`, `openRowsIn`, `timelineDates`, `subItems`, `editProperties`), each with an icon no other function has; `moveLeft`, `moveRight`, `rename` and `delete` reused with their icons. The radio lists inside submenus are `MenuRadioGroup`s, as `ViewOpenMenu`'s already is | ui |

**Parity statement**: column order is the one new capability, and agents get
it through `set_view` with the checks people's saves get, in one function.
Everything else is presentation.

**Manifest**: unchanged routes and tools; no new gap; `gapBudget` unchanged;
one new parity pair.

**Registry**: no new row.

## Project Structure

### Documentation (this feature)

```text
specs/012-database-view-handling/
├── spec.md              # amended: R10 (no Settings in embeds)
├── plan.md
├── research.md          # R1–R13
├── data-model.md        # colOrder, menu functions, drop place
├── quickstart.md
├── contracts/mcp.md     # REST and MCP
├── contracts/ui.md      # table, board, toolbar, strings
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
server/viewopen.go                   # PR 1: colOrder rules in normalizeViews
server/mcp.go, server/mcp_schema.go  # PR 1: set_view column_order
server/viewopen_test.go (or the existing view test file), server/parity_property_test.go   # PR 1
web/src/types.ts                     # PR 1: ViewDef.colOrder
web/src/styles.css                   # PR 1: table sizes; PR 2: fold-away, marker, Settings
web/src/columnDrag.ts                # PR 1: new
web/src/boardDrag.ts                 # PR 1: dropIndex, placeholder state
web/src/components/CollectionView.tsx  # PR 1: ColHead menu and drag, TableView order, board marker; PR 2: toolbar
web/src/components/CollectionMenus.tsx, ViewOpenMenu.tsx   # PR 2: inside Settings
web/src/ui/Menu.tsx, Menu.css, README.md   # PR 2: MenuSubmenu value
web/src/menuIcons.ts                 # PR 1: hideInView; PR 2: the other five
web/src/serverErrors.ts              # PR 1
web/src/locales/de.json, es.json, nl.json   # both PRs
web/catalog/main.tsx                 # PR 1: table at 14 and 15px; PR 2: MenuSubmenu value
web/scripts/check-columndrag.mjs, check-boarddrag.mjs, web/package.json   # PR 1
web/tokens/budgets.json              # fontSize (PR 1), rawButtons (PR 2), to measured counts
web/tests/column-order.mjs, board-drop-marker.mjs   # PR 1
web/tests/view-settings.mjs, embed-toolbar-fold.mjs # PR 2
web/tests/database-toolbar-menus.mjs, embeds.mjs, menu-icons.mjs, menu-keyboard.mjs, people.mjs, side-peek.mjs, fixture.mjs, package.json   # PR 2 (PR 1 where they touch headers)
wiki/views.md, collections.md, mcp-tools.md, docs/what-it-does.md   # both PRs
wiki/img/…                           # retaken by shoot-wiki.mjs only
```

**Structure Decision**: no new component in `web/src/ui/`. The Settings menu
and the header menu are `ui/Menu`, and `MenuSubmenu` learns to show a value.
Two small modules (`columnDrag.ts`, plus `dropIndex` in `boardDrag.ts`) carry
the parts that can be checked without a browser.

**Order of work** (R12): PR 1 = US1, US2 (server and MCP first, then the
interface), US3. PR 2 = US4, US5, screenshots.

**Streams**: built by the helper stream (stream B) on its own branch. It owns
the files above for the length of spec 012. The conductor writes spec 013 in
the meantime and touches none of them. The shared files (`de/es/nl.json`,
`docs/decisions.md`, `wiki/mcp-tools.md`, `server/mcp.go`) follow the steward
skill's "add your own entries, never reorder" rule.

## Complexity Tracking

None. No principle is bent.
