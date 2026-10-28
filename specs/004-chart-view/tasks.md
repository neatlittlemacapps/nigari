---

description: "Tasks for chart views of a database, with the chart builder"
---

# Tasks: Chart views of a database

**Input**: `specs/004-chart-view/` (plan.md, spec.md, research.md, data-model.md, contracts/)

**Tests**: required (salt.md). Refusal paths for every gate.

**Issues**: parent #20; T001–T048 are #215–#262, in order; T049–T054 are #271–#276.

**Delivery**: three pull requests, each green on its own.
1. **Server and agents**: the server half of Phase 2, US3, the route, the benchmark and
   the agents' wiki (T003–T008, T014, T023–T028, T041, T044, T047). Agents can chart
   before people can.
2. **The chart view**: Phase 1, the browser half of Phase 2, US1, US2, US4 and their wiki
   (T001, T002, T009–T013, T015–T022, T029, T030, T042, T043, T046 for `collection-chart`).
3. **The chart builder**: US5 and its wiki (T031–T040, T045, T046 for `chart-settings`,
   T048).

## Format: `[ID] [P?] [Story] [surface] Description`

---

## Phase 1: Setup

- [x] T001 [ui] Dependency: `npm install chart.js@4.5.1` in `web/` (lockfile through npm, never by hand); `THIRD-PARTY-NOTICES.md` through `node scripts/licenses.mjs`; the reason goes in the pull request that first imports it (research R8)
- [x] T002 [ui] Tokens (research R8, R16): semantic `color.chart.1`–`.12`, `color.chart.gray.1`–`.3`, `color.chart.<hue>.1`–`.3` for blue, yellow, green, purple, teal, orange, pink, red, each with light and dark values and `md.salt.contrast` 3:1 on `color.surface.default`; `color.chart.background.1`–`.4` (soft, no contrast claim); component `chart.height.small|medium|large|xlarge`; rebuild `web/src/tokens.css` with `node scripts/build-tokens.mjs`

---

## Phase 2: Foundational (blocks every story)

- [x] T003 [backend] Extract `(s) rowsWhere(u, colID, flat, groups, now) (string, []any)` from `collectionRowsQuery` in `server/collections.go`; `collectionRowsQuery` calls it, behaviour unchanged (research R1)
- [x] T004 [backend] New `server/aggregate.go`: `aggSpec`, `aggResult`, `(s) aggregateRows(ctx, u, colID, spec, flat, today)`: one `GROUP BY` on `s.rdb` under `withReadLimit` over `rowsWhere`; keys per research R2 (select/status option, list elements through `json_each`, person, checkbox, date day/ISO week/month/year), gap filling and the 400-period limit (`too_many_periods`), labels and `missing` (R5), left-out count (R3); without a grouping one group `"*"` (FR-029); `groupCounts` in `collections_group.go` becomes its count case
- [x] T005 [backend] `aggregateDerived` in `server/aggregate.go`: formula and rollup aggregates read the filtered rows in pages of 1,000 on `s.rdb`, drain each cursor before `computeDerived`, fold in Go, same limit (research R3)
- [x] T006 [backend] `checkChartView(view, schema)` in `server/aggregate.go` for every field of data-model.md (kinds incl. `hbar` and `number`, grouping types, period only with dates, aggregate and its property, `chartSort`, `hiddenGroups` ≤ 500, `showZero`, `chartStyle` values and text lengths; a grouped kind needs `groupBy`); `normalizeViewsOpenIn` in `server/viewopen.go` becomes `normalizeViews`, running both rules on `PUT /api/collections/{id}` (400 `invalid_chart`)
- [x] T007 [P] [test] `server/aggregate_test.go`: every grouping type × count; sum/avg/min/max with left-out counts and negatives; date periods with gaps and the 400 limit; multi-value counting; private rows not counted; a group's value equals the row count of the same filter through `query_rows` (SC-002); formula and rollup sums; no grouping → one value; a foreign or unreadable database refused
- [x] T008 [P] [test] Table test for `checkChartView` and `normalizeViews` in `server/aggregate_test.go`: each field valid and invalid, missing defaults, a grouped kind without `groupBy`, a number chart without one, over-long texts, 501 hidden groups
- [x] T009 [P] [ui] `web/src/types.ts`: `ViewDef` gains `'chart'` and the fields of data-model.md; `api.aggregate()` in `web/src/api.ts`; `invalid_chart` and `too_many_periods` in `web/src/serverErrors.ts`
- [x] T010 [P] [ui] New pure `web/src/chartLayout.ts`: sort (R15), hidden groups, empty options as zero from the schema, folding into "Other" (12 drawn, R4), the empty and all-hidden states, the summary sentence, and Chart.js data for each kind
- [x] T011 [P] [test] New `web/scripts/check-chartlayout.mjs` for T010 (every sort, hidden "No value", all hidden, folding with and without value sort, zeros for select and checkbox, dates untouched), added to `npm run check`
- [x] T012 [P] [ui] New pure `web/src/chartDefaults.ts`: `defaultChartView(kind, schema)` and the default grouping when a number chart turns into a grouped kind (FR-019, research R14)
- [x] T013 [P] [test] New `web/scripts/check-chartdefaults.mjs` for T012 (select first, status first, other groupable, none → number), added to `npm run check`

