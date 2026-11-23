# Research: Every table row has a drag handle, a + and a row menu

Decisions for spec 022, from the code graph and the source (2026-11-22).

## R1. Where a row is placed: one server function, by neighbour

**Decision**: one domain function, `placePage(u, id, anchorID, side, viewID)`
in a new `server/order.go`, puts a page just before or after a sibling. It
reads the anchor and the sibling next to it on that side (`ORDER BY position,
created_at, id`, two short reads, not the whole list), and writes the moved
page's `position` as the midpoint. It runs in one transaction on `s.db`.

- **Ties or a gap too small** (the two neighbours share a position, or the
  midpoint equals one of them): the siblings are renumbered 1, 2, 3, … in the
  same transaction first, as `handleReindexSiblings` does, then the midpoint
  is taken. Rows imported in bulk share no positions today (each insert takes
  `MAX + 1`), so this stays the rare path.
- **Writes**: the one row, plus the renumbering when it happens. `updated_at`
  is **not** touched: a move is not an edit, and the row menu's "last edited"
  must not change because someone dragged the row.
- **Side effects**: `pagesChanged()`, `rowChanged(id)` (the other open tables
  reload, as for a property change), `fireWebhook("page.updated", id)`, after
  the commit. The activity entry is the door's: the REST route writes
  `reorder_page` (side, anchor, view); an agent's call is already logged once
  by `mcpCall`, so `placePage` writing its own would log every agent move
  twice (found while testing).
- **Checks**: `canWrite` on the page, then `credentialMayEnter`; the anchor
  must be a live sibling (same parent, not trashed, readable), else
  `400 anchor_not_sibling`. A page placed next to itself writes nothing.

**Why**: the browser cannot compute a midpoint safely for a database. With a
filter, the rows it shows are not adjacent in the database's order, and an
agent has no positions at all. One function by neighbour gives the person and
the agent the same move (constitution II) and keeps the gate in one place
(constitution III).

**Turned down**: the browser sends a raw `position` through `PATCH` (the
sidebar's way: wrong next to hidden rows, and an agent would have to read and
compute positions); renumbering every row on each move (one write per row,
SC-002).

**Room for #870** (a view's own order with "change everywhere", owner
2026-11-22): REST and MCP both accept a view id, checked against the
database's views and logged now; #870 decides from it whose order a move
writes. A first draft had an `orderScope` function that always answered "the
database"; review found it dead code and it went until #870 needs it.

## R2. The door for people: `POST /api/pages/{id}/place`

**Decision**: a new route, body `{"after": "<id>"}` or `{"before": "<id>"}`,
plus an optional `viewId` (R1, validated, and in the activity log). It answers the
page's new position. `PATCH /api/pages/{id}` keeps its `position` field for
the sidebar, unchanged.

**Why a new route** rather than `after` on `PATCH`: `PATCH` already carries
twelve fields with their own rules (trash, materialise, workspace moves); a
move with its own checks and its own log entry reads clearer on its own.
`pages.order` in `capabilities.json` gets this route.

## R3. The + and Duplicate land next to their row

**Decision**: `POST /api/pages` (create) takes the same optional `after` /
`before`; the new row is inserted and placed by `placePage` in one request.
`POST /api/pages/{id}/duplicate` places the copy right after its source when
the source is a database row (today it goes to the end). The MCP
`create_page` tool gets `after` / `before` too, through the same function.

**Why**: one request per click, and no flash of the new row at the bottom.

## R4. A drag in a sorted view: the sort goes as a personal change

**Decision**: on drop in a sorted view, the table calls `updateView({ sort:
null })`. Through spec 013's `withPersonalEdit` that stores `sort: null` for
this person and scope, and the "Only you see these changes" bar offers Save
for everyone and Reset. The move itself (R1) is shared at once.

- **Locked views**: personal filter and sort are allowed under a lock (spec
  013, FR-009), so a drag works there too; Save for everyone stays locked.
- **No personal scope** (an embed without a place): the sort change goes
  to the view as today, so a person who may not change that view cannot
  drag rows of a sorted view (spec FR-005).
- **Owner decision** (2026-11-23): just the person's own sort goes, as
  above. Turned down: removing it for everyone at once (`saveViews`), which
  would surprise teammates and be refused under a lock.

## R5. The gesture: pointer events, as the board and the columns drag

**Decision**: a new `web/src/rowDrag.ts`, shaped like `columnDrag.ts`: a pure
part (where the row lands from the pointer's y and the row boxes; which spots
a tree allows; the anchor and side to send) checked by
`web/scripts/check-rowdrag.mjs`, and a hook for the gesture.

