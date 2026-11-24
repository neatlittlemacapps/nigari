# Feature Specification: The page scrolls while a dragged block is held near its edge

**Feature Branch**: `claude/drag-autoscroll-810`

**Created**: 2026-11-24

**Status**: Draft

**Issues**: #810

**Input**: Owner, 2026-11-24, on #810 (block drag and drop epic #812): drag a
database view up into a right column higher on the page; "ideally the page
would need to scroll upwards as well to see my target". Later the same day,
after testing on the live instance: "Speed is ok", so what #810 still asks
for is this scrolling, not drag speed.

## Context

From the code graph (`codegraph explore` on `blockDrop`, `overAt`,
`onScroll`, `rowDrag`, `boardDrag`, `columnDrag`, 2026-11-24) and the source:

- **A block drag is the browser's own drag and drop.** `blockDrop`
  (`web/src/blockDrop.ts`, rendered by `BlockContent` in `Editor.tsx`) listens
  for `dragover` on the document and draws its own drop line (spec 021).
  While the pointer rests, the browser sends a `dragover` only every 350 ms or
  so, so anything that must move smoothly cannot ride on those events alone.
- **The page does not scroll by itself during a drag.** The page scrolls
  inside `.page-body`, not the window. The browser's own drag scrolling does
  nothing there. Measured: a block held at the top of the page for 2 s left
  the scroll position at 1,263 px.
- **The other three drags already scroll their scroller**, each on its own
  pointer events (which fire on every move): table rows (`rowDrag.ts`,
  48 px zone, 14 px a step, with its own `scrollParent`), board cards
  (`boardDrag.ts`, a column's cards, 40 px / 12 px) and table columns
  (`columnDrag.ts`, sideways, 40 px / 12 px). So a block is the one thing
  that can be dragged and cannot be taken past the screen.
- **A scroll already redraws the line.** `blockDrop` listens for `scroll` on
  the window (capture) and drops its cached boxes then, so the line is
  decided again from fresh boxes on the next step.
- **Saving the scroll position** (`writePageScroll` in `Editor.tsx`) happens
  only within 2 s of a wheel or touch gesture, so a scroll made by a drag is
  not saved as the page's place. No change is needed there.
- **Which blocks move** comes from the editor's selection when the drop lands
  (`draggedIds`), not from the drag event itself.

## User Scenarios & Testing

### User Story 1: Drag a block to a place that was off screen (P1)

A person drags a block (a paragraph, a heading, a database view) by its
handle towards the top or bottom edge of the page's visible area. The page
scrolls in that direction while the block is held there, and the drop line
follows the place under the pointer as it moves into view. Moving the
pointer away from the edge stops the scrolling. The block lands where the
line was.

**Acceptance**:
1. Given a long page scrolled down, when a block is held within the top edge
   zone, then the page scrolls up without the pointer moving, until the top
   of the page or until the pointer leaves the zone.
2. The same downward, at the bottom edge.
3. The nearer the pointer is to the edge, the faster it scrolls; just inside
   the zone it creeps, so the first or last visible line can still be chosen
   without the page running away.
4. Held over the header above the page (the title bar, which does not
   scroll), it scrolls up at full speed.
5. While it scrolls, the drop line stays on the place under the pointer.
6. The owner's case: a database view dragged up into a right column higher on
   the page lands in that column, and nothing else moves.

### User Story 2: Nothing changes when no block is dragged (P1)

1. Dragging a file from the desktop, text inside a paragraph, or a table row
   or board card does not start this scrolling. The table rows and board
   cards keep their own.
2. Once the drag ends (drop, Escape, drop outside), the page stops scrolling
   at once.

### Edge cases

- At the top or bottom of the page the scrolling stops; nothing jumps.
- A short page that does not scroll: nothing happens.
- A block in a peek panel scrolls the peek, the nearest thing that scrolls.
- Held over the sidebar or anything else beside the page, nothing scrolls,
  however high or low the pointer is.
- While the page scrolls, holding a block at a column's edge does not make a
  new column: the page moving counts as the block moving, so the short rest a
  new column needs starts once the scrolling stops.
- Two editors on one page (a page and its peek): only the one the drag
  started in scrolls.
- A read-only page does not offer block drags, so nothing changes there.
- Phone: block drags by touch are not part of this (the handle opens the
  block menu on a tap); nothing changes there.

## Requirements

- **FR-001**: While a block dragged by its handle is held inside an edge zone
  at the top or bottom of the visible part of the page, the page MUST scroll
  in that direction, also while the pointer rests.
- **FR-002**: The speed MUST grow with the depth into the zone, from a slow
  creep at its inner border to the fastest at the edge and past it (over the
  header).
- **FR-003**: The zone MUST be narrower on a short visible area, so its
  middle never scrolls.
- **FR-004**: The drop line MUST be decided again after each scroll step for
  the same pointer position.
- **FR-005**: The block that lands MUST be the block that was picked up,
  after any amount of scrolling.
- **FR-006**: Scrolling MUST stop when the pointer leaves the zone, at the end
  of the page, and when the drag ends in any way.
- **FR-007**: Only block drags that started in this editor scroll; file,
  text, row, card and column drags are untouched.
- **FR-008**: A scroll made by the drag MUST NOT be saved as the place the
  page is reopened at.

## Decisions

- **Q1. Speed ramp** (Claude's default, not asked): the speed grows with the
  square of the depth into a 72 px zone, up to 24 px a frame (about 1,400 px
  a second). Measured: 1,263 px of page in about 1.3 s. A page is much longer
  than a table, so the 14 px steps of the row drag would take over a minute
  across a long page. Turned down: the rows' fixed step (too slow over a page,
  and it jumps at the zone's border), and a zone as wide as the table's 48 px
  (too narrow to aim into with a block's picture under the pointer).
- **Q2. Scroll on a timer of frames**, not on each `dragover`: a resting
  pointer gets a `dragover` only every 350 ms, which would scroll in jerks.
  Turned down: scrolling per `dragover` like the rows do per pointer move.
- **Q3. No scrolling sideways**: a page does not scroll sideways; a wide
  table inside a database view has its own drag (columns).

## Success Criteria

- **SC-001**: A block held at the top edge of a page scrolled 1,200 px down
  reaches the top of the page in under 2 s.
- **SC-002**: A block held 12 px into the edge zone scrolls no more than
  2 px a frame.
- **SC-003**: In the owner's case (a database view dragged up into a right
  column 1,200 px higher), the database lands in the column and the other
  blocks keep their order, in 10 of 10 runs.
- **SC-004**: When the drag ends, the page scrolls no further (0 px in the
  next 500 ms).

## Assumptions

- Mouse and trackpad drags on desktop browsers (Chrome, Safari, Firefox).
- The header above the page counts as "past the top edge".
