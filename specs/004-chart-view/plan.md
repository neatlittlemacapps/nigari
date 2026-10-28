# Implementation Plan: Chart views of a database

**Branch**: `claude/vigilant-babbage-bvoiel` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md) | **Issue**: #20

**Input**: Feature specification from `/specs/004-chart-view/spec.md`

## Summary

A database gains an eighth view type, `chart` (bar, line, donut), over one grouping and one
aggregate (count, sum, average, minimum, maximum). The server computes the groups in one
SQL `GROUP BY` over exactly the WHERE the rows query uses (research R1), with a second,
measured path for formulas and rollups, whose values only exist in Go (R3). One function,
`aggregateRows`, serves REST (`POST /api/collections/{id}/aggregate`) and MCP (`query_rows`
with `group_by`, R6). Chart settings are validated by one rule on both view-saving doors
(R7). The browser draws with Chart.js 4.5.1 (owner's choice), lazily loaded, themed from
the design tokens, with a table alternative and focusable group buttons beside the canvas
(R8, R11); selecting a group lists its rows
through the ordinary rows query (R9).

## Technical Context

**Language/Version**: Go 1.27 (server, one package `server/`), TypeScript 5.6 + React 18 (`web/src/`)

**Primary Dependencies**: Go standard library + pure-Go SQLite (3.53.4, `%G`/`%V` in `strftime`); React, BlockNote. New dependency: Chart.js 4.5.1 (MIT, 60,694 B gzip for bar, line and doughnut), in a lazy chunk; reason in the PR

**Storage**: One SQLite file; aggregates on the read pool `s.rdb` under `withReadLimit`. Schema change: none (views are JSON in `collections.views`)

**Testing**: `go test ./...` (table tests, `callTool`, parity acts), `BenchmarkStorageAggregate`, `npm run check` (new `check-chartlayout.mjs`), Playwright `web/tests/chart-view.mjs`, catalogue + axe

**Target Platform**: One static binary (`CGO_ENABLED=0`); browser (desktop and phone widths), desktop shell, MCP clients

**Performance Goals**: counts within spec 002's grouped-count budgets (4 ms / 30 ms p95 at 1k / 10k rows); sum and date grouping budgets set from CI measurement (R10); formula aggregates measured and bounded by the 5-second limit; main chunk +≤ 3 KB gzip

**Constraints**: No external services; the one new browser dependency stays out of the main bundle. English source strings as keys. Agent parity. Design system: no new literals, chart colours as tokens with a 3:1 contrast check.

**Scale/Scope**: up to 100k rows per database; at most 12 groups drawn, 400 date periods

## Constitution Check

- I. One binary, no external services: ✅ no service, no schema change; Chart.js is bundled into the binary's frontend, no CDN
- II. Agent parity: ✅ `query_rows` aggregates and `set_view` chart settings in the same change
- III. Gates are one function: ✅ `aggregateRows` and `checkChartView` serve both doors; the read gates of `query_rows` / `…/rows` apply first
- IV. Derive from code: ✅ `check-chartlayout.mjs` for the geometry, token contrast in `build-tokens.mjs`, `check-wiki.mjs` learns the eighth view type
- V. English source: ✅ every label through `t()`, German in `de.json`; numbers and dates through `format.ts`
- VI. Every surface, every time: ✅ table below, plus a new registry row (Aggregation)
- VII. Measured, not assumed: ✅ new benchmark and budgets from CI; bundle measured

Re-checked after Phase 1 design: unchanged.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | New `server/aggregate.go`: `aggregateRows` (SQL path), `aggregateDerived` (formula and rollup path), `checkChartView`, `aggSpec`/`aggResult`. `rowsWhere` extracted from `collectionRowsQuery` so both read one WHERE (R1). Reading needs read access, as for rows; saving a chart view needs write access, as for any view. No `audit`/`fireWebhook`: a read changes nothing, and view saves have none today (#178) | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | No schema change. One `GROUP BY` on `s.rdb` under `withReadLimit`, through the existing `parent_id` index; `EXPLAIN QUERY PLAN` recorded in the PR. The derived path reads in pages of 1,000 and drains each cursor before `computeDerived` queries again (go-server rule) | backend |
| REST routes (`server/server.go`, middleware) | New `POST /api/collections/{id}/aggregate` behind `auth` (R6). `PUT /api/collections/{id}` runs `checkChartView` through the views normalisation (400 `invalid_chart`) | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | `query_rows`: `group_by`, `period`, `aggregate`, `aggregate_property`, `view_id`; groups answered as JSON, labels a person wrote inside `wrapUntrusted`. `set_view`: type `chart`, `chart_kind`, `period`, `aggregate`, `aggregate_property`, `show_empty`, `group_by` on charts. `get_collection` description names the chart settings. Read scope may aggregate (it is a read) and may not save a view (existing gate) | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: open to agents | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | `ChartView.tsx` (lazy): Chart.js bar, line, doughnut on a canvas marked `aria-hidden`; group buttons with roving focus beside it; table alternative; empty and error states. `ChartSettings.tsx`: kind, grouping, period, aggregate, property, show "No value", in the toolbar like the board's Group. Chart in the `+` menu with its icon. Drill-down list under the chart reuses `ListView` and follows **Open pages in**. Works embedded (own filters, #26) and in a peeked page. New modules for logic: `chartLayout.ts` (folding, order, gaps, Chart.js data), `chartTheme.ts` (options from tokens), `chartGroups.ts` (group → filter for R9) | ui |
| Translations (`t()`, `de.json` required, `es.json`) | View, kind, aggregate and period names; "No value", "Other", "Show as table", empty, too-many-periods and left-out sentences; plural forms through `plural()`. German required, Spanish reported | i18n |
| Server error codes (`web/src/serverErrors.ts`) | `invalid_chart` (bad settings or a request that cannot group/aggregate) and `too_many_periods`; the existing `query_timeout` covers the 5-second limit | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots) | `wiki/collections.md` new § "What the chart adds" and the view list; `wiki/mcp-tools.md` §§ query_rows, set_view, get_collection; `wiki/api.md` the new route; `docs/what-it-does.md` "eight ways". New screenshot `collection-chart` (light and dark) in `wiki/screenshots.json` and `shoot-wiki.mjs`; shots made stale are retaken. `check-wiki.mjs` learns `chart` as a view type | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | `server/aggregate_test.go`: every grouping type × count; sum/avg/min/max with left-out counts and negatives; date periods with gap filling and the 400 limit; multi-value counting; private rows not counted; filters equal to `query_rows` (SC-002, one test comparing group values with filtered row counts); formula and rollup sums; refusals (bad grouping type, non-number aggregate property, foreign or unreadable database, workspace closed to agents, read-only token saving a chart view). `checkChartView` table test. Parity acts `aggregate` and `chart view`. `check-chartlayout.mjs`. Playwright `chart-view.mjs`: add a chart, numbers match, switch kinds, select a bar → its rows, table alternative, keyboard, embedded. Catalogue: chart section with axe and keyboard | test |
| Performance (query plans, payload size, per-request work) | One query per chart; payload is the groups only (≤ 400 + "No value"). `BenchmarkStorageAggregate` at 1k/10k (100k with `BENCH_LARGE=1`). Charts do not poll; they redraw on the existing rows-changed signal | perf |
| Manifest (`capabilities.json`, `gapBudget`, `parity_property_test.go`) | `collections` capability lists `POST /api/collections/{id}/aggregate`; `query_rows` and `set_view` already listed. No new gap; `gapBudget` stays 10. Two parity acts | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets) | Chart colours `color.chart.1` … `.12` as semantic tokens with light and dark values and a 3:1 `md.salt.contrast` on `color.surface.default`; axis and grid from existing border and text tokens; type from the font scale. Controls are `ui/Select`, `ui/Switch`, `ui/Button`. No new literals; raw-button and hand-dialog counts unchanged. Chart.js options come only from tokens read at draw time (`chartTheme.ts`), so no colour literal enters the code. `ChartView` is a feature component, not a `ui/` primitive; the catalogue shows it with sample data | ui |
| Storage budgets (`bench_world_test.go`, p95 in spec 002 research) | New rows in spec 002's budget table: aggregate sum, count per month, formula sum, at 1k and 10k rows, from the CI run of this PR (× 1.5). Counts keep their existing budgets | perf |
| Page containers (full page, side peek, centre peek) | A chart view is a view, drawn by `CollectionView` inside whichever container shows its database (a page, or a document peeked with an embedded chart); its drill-down rows follow the view's **Open pages in**. No page-level control is added | ui |
| Aggregation (new registry row) | Added by this plan: a later property type states how it groups and aggregates in `server/aggregate.go`, or that it does not, so charts and agents' counts cover it | backend |

