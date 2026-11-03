# Research: A view's filters can be changed for oneself, offered as quick filters, sub-grouped, locked, and logged

Spec: [spec.md](spec.md). Each entry: decision, why, what was turned down.

## R1 — Personal state in a table of its own, created by an upgrade step

**Decision**: `view_prefs(user_id, collection_id, scope, state, updated_at)`,
primary key `(user_id, collection_id, scope)`, index on `collection_id`.
`scope` is the view id for a database's own view, and
`embed:<pageId>:<blockId>:<viewId>` for an embed. `state` is JSON:
`{filters?, sort?, quickPicks?}`. Created by upgrade step 2.

**Why**: the owner chose the account ("follows me to every device").
`userPrefs` (`server/prefs.go`) holds a handful of scalars per person; views
are many per person, so a row each is the natural shape, read by primary key.
A table is "a change to what is stored", so it goes in an upgrade step with a
fixture (spec 008), not in `db.go`'s schema constant.

**Turned down**: a JSON column on `users` (one blob rewritten on every filter
click by every tab, and unbounded); the browser's storage (the owner chose
the account).

## R2 — How the browser reads and writes it

**Decision**: on opening a database, `GET /api/collections/{id}/personal`
returns the person's states for that database (all scopes). A change is a
`PUT …/personal/{scope}` with the whole state, debounced like a filter edit
today; Reset is `DELETE`. Routes are `auth` + `sessionOnly` + `canReadReq`.
The interface draws the shared view until the answer arrives (one request,
in parallel with the rows), then the personal one; no browser storage key.

**Why**: one request per database, not per view; whole-state PUT keeps the
merge rule in one place (the browser) and the server a store. `sessionOnly`
keeps it a person's thing (agents have no personal state, owner's choice).
Readers may personalize: it changes nothing for anyone else.

**Turned down**: a first-paint cache in localStorage (a new outside name,
and a flash of the wrong rows is less bad than a stale cache across
accounts); a patch format (two merge rules to keep in step).

## R3 — The lock: stored on the database, checked by one function

**Decision**: `collections.views_locked_by` (user id) and `views_locked_at`.
`PUT /api/collections/{id}/lock` locks, `DELETE` unlocks; both `auth` +
`sessionOnly` + `canWriteReq`, audited. `checkViewsUnlocked(colID, before,
after []byte)` returns `errViewsLocked` when the database is locked and the
views JSON differs from what is stored (byte-equal saves pass, so a browser
that sends the same views with a schema change is not refused). Called by
`handlePutCollection` (when the views half is sent) and by `mcpCreateView`,
`mcpUpdateView`, `mcpDeleteView`. REST answers 409 `views_locked`.

**Why**: `codegraph explore` showed REST writing views with its own SQL and
MCP through `saveCollection`, so the check is a function both call, not a
step inside one writer. Keeping the flag outside the views list means a
`PUT` of the views cannot unlock them by sending a list without the flag.
`sessionOnly` makes locking a person's act (owner's choice: agents cannot).

**Turned down**: the flag inside the views JSON (any views save could clear
it); checking in `saveCollection` (REST does not call it); per-view locks
(Notion locks the database's views together; the spec says per database).

**What the lock does not cover**: schema changes (`update_schema`) that leave
the views list unchanged; an embed's own filters (they belong to the
document); personal state.

## R4 — Save for everyone and Reset

**Decision**: Save for everyone writes the person's filters and sort into
the view through the normal save (REST PUT for a database view,
`embed.onView` for an embed), so the lock, the per-view checks and the log
apply; then the personal state is deleted. Offered only when the person can
edit (the database, or for an embed the document) and the views are not
locked (database views only; the lock does not cover embeds). Reset deletes
the personal state.

**Why**: one write path for shared changes, so nothing new to secure.

## R5 — Which filters the rows and new rows use

**Decision**: the browser merges (`web/src/viewState.ts`, pure): personal
filters replace the shared ones when present (the person edited them from
the shared ones); quick filter picks are added; personal sort replaces the
shared sort. The merged filters go to the rows query exactly as filters do
today. For new rows, `rowPinsForView(colID, viewID, userID)` reads the
person's state for that view and pins from the same merge, done in Go by
`mergeViewState`, which `check-viewstate.mjs` and a Go test hold level with
the browser's.

