---

description: "Tasks for grouping tables and lists, in three pull requests"
---

# Tasks: Tables and lists can be grouped by a property, as folding groups

**Input**: `specs/024-table-list-group-by/` (spec.md Q1–Q7, plan.md, research.md R1–R6, data-model.md, contracts/place-and-set-view.md)

**Tests**: required.
- Go: `server/viewgroup_test.go` (new) for `checkViewGrouping` through both doors and embeds, refusal paths included; place with props; layout change; personal state; the parity act pair; the views lock.
- `check-rowgroups.mjs` (new); `check-content-actions.mjs` and `check-menu-icons.mjs` extended.
- Playwright `table-groups.mjs` (new).
- Every new test is mutation-checked (it fails with its fix taken out).

**Issues**: parent #823; tasks T001–T034 are #945–#978

**Delivery**: three pull requests, each from its own branch off `main`.
- PR 1: server, agents and the pure grouping module (US7, the server half of US1, US2, US5, US6).
- PR 2: the grouped table (US1, US2, US5, US6). Starts after PR 1 merges.
- PR 3: lists and date periods, wiki and screenshots (US3, US4). Starts after PR 2 merges.

**CodeGraph** (before writing these tasks; `codegraph status`: synced): see plan.md's CodeGraph section. `switchViewLayout` has one caller, `switchViewType` (MCP); the browser has its own copy of the rule in `web/src/viewLayout.ts` (`switchLayout`), so both change. `normalizeViews` has one route caller (`collections.go`); `applyViewSpec` four, all MCP (database and embed views); `cleanViewState` one route; `handlePlacePage` only its route. The Playwright specs are not indexed: the ones touching view settings, layouts and lanes (`view-layout.mjs`, `view-settings.mjs`, `board-lanes.mjs`, `embed-views.mjs`, `row-handle.mjs`, `view-lock.mjs`) come from text search and are rerun.

## Format: `[ID] [P?] [Story] [surface] Description`

---

## PR 1: Views can hold a table's or list's grouping, for people and agents

Built with the changes in research R7: `showEmptyGroups` / `show_empty_groups` for a table's empty groups, No value keyed `""` and dates by the chart's period keys, and the place route's `propsPatch` logged as two entries.

### Phase 1: Foundational

- [x] T001 [backend] `server/viewgroup.go` (new): `checkViewGrouping(view, schema, strict)` (R2). On a table or list with `grouped`: `groupBy` is select, multiselect, status, relation, person, checkbox, date, formula or rollup; `groupPeriod` only with a date and one of day, week, month, year; `statusGroups` only with a status; `groupReverse`, `showEmpty` booleans; `hiddenGroups` a list of strings. Strict (a change): refuse with `invalid_view_group` and a sentence naming the property and why. Not strict (stored): a stale property draws flat and the grouping keys are dropped. Board and chart views are left to their own checks
- [x] T002 [test] `server/viewgroup_test.go` (new): each groupable type accepted; text, number, url refused with the sentence; period on a non-date refused; status groups on a select refused; a deleted property dropped on a later save, not refused; a board's or chart's keys untouched. Mutation-check the type rule

### Phase 2: The doors (US7 and the server half of US1, US5)

