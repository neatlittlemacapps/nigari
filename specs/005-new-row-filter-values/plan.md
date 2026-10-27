# Implementation Plan: A new row takes the values its view's filters pin down

**Branch**: `claude/vigilant-babbage-bvoiel` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md) | **Issue**: #139

**Input**: Feature specification from `/specs/005-new-row-filter-values/spec.md`

## Summary

When a row is created "from" a view, the server reads that view's stored filters and
works out the values they pin to a single answer (research R1). It stores them under any
explicit values, then checks the new row against the same filters with the SQL the rows
query already uses (R3). It answers whether the row matches. One function,
`rowPinsForView`, serves REST (`POST /api/pages` and the row-from-template route, new
field `viewId`) and MCP (`create_page`, `create_rows`, new argument `view_id`). The
interface passes the active view's id and shows a toast with an **Open** action when the
answer is "doesn't match" (R4).

## Technical Context

**Language/Version**: Go 1.27 (server, one package `server/`), TypeScript 5.6 + React 18 (`web/src/`)

**Primary Dependencies**: Go standard library + pure-Go SQLite; React, Mantine, BlockNote in the frontend. New dependencies: none

**Storage**: One SQLite file; writer `s.db`, read pool `s.rdb`. Schema change: none (views and filters are already stored in `collections.views`)

**Testing**: `go test ./...` (`testServer`, `signedIn`, `callTool`), `npm run check`, Playwright in `web/tests/`

**Target Platform**: One static binary (`CGO_ENABLED=0`); browser, desktop shell, MCP clients

**Performance Goals**: creating a row with a view costs one `loadCollection` (by primary key) and one `SELECT 1 … WHERE id = ?` check, with no per-row work for `create_rows` beyond that check (SC-004)

**Constraints**: No external services. English source strings as keys. Agent parity: the act is open to agents.

**Scale/Scope**: views hold at most a few dozen filters; `create_rows` takes up to 200 rows

## Constitution Check

- I. One binary, no external services: ✅ no dependency, no schema change
- II. Agent parity: ✅ `view_id` on `create_page` and `create_rows` in the same change
- III. Gates are one function: ✅ `rowPinsForView` shared by every door; the existing write gates still apply first
- IV. Derive from code: ✅ pin rules are a pure Go function with a table test; `check-wiki.mjs` covers the tool text
- V. English source: ✅ two new strings, both through `t()`, German in `de.json`
- VI. Every surface, every time: ✅ table below
- VII. Measured, not assumed: ✅ added work is two primary-key reads per call; `BenchmarkCreateRowWithView` measures it against the plain create

Re-checked after Phase 1 design: unchanged.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | New `server/viewpins.go`: `pinsFromFilters(schema, filters, now)` (pure) and `(s) rowPinsForView(colID, viewID)` (loads the view, refuses a view of another database) plus `(s) rowMatchesView(rowID, colID, viewID)`. Gates unchanged and run first: the caller must be able to write the database, and the view id grants nothing. Pinned values go through `normalizePropValues` like any write. `audit` and `fireWebhook` are the existing create paths' | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | No schema change. The match check is `SELECT 1 FROM pages WHERE id = ? AND <filters' where()>`, by primary key, on the writer right after the insert (the read pool might not see it yet) | backend |
| REST routes (`server/server.go`, middleware) | No new route. `POST /api/pages` and `POST /api/collections/{id}/from-template` take an optional `viewId`; the response gains `matchesView` when one was given | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | `create_page` (with a database as parent, with or without `template_id`) and `create_rows` take `view_id`; answers add `matches_view` and, when false, one sentence saying the row will not show in that view. No page text returned, so no `wrapUntrusted`. Read scope: both tools already write | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: open to agents | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | `CollectionView.addRow` and `addRowFromTemplate` pass the active view's id (not for a form view). On `matchesView === false` a toast with **Open**. `toast.ts` gains an optional action, keyboard-reachable, light and dark | ui |
| Translations (`t()`, `de.json` required, `es.json`) | "The new row doesn't match this view's filters, so it isn't shown here." and "Open" (exists). German in `de.json`, Spanish reported | i18n |
| Server error codes (`web/src/serverErrors.ts`) | New code `view_not_in_database` (400) with an entry in `serverErrors.ts` | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots) | `wiki/collections.md` § Rows are pages; `wiki/mcp-tools.md` §§ create_page, create_rows; `wiki/api.md` the `viewId` field. `docs/what-it-does.md` one line. Screenshots: none show a new row; `check-wiki.mjs` lists any that `toast.ts` makes stale | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | `server/viewpins_test.go`: table test for `pinsFromFilters` (every edge case in the spec); REST and MCP create with a view; explicit beats pin; pin beats template; refusal for a view of another database (nothing created); read-only token refused (existing gate); SC-003 parity test doing both doors on one view. `parity_property_test.go`: act `create row in view`. Playwright `web/tests/new-row-filters.mjs`: US1 scenario 1, US2 scenario 1 | test |
| Performance (query plans, payload size, per-request work) | Two primary-key reads per call (`EXPLAIN QUERY PLAN`: `SEARCH pages USING INTEGER PRIMARY KEY` / `collections` by `page_id`); `create_rows` loads the view once for all rows | perf |
| Manifest (`capabilities.json`, `gapBudget`, `parity_property_test.go`) | No new route or tool; `create_page`/`create_rows` already listed. No new gap; `gapBudget` stays 10. One parity act added | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets) | No new component. The toast action is a `ui/Button` (no new raw `<button>`, so the `rawButtons` budget holds); toasts themselves join `web/src/ui/` in spec 001 batch 2. No new literals | ui |
| Storage budgets (`bench_world_test.go`, p95 in spec 002 research) | Not a hot path (row creation). `BenchmarkCreateRowWithView` on the seeded workspace recorded beside the plain create; no budget entry | perf |

**Parity statement**: Agents can do this over MCP via `create_page` / `create_rows` with
`view_id`, with the same checks as `POST /api/pages` with `viewId`. Every door calls
`rowPinsForView` and `rowMatchesView`.

**Manifest**: unchanged routes and tools; no new gap; `gapBudget` stays 10.

## Project Structure

### Documentation (this feature)

```text
specs/005-new-row-filter-values/
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
├── viewpins.go          # new: pinsFromFilters, rowPinsForView, rowMatchesView
├── viewpins_test.go     # new
├── pages.go             # handleCreatePage: viewId
├── db_templates.go      # rowFromTemplate / handler: viewId
├── mcp.go               # create_page, create_rows: view_id (schema, dispatch)
├── mcp_schema.go        # mcpCreateRows: pins per row, one view load
└── parity_property_test.go
web/src/
├── api.ts               # createPage / rowFromTemplate: viewId, matchesView
├── toast.ts             # optional action
├── serverErrors.ts      # view_not_in_database
├── components/CollectionView.tsx  # pass the active view; the notice
└── locales/de.json, es.json
web/tests/new-row-filters.mjs
wiki/collections.md, wiki/mcp-tools.md, wiki/api.md, docs/what-it-does.md
```

**Structure Decision**: one new server file for the rule (the rule is the feature) and
small changes at each door. No new frontend module: the client only passes an id and
reads a flag, so it holds no rule of its own (FR-009).

## Complexity Tracking

None. No principle is bent.