**Checkpoint**: the server counts and validates; the browser knows what to draw.

---

## Phase 3: User Story 1: a person sees a database as a chart (P1) 🎯 MVP

**Goal**: a chart view in a database page, numbers from the server, rows behind a bar.

**Independent Test**: a chart view grouped by a select; bars match the filtered counts; a click lists the rows.

- [x] T014 [US1] [backend] Route `POST /api/collections/{id}/aggregate` in `server/server.go` behind `auth`: `canRead`, then `credentialMayEnter`, then `aggregateRows`; `viewId` defaults and overrides (contracts/rest.md)
- [x] T015 [US1] [ui] New `web/src/chartTheme.ts`: Chart.js options from the tokens read off the chart's element (colours per palette, text, grid, font), rebuilt on a theme switch; `prefers-reduced-motion`
- [x] T016 [US1] [ui] New lazy `web/src/components/ChartView.tsx` + `ChartView.css`: Chart.js bar, horizontal bar, line, doughnut (controllers registered by hand) and the number chart in DOM; canvas `aria-hidden`; empty, all-hidden, error and time-limit states; redraws on the rows-changed signal; keeps the last chart while reloading
- [x] T017 [US1] [ui] `CollectionView.tsx`: `chart` in the **+** menu with its icon, `addView` through `defaultChartView`, the render branch for `ChartView` (lazy), a chart settings button in the toolbar (hidden for a workspace viewer, FR-027)
- [x] T018 [US1] [ui] New pure `web/src/chartGroups.ts` (group → filter, research R9) and the drill-down list under the chart through `ListView`, following the view's **Open pages in**
- [x] T019 [P] [US1] [test] Cases for `chartGroups.ts` in `web/scripts/check-chartlayout.mjs` (option, person, "No value", checkbox, date period, "Other")
- [x] T020 [P] [US1] [i18n] German (required) and Spanish: view name, kinds, "No value", "Other", empty and error sentences
- [x] T021 [US1] [test] Playwright `web/tests/chart-view.mjs` (in `web/tests/package.json`): add a chart, numbers match a filtered table, click a bar → its rows, embedded in a document

**Checkpoint**: US1 works in a database page and in a document.

---

## Phase 4: User Story 2: the chart says more than "how many" (P1)

**Goal**: sums, averages, dates by period, multi-value groups.

**Independent Test**: sum per category, average, count per week; compare with the rows.

- [x] T022 [US2] [ui] Chart settings, data section (first form of `ChartSettings.tsx`): grouping, period (dates), aggregate and its property (number, formula, rollup); the left-out sentence and the multi-value note under the chart; German and Spanish strings

---

## Phase 5: User Story 3: an agent reads and builds charts like a person does (P1)

**Goal**: agents aggregate in one call and create the same charts.

**Independent Test**: `query_rows group_by` equals the chart; `set_view type chart` and `embed_database view_id` show it in the interface.