**Why**: the server already evaluates whatever filters it is sent
(`handleCollectionRows`), so display needs no server change. New rows are
made on the server from the view id, so the server must know the person's
filters there (FR-005); otherwise a row made in "only mine" would not be
mine.

**Turned down**: the server merging for the rows query (the browser already
sends filters; two places would build the same list).

## R6 — The log: one entry per changed view, meaningful keys only

**Decision**: `auditViewChanges(actorType, u, colID, ws, before, after)`
diffs the two views lists by id: `view.create`, `view.delete`, `view.rename`,
and `view.update` with the changed keys among `filters`, `sort`, `groupBy`,
`subGroupBy`, `quickFilters`, `type` settings that are not layout. Keys
ignored: `colWidths`, `colOrder`, `hidden`, `openIn`, chart style. The
detail names the view; `changes` carries before and after of the changed
keys. Lock and unlock: `views.lock`, `views.unlock`. Actor type "user" for
REST, "agent" for MCP. `ActivityModal` gets labels for the five actions.

**Why**: the owner chose meaningful changes only; the diff is in Go over two
lists already in memory, one function both doors call.

**Turned down**: one entry per save (noise, owner's choice); a hook in
`saveCollection` (REST does not call it).

## R7 — Quick filters

**Decision**: a view key `quickFilters: string[]` (property ids), set by
anyone who can change the view, checked by `checkViewQuickFilters` (ids must
be properties of a filterable type; repeats dropped; at most 8). A viewer's
pick is stored in their personal state as `quickPicks: {propId: value}` and
becomes an "is" (options, people, checkbox) or "contains" (text) filter in
the merge. Save for everyone turns picks into shared filters. MCP `set_view`
`quick_filters`.

**Why**: the issue's shape (chips on the view, value per viewer), with the
per-viewer value on the account like the rest of personal state. No new
filter operator.

**Turned down**: picks in the browser only (the owner chose the account).

## R8 — Sub-group key and its rule

**Decision**: a board view key `subGroupBy: string`, checked by
`checkViewSubGroup`: board views only, a property of a groupable type
(`groupableTypes` in `aggregate.go`), not the same as `groupBy`. MCP
`set_view` `sub_group_by`, `""` clears.

**Why**: same pattern as `groupBy`; one rule on both doors.

## R9 — Lanes in the interface

**Decision**: `web/src/boardLanes.ts` (pure) splits the loaded rows into
lanes × columns, with a "No value" lane, and returns the two values a cell
stands for. A drop writes both properties in one `propsPatch` (one request,
one history entry). spec 012's `dropIndex` places the marker inside the
cell. Folded lanes are personal state (`foldedLanes`), kept on the account
like the rest. A lane property that cannot be written (formula, rollup)
draws lanes and refuses drops between them.

**Why**: the board already loads its rows; lanes are a layout of them. One
patch avoids a half-moved card.

## R10 — Agents: what they see and what is closed

**Decision**: `get_collection` returns `views_locked: {by, at}` or null.
`set_view`/`delete_view` refuse with the lock's sentence. No MCP tool for
lock or personal state; both listed in `not_available_via_mcp` and as gaps
in `capabilities.json` (owner, 2026-11-03).

## R11 — A new registry row: View lock

**Decision**: `.specify/memory/surfaces.md` gains **View lock**: "a new path
that writes a database's views calls `checkViewsUnlocked` and
`auditViewChanges`; a test with the lock on shows it refused", tag
`backend`, since the date PR 1 merges.

**Why**: the lock only protects if every later writer calls it, and spec
012 showed how easily a second door is missed.

## R12 — Three pull requests, after spec 012

**Decision**: PR 1 lock + log (US2, US5); PR 2 personal changes (US1); PR 3
quick filters + lanes (US3, US4). Start after spec 012 PR 2 is merged:
PR 1 adds items to its Settings menu, and both specs touch
`CollectionView.tsx`, `viewopen.go`, `mcp_schema.go` and `menuIcons.ts`.

**Why**: the lock must exist before anything new writes views; each PR
ships something whole.
