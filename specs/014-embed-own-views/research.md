# Research: A database in a document has views of its own

Decisions for spec 014, each with what was turned down. The code graph
findings they rest on are in plan.md, section CodeGraph.

## R1 — Embed views are stored in the block, in the document

**Decision**: an embed's views live in the `database` block's existing
`local` prop, in a new shape (data-model.md): the full list of views, each
with the same keys as a database's view, plus the open view's id.

**Why**:
- The spec's assumption checks out against the code. A document's blocks
  are stored twice: the Yjs state the editor works on (`yjs_state`,
  `yjs_updates`, never read by the server) and the materialized JSON in
  `pages.content`, written by the browser's debounced save
  (`Editor.tsx`, `materialize`) and by every server-side write.
- So the views go wherever the document goes, with nothing new to copy:
  page history (`snapshotRevision`), duplicate, transfer, backup and
  restore, trash. Live editing settles two people changing the same embed,
  as it does for today's `local` (last write of the prop wins).
- `local` is free text already parsed tolerantly (`parseEmbedLocal`), so a
  new shape needs no change to the block's prop schema.

**Turned down**:
- A server table `embed_views(page_id, block_id, views)`. It would need its
  own copy on duplicate, a restore rule for history, cleanup when the block
  is deleted, and a block id the server only learns when the content is
  saved. Every one of those is a bug the document path does not have.
- A second block prop (`views`) beside `local`. Two props would be written
  apart and could disagree; one JSON value keeps the open view and the
  list together.

## R2 — Old embeds are read in both shapes; no upgrade step rewrites them

**Decision**: the readers (browser and server) accept both shapes:
- **Old** (`{viewId, views: {<dbViewId>: {filters, sort}}}`, or empty):
  read as a copy of every database view an embed can show (forms left out),
  each keeping its id, with the embed's own filters and sort laid over it,
  and the same view open (owner, Q2 B). Computed when read, from the
  database's views at that moment.
- **New** (`{v: 2, viewId, views: [<view>…]}`): the embed's own views.

An old embed is written in the new shape the first time someone who may
edit the document changes one of its views; until then it shows what it
shows today. One pure function converts, in TypeScript
(`web/src/embedViews.ts`) and in Go (`server/embedviews.go`), held level
by shared fixtures (R10).

**Why**:
- The registry's **Stored data** row asks for an upgrade step when a JSON
  shape inside a column changes. A step cannot do this one safely. The
  server never reads Yjs data (`server/collab.go`, header comment); the
  editor's Yjs state is the authority, and `pages.content` can be a few
  seconds older. Rewriting `content` means deleting each document's Yjs
  state (`resetYjsDoc`, as a restore does), which would throw away any edit
  not yet materialized, in every document with an embed, at once.
- Converting on read changes nothing anyone sees (Q2 B's goal), and
  converting on the first change gives FR-014's guarantee: the first change
  is to the embed's copy, never to the database's view.
- Keeping each copied view's id means anything keyed by it stays valid:
  spec 013's personal state (`embed:<pageId>:<blockId>:<viewId>`, its
  data-model.md) made before this spec ships still finds its view.
- The old shape cannot be retired anyway: page history holds it, and a
  restored revision brings it back.

**Turned down**:
- An upgrade step rewriting `pages.content` and resetting Yjs state for
  every document with an embed (data loss risk above).
- Converting when a document opens, even without a change. Opening would
  write to the document (history entry, "edited" time, a live update to
  everyone viewing) without anyone doing anything.
- Converting on the server at restore time only. A browser that opens a
  restored revision before the server converts it would still meet the old
  shape, so the browser needs the reader regardless.

This is recorded under Complexity Tracking in plan.md as a deliberate
exception to the Stored data row: expand only, no step, no contract.

## R3 — One view source in the collection view

**Decision**: `CollectionView` reads and writes views through one source:
the database's (`config.views`, saved by `saveConfig`) on a database page,
the embed's (`EmbedState.views`, saved by `embed.onViews`) in a document.
Every function that changes views today (`updateView`, `renameView`,
`removeView`, `moveView`, `addView`, Settings' items, column order, widths,
chart settings) goes through `saveViews(next)`, which picks the source.

**Why**: the code graph shows five functions writing `config.views`
(`updateView`, `renameView`, `removeView`, `moveView`, `addView`), all inside
`CollectionView`, with Settings, column order, widths and chart settings
reaching them through `updateView` (plan.md). One switch point means a later view
setting cannot be added on the database path and forgotten on the embed
path. Today's split (`updateView` sending only filters and sort to the
embed, everything else to the database) is the kind of half-route the spec
removes. `CollectionView.tsx` is over 1,400 lines, so the source lives in a
new module (`web/src/viewSource.ts`), per `.claude/rules/frontend.md`.