- Pointer events, so mouse, pen and finger take one path (`boardDrag.ts`,
  `columnDrag.ts`); a 5px threshold tells a click (menu) from a drag.
- **Touch**: a press-and-hold of 300ms on the handle starts the drag, so a
  scroll that starts on the handle still scrolls. **Owner decision**
  (2026-11-23): on a phone the handle is hidden until a row is tapped; the
  tap shows that row's handle, while a tap on the title still opens the row
  and a tap on a cell still edits it. Turned down:
  always visible on every row (the picture's draft), for a cleaner table.
- **The line**: the block drop line's look, 2px in `--color-focus`
  (`--editor-drop-line-width`), drawn across the row's full width between two
  rows. One spot per gap, so it cannot twitch between two (the #809 lesson).
- **Auto-scroll** near the scroll container's top and bottom edge, as
  `columnDrag.ts` does sideways.
- **Tree** (sub-items): spots only among siblings at the dragged row's depth
  under the same parent; elsewhere no line, and the drop does nothing.

**Turned down**: HTML drag and drop (no touch, and the browser's own drag
picture is the Safari cost suspected in #810).

## R6. The row menu: a row actions list, shared with the board card

**Decision**: a new `web/src/actions/rowActions.ts` lists what can be done to
a row, by place (`table`, `boardCard`), as `propertyActions.ts` does for a
property (Content actions surface). `check-content-actions.mjs` gets the row
list. The board card's `CardMenu` is drawn from it too, with its own reasons
for what it leaves out (it keeps "Move to" a column, a board action).

Groups, in order (spec 015's rule: a choice is a submenu, more than 3 in a
group is a submenu):

| Group | Actions |
|---|---|
| open | Open · Open in › (side peek, centre peek, new tab) |
| edit | Edit property › (the row's properties) · Comment · Add to / Remove from favourites |
| copy | Copy link · Duplicate |
| danger | Move to trash |

Below them, as text: "Edited {time} by {name}", from the row's `updated_at`
and the newest activity entry for the row that is not a `reorder_page`
(`GET /api/audit?page=<id>`, read when the menu opens).

**Menu icons** (`menuIcons.ts`): existing functions reuse their icons (`open`,
`openInNewTab`, `editProperty`, `commentsPanel`, `favorite`, `copyLink`,
`duplicate`, `moveToTrash`). New: `openIn` (the submenu), `openInSidePeek`,
`openInCenterPeek`, `addRowBelow` (the +, for its tooltip and the shortcut
list), each with an icon no other function has.

## R7. Keyboard

**Decision**: in `keys.ts`, `mod+/` opens the focused row's menu and
`mod+shift+arrowup` / `arrowdown` move it one place (R1 with the row above's
or below's id). Both are free today. A row is focusable through its title
button already; the shortcuts act when focus is inside a table row. The
shortcut sheet lists them; `check-keys.mjs` is extended.

## R8. Where the handle sits

**Decision (to show the owner as a picture before building)**: in a narrow
leading gutter cell of its own, sticky at the row's left, ahead of every
column: it stays in view while the table scrolls sideways, does not move when
another column is put first (the checkbox-first change in the other thread),
and inside a document it does not collide with the embed block's own handle in
the document's left margin. First drafted inside the title cell; changed
because the title column is not always the first one. Notion puts
it outside the table on the left; nigari's tables in documents have the
document's handle there.

## R9. Finding the neighbour stays inside the budget without a new index

**Decision**: `placePage` reads the anchor's neighbour with the same shape as
the rows query (`parent_id = ? AND trashed_at IS NULL ORDER BY position,
created_at LIMIT 1` past the anchor), on `idx_pages_parent`. A benchmark on
the seeded workspace's largest database (`bench_world_test.go`) measures the
move; only if it is over the write budget in
`specs/002-storage-engine/research.md` does an index `(parent_id, position,
created_at)` follow, as an upgrade step with its fixture (Stored data).

**Measured** (`BenchmarkStoragePlaceRow`, 10,000 rows, random row and
anchor): p50 5.1 ms, p95 6.9 ms, inside the 8 ms write budget. The first
version read every sibling per move and was 25.5 ms at p95; reading only the
anchor and the one neighbour (`LIMIT 2` past the anchor) fixed it. `EXPLAIN
QUERY PLAN`: `SEARCH pages USING INDEX idx_pages_parent (parent_id=?)` plus a
temp B-tree for the ORDER BY. No index added.

**Why**: an index is a stored-data change with an upgrade step; it is added
when a number asks for it (constitution VII), not before.
