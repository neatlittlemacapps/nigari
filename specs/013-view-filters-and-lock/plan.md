# Implementation Plan: A view's filters can be changed for oneself, offered as quick filters, sub-grouped, locked, and logged

**Branch**: the build stream's branch (named in its first prompt) | **Date**: 2026-11-03 | **Spec**: [spec.md](spec.md) | **Issue**: epic #426 (#279, #281, #19, #178)

**Input**: Feature specification from `/specs/013-view-filters-and-lock/spec.md`

## Summary

Five changes to what a database's views store, in three pull requests (R12).

- **PR 1: the lock and the log.**
  - A database's views can be locked (#281). The lock is stored on the database, not in the views list, so saving views cannot unlock them.
  - One function refuses a view change while locked, called by REST `PUT /api/collections/{id}` and by MCP `set_view` and `delete_view` (R3).
  - The same save paths write one activity entry per meaningful view change (#178, R6).
- **PR 2: personal changes.**
  - A person's own filter and sort are kept per person, per view (or per embed) in a new table (#279, R1, R2), through session-only routes.
  - The bar offers **Reset** and **Save for everyone** (R4).
  - The browser sends the filters the person sees to the rows query, and the server's new-row pins read the person's filters too (R5).
- **PR 3: quick filters and swimlanes** (#19). Two optional keys on a view, `quickFilters` and `subGroupBy`, checked on both doors (R7, R8). Picks on quick filters are personal state (R7). Boards draw lanes, and a drag sets both values (R9).

## Technical Context

**Language/Version**: Go 1.27 (`server/`); TypeScript 5.6 + React 18 (`web/src/`)

**Primary Dependencies**: none new. `ui/Menu` and spec 012's Settings menu, header menu and drop marker.

**Storage**:
- one upgrade step (2) adds a table `view_prefs` and two columns on `collections` (`views_locked_by`, `views_locked_at`) (R1, R3);
- two optional view keys, `quickFilters` and `subGroupBy`, which need no step (R7, R8).

**Testing**:
- Go:
  - the lock at every door (REST PUT, MCP create/update/delete view), each with its refusal, and a reader refused the lock route;
  - personal state routes: owner only, a reader allowed, a token refused (session only), cleanup on view and database delete;
  - new-row pins with personal filters;
  - audit entries per change kind, with layout-only saves making none;
  - `quickFilters`/`subGroupBy` rules on both doors;
  - the upgrade step with its fixture `server/testdata/upgrade/step-1.db`;
  - parity pairs for the new view keys.
- Playwright: `view-lock.mjs`, `personal-view.mjs` (two accounts, two browser contexts as two devices), `quick-filters.mjs`, `board-lanes.mjs`, `activity-views.mjs`.
- Pure checks: `check-viewstate.mjs` (merging shared and personal filters, R5) and `check-boardlanes.mjs` (cells, lane values, R9).

**Target Platform**: browser at desktop and phone widths; the desktop shell

**Performance Goals**: one indexed lookup of `view_prefs` per database open (primary key `user_id, collection_id, scope`). Lanes are drawn from the rows already loaded. New-row pins read one extra row by primary key. No new scan.

**Constraints**:
- English source; design system (tokens, `ui/` components, budgets only go down); menu icons (one per function).
- Upgrade steps are append-only (spec 008).
- Agent gaps (no lock/unlock, no personal state) named in `capabilities.json` with `gapBudget` raised by 2.

**Scale/Scope**: 4 issues, 3 PRs, 1 table, 2 columns, 2 view keys, 5 routes, 2 MCP arguments, 2 deliberate gaps, about 25 strings.

## CodeGraph

Index checked with `codegraph status` before planning (synced: 392 files, 7,181 nodes, 23,228 edges).

- **Who changes views** (`codegraph explore "handlePutCollection mcpUpdateView mcpCreateView mcpDeleteView saveCollection audit"`):
  - REST `handlePutCollection` (`server/collections.go:51`) writes the views half with its own SQL.
  - MCP `mcpCreateView`, `mcpUpdateView` and `mcpDeleteView` (`server/mcp_schema.go:677`, `:712`, `:738`) load, change and call `saveCollection` (`:163`, 6 callers including `mcpUpdateSchema` and `server/ingest.go`).
  - So the lock check cannot live in `saveCollection` alone: REST bypasses it. It is one function both call (R3).
- **Audit** (`codegraph callers audit`): 32 callers, none of them on a view path. `audit(actorType, actorID, actorName, action, pageID, workspaceID, detail)` in `server/audit.go:19`; `auditChanges` keeps a before and after.
- **Per-person settings**: `server/prefs.go` (`userPrefs`, `PUT /api/me/prefs` behind `sessionOnly`) keeps settings on the account, with the browser as a first-paint cache. It is the pattern for `view_prefs`, but a separate table, because views are many per person (R1).
- **Rows and filters**:
  - The browser sends the view's armed filters as `filter` params to `GET /api/collections/{id}/rows` (`handleCollectionRows`, `collections.go:631`; `api.collectionRows`, `web/src/api.ts:430`). The server evaluates them with `rowFilter`.
  - `applyView` (`CollectionView.tsx:224`) applies them again in the browser for the loaded rows.
  - Personal filters therefore travel the same way, and nothing on the server reads them for display (R5).
- **New rows**: `rowPinsForView` (`server/viewpins.go:188`) → `propsInView` (`:278`), called by `handleCreatePage`, `handleRowFromTemplate` and `mcpCall` (create_page, create_rows). It reads the stored view's filters only, so it must also read the person's own (R5).
- **Embeds**: `EmbedState` (`CollectionView.tsx:80`) keeps per-embed `filters` and `sort` in the document's block (#26). `updateView` (`:663`) routes filter and sort patches to `embed.onView`. Personal changes in an embed sit in front of that (R2).
- **Board** (from spec 012's graph): `BoardView` (`CollectionView.tsx:1986`) is the one caller of `useBoardDrag`, which reports `onDrop(rowId, groupBy, toCol)`. `setGroupValue` (`:653`) writes one property. Lanes need a second value per drop (R9).
- **Upgrade steps**: `upgradeSteps()` (`server/upgrade_steps.go:24`) holds step 1 only, so this adds step 2.
- **Activity log interface**: `ActivityModal` (`UserMenu.tsx:362`), opened per page by `showActivityFor` (`ActivityLogHost.tsx:12`). New action names need labels there.
- **Not from the graph**:
  - `capabilities.json` `gapBudget` is 10.
  - `not_available_via_mcp` (`server/mcp_workspace.go:50`) holds five entries.
  - The read-only POST list from #474 (`readOnlyPOSTRoutes`) is not needed here: the new routes are session-only.

## Constitution Check

- I. One binary, no external services: ✅ one table and two columns in the same SQLite file.
- II. Agent parity: ⚠️ two deliberate gaps, owner's decision (2026-11-03): agents cannot lock or unlock views, and agents have no personal view state. Both are named in `not_available_via_mcp` and `capabilities.json`, with `gapBudget` 10 → 12 in PR 1 and PR 2. Everything else is open to agents: the lock is readable (`get_collection`) and refuses them; quick filters and sub-groups are set by `set_view`; the log records agents as agents.
- III. Gates are one function:
  - ✅ `checkViewsUnlocked` for the lock;
  - ✅ `auditViewChanges` for the log;
  - ✅ the per-view checks for `quickFilters` and `subGroupBy`, called from `normalizeViews` and `applyViewSpec` as `checkViewColOrder` is (spec 012).
- IV. Derive from code: ✅ pure checks for the merge and the lanes; a test that every view-writing path refuses while locked (it lists the paths by calling them).
- V. English source: ✅ all strings through `t()` with de/es/nl.
- VI. Every surface: ✅ table below. A new registry row is added: **View lock** (R11).
- VII. Measured: ✅ the `view_prefs` lookup and the pins lookup are measured in `bench_world_test.go` against the read budget.

Re-checked after Phase 1 design: unchanged.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | **Lock** (PR 1): `checkViewsUnlocked(colID, before, after)` refuses any change to the views JSON while locked (R3), called in `handlePutCollection` and the three MCP view tools. Lock and unlock need `canWriteReq` and a browser session. **Audit** (PR 1): `auditViewChanges(actor, colID, before, after)` diffs by view id (R6); lock and unlock are audited. **Personal state** (PR 2): routes need `canReadReq` (readers may narrow a view for themselves) and a session; `rowPinsForView` takes the person's filters (R5). **View keys** (PR 3): `checkViewQuickFilters`, `checkViewSubGroup` in `server/viewopen.go`. No webhook: no page content changes | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | `view_prefs(user_id, collection_id, scope, state, updated_at)`, primary key `(user_id, collection_id, scope)`, plus an index on `collection_id` for cleanup. `collections.views_locked_by`, `views_locked_at`. Created by upgrade step 2, not by `ensureColumn` in `db.go` (R1) | backend |
| REST routes (`server/server.go`, middleware) | `PUT /api/collections/{id}/lock` and `DELETE /api/collections/{id}/lock` (`auth` + `sessionOnly`, PR 1). `GET /api/collections/{id}/personal`, `PUT` and `DELETE /api/collections/{id}/personal/{scope}` (`auth` + `sessionOnly`, PR 2). `GET /api/collections/{id}` gains `viewsLocked: {by, byName, at}` or `null`. New error code `views_locked` (409) | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | `set_view` and `delete_view` refuse while locked, through `checkViewsUnlocked`, and their descriptions say so. `get_collection` returns `views_locked`. `set_view` gains `quick_filters` (array of property ids, `[]` clears) and `sub_group_by` (property id, `""` clears) (PR 3). No lock or personal tool | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | Two entries: "locking and unlocking a database's views (an agent sees the lock and is refused by it)" (PR 1), and "personal view changes (an agent's view change is always for everyone)" (PR 2). `wiki/agent-access.md` lists both | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | **PR 1**: Lock views / Unlock views in spec 012's Settings menu (Database settings); a lock marker beside the view tabs; locked controls not offered (Settings items, header menu Move/Hide, column drag and resize, view tab menu, add view); a `views_locked` refusal shown as a toast. **PR 2**: the personal-change bar above the view (Reset, Save for everyone), on database pages and in embeds; filter and sort edits become personal. **PR 3**: quick filter chips above the view (a `ui/` chip with a value menu), "Quick filters" in Settings; board lanes with fold buttons and a "No value" lane; sub-group in Settings for boards. Keyboard: the bar's buttons, chips and lane folds are buttons in tab order; Escape closes a chip's menu | ui |
| Translations (`t()`, `de.json`/`es.json`/`nl.json`) | About 25 strings (contracts/ui.md), de/es/nl, informal | i18n |
| Server error codes (`web/src/serverErrors.ts`) | `views_locked`; `invalid_view_quick_filters`; `invalid_view_sub_group` | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots, `docs/what-it-does.md`) | `wiki/views.md`: personal changes, the bar, quick filters, lanes, the lock. `wiki/collections.md`: Lock views. `wiki/mcp-tools.md`: `set_view` refusals and new arguments, `get_collection`'s `views_locked`. `wiki/agent-access.md`: two closed items. `wiki/activity-log.md` (or the page that describes the log): view entries. `docs/what-it-does.md`: a line each. Stale shots retaken | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | See Technical Context. Each new test is mutation-checked. A test that walks every MCP tool and REST route which writes views, with the lock on, expects `views_locked` from each (SC-003) | test |
| Performance (query plans, payload size, per-request work) | `view_prefs` read by primary key, once per database open, and once per new row in a view. Lock read with the collection, in the same row. Audit diff in Go over the two views lists already in memory. Lanes from loaded rows | perf |
| Manifest (`capabilities.json`, `gapBudget`, `parity_property_test.go`) | New routes named: lock (session only, closed to agents) and personal (session only, closed to agents). Two gaps with notes; `gapBudget` 10 → 11 in PR 1 and 11 → 12 in PR 2. Parity pairs: "change a view while locked" (REST PUT vs MCP `set_view`, both refused); "set quick filters" and "set a sub-group" (REST PUT vs `set_view`) | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets) | A chip component for quick filters, if `ui/` has none (catalogue section, README entry, light and dark). The bar uses `ui/` buttons and tokens. Lanes use existing board tokens. Budgets only go down | ui |
| Storage budgets (`bench_world_test.go`, p95 in spec 002 research) | Two benchmarks: `view_prefs` lookup and `rowPinsForView` with personal filters, on the seeded workspace, within the read budget | perf |
| Page containers (full page, side peek, centre peek) | A database shown in a peek is a full collection view: lock marker, bar, chips and lanes work there. The bar sits inside the view, so no container changes | ui |
| Aggregation (`server/aggregate.go`) | No change: no property type. A chart view's own filters can be personal like any view's; the browser sends them to `aggregate` as it sends an embed's today | backend |
| Stored data (`server/upgrade_steps.go`) | Step 2: `CREATE TABLE view_prefs …`, `ALTER TABLE collections ADD COLUMN views_locked_by TEXT NOT NULL DEFAULT ''`, `views_locked_at TEXT NOT NULL DEFAULT ''`. Fixture `server/testdata/upgrade/step-1.db` written before it. Step 1 untouched. `quickFilters` and `subGroupBy` are optional view keys, so no step (as `colOrder`, spec 012 R3) | backend |
| Outside names (env vars, cookies, storage keys, …) | No change to an outside name. The browser keeps no new storage key: personal state lives on the account (owner's choice); the first paint waits for one request (R2) | backend |
| Menu icons (`ui/Menu`, `menuIcons.ts`, `check-menu-icons.mjs`) | New functions: `lockViews` (`Lock`), `unlockViews` (`LockOpen`), `quickFilters` (`Zap`), `subGroup` (`Rows2`), `foldLane` (`ChevronsDownUp`), `resetView` (`RotateCcw`), `saveViewForEveryone` (`Users`). Each with an icon no function has; the build's `check-menu-icons.mjs` decides | ui |

**Parity statement**: everything a person does to a view's shared state, an agent can do with the same checks, except locking and unlocking. Personal state is a person's screen and has no agent counterpart. Both gaps are the owner's decision and are named in the manifest.

**Manifest**: new routes named; two gaps; `gapBudget` 10 → 12 over PR 1 and PR 2; three new parity pairs.

**Registry**: a new row, **View lock** (R11): any new path that writes a database's views calls `checkViewsUnlocked` and `auditViewChanges`, and a test with the lock on proves it is refused.

## Project Structure

### Documentation (this feature)

```text
specs/013-view-filters-and-lock/
├── spec.md
├── plan.md
├── research.md          # R1–R12
├── data-model.md        # view_prefs, the lock, quickFilters, subGroupBy, audit actions
├── quickstart.md
├── contracts/rest.md    # lock and personal routes, views_locked
├── contracts/mcp.md     # set_view, delete_view, get_collection
├── contracts/ui.md      # bar, chips, lanes, lock marker, strings
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
server/upgrade_steps.go, server/testdata/upgrade/step-1.db   # PR 1: step 2
server/viewlock.go (new)            # PR 1: checkViewsUnlocked, lock routes
server/viewaudit.go (new)           # PR 1: auditViewChanges
server/collections.go               # PR 1: lock check + audit in handlePutCollection; viewsLocked in GET
server/mcp_schema.go, server/mcp.go # PR 1: lock + audit in view tools; PR 3: quick_filters, sub_group_by
server/mcp_workspace.go             # PR 1, PR 2: closed list
server/viewprefs.go (new)           # PR 2: personal state routes, cleanup
server/viewpins.go                  # PR 2: rowPinsForView with the person's filters
server/viewopen.go                  # PR 3: checkViewQuickFilters, checkViewSubGroup
server/server.go                    # PR 1, PR 2: routes
server/*_test.go, server/parity_property_test.go, server/bench_world_test.go
capabilities.json                   # PR 1, PR 2
web/src/types.ts                    # ViewDef.quickFilters, subGroupBy; CollectionConfig.viewsLocked
web/src/api.ts                      # lock, personal routes
web/src/viewState.ts (new)          # PR 2: merge shared + personal (pure), check-viewstate.mjs
web/src/boardLanes.ts (new)         # PR 3: cells and lane values (pure), check-boardlanes.mjs
web/src/components/CollectionView.tsx  # all PRs
web/src/components/ViewChangeBar.tsx (new)   # PR 2
web/src/components/QuickFilters.tsx (new)    # PR 3
web/src/components/UserMenu.tsx     # PR 1: ActivityModal labels for view actions
web/src/ui/Chip.tsx (if none)       # PR 3
web/src/menuIcons.ts, web/src/serverErrors.ts, web/src/locales/*.json
web/tests/*.mjs (five new), web/scripts/check-viewstate.mjs, check-boardlanes.mjs
wiki/views.md, collections.md, mcp-tools.md, agent-access.md, the activity log page, docs/what-it-does.md
.specify/memory/surfaces.md         # PR 1: View lock row
```

**Structure Decision**: new server files per concern (`viewlock.go`, `viewaudit.go`, `viewprefs.go`), because `collections.go` and `mcp_schema.go` are already long and both doors call these functions. Two small pure modules on the web side, for the parts a check can test without a browser.

**Order of work** (R12): PR 1 (lock + log) first, because PR 2's Save for everyone and PR 3's settings must respect the lock. Then PR 2, then PR 3. Spec 012 PR 2 (the Settings menu) must be merged before PR 1's interface part, which adds items to it.

**Streams**: built by the helper stream after it finishes spec 012, or by the conductor if the owner prefers. Files shared with spec 012: `CollectionView.tsx`, `menuIcons.ts`, locales, `server/viewopen.go`, `server/mcp_schema.go`. So this spec does not start building until spec 012 PR 2 is merged.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Two parity gaps (constitution II) | Owner's decision: the lock exists partly to stop agents changing views; personal state is a person's screen | Agents locking: defeats the lock. Agent personal state: no screen to keep it for |
