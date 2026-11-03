# Implementation Plan: A database in a document has views of its own

**Branch**: `claude/handoff-14` (plan); the build branch is named when it starts | **Date**: 2026-11-03 | **Spec**: [spec.md](spec.md) | **Issue**: epic #426 (#371, and #524's confirmation)

**Input**: Feature specification from `/specs/014-embed-own-views/spec.md`

## Summary

An embedded database keeps a list of views of its own, inside its block in
the document, so changing them never touches the database's views
(owner's model, 2026-11-03).

- **Where they live**: the `database` block's `local` prop, in a new shape
  `{v: 2, viewId, views: [...]}`, each view with the keys and rules of a
  database view (R1).
- **Old embeds**: read as a copy of every database view they could switch
  to, with their own filters on top and the same view open; written in the
  new shape on the first change. No upgrade step, because the server cannot
  rewrite the editor's live document safely (R2).
- **Interface**: one view source in `CollectionView`, the database's or the
  embed's (R3); **New view** lists "Views on {database}" to copy (R8);
  spec 012's Settings act on the embed's views (R9); a chart from the /
  menu is the embed's own (R12).
- **Server and agents**: new rows in an embed view pin from its filters
  (R5); charts send their settings explicitly (R6); `get_collection`,
  `set_view`, `delete_view` take `embed_id`, `get_page` lists embeds,
  `create_page`/`create_rows` take `embed` (R7).
- **Confirmations**: deleting a property asks everywhere (#524, its own PR
  first); saving properties from a document asks, naming the database (R11).

Three pull requests (R13): #524; model, server and agents; interface.

## Technical Context

**Language/Version**: Go 1.27 (`server/`); TypeScript 5.6 + React 18 (`web/src/`)

**Primary Dependencies**: none new. BlockNote 0.51.4 (the block), `ui/Menu`
(spec 010), spec 012's `ViewSettingsMenu`, `dialog.tsx` (`confirm`).

**Storage**: no table, column or index. A new JSON shape inside
`pages.content` (and the document's Yjs state), read in both shapes (R2,
data-model.md).

**Testing**:
- Go:
  - the converter and tolerant reader against `server/testdata/embedviews/*.json`;
  - `set_view`/`delete_view`/`get_collection` with `embed_id`: create, copy,
    update, delete, last view refused, form refused, unknown embed refused,
    the database's views byte-for-byte unchanged (SC-001);
  - gates: read scope refused; document writable but database unreadable
    refused; document read-only refused; a workspace closed to agents;
    other workspace (`credential_audit_test.go` gets the shapes);
  - `embed_database` writes the new shape, with and without `view_id`;
  - new rows: `viewFilters` on `POST /api/pages` and from-template; `embed`
    on `create_page`/`create_rows`; both refused when both or neither match;
  - `get_page` lists embeds inside the untrusted wrapper;
  - parity pairs (SC-005): REST has no embed view route, so the pair is the
    document's content written by `PATCH /api/pages/{id}` against `set_view`
    with `embed_id`, both read back through `get_collection`.
- Pure check: `web/scripts/check-embedviews.mjs` runs the same fixture files
  through `web/src/embedViews.ts` (R10).
- Playwright: `web/tests/embed-views.mjs` (US1, US2, US3, US5: an old-shape
  block written by the fixture), `web/tests/property-confirm.mjs` (US4,
  #524), `chart-insert` spec updated (R12).

**Target Platform**: browser at desktop and phone widths; the desktop shell

**Performance Goals**: no new query on a hot path. Reading an embed costs
what it does today (one `getCollection`, which already returns the database
views the converter needs). The agent's `embedViewOf` reads one page's
content by primary key. The converter is linear in the number of views.

**Constraints**:
- English source; design system (`ui/` and tokens; budgets only go down);
  menu icons (no new function: the copies are values of "add a view").
- Expand only: both shapes stay readable for good (R2).
- Spec 013 first: PR 2 and PR 3 start after spec 013 PR 2 is merged (R13).

**Scale/Scope**: 1 issue (+ #524), 3 PRs, 0 tables, 0 routes, 0 new tools,
6 MCP arguments (`embed_id` ×3, `copy_of`, `embed` ×2), 2 REST fields
(`viewFilters` ×2), about 7 strings.

## CodeGraph

Index checked with `codegraph status` before and during planning: 403
files, 7,355 nodes, 23,855 edges, current with the checkout.

- **The embed today** (`codegraph explore "EmbedState databaseSpec
  CollectionView embed onView updateView local viewId"`):
  - `databaseSpec` (`web/src/blocks.tsx:339`) holds `collectionId`, `local`
    and `chartKind`; `parseEmbedLocal` (`:324`) reads `local` tolerantly;
    `keep` writes it with `editor.updateBlock` when editable, else into
    `unsaved` state.
  - `EmbedState` carries `viewId`, `views` (filters and sort per database
    view), `onViewId`, `onView`. `CollectionView` (`CollectionView.tsx:212`)
    is rendered by `Editor` and by the block.
  - `updateView` (`:634`) sends only filters and sort to the embed; every
    other key reaches `saveConfig` (`:528`) and so the database. Four more
    writers of `config.views`: `renameView` (`:658`), `removeView` (`:667`),
    `moveView` (`:686`), `addView` (`:695`). Hence one view source (R3).
  - Spec 012's embed guards are `!embed` checks around column moves and
    hiding (`:1035`, `:1039`) and Settings; they become "may edit this view
    source".
- **Server features that look views up by id** (`codegraph explore
  "rowPinsForView propsInView handleCreatePage handleAggregate
  mcpEmbedDatabase applyViewSpec normalizeViews"`):
  - `rowPinsForView` → `viewOf` (`server/viewpins.go:188`, `:163`) searches
    the database's views only; `propsInView` has 4 callers (`handleCreatePage`,
    `handleRowFromTemplate`, `mcpCreateFromTemplate`, `mcpCall`). An embed
    view id would be refused with `view_not_in_database` (R5).
  - `resolveAggRequest` (`server/aggregate.go:1087`) already takes explicit
    fields over a view, for #26's embed filters; explicit settings are
    checked by the same `errChart` rules (`aggregate.go:144`–`188`) (R6).
  - `applyViewSpec` (`server/mcp_schema.go:474`, 2 callers) and
    `normalizeViews` (`server/viewopen.go:86`, 3 callers) are the view rules
    the agent's embed path reuses (R4).
  - `mcpEmbedDatabase` (`server/mcp_pages.go:384`) writes `local.viewId`
    through `appendBlockJSON`, `snapshotRevision`, `resetYjsDoc`: the write
    pattern for embed views (R7).
- **How a document is stored** (`server/collab.go` header; `Editor.tsx`
  `materialize` save; `resetYjsDoc` `collab.go:340`): the server never reads
  Yjs; `pages.content` is the browser's debounced copy. This decided R2 (no
  upgrade step) and R5 (the browser sends filters, it does not ask the
  server to read the document).
- **Gates for `set_view`/`delete_view`/`get_collection`** (`mcpCall`,
  `server/mcp.go:906`–`934`): the generic `canRead`/`canWrite` on `page_id`
  already fits `page_id` = the document (R7).
- **Agents and block ids**: `cap_edits.go` (header) matches edits against
  `get_page`'s Markdown, which carries no block ids; `export.go:196` writes
  an embed as `[Collection](/p/<id>)`. Hence the embed list after the
  Markdown, not inside it (R7).
- **Properties dialog** (`codegraph explore "ViewSettingsMenu AddViewMenu
  SchemaEditor removeProp saveConfig ChartView embed"`): `SchemaEditor` has
  one caller (`CollectionView`); its ✕ calls `removeProp` with no
  confirmation (#524), while deleting an option already confirms
  (`SchemaEditor.tsx:604`). `AddViewMenu` (`CollectionMenus.tsx:60`, 2
  callers) is one `MenuValues` group, so the copies go in a second group of
  the same function (R8).
- **Chart insert**: `pickForChart` (`blocks.tsx:374`) calls `addChartView`
  on the database (R12).
- **Not from the graph**: 34 MCP tools (`mcpTools` in `server/mcp.go`,
  counted); `gapBudget` 10; strings `Edit properties`, `Delete property`,
  `Table`, `Add view`, `Settings`, `Cancel` already in `de.json`.

## Constitution Check

- I. One binary, no external services: ✅ nothing new is stored outside
  the document's existing content.
- II. Agent parity: ✅ every embed view action has an MCP door with the same
  checks (R7). No new gap; `gapBudget` stays 10.
- III. Gates are one function:
  - ✅ embed view rules: `applyViewSpec` + `normalizeViews`, the functions a
    database view goes through, called from the embed path;
  - ✅ new-row pins: one `pinsForFilters` behind `rowPinsForView`, the
    browser's `viewFilters` and the agent's `embed`;
  - ✅ embed lookup for agents: one `embedViewOf(u, pageID, embedID)` with
    its gates, used by all five tools.
- IV. Derive from code: ✅ one fixture set read by the Go test and
  `check-embedviews.mjs` (R10).
- V. English source: ✅ strings through `t()` with de/es/nl.
- VI. Every surface: ✅ table below. A new registry row: **Embedded views**
  (below).
- VII. Measured: ✅ no new hot-path query; the converter's cost is measured
  in the Go test on a 50-view database (number recorded in the PR).

Re-checked after Phase 1 design: unchanged, with one justified exception
under Complexity Tracking (Stored data, R2).

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | `server/embedviews.go` (new): `readEmbedLocal(raw, dbViews)` (both shapes, tolerant, R2), `embedViewOf(u, pageID, embedID)` (reads `pages.content`, finds the block; `canRead` on the document, `canRead` + `credentialMayEnter` on the database), `writeEmbedViews(u, pageID, embedID, views)` (`snapshotRevision`, content, `resetYjsDoc`, `pagesChanged`, `fireWebhook("page.updated")` as content writes do). Embed views checked by `applyViewSpec` + `normalizeViews`; form refused; last view kept. `pinsForFilters` behind `rowPinsForView` (R5). No audit entry for a view change: a document edit is recorded in page history, as `embed_database` is today | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | No change: no table or column. `embedViewOf` reads one `pages` row by primary key | backend |
| REST routes (`server/server.go`, middleware) | No new route. `POST /api/pages` and `POST /api/collections/{id}/from-template` take `viewFilters` (contracts/rest.md). The aggregate request is unchanged; embeds send explicit fields | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | `get_collection`, `set_view`, `delete_view`: `embed_id` (and `copy_of` on `set_view`); `get_page`: embed list after the Markdown, inside `wrapUntrusted`; `embed_database`: new shape, answers `embed_id`; `create_page`/`create_rows`: `embed`. Read scope refused by the existing mutating gate. Descriptions in contracts/mcp.md | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: nothing closed. The confirmations are a person's, and `update_schema` already says it applies everywhere | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | `web/src/viewSource.ts` (new): the database's or the embed's views, one `saveViews` (R3). `CollectionView`: every view writer through it; the embed's tabs, ＋, tab menu and Settings act on the embed. `AddViewMenu`: "Views on {name}" group (R8). `ViewSettingsMenu`: shown in embeds; Edit properties when the database is writable (R9); timeline dates and sub-items back. `SchemaEditor`: delete confirmation everywhere, save confirmation from a document (R11). `blocks.tsx`: `parseEmbedLocal` replaced by `embedViews.ts`; `pickForChart` writes the embed's own chart (R12). Light and dark; keyboard through `ui/Menu` and `dialog.tsx` | ui |
| Translations (`t()`, `de.json`/`es.json`/`nl.json`) | About 7 strings (contracts/ui.md), de/es/nl, informal | i18n |
| Server error codes (`web/src/serverErrors.ts`) | No new code. `set_view`'s refusals are MCP text; the browser never meets them (its embed changes do not go through the server) | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots, `docs/what-it-does.md`) | `wiki/views.md` (or the page that describes embeds): an embed's own views, Views on…, Settings, the confirmation. `wiki/collections.md`: deleting a property asks. `wiki/mcp-tools.md`: the new arguments on six tools and `get_page`'s list. `docs/what-it-does.md`: a line. Shots of embeds and the Properties dialog retaken (`check-wiki.mjs` lists them) | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | See Technical Context. Every new test mutation-checked; SC-001 by comparing the database's views JSON before and after each embed change; SC-002 by the fixture cases plus `embed-views.mjs` on an old-shape block of every view type | test |
| Performance (query plans, payload size, per-request work) | No new hot-path query. An embed renders from the `getCollection` it already loads. A document's content grows by its embeds' views (a few hundred bytes each) | perf |
| Manifest (`capabilities.json`, `gapBudget`, `parity_property_test.go`) | No new route or tool, so no new entry; the changed tools' notes mention embeds. A parity pair "change an embed's view": `PATCH /api/pages/{id}` content vs `set_view` with `embed_id`, compared through `get_collection` (Technical Context). `gapBudget` stays 10 | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets) | No new component: `ui/Menu` groups, `IconButton`, `dialog.tsx`. Budgets only go down (the ✕ in `SchemaEditor` is a raw button today; it stays one, or becomes `IconButton` and the budget drops by one) | ui |
| Storage budgets (`bench_world_test.go`, p95 in spec 002 research) | No change: no hot-path query. `embedViewOf` is one primary-key read on an agent's call | perf |
| Page containers (full page, side peek, centre peek) | An embed in a document shown in a side or centre peek is the same block: own views work there. No page-level control added | ui |
| Aggregation (`server/aggregate.go`) | No property type. An embed's chart sends explicit fields (R6); the existing checks apply | backend |
| Stored data (`server/upgrade_steps.go`) | A new JSON shape in `pages.content`, **without an upgrade step**: read in both shapes, written in the new one on first change (R2). Exception justified under Complexity Tracking. No step number taken | backend |
| Outside names (env vars, cookies, storage keys, …) | No change: the prop keeps its name `local`; no storage key; `embed_id` is the block id already stored | backend |
| Menu icons (`ui/Menu`, `menuIcons.ts`, `check-menu-icons.mjs`) | No new function. "Views on {name}" items are values of "add a view" (`MenuValues`), each with its type's icon as the existing type items; Settings items keep their functions | ui |

**Parity statement**: everything a person does to an embed's views, an
agent does with `embed_id`, with the same rules; reading a document shows
an agent its embeds and their views.

**Manifest**: no new route or tool; one parity pair; `gapBudget` stays 10.

**Registry**: a new row, **Embedded views**, added to
`.specify/memory/surfaces.md` in PR 2: "A new view setting, or a new
feature that reads a view by id (pins, charts, personal state, locks,
exports), works for an embed's own views in the document (`embedViews.ts`,
`embedviews.go`) as well as the database's, or the plan says why not. The
embed's views are never written to the database."

## Project Structure

### Documentation (this feature)

```text
specs/014-embed-own-views/
├── spec.md
├── plan.md
├── research.md          # R1–R13
├── data-model.md        # the block's local prop, both shapes
├── quickstart.md
├── contracts/mcp.md     # get_page, get_collection, set_view, delete_view, embed_database, create_*
├── contracts/rest.md    # viewFilters; aggregate as used by embeds
├── contracts/ui.md      # tabs, New view, Settings, confirmations, strings
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
web/src/components/SchemaEditor.tsx        # PR 1: delete confirmation (#524); PR 3: save confirmation
web/tests/property-confirm.mjs (new)       # PR 1, PR 3

server/embedviews.go (new)                 # PR 2: reader, embedViewOf, writeEmbedViews
server/testdata/embedviews/*.json (new)    # PR 2: shared cases
server/viewpins.go                         # PR 2: pinsForFilters
server/pages.go, server/db_templates.go    # PR 2: viewFilters
server/mcp.go, server/mcp_schema.go        # PR 2: embed_id, copy_of, embed, get_page list
server/mcp_pages.go                        # PR 2: embed_database new shape
server/*_test.go, credential_audit_test.go, parity_property_test.go
web/src/embedViews.ts (new)                # PR 2: reader/converter (pure)
web/scripts/check-embedviews.mjs (new)     # PR 2
capabilities.json                          # PR 2: notes
.specify/memory/surfaces.md                # PR 2: Embedded views row

web/src/viewSource.ts (new)                # PR 3
web/src/components/CollectionView.tsx      # PR 3
web/src/components/CollectionMenus.tsx     # PR 3: Views on…
web/src/components/ViewSettingsMenu.tsx    # PR 3
web/src/blocks.tsx                         # PR 3: embedViews.ts, chart insert
web/src/api.ts                             # PR 3: viewFilters
web/src/locales/*.json                     # PR 1, PR 3
web/tests/embed-views.mjs (new), chart insert spec
wiki/views.md, collections.md, mcp-tools.md, docs/what-it-does.md
```

**Structure Decision**: new modules for the new concern on both sides
(`embedviews.go`, `embedViews.ts`, `viewSource.ts`), because
`CollectionView.tsx`, `mcp.go` and `mcp_schema.go` are long and both doors
call the same functions.

**Order of work** (R13): PR 1 (#524) can go now, in its own small branch.
PR 2 and PR 3 after spec 013's PR 2 is merged. PR 2 before PR 3: the
interface reads with `embedViews.ts` and writes rows with `viewFilters`.

**Streams**: spec 013 is the helper stream's next build. This spec's PR 1
touches only `SchemaEditor.tsx` and locales, so the conductor can build it
alongside; PR 2 and PR 3 wait for spec 013's shared files.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Stored data row: a JSON shape inside `pages.content` changes without an upgrade step (R2) | The editor's live document (Yjs) is the authority and the server cannot read or rewrite it; `pages.content` may lag it | A step rewriting `pages.content` must reset every such document's Yjs state, losing any edit not yet saved to content, in every document with an embed |
| The converter exists twice (TypeScript and Go) | The browser reads old embeds as it renders; agents read them on the server | One side only: either agents would see the database's views for an old embed, or the browser would wait on a server round trip to draw a block |