- [x] T003 [US1] [backend] `server/viewopen.go` `normalizeViews`: call `checkViewGrouping` beside `checkViewSubGroup`, strict for a changed view, as `normalizeKey` does
- [x] T004 [P] [US7] [mcp] `server/mcp_schema.go`: `viewSpec` gains `GroupReverse *bool` (`group_reverse`); `applyViewSpec` on a table or list: `group_by` sets `groupBy` and `grouped` (`""` clears `grouped`, `groupBy`, `groupPeriod`, `groupReverse`, `showEmpty`, `hiddenGroups`), `period`, `show_empty`, `hidden_groups`, `status_groups`, `group_reverse` apply; then `checkViewGrouping` strict. Embeds get it through `mcpCreateEmbedView` / `mcpUpdateEmbedView`
- [x] T005 [P] [US7] [mcp] `server/mcp.go` `set_view`: input schema adds `group_reverse`; description says a table or list groups with `group_by` (and `period` for a date), that `""` removes it, and that a board changed to a table or list stays grouped
- [x] T006 [US1] [backend] `server/viewlayout.go` `switchViewLayout`: board → table or list with a `groupBy` sets `grouped: true`; table or list → board keeps `groupBy` as the columns when it can group a board; `layoutDefaultsSaid` names the grouping kept
- [x] T007 [P] [US1] [ui] `web/src/viewLayout.ts` `switchLayout`: the same rule as T006 for the browser's layout change; `web/scripts/check-viewlayout.mjs` gains the cases
- [x] T008 [US1] [backend] `server/viewaudit.go`: watched keys gain `grouped`, `groupReverse`, `groupPeriod`, `showEmpty`, `hiddenGroups`, `statusGroups`, so a regroup is in the view history
- [x] T009 [US1] [test] `server/viewgroup_test.go`: PUT `/api/collections/{id}` groups a table and a list; a table that was a board before (stored `groupBy`, no `grouped`) stays flat after an unrelated save; board → table via PUT layout and via `set_view type` is grouped by the board's property; `set_view group_by ""` clears every grouping key; read scope refused; locked views refused (one case in `TestEveryViewDoorIsRefusedWhileLocked`); an embed's view grouped through `set_view embed_id`, the database's views unchanged; a new case in `server/testdata/embedviews`
- [x] T010 [P] [US7] [mcp] `server/parity_property_test.go`: an act pair "group a table view" (PUT views, `set_view`) and `capabilities.json` entry for the capability

### Phase 3: Folding and the drag (server half of US2, US6)