- [x] T023 [US3] [mcp] `query_rows` in `server/mcp.go` / `server/mcp_db.go`: `group_by`, `period`, `aggregate`, `aggregate_property`, `view_id`; groups (or one value without a grouping) answered as JSON in `wrapUntrusted`; description as contracts/mcp.md
- [x] T024 [US3] [mcp] `set_view` in `server/mcp_schema.go`: type `chart`; `chart_kind`, `period`, `aggregate`, `aggregate_property`, `show_empty`, `chart_sort`, `hidden_groups`, `show_zero`, `chart_style`; `group_by` accepts the chart's types; runs `checkChartView`; `get_collection` description names the chart settings
- [x] T025 [US3] [mcp] `embed_database` in `server/mcp_pages.go`: optional `view_id`, written as the block's `local.viewId`; a view of another database refused (research R14)
- [x] T026 [US3] [test] MCP tests through `callTool`: aggregate equals REST; one value; read scope may aggregate and may not save a chart view; workspace closed to agents refused; `embed_database view_id` own view, foreign view refused, read-only token refused
- [x] T027 [US3] [mcp] `capabilities.json`: the route in `collections`; the note on pictures (research R17); `gapBudget` stays 10
- [x] T028 [P] [US3] [test] Parity acts `aggregate` and `chart view` in `server/parity_property_test.go`; `embed_database view_id` has no REST twin of its own (a person's embed is a document write, which the `edit` act covers), so its gates are tested in `server/mcp_chart_test.go`

---

## Phase 6: User Story 4: everyone can read the chart (P2)

**Goal**: keyboard, screen reader, table, phone.

**Independent Test**: axe in both themes, arrow keys through the groups, the table alternative.

- [x] T029 [US4] [ui] `ChartView.tsx`: `figure` with caption and summary; group buttons with roving focus through `nav.ts` (arrow keys, Enter opens rows, focus highlights the bar or slice); **Show as table**; phone width
- [x] T030 [P] [US4] [test] Catalogue chart section in `web/catalog/` with sample data, axe and keyboard in both themes (`web/tests/catalog.mjs`)

---

## Phase 7: User Story 5: a person builds a chart in a document (P1)

**Goal**: Notion's flow: `/` entry, database, settings, style, hover, picture.

**Independent Test**: each `/` entry; every setting survives a reload; hover and click; save the picture.

- [ ] T031 [US5] [ui] New primitive `web/src/ui/Popover.tsx` + `Popover.css` on Base UI's Popover (anchor, focus, Escape, outside click; layer above a peek); README entry in `web/src/ui/README.md`
- [ ] T032 [P] [US5] [test] Catalogue section for `Popover` (checked by `web/tests/catalog.mjs`)
- [ ] T033 [US5] [ui] `ChartSettings.tsx` becomes the one panel of research R13 in `ui/Popover`: kind buttons (five), Data (what to show, period, value, sort, groups list with hide/show and Hide all / Show all, show empty options), Style (palette, more style options: height, legend, value labels, centre total and its label, caption; a number chart's title), Show as table, Save chart as; immediate redraw, debounced text, refusal restores the stored view
- [ ] T034 [US5] [ui] Style in `chartTheme.ts` / `ChartView.tsx` (research R16): palettes (auto from option colours), heights, legend place, value-labels plugin, centre total as DOM, caption as `figcaption`, number title
- [ ] T035 [US5] [ui] Tooltip (research R17): Chart.js external tooltip as a token-styled DOM element with label, value and "Click to view data"; the same on group-button focus
- [ ] T036 [US5] [ui] Save chart as (research R17): new `web/src/savePicture.ts` (offscreen 2× drawing on the chosen background with caption and legend, `toBlob`, Copy as PNG through the clipboard, Download PNG through an object URL; refused clipboard → toast and download)
- [ ] T037 [US5] [ui] `blocks.tsx`: the database block takes `chartKind`; its picker reads "Choose a database to chart"; a pick adds `defaultChartView` through `PUT /api/collections/{id}`, writes `{collectionId, local: {viewId}}`, clears `chartKind`, opens the settings; a refusal keeps a plain embed with a toast (research R14)
- [ ] T038 [US5] [ui] `Editor.tsx`: five slash entries (Bar chart, Horizontal bar chart, Line chart, Donut chart, Number chart) with search words, inserting the block of T037
- [ ] T039 [P] [US5] [i18n] German (required) and Spanish for every builder string (plan, Translations row)
- [ ] T040 [US5] [test] Playwright `web/tests/chart-builder.mjs` (in `web/tests/package.json`): each slash entry and the picker; every setting survives a reload (SC-007); hover tooltip; Save chart as downloads a PNG; a workspace viewer sees no settings

---

## Phase 8: Polish and cross-cutting

- [x] T041 [perf] `BenchmarkStorageAggregate` in `server/storage_bench_test.go` (sum per select, count per month, formula sum; 1k and 10k, `BENCH_LARGE=1` for 100k); budgets from the CI run × 1.5 into `specs/002-storage-engine/research.md`; `EXPLAIN QUERY PLAN` in the pull request
- [x] T042 [perf] Bundle: main chunk growth measured against the plan's budgets; Chart.js only in the lazy chunk (`budgets.json` `bundleGzip` unchanged or lowered)
- [x] T043 [P] [wiki] `wiki/collections.md` § "What the chart adds" and the eight view types; `docs/what-it-does.md` "eight ways"; `check-wiki.mjs` learns `chart`
- [x] T044 [P] [wiki] `wiki/mcp-tools.md` §§ query_rows, set_view, get_collection, embed_database; `wiki/api.md` the aggregate route
- [ ] T045 [P] [wiki] The wiki page that lists `/` entries gains the five chart entries; `wiki/collections.md` describes the settings panel, palettes and Save chart as
- [ ] T046 [wiki] Screenshots `collection-chart` and `chart-settings` (light and dark) in `wiki/screenshots.json` and `web/scripts/shoot-wiki.mjs`; stale shots retaken
- [x] T047 [backend] Registry row *Aggregation* (tag `backend`, Since 2026-10-29) in `.specify/memory/surfaces.md` (plan, Registry)
- [ ] T048 [ui] Backlog issues for what the walk-through showed and this feature leaves out (spec FR-017): "Save for everyone"/"Reset" on view filters, the folding toolbar, Lock views, a second grouping with stacked bars and reference lines


---

## Phase 9: Each row and an honest settings row (FR-030, FR-031, part 3)

**Goal**: one bar per row with its number; a chart never silently stays a number chart.

**Independent Test**: a collection with only a name and a number: a new chart is bars, one per row; switching kinds works; with no number either, the chart says what to add.

- [x] T049 [backend] Each row in `server/aggregate.go` (research R18): `groupBy "__row"` keyed by row id and labelled by title in `aggregateSQL` and `aggregateDerived`; `checkAggSpec` / `checkChartView` accept it and refuse `count` with it; MCP descriptions of `query_rows` and `set_view` name it
- [x] T050 [P] [test] Go tests for Each row: values equal each row's number, private rows excluded, formula and rollup values, `count` refused, MCP `set_view` and `query_rows` with `group_by "__row"`
- [x] T051 [ui] `chartLayout.ts` cap of 50 for Each row (12 on a donut), default sort value high to low; `chartDefaults.ts` picks Each row and the first number when nothing groups; a row's bar opens the row; cases in `check-chartlayout.mjs` and `check-chartdefaults.mjs`
- [x] T052 [ui] Settings: "What to show" always shown, "Each row" first when a number exists; with Each row "Value" lists the number properties by name; every kind selectable; a grouped kind with nothing to group by shows the sentence of FR-031; German and Spanish
- [x] T053 [P] [test] Playwright: the owner's case, a collection with only a number, gives bars per row, kinds switch, a bar opens its row
- [x] T054 [P] [wiki] `wiki/views.md` § chart and `wiki/mcp-tools.md`: Each row, and the sentence when nothing groups

---

## Dependencies

- T001 → T016. T002 → T015, T034. T003 → T004 → T005, T006, T014, T023. T006 → T024, T037.
- T009 → T016, T017. T010 → T016. T012 → T017, T037. T031 → T033.
- US1 is the MVP. US2 and US4 need US1's view. US3 needs Phase 2's server half only.
- US5 needs US1 (the view), T031, T012. The wiki follows the code it describes.
- T049 → T050, T051 → T052 → T053. Phase 9 ships with part 3.