**Turned down**: a second component for embeds. The views, toolbar and
settings would be duplicated, and spec 012 and 013 each add to them.

## R4 — The interface checks an embed's views with the rules it already has; the server checks the agent's door

**Decision**:
- A person's change to an embed's view is a block change in the live
  document: the server never sees it as a view, and cannot refuse it. The
  browser applies the same rules it applies before saving a database's
  views (the chart defaults, a board's grouping, the last view kept), and
  the reader is tolerant: a view of an unknown type, or not an object, is
  dropped; an embed left with none shows one table view.
- An agent's change goes through the server, which runs the database view
  rules: `applyViewSpec` (`set_view`'s checks) and `normalizeViews`
  (`checkViewOpenIn`, `checkViewColOrder`, `checkChartView`), against the
  database's schema. Same functions, so the same refusals (FR-004, SC-005).
- A property removed from the database is handled where it is read, as
  today's embed filters are: a filter, sort, grouping or shown column naming
  a missing property is ignored. The database's own views are cleaned by
  the server when the schema changes; documents are not rewritten (R2).

**Why**: this is how every other block prop works (a callout's colour, an
image's width): the document is the person's, and the editor writes it.

**Turned down**: a server route the browser calls to save an embed's views.
It would race the live document (two writers to one block) and need the
Yjs reset above on every view change.

## R5 — New rows in an embed's view

**Decision**:
- **Browser**: `POST /api/pages` and `POST /api/collections/{id}/from-template`
  take `viewFilters` (the filters of the view as the person sees it) in
  place of `viewId` when the view is an embed's. The server pins from them
  with `pinsFromFilters` and answers `matchesView` from them, as it does
  for a database view.
- **Agents**: `create_page` and `create_rows` take `embed` (`{page_id,
  embed_id}`) with `view_id` naming the embed's view. The server reads the
  view from the document's stored content (`embedViewOf`), behind
  `canRead` on the document and `credentialMayEnter` on its workspace, then
  pins as above.
- Both end in one function, `pinsForFilters(colID, filters)`, which
  `rowPinsForView` calls too.

**Why**:
- `rowPinsForView(colID, viewID)` (`server/viewpins.go`) looks the view up
  in the database's views; an embed's view is not there, so today's call
  would be refused with `view_not_in_database`.
- The browser cannot ask the server to read the view from the document:
  `pages.content` lags the live document by the save delay, and a filter
  changed a moment before a new row would be missed.
- Sending filters is no new power: the caller must be able to write the
  database, and could pass the same values as `props` directly. The pins
  only save typing (spec 005).
- Spec 013 R5 merges a person's own filters into the pins on the server.
  For an embed, the browser already sends the merged filters it shows.

**Turned down**: always sending filters, for database views too. Spec 005's
contract (`view_id`) and its tests stay as they are.

## R6 — Charts in an embed

**Decision**: an embed's chart view sends its settings and filters to
`POST /api/collections/{id}/aggregate` as explicit fields with no `viewId`
(`aggRequest` already takes them: `groupBy`, `period`, `aggregate`,
`aggregateProp`, `filters`). `resolveAggRequest` checks explicit settings
like a view's.

**Why**: the aggregate request was built for this (its comment: "the
browser sends a document embed's own filters, #26"); only the chart
settings move from the database's view into the request.

**Turned down**: a new aggregate route for embeds.

## R7 — Agents: the existing view tools take an embed

**Decision**: no new tool. `get_collection`, `set_view` and `delete_view`
take an optional `embed_id`: with it, `page_id` is the document and the
tool acts on that embed's views; without it, as today. `get_page` lists a
document's embeds after its Markdown (embed id, database id and title,
view names and types), inside the untrusted wrapper. `embed_database`
returns the new embed's id. `create_page`/`create_rows` take `embed` (R5).

**Why**:
- `.claude/rules/mcp.md`: "Prefer one tool with an `action` argument over
  several near-identical tools". Four new tools for list/add/change/remove
  would repeat `set_view`'s 20 arguments.
- The generic gate in `mcpCall` already checks `canWrite` on `page_id` for
  `set_view` and `delete_view`, and `canRead` for `get_collection`. With
  `page_id` the document, that is the right gate for an embed (FR-010),
  and the tool adds `canRead` plus `credentialMayEnter` on the database.
- An agent writes the document the way `embed_database` does: change
  `pages.content`, `snapshotRevision`, `resetYjsDoc`, `pagesChanged`.
- Agents have never seen block ids. `get_page`'s Markdown cannot carry
  them without changing what find-and-replace edits match against
  (`cap_edits.go`), so the list goes after it, not inside it.

**Turned down**: four `*_embed_view` tools (tool count 34 → 38 for one
concept); embed views shown as Markdown inside the page text.

## R8 — New view in an embed: types and "Views on <database>"

**Decision**: the ＋ menu (`AddViewMenu`) gains a second group in an embed,
headed "Views on {name}", listing the database's views (forms left out)
with their type's icon. Picking one adds a copy with a new id and the same
name. View types in an embed leave out the form (spec edge case).

**Why**: Notion's linked view does exactly this (owner's screenshot), and
the same menu keeps the copy two clicks away (SC-003). The items are values
of one function, "add a view", in a `MenuValues`, so `check-menu-icons.mjs`
needs no new function.

## R9 — Settings in an embed

**Decision**: the spec 012 Settings menu shows in an embed for someone who
may edit the document. Its View settings act on the embed's view (through
R3's source). Database settings shows **Edit properties** only when the
person may write the database: the database's workspace role is not
`viewer` (`PageMeta.workspaceId` → `Workspace.role`), the rule the server's
`canWrite` applies. The timeline date pickers and the sub-items picker,
removed from embeds by spec 012 PR 2, come back.

**Why**: the owner's model (decisions 2026-11-03): settings in an embed act
on its own views without asking.

## R10 — One converter, two languages, shared fixtures

**Decision**: `server/testdata/embedviews/*.json` holds cases (database
views, old `local`, expected views and open view, plus malformed inputs).
`server/embedviews_test.go` and `web/scripts/check-embedviews.mjs` both run
every case.

**Why**: the conversion and the tolerant reader exist in both languages
(R2); a case file both read is what keeps them equal, the way
`check-viewstate.mjs` and its Go test do for spec 013.

## R11 — Confirmations (FR-012, FR-013, #524)

**Decision**:
- **Delete a property** asks on every surface through `dialog.tsx`'s
  `confirm`: "Delete {property} from {database}? It will be removed from all
  views." For a relation with a back-relation, a second sentence: "Its
  column in {other} is removed too." Shipped first, on its own, as the fix
  for #524.
- **Save in the Properties dialog opened from a document** asks before
  saving: "Change the properties of {database}? This changes the database
  and every view of it, everywhere." Cancel keeps the dialog open with the
  edits. On the database's own page, Save does not ask (only Delete does).
- Agents are not asked: `update_schema` has no person to ask. Its
  description already says a schema change applies everywhere.

**Why**: owner's Q1 A; #524 is a bug and goes in its own small pull request
(AGENTS.md).

## R12 — A chart from the / menu is the embed's own chart

**Decision**: picking a database for a chart from the / menu
(`pickForChart` in `blocks.tsx`) no longer adds a chart view to the
database (`addChartView`). It writes the embed in the new shape with one
chart view of the asked kind (`defaultChartView`), its settings open.

**Why**: today every chart put into a document leaves a chart view behind
on the database's own page, and the pick is refused for a database the
person may only read. With views of its own, the chart is the document's:
nothing changes on the database, and a reader of the database can chart it
in their own document.

**Turned down**: keeping the database view and copying it (two views for
one chart, one of them orphaned).

## R13 — Order of work and pull requests

**Decision**: three pull requests.
1. **#524**: delete-a-property confirmation, everywhere (US4 scenario 4).
   Small, `SchemaEditor.tsx` only. Can go at once.
2. **Model, server, agents** (US5, US6, FR-005, FR-008, FR-015, FR-016): the
   converter in both languages, `embedviews.go`, the MCP arguments, the pins
   from filters, `get_page`'s embed list, `embed_database` writing the new
   shape.
3. **Interface** (US1–US4): the view source, New view with "Views on…",
   Settings in embeds, the Save confirmation, wiki and screenshots.

PR 2 and PR 3 start after spec 013's PR 2 is merged: both specs change
`server/viewpins.go`, `server/mcp_schema.go`, `server/mcp.go` and
`CollectionView.tsx`, and spec 013's per-embed personal state is what this
spec's views attach to.

**Why**: the steward skill keeps two streams in separate files; these files
are spec 013's until its PR 2 lands.
