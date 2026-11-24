# Implementation Plan: Tables and lists can be grouped by a property, as folding groups

**Branch**: `claude/spec-024-group-by` | **Date**: 2026-11-24 | **Spec**: [spec.md](spec.md) | **Issue**: #823

**Input**: Feature specification from `/specs/024-table-list-group-by/spec.md`

## Summary

A table or list view gets one grouping: the rows are drawn under folding
group headers (value, count; in a table, a totals row per group). Grouping is
worked out in the browser from the rows the view already loads, by a new pure
module that reuses the board's lane logic (`boardLanes.ts`) and the format
helpers for date periods. The view stores it in the fields the board and the
chart already use (`groupBy`, `groupPeriod`, `showEmpty`, `hiddenGroups`,
`statusGroups`) plus two new ones: `grouped` (the switch that makes a table or
list draw its `groupBy`, so tables that carry a board's old `groupBy` stay
flat, R1) and `groupReverse`. Folded groups are personal state
(`foldedGroups`, beside `foldedLanes`). One server check validates a
grouping for both doors (PUT views, `set_view`), and a layout change from a
board turns grouping on. A drag into another group writes the value and the
place in one request (`POST /api/pages/{id}/place` takes the props, R4).

Three pull requests: (1) server and agents, with the pure module and its
check; (2) the grouped table, its Group menu, folding and drags; (3) lists,
date periods, wiki and screenshots.

## Technical Context

**Language/Version**: Go 1.27 (server, one package `server/`), TypeScript 5.6 + React 18 (`web/src/`)

**Primary Dependencies**: Go standard library + pure-Go SQLite; Mantine, BlockNote, Yjs in the frontend. New dependencies: none

**Storage**: One SQLite file. Schema change: none. Two new optional keys in a view's JSON (`grouped`, `groupReverse`) and one in personal view state (`foldedGroups`); absent means today's behaviour, so no upgrade step (as spec 013's `subGroupBy` and `foldedLanes`).

**Testing**: `go test ./...` (`testServer`, `callTool`, embed view cases), `npm run check` (new `check-rowgroups.mjs`), Playwright `web/tests/table-groups.mjs`

**Target Platform**: One static binary; browser, desktop shell, MCP clients

**Performance Goals**: grouping 5,000 loaded rows within one frame of the flat table's draw (SC-002), measured in the browser spec before and after; no new request per group; no new server query.

**Constraints**: main bundle under its cap (557,749 B gzip after #935, 31.6 KB headroom); measured after each PR with `check-bundle.mjs`.

**Scale/Scope**: the row counts a table already loads (every row, in pages of 200); a relation or person grouping with hundreds of values.

## CodeGraph

- `codegraph explore "BoardView TableView ListView groupBy subGroupBy"`: only `BoardView` reads `groupBy`; `TableView` and `ListView` draw rows flat; the Group button in the view bar is gated on `view.type === 'board'`. Nothing of #823 for tables or lists exists.
- `codegraph explore "boardLanes laneIdsOf lanesFor laneValue dropPatch"`: pure, no React, held by `check-boardlanes.mjs`; the new module imports from it rather than copying (a row in several groups, No value last, the multi-value drop that keeps other values).
- `codegraph explore "checkViewSubGroup normalizeViews applyViewSpec switchViewLayout"`: both doors already share `checkViewSubGroup` (`normalizeViews` for PUT, `applyViewSpec` for `set_view`); `checkViewGrouping` joins it the same way. `switchViewLayout` keeps `groupBy` on board → table today (spec 018), which is why the `grouped` switch is needed (R1).
- `codegraph explore "checkChartView applyChartSpec groupPeriod hiddenGroups showEmpty"`: the chart already validates these keys; R2 reuses the period and hidden-group rules instead of a second set.
- `codegraph callers cleanViewState`: two callers in `viewprefs.go`, the personal state route and its embed scope; `foldedGroups` is cleaned beside `foldedLanes`.
- `codegraph explore "placePage handlePlacePage update_page after before"`: one function behind the REST door and `update_page`; the REST body has no props today (R4). `update_page` already takes props and after/before in one call, so agents need nothing new for a drag.
- `codegraph callers TableView` / `ListView`: rendered by `CollectionView` only (ListView also by `ChartView` for its table alternative, which stays ungrouped). The embed row limit (`limitRows`, spec 023) is applied before the view draws; R5 applies grouping after it.
- `codegraph explore "viewaudit auditViewChanges viewlock"`: the audit's watched keys list `groupBy`/`subGroupBy`; `grouped`, `groupReverse`, `groupPeriod`, `showEmpty` and `hiddenGroups` are added so a regroup shows in the history like a resort.

## Constitution Check

- I. One binary, no external services ✅ nothing added.
- II. Agent parity ✅ `set_view` gains `group_reverse` and accepts `group_by`, `period`, `show_empty`, `hidden_groups`, `status_groups` on a table or list; folding is personal UI state, as folded lanes are (not in MCP today, closed-list entry unchanged).
- III. Gates are one function ✅ `checkViewGrouping` for both doors; the place route keeps `placePage` and applies props through the same function PATCH uses.
- IV. Derive from code ✅ `check-rowgroups.mjs` holds the grouping rules; plan records decisions only.
- V. English source ✅ new strings through `t()`, de/nl/es.
- VI. Every surface, every time ✅ table below.
- VII. Measured, not assumed ✅ SC-002 measured in the browser spec; bundle measured per PR.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | New `checkViewGrouping` (`server/viewgroup.go`) called from `normalizeViews` and `applyViewSpec`; `switchViewLayout` sets `grouped` on board → table/list; `handlePlacePage` applies optional `props` through the PATCH path's function under the same `canWrite`, then places; one audit entry each. | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | No change: grouping is computed from rows already loaded; no new query. | backend |
| REST routes (`server/server.go`, middleware) | `POST /api/pages/{id}/place` body gains optional `props` (contracts/place-and-set-view.md). No new route. | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | `set_view`: `group_by`, `period`, `show_empty`, `hidden_groups`, `status_groups` apply to tables and lists; new `group_reverse`; description updated (a board changed to a table stays grouped). Read scope still refused by `set_view`'s existing check. | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: folding a group is personal display state, like folding a lane, which agents have no use for. | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | `TableView` draws one `<tbody>` per group with a header row; `ListView` draws headers between rows; new `RowGroupHeader.tsx` (fold button with `aria-expanded`, count, header menu); Group menu moved out of `CollectionView` into `ViewGroupMenu.tsx` and shown for table and list; light and dark, phone width, keyboard (Enter/Space folds). | ui |
| Translations (`t()`, `de.json` and `nl.json` required, `es.json`) | New strings: Group menu labels (Order, Show empty groups, Hidden groups, Show, Expand all, Collapse all, Remove grouping, Hide group, No value, week label). | i18n |
| Server error codes (`web/src/serverErrors.ts`) | New code `invalid_view_group` (a grouping on a type that cannot group). | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots) | `wiki/views.md` (grouping tables and lists), `wiki/mcp-tools.md` (`set_view`), new screenshots of a grouped table and the Group menu in `screenshots.json`. | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | Go: `checkViewGrouping` cases, both doors, locked view refused, read scope refused, layout change board → table grouped and old table flat, place with props refused without write; embed case in `testdata/embedviews`. `check-rowgroups.mjs`. Playwright `table-groups.mjs` (group, fold, reload, drag between groups, list, phone). | test |
| Performance (query plans, payload size, per-request work) | No server work added. Browser: grouping is one pass over loaded rows, memoised on rows + settings; measured for 5,000 rows. | perf |
| Manifest (`capabilities.json`, `gapBudget`, parity acts) | No new route or tool; a pair of parity acts for "group a table view" (PUT views and `set_view`) in `parity_property_test.go`. | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets, catalogue) | Header built from `ui/Button` and the existing option chip; token colours only; no new raw button or literal; no new `ui/` primitive. | ui |
| Storage budgets (benchmarks on the seeded workspace, p95 budgets, read time limit) | No change: no query added or changed. | perf |
| Page containers | Grouped views render the same in a full page, side peek and centre peek: they are part of the collection view, not a page-level control. | ui |
| Aggregation | No change: no new property type; table totals per group reuse `TableView`'s footer function on each group's rows. | backend |
| Stored data | No upgrade step: new optional keys, absent means flat (R1), as spec 013 added `subGroupBy`. | backend |
| Outside names | No change: no new outside name. | backend |
| Menu icons | The group header menu is a `ui/Menu` with three new functions in `menuIcons.ts`, each with an icon no other function has: `hideGroup`, `collapseAllGroups`, `expandAllGroups`. The Group menu in the view bar is a popover like Filter and Sort, not a menu. | ui |
| View lock | Grouping changes go through the existing view saves (`saveViews`, `changeEmbedViews`), already refused while locked; folding is personal and allowed. Covered by `TestEveryViewDoorIsRefusedWhileLocked` plus one case. | backend |
| Cross-origin requests | No change: the place route is a POST, judged by `ServeHTTP`. | backend |
| Embedded views | Grouping works for an embed's own views: same keys, normalised by `changeEmbedViews` through `checkViewGrouping`; `foldedGroups` under the embed's personal scope; a new case in `server/testdata/embedviews`. | ui |
| Content actions | New list `web/src/actions/groupActions.ts` for a group header (Hide group; Collapse all, Expand all behind a separator), drawn by one renderer; `check-content-actions.mjs` gains the group list with its one place, `groupHeader`. | ui |