**Parity statement**: Agents can do this over MCP via `query_rows` (`group_by`, `aggregate`)
and `set_view` (type `chart`), with the same checks as `POST /api/collections/{id}/aggregate`
and `PUT /api/collections/{id}`. Every door calls `aggregateRows` and `checkChartView`.

**Manifest**: one new route in `collections`; no new tool; no new gap; `gapBudget` stays 10.

**Registry**: new row *Aggregation* (tag `backend`, Since 2026-10-29, introduced by spec 004):
"A new property type says how it groups and how it aggregates in `server/aggregate.go`
(or why it does neither), with a case in `aggregate_test.go`." Since is the day after this
plan, as spec 007 did, so plans already written are not asked about it; this plan answers
it (row above).

## Project Structure

### Documentation (this feature)

```text
specs/004-chart-view/
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
├── aggregate.go         # new: aggSpec, aggResult, aggregateRows, aggregateDerived, checkChartView, labels
├── aggregate_test.go    # new
├── collections.go       # rowsWhere extracted; collectionRowsQuery uses it
├── collections_group.go # groupCounts becomes a call of aggregateRows
├── viewopen.go          # normalizeViewsOpenIn → normalizeViews (open mode + chart)
├── server.go            # route
├── mcp.go               # query_rows and set_view arguments and descriptions
├── mcp_db.go            # query_rows: the aggregate branch
├── mcp_schema.go        # validViewTypes += chart; viewSpec chart fields; applyViewSpec
├── storage_bench_test.go # BenchmarkStorageAggregate
└── parity_property_test.go
web/tokens/semantic.tokens.json  # color.chart.1–12
web/src/
├── chartLayout.ts       # new, pure: folding, scale, ticks, bars, line, arcs
├── chartGroups.ts       # new, pure: group → filter (drill-down)
├── api.ts               # aggregate()
├── types.ts             # ViewDef: 'chart' and its fields
├── serverErrors.ts      # invalid_chart, too_many_periods
├── chartTheme.ts        # new: Chart.js options from tokens
├── components/ChartView.tsx, ChartView.css     # new, lazy (Chart.js)
├── components/ChartSettings.tsx                # new
├── components/CollectionView.tsx               # chart type, menu, toolbar, render
└── locales/de.json, es.json
web/catalog/             # chart section
web/package.json, package-lock.json  # chart.js 4.5.1 via npm install
THIRD-PARTY-NOTICES.md               # via scripts/licenses.mjs
web/scripts/check-chartlayout.mjs, check-wiki.mjs
web/tests/chart-view.mjs
wiki/collections.md, wiki/mcp-tools.md, wiki/api.md, wiki/screenshots.json, docs/what-it-does.md
specs/002-storage-engine/research.md   # new budget rows
.specify/memory/surfaces.md            # Aggregation
docs/decisions.md
```

**Structure Decision**: one server file for the feature's rule (grouping and aggregating),
three pure browser modules with checks for the decisions, and one lazy component that
hands their output to Chart.js. `CollectionView.tsx` only gains the branch that renders it and the menu entry.

## Complexity Tracking

| Exception | Why | Simpler option rejected because |
|---|---|---|
| A new runtime dependency (Chart.js) | Owner's choice (2026-10-28): a mature library with room for more chart types | Hand-drawn SVG was offered and recommended; the owner preferred the library. Kept out of the main bundle; accessibility added in DOM beside the canvas (R8) |
| A second aggregation path for formulas and rollups (`aggregateDerived`) | Their values exist only in Go (`computeDerived`); FR-002 asks for them | Storing them is a cache invalidated by every write of every input across relations; dropping them breaks FR-002 |