- [x] T011 [US2] [backend] `server/viewprefs.go` `cleanViewState`: accept `foldedGroups`, a list of strings (at most as many as the view could have groups; a non-list refused like `foldedLanes`)
- [x] T012 [US6] [backend] `server/order.go` `handlePlacePage`: optional `props` (contracts/place-and-set-view.md); after the gate, set them with the function PATCH `/api/pages/{id}` uses for properties (same validation, history, webhook), then place; a refused value answers as PATCH does and nothing moves; one `reorder_page` audit entry naming the properties
- [x] T013 [US6] [test] `server/order_test.go`: place with props sets the value and the place in one request; a value PATCH refuses is refused here and the row does not move; no write access refused before the body is read; a credential outside the workspace refused. `server/viewprefs_test.go` (or `status_groups_test.go`'s neighbour): `foldedGroups` kept, a non-list refused, embed scope. Mutation-check both
- [x] T014 [P] [US6] [i18n] `web/src/serverErrors.ts`: `invalid_view_group`; `web/src/api.ts`: `placePage` takes optional `props`; `web/src/types.ts`: `ViewDef` gains `grouped`, `groupReverse`; `PersonalViewState` gains `foldedGroups`

### Phase 4: The grouping rules (browser, pure)

- [x] T015 [US1] [ui] `web/src/rowGroups.ts` (new, R3): `groupRows(rows, prop, settings, opts)` returning `{key, label, value, rows, count}[]`: option types through `lanesFor`/`laneIdsOf` from `boardLanes.ts` (option order, No value `__unset__` last, a multi-value row in each group); person and relation in the order met, named by the caller; checkbox `true` then `false`, no No value; date by `groupPeriod` (month default; week from `firstWeekday()`), key = the period's first day `YYYY-MM-DD`, oldest first; status with `statusGroups` by its groups; then `groupReverse` (No value stays last), `hiddenGroups` removed, empty groups dropped unless `showEmpty`. Also `groupDropPatch(prop, fromKey, toKey, current)` from `laneValue`/`dropPatch` rules (null for formula, rollup and a date)
- [x] T016 [test] `web/scripts/check-rowgroups.mjs` (new, in `npm run check`): every rule of T015, counts equal rows, a multi-value row counted in each group, a week starting Monday and Sunday, reverse keeps No value last, a drop patch keeps a multi-value row's other values. Mutation-check

**Checkpoint (PR 1)**: `go test ./...`, `npm run check`, the gate; `/code-review`, `/security-review` (place route gate). Nothing visible changes yet.

---

## PR 2: A table can be grouped, folded and dragged between groups

### Phase 5: User Story 1 - Group a table (P1) 🎯 MVP

**Goal**: a table drawn in groups with headers, counts and per-group totals.
**Independent Test**: group a table of tasks by Status; one header per status with rows, option order, right counts, sorted rows.

- [x] T017 [US1] [ui] `web/src/components/ViewGroupMenu.tsx` (new): the Group popover moved out of `CollectionView.tsx`'s view bar, shown for board, table and list; for a table or list: property picker (groupable types), Order (as the property's order / reversed), Show empty groups (`ui/Switch`), Hidden groups with Show, Expand all, Collapse all, Remove grouping; a board keeps its column picker as today
- [x] T018 [US1] [ui] `web/src/components/RowGroupHeader.tsx` (new): one `<tr>` with a `<th scope="rowgroup" colSpan>` holding a `ui/Button` fold toggle (`aria-expanded`, Enter/Space), the value (an option as its chip, a person or page by name, No value, a period label), the count; right-click and its ⋯ open the header menu from T020; tokens only
- [x] T019 [US1] [ui] `web/src/components/CollectionView.tsx` `TableView`: when the view is grouped, `groupRows` (memoised on rows and settings) after the embed row limit (R5); one `<tbody>` per group: header, rows (a tree's sub-items under their parent, top-level rows grouped only, Q7), the group's totals row from the existing `footer` function on its rows; the overall foot row is not drawn while grouped; Group button lit when grouped
- [x] T020 [P] [US1] [ui] `web/src/actions/groupActions.ts` (new) and its renderer: Hide group; Collapse all, Expand all behind a separator; `web/src/menuIcons.ts`: `hideGroup`, `collapseAllGroups`, `expandAllGroups`, each its own icon; `web/scripts/check-content-actions.mjs` gains the group list with its place `groupHeader`; `check-menu-icons.mjs` passes
- [x] T021 [P] [US1] [i18n] `web/src/locales/de.json`, `nl.json`, `es.json`: every new string (Group menu, header menu, No value, Checked, Unchecked, count labels through `plural()`)

### Phase 6: User Story 2 - Fold groups (P1)

**Goal**: folding is each person's own and survives a reload.
**Independent Test**: fold a group, reload, still folded; another person sees it open.

- [x] T022 [US2] [ui] `web/src/viewState.ts`: `withGroupFolded(state, key, folded)` and `withAllGroupsFolded(state, keys | null)` beside `withLaneFolded`; `CollectionView.tsx` wires the header toggle, Expand all and Collapse all through the personal state (both scopes), allowed on a locked view and for a reader

### Phase 7: User Story 5 - Order, empty and hidden groups (P2)

**Goal**: flip the order, show empty groups, hide one and bring it back.
**Independent Test**: hide a group from its header menu; it is listed under Hidden groups; Show brings it back.

- [x] T023 [US5] [ui] `CollectionView.tsx` / `ViewGroupMenu.tsx`: Order, Show empty groups, Hide group and Show save the view for everyone (`saveViews`), refused with the lock's message while locked

### Phase 8: User Story 6 - Drag within and between groups (P2)

**Goal**: reorder inside a group; drop into another group to change the value.
**Independent Test**: drag a To do row into In progress: status In progress, at the drop spot.

- [x] T024 [US6] [ui] `web/src/rowDrag.ts` and `TableView`: drop spots know their group; within a group, today's `placePage`; into another group, `placePage` with `groupDropPatch`'s props; refused (no line) where the patch is null; a sorted view gives way as in spec 022; a multi-value row dragged from one of its groups replaces only that value
- [ ] T025 [test] `web/tests/table-groups.mjs` (new, in `web/tests/package.json`): group by Status; headers, counts and per-group totals right; filter and sort apply inside groups; a tagged row in two groups; fold, reload, folded; another account sees it open; Collapse all / Expand all; Order flipped; hide and show a group; Show empty groups; drag within a group and into another (value and place after reload); a formula grouping refuses the cross-group drop; a reader folds but cannot drag; a board switched to a table stays grouped, an old converted table stays flat; phone width; light and dark. Rerun `view-layout.mjs`, `view-settings.mjs`, `board-lanes.mjs`, `embed-views.mjs`, `row-handle.mjs`, `view-lock.mjs`
- [x] T026 [perf] Measure SC-002 in `table-groups.mjs`'s set-up: 5,000 rows, time to draw flat and grouped, fold and unfold; record the numbers in the PR

**PR 2 split in two** (2026-11-24, while building): PR 2a is T017–T023 and the
grouped-table part of T025 (`web/tests/table-groups.mjs`): headers, totals,
folding, the Group menu, hidden and empty groups, order. While a table is
grouped its rows do not move. PR 2b is T024 (drag within and between groups),
the drag part of T025, and T026 (the 5,000-row measurement). Reason: the drop
between groups changes how a drag reads the table's rows (one tbody per group
now), and 2a was already the larger half; two reviewable pull requests
instead of one.