**New concepts**: None. Grouping reuses the view's grouping fields and personal state.

**Parity statement**: Agents can group, regroup and ungroup a table or list over MCP via `set_view` (with `embed_id` for an embed's views), with the same checks as PUT `/api/collections/{id}` (`checkViewGrouping`, the views lock). A drag between groups is `update_page` with props and `after`/`before`, as it is today.

## Project Structure

### Documentation (this feature)

```text
specs/024-table-list-group-by/
├── plan.md
├── research.md       # R1–R6
├── data-model.md     # the view's grouping keys and foldedGroups
├── contracts/        # place-and-set-view.md
└── tasks.md          # /speckit-tasks
```

`quickstart.md` is not written: the Playwright spec and tasks cover the run.

**Files touched**: `server/viewgroup.go` (new), `server/viewopen.go`, `server/viewlayout.go`, `server/mcp_schema.go`, `server/mcp.go` (description), `server/order.go`, `server/viewprefs.go`, `server/viewaudit.go`, `server/embedviews.go`, tests beside them; `web/src/rowGroups.ts` (new), `web/scripts/check-rowgroups.mjs` (new), `web/src/components/RowGroupHeader.tsx` (new), `web/src/components/ViewGroupMenu.tsx` (new), `web/src/actions/groupActions.ts` (new), `web/src/components/CollectionView.tsx`, `web/src/components/ListView.tsx`, `web/src/viewState.ts`, `web/src/types.ts`, `web/src/api.ts`, `web/src/menuIcons.ts`, `web/src/serverErrors.ts`, locales, `web/tests/table-groups.mjs` (new), `wiki/views.md`, `wiki/mcp-tools.md`, `wiki/screenshots.json`.

## Complexity Tracking

No violations.
