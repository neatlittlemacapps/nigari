---

description: "Tasks for database views that read comfortably and handle the way people expect"
---

# Tasks: Database views read comfortably and handle the way people expect

**Input**: `specs/012-database-view-handling/` (plan.md, spec.md, research.md R1–R13, data-model.md, contracts/mcp.md, contracts/ui.md, quickstart.md)

**Tests**: required. Go tests for the stored order on both doors and a parity pair; two pure checks (`check-columndrag.mjs`, `check-boarddrag.mjs`); four new browser specs; the existing specs that press the old toolbar controls kept green.

**Issues**: parent #426; T001–T040 are #429–#468, in order.

**Delivery**: two pull requests (research R12), built by the helper stream on its own branch. Phases 1–4 are **PR 1** (text size, column order with its server and MCP part, board marker). Phases 5–7 are **PR 2** (Settings menu, fold-away toolbar, polish).

**CodeGraph** (before writing these tasks, `codegraph status`: "Index is up to date"):

- `codegraph callers normalizeViews` → `handlePutCollection` (REST) and two tests only. **MCP `set_view` does not call it.** It goes through `applyViewSpec` (`server/mcp_schema.go:697`, `:724`), which calls the per-view checks (`checkViewOpenIn`, `checkChartView`) itself. So the `colOrder` rule is one function, `checkViewColOrder`, called from both `normalizeViews` and `applyViewSpec` (T005). The plan's "both doors call `normalizeViews`" is corrected in plan.md and research R4.
- `codegraph callers ColHead` → `TableView`; `TableView` → `CollectionView`; `ColumnsControl` → `CollectionView`; `SchemaEditor` → `CollectionView`; `ViewOpenMenu` → `CollectionView`.
- `codegraph callers ViewActionItems` → `CollectionView`. It is used by the view tab's right-click menu as well as the ⋯ menu, so it stays a shared component and the tab menu keeps working (T027).
- `codegraph callers useBoardDrag` → `BoardView` (`CollectionView.tsx:1986`) only.
- `codegraph callers MenuSubmenu` → `PageMenu` (`SidebarMenus.tsx`) and the catalogue. The new `value` prop is optional, so neither has to change.
- Text search, not the graph: the "Open ⚙ Properties to add one" sentence is in **three** empty states (board `CollectionView.tsx:2053`, timeline `:2656`, calendar `:2796`), not only the board's as research R13 says (T028). The six proposed icons (`EyeOff`, `Eye`, `PanelRight`, `CalendarRange`, `Network`, `Rows3`) are used by no menu function today. The specs that press the old controls: `database-toolbar-menus`, `embeds`, `fixture`, `menu-icons`, `menu-keyboard`, `people`, `side-peek`.

## Format: `[ID] [P?] [Story] [surface] Description`

---

## Phase 1: Setup (PR 1)

- [x] T001 [ui] `ViewDef.colOrder?: string[]` in `web/src/types.ts`, beside `colWidths`, with a comment: per view, missing means the schema's order (research R2). Optional, so none of `ViewDef`'s 38 callers changes

---

## Phase 2: User Story 1, a table is as easy to read as the text around it (P1) 🎯 PR 1

**Goal**: table text on the type scale.

**Independent Test**: quickstart §1, in light and dark at desktop and phone width, on a database page and an embed.

- [x] T002 [US1] [ui] `web/src/styles.css`: `.db-table td` takes `font-size: var(--font-size-md)` and `.db-table th` `var(--font-size-sm)`, replacing 13.5px and 12.5px (FR-001). Check row height, column widths and wrapping at the new size at desktop and phone width (FR-002); an embed draws the same size as the page (US1 scenario 3)
- [x] T003 [P] [US1] [ui] Catalogue section in `web/catalog/main.tsx`: the same table at 14px (`--font-size-md`) and at a one-off 15px preview, in light and dark, so the owner can choose (research R1). Owner chose 14px (2026-11-03); the 15px preview was removed
- [x] T004 [US1] [ui] `fontSize` in `web/tokens/budgets.json` lowered to the count `node web/scripts/check-tokens.mjs --measure` gives after T002 (374 before)

---

## Phase 3: User Story 2, move a column by dragging its header (P1) PR 1

**Goal**: a per-view column order, set by drag, by the header menu, or by an agent.

**Independent Test**: quickstart §2 and §6.

### Server and MCP first