**PR 2b, as built** (2026-11-25): a drop into an empty or folded group writes
the value alone, since there is no row in it to place the row by; the line is
drawn under that group's header. The keyboard move (mod+shift+↑/↓) steps
among the rows of the group the focused copy is in and never changes a value:
the value is changed by editing it, or by a drag. T026's numbers are in the
pull request; switching a 5,000-row table back to flat takes about 30 s on
`main` as well, filed as #994. T025 stays open for its last items (a board
switched to a table, an old converted table, phone width, light and dark),
which PR 3's screenshots and tests take up.

**Checkpoint (PR 2)**: gate, `check-bundle.mjs` under the cap (number in the PR), `/code-review`, `ux-ui-audit` light and dark at desktop and phone width.

---

## PR 3: Lists group too, dates group by period, and the wiki says so

### Phase 9: User Story 3 - Group a list (P2)

**Goal**: the same headers in a list, without totals.
**Independent Test**: group a list by Status; headers, counts and folding.

- [ ] T027 [US3] [ui] `web/src/components/ListView.tsx`: takes the grouping and the fold handlers; headers (`RowGroupHeader` in its list form, a `div` row spanning the grid with the same button and menu) between rows; the phone grid unchanged; `ChartView`'s table alternative stays flat
- [ ] T028 [US3] [test] `web/tests/table-groups.mjs`: a grouped list on desktop and phone, folding, hidden groups

### Phase 10: User Story 4 - Group by a date (P2)

**Goal**: a date groups by day, week, month or year.
**Independent Test**: group by Due, by month; 12 and 29 August share August.

- [ ] T029 [US4] [ui] `ViewGroupMenu.tsx`: for a date property a period choice (`ui/ToggleGroup` or a select: Day, Week, Month, Year; month default); `RowGroupHeader` labels: a day by `formatDay`, a week "Week of {day}", a month by `formatMonth`, a year as its number
- [ ] T030 [US4] [test] `web/tests/table-groups.mjs`: date grouping by month and week with the account's week start; a cross-group drag on a date grouping refused

### Phase 11: Polish

- [ ] T031 [P] [wiki] `wiki/views.md`: grouping a table or list (Group menu, folding, order, empty and hidden groups, dates, drag between groups); `wiki/mcp-tools.md`: `set_view` grouping parameters
- [ ] T032 [P] [wiki] `wiki/screenshots.json`: a grouped table and the Group menu (light and dark), shot with `web/scripts/shoot-wiki.mjs`; retake shots `check-wiki.mjs` reports stale
- [ ] T033 [ui] Follow-up issue for two levels of grouping (Q3) and a per-group + New (spec Assumptions), linked from #823
- [ ] T034 [backend] Release after PR 3 merges; close #823 once its table and list parts are done; handoff comment on #643

**Checkpoint (PR 3)**: gate, bundle, `/code-review`, `ux-ui-audit`.

---

## Dependencies & Execution Order

- PR 1: T001 → T002, T003; T004–T005 after T001 (parallel with T006–T008); T009 after T003–T008; T010 after T004; T011–T013 independent of T001–T010; T014 any time; T015 → T016.
- PR 2 needs PR 1 merged. T017–T021 → T022 → T023 → T024 → T025, T026.
- PR 3 needs PR 2 merged. T027–T028 and T029–T030 can run in either order; T031–T034 last.

## Parallel Opportunities

- PR 1: T004/T005 (mcp) beside T006/T007 (layout) and T011 (personal state); T015/T016 (browser module) beside all server work.
- PR 2: T020 (actions, icons) and T021 (translations) beside T017–T019.
- PR 3: T031/T032 (wiki) beside T027–T030.

## Implementation Strategy

MVP is PR 2's US1 and US2: a table grouped and folded. Each PR is independently releasable: PR 1 lets agents and the REST door group a view (the browser draws it flat until PR 2, which reads the same keys).