- [x] T005 [US2] [backend] `checkViewColOrder(view, schema)` in `server/viewopen.go` with the rules in data-model.md, verbatim: "Only on a `table` view. On any other type the request is refused (`invalid_view_column_order`)"; "Must be an array of strings; anything else is refused with the same code"; "Ids that are not properties of the schema, and repeats, are dropped silently"; the title is never in the list. An empty list removes the key. Called from `normalizeViews` (which then marks the array changed whenever the view's JSON changed: an id dropped or an empty list removed, so REST stores what MCP stores) **and** from `applyViewSpec` in `server/mcp_schema.go` (reached by `set_view` both when it creates a view, `mcpCreateView`, and when it updates one, `mcpUpdateView`), so the rule is one function on both doors. Its own error type, answered by `handlePutCollection` (`server/collections.go`) as HTTP 400 with code `invalid_view_column_order` and the message in contracts/mcp.md
- [x] T006 [US2] [mcp] `set_view` gains `column_order` (array of strings) in `server/mcp.go`: the tool's input schema, the args struct, the `viewSpec` it builds, and the description sentence from contracts/mcp.md. `viewSpec.ColumnOrder` in `server/mcp_schema.go` is applied in `applyViewSpec` on create and on update (`[]` clears it) and checked by `checkViewColOrder` (depends on T005)
- [x] T007 [US2] [test] Go tests in `server/viewopen_test.go` and an MCP test via `callTool`: accepted on a table view through REST and MCP, on an MCP create and an MCP update; refused on a board view and as a non-array on both doors with the same code; unknown ids and repeats dropped; `[]` clears and REST and MCP store the same bytes for it; a view without `colOrder` stores the same bytes as before; `get_collection` returns `colOrder`; a read-scope token refused on `set_view`. Each new test mutation-checked (remove the call from one door, it fails)
- [x] T008 [US2] [mcp] A pair of acts "set a view's column order" in `server/parity_property_test.go` (REST `PUT /api/collections/{id}` with `colOrder`, MCP `set_view` with `column_order`) that must agree on access. `capabilities.json` and `gapBudget` unchanged
- [x] T009 [P] [US2] [i18n] `web/src/serverErrors.ts` entry for `invalid_view_column_order`, its sentence in `de.json`, `es.json`, `nl.json`

### Interface

- [x] T010 [US2] [ui] New `web/src/columnDrag.ts`: pure `orderedColumns(schemaIds, colOrder, hidden)` (data-model.md "Drawing": the ids of `colOrder` that exist and are not hidden, in that order, then every other visible property in schema order), `gapIndex(headerRects, x)`, `moveColumn(order, id, delta)`, and a `useColumnDrag` hook (pointer events, the 5px threshold `boardDrag.ts` uses, Escape or a release outside the header row cancels, auto-scroll at the table's sides) (research R5)
- [x] T011 [P] [US2] [test] New `web/scripts/check-columndrag.mjs` for the pure functions of T010 (a deleted id skipped, a new property at the end, a hidden one keeps its place, title never moved, moves at both ends), added to `npm run check` in `web/package.json`
- [x] T012 [US2] [ui] `TableView` in `web/src/components/CollectionView.tsx` draws its columns through `orderedColumns`; widths still follow each column
- [x] T013 [US2] [ui] `ColHead` (`CollectionView.tsx`): a drag from the label through `useColumnDrag` with a 2px token-coloured marker on the nearest gap and the dragged header dimmed; release saves `colOrder` through the view update that saves `colWidths`. `.col-resize` keeps its own pointerdown and resizes as today (FR-006); the title column neither drags nor has a menu
- [x] T014 [US2] [ui] `ColHead` header menu: `ui/Menu`, opened by a click on the label and by a right-click, with `moveLeft`, `moveRight` (left out at the ends) and a new function `hideInView` (`EyeOff`) added to `web/src/menuIcons.ts`. After a move, focus is back on that header (FR-005). A reader who cannot edit gets no menu
- [x] T015 [P] [US2] [i18n] "Hide in view" and the header menu's accessible name in `de.json`, `es.json`, `nl.json`
- [x] T016 [US2] [test] New `web/tests/column-order.mjs`, registered in `web/tests/package.json`: drag with the marker; reload keeps the order; a second table view and the Properties dialog unchanged; the header menu by keyboard with focus kept; an edge drag still resizes; the title stays first; an order set by `set_view` is drawn. Mutation-checked against the old `TableView`
- [x] T017 [P] [US2] [wiki] `wiki/views.md` (moving columns, per view), `wiki/mcp-tools.md` (`set_view` `column_order`), a line in `docs/what-it-does.md`

---

## Phase 4: User Story 3, a board drag shows where the card lands (P2) PR 1

**Goal**: a placeholder at the place the view's sort will give the card.

**Independent Test**: quickstart §3.

- [x] T018 [US3] [ui] `dropIndex(cards, card, sort)` in `web/src/boardDrag.ts`: the column's cards in the view's sort order with the card inserted by the same comparator the view sorts with, by row order when there is no sort; over its own column, its own index (data-model.md "Board drop place", research R7)
- [x] T019 [P] [US3] [test] New `web/scripts/check-boarddrag.mjs`: sorted, unsorted, own column, ties, and a 500-card column timed; added to `npm run check` in `web/package.json`
- [x] T020 [US3] [ui] `BoardView` (`CollectionView.tsx`, the one caller of `useBoardDrag`): the column under the pointer gets the target style (`--color-hover` background, `--color-border-strong` outline) and a placeholder the card's height at `dropIndex(...)`; no transition under `prefers-reduced-motion`; nothing when the group property cannot be changed (no drag starts, as today)
- [x] T021 [US3] [test] New `web/tests/board-drop-marker.mjs`, registered in `web/tests/package.json`: ten drags across columns land where the placeholder was (SC-003); sorted and unsorted; own column changes nothing; a touch drag (`hasTouch`); reduced motion. Mutation-checked
- [x] T022 [P] [US3] [wiki] `wiki/views.md`: what the board shows while dragging

### Closing PR 1

- [x] T023 [test] Before PR 1 is offered: bundle gzip measured against `check-bundle.mjs`'s cap; stale shots retaken with `shoot-wiki.mjs`; `codegraph sync`, then `codegraph callers` on `checkViewColOrder`, `orderedColumns`, `useColumnDrag`, `dropIndex`; `/code-review` on the diff; `ux-ui-audit` on the table and board in light and dark at desktop and phone width; findings fixed or filed

---

## Phase 5: User Story 4, a view's toolbar has one Settings button (P2) PR 2

**Goal**: one Settings menu holds everything the Properties button, the ⋯ menu and the per-view dropdowns did.

**Independent Test**: quickstart §4.

- [x] T024 [US4] [ui] `MenuSubmenu` gains `value?: ReactNode` in `web/src/ui/Menu.tsx`, drawn muted on the right before `›` (`Menu.css`, tokens only); documented in `web/src/ui/README.md`; a catalogue case in `web/catalog/main.tsx` in light and dark
- [x] T025 [US4] [ui] Five new functions in `web/src/menuIcons.ts`: `propertyVisibility` (`Eye`), `openRowsIn` (`PanelRight`), `timelineDates` (`CalendarRange`), `subItems` (`Network`), `editProperties` (`Rows3`); `check-menu-icons.mjs` decides if one is taken
- [x] T026 [US4] [ui] Settings in `CollectionView.tsx`: an `IconButton` with the sliders icon, tooltip and accessible name "Settings", `aria-haspopup="menu"`, just before **New**, opening a `ui/Menu` (`narrow="sheet"`, label "{name} view settings") with the items of research R8 except Layout (R9): **View settings** (rename with `opensDialog`; Property visibility with value "{n} of {total}" over `MenuCheckboxItem`s; Open rows in over `ViewOpenMenu`'s radio group, not for forms; timeline only Start date and End date; table only, with a self-relation, Sub-items), a separator, `moveLeft`, `moveRight`, `delete` (danger, last), a separator, **Database settings** (Edit properties, opening `SchemaEditor`). The view-type part is left out when a type has none. No Settings in an embed (FR-017, R10); a reader who cannot edit is offered no changes (depends on T024, T025)
- [x] T027 [US4] [ui] Remove from the toolbar: the **Properties** button, the **⋯ View options** menu, `ColumnsControl`, the timeline's two `<select>`s, the table's sub-items `<select>`. `ViewActionItems` stays for the view tab's right-click. Then `codegraph callers anchoredMenuStyle`: spec 010 kept it for `ColumnsControl`; if it has no caller left, remove it and say why in `check-anchoredmenu.mjs`, or keep it for its remaining caller (depends on T026)
- [x] T028 [US4] [ui] The three empty states in `CollectionView.tsx` (board, timeline, calendar) say "Open Settings, then Edit properties, to add one." in place of "Open ⚙ Properties to add one.", each keeping its own first sentence
- [x] T029 [P] [US4] [i18n] The strings in contracts/ui.md for Settings and the three new empty-state sentences in `de.json`, `es.json`, `nl.json`; strings only the removed controls used are removed from all three (check each with a search first)
- [x] T030 [US4] [test] New `web/tests/view-settings.mjs`, registered in `web/tests/package.json`: a list of every action the old ⋯, Properties and dropdowns offered, each found and done from Settings (SC-004); values on the right; Escape returns focus to Settings; Tab stays inside; a bottom sheet at phone width; no Settings in an embed; a reader is offered no changes; opened from a side peek it draws over it
- [x] T031 [US4] [test] Update `web/tests/database-toolbar-menus.mjs`, `embeds.mjs`, `menu-icons.mjs`, `menu-keyboard.mjs`, `people.mjs`, `side-peek.mjs` and the `fixture.mjs` helper from the old controls to Settings, keeping every assertion
- [ ] T032 [P] [US4] [wiki] `wiki/views.md` and `wiki/collections.md`: the Settings menu replaces every mention of Properties, ⋯ and the dropdowns; where Edit properties is now

---

## Phase 6: User Story 5, a database in a document stays quiet until you reach for it (P3) PR 2

**Goal**: an embed's toolbar buttons fold away until hover or focus.

**Independent Test**: quickstart §5.

- [ ] T033 [US5] [ui] `web/src/styles.css`: inside `.collection--embed`, the toolbar's control group at `opacity: 0`, shown on `:hover`, `:focus-within` and `[data-menu-open]`; always shown under `@media (hover: none)`; the opacity transition dropped under reduced motion. `data-menu-open` set from the toolbar menus' `onOpenChange` in `CollectionView.tsx`. The buttons stay in the tab order and the accessibility tree (research R11)
- [ ] T034 [US5] [ui] A "Filtered" / "Sorted" marker beside the view tabs of an embed that shows while the buttons are folded (FR-021)
- [ ] T035 [P] [US5] [i18n] "Filtered" and "Sorted" in `de.json`, `es.json`, `nl.json`
- [ ] T036 [US5] [test] New `web/tests/embed-toolbar-fold.mjs`, registered in `web/tests/package.json`: hidden at rest; shown on hover and one Tab; stays while a menu from it is open; always shown with `hasTouch`; "Filtered" at rest; the toolbar's box does not move; two embeds fold on their own; a page's own toolbar never folds. Mutation-checked
- [ ] T037 [P] [US5] [wiki] `wiki/views.md`: the folding toolbar in documents

---

## Phase 7: Polish and cross-cutting (PR 2)

- [ ] T038 [ui] `rawButtons` in `web/tokens/budgets.json` lowered to the count measured after PR 2 (271 before); bundle gzip measured against the cap
- [ ] T039 [P] [wiki] Retake every shot `check-wiki.mjs` lists as stale with `node web/scripts/shoot-wiki.mjs <id>`
- [ ] T040 [test] Before PR 2 is offered: `codegraph sync`, then `codegraph callers` on `MenuSubmenu`, `ViewActionItems`, `ViewOpenMenu`, `SchemaEditor` and the removed `ColumnsControl`; `/code-review` on the diff; `ux-ui-audit` on the toolbar, Settings and an embed in light and dark at desktop and phone width; findings fixed or filed

---

## Dependencies

- T001 → T010, T012. T005 → T006 → T007, T008. T010 → T011, T012, T013 → T014 → T016.
- T018 → T019, T020 → T021.
- Phases 2, 3 and 4 are independent of each other once T001 is in; T023 closes PR 1.
- PR 2 starts after PR 1 is merged. T024, T025 → T026 → T027, T030, T031. T033 → T034 → T036.
- T038–T040 close PR 2.

## Parallel opportunities

- T003 beside T002; T009 beside T010–T014 (server error text vs. interface).
- T011 and T019 (pure checks) beside the interface work they check.
- Translations (T015, T029, T035) and wiki tasks (T017, T022, T032, T037) once their strings and behaviour exist.
- Within one stream these are separate commits, not separate people (steward skill: at most two streams).

## Implementation strategy

MVP = PR 1: tables read at the type scale's size, columns move per view (with agents on par), and a board drag says where the card lands. PR 2 reworks the toolbar once, as a whole: Settings, then the fold. Each PR leaves `main` releasable.
