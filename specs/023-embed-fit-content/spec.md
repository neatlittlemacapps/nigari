# Feature Specification: An embedded database fits its content and sits on the page without its own card

**Feature Branch**: `claude/spec-023-embed-fit`

**Created**: 2026-11-23

**Status**: Draft

**Issues**: #910

**Input**: Owner, 2026-11-23, with a screenshot of the Inbox page:

> "databases should take the available height in accordance to their contents
> instead of a fixed height. Also, they should not be in their separate
> wrapper. Just take the contents and put that on the page."

And on long databases (owner, 2026-11-23, "accept your proposal"): tables and
lists show the first 25 rows, then a "Show more" button; boards keep a capped
height so their columns scroll.

## Context

From the code graph (`codegraph explore` on `databaseSpec`, `CollectionView`,
`TableView`, `ListView`, `GalleryView`, 2026-11-23) and the source:

- **The card is the block's own CSS.** `databaseSpec` (`web/src/blocks.tsx`)
  draws `.bn-db-embed`: a title button, then `CollectionView` with `embed`.
  `.bn-db-embed` has a border, a 12px radius, `overflow: hidden` and the card
  surface; the title has its own padding and a bottom rule.
- **The empty space under the table is the full page's padding.** An embed
  uses the same view wrappers as a database page: `.table-wrap` has 48px at
  the sides and 40px below (room for a page's scroll end), `.gallery` 48px and
  40px, `.collection-toolbar` 48px at the sides. In a document that is the
  empty band under the summary row in the owner's screenshot, and the table
  and tabs sit 48px in from the text above and below.
- **No fixed height for a table, list or gallery in a document.** They already
  grow with their rows; only the padding made a one-row table look boxed in.
  Every row is drawn, so a 500-row database makes a 500-row block in the
  middle of the text.
- **A board has a fixed band** (`.bn-db-embed .board`: at least 240px, at most
  `min(560px, 70vh)`), on purpose: its columns scroll on their own, which
  needs a height (the comment above that rule). The owner keeps it.
- **A table row's handle and +** (spec 022) sit in a 52px gutter cell ahead of
  the first column, inside the table.
- **Selection** of the block is BlockNote's node outline on the block (#532,
  #818), not the card's border, so it stays visible without the card.
- **The toolbar folds away** in a document until hovered or focused (#280),
  keyed on `.bn-db-embed:hover` and `:focus-within`. The block keeps its class.

## User Scenarios & Testing

### User Story 1: The database reads as part of the document (P1)

A person writes a document with a paragraph, an embedded database and another
paragraph. The database's title, view tabs and table line up with the
paragraphs' text, with no box around them and no empty band below the last row.

**Acceptance**:
1. Given an embedded table with one row, then the block ends just below its
   summary row: no border, no card background, no rounded corners.
2. The left edge of the title, of the first view tab and of the table's first
   column line up with the paragraph text above (within 2px), on desktop and
   phone widths, light and dark.
3. A table row's handle and + still show on hover, in the page margin to the
   left of the row, and still work.
4. The title still opens the database as a page, with "Open as page ↗" on
   hover (always shown on a touch screen).
5. The folded toolbar still appears on hover and on keyboard focus.
6. A selected block (clicked beside it, or by its block handle) is still
   visibly selected.

### User Story 2: A long database shows 25 rows, then "Show more" (P1)

**Acceptance**:
1. Given an embedded table, list or gallery whose view has more than 25 rows,
   then the first 25 are drawn and a "Show more" button follows them.
2. Each press shows 25 more; the button goes once every row is shown.
3. The table's summary row still counts and sums every row of the view, not
   the 25 drawn.
4. A row just added from the embed's ＋ New is shown even when it falls past
   the limit.
5. Switching to another view of the embed starts again at 25.
6. A database opened as its own page is unchanged: every row, no button.

### User Story 3: A board keeps its height (P2)

1. An embedded board keeps its capped height, and each column scrolls on its
   own as today. Only the card around it goes.

### Edge cases

- A tree (sub-items shown in a table) counts the rows as drawn, sub-items
  included, so a parent's children never push the button off.
- Calendar, timeline and chart draw their own size; they lose only the card
  and the side padding.
- A filter that leaves fewer than 26 rows shows no button.
- Reading a document someone shared read-only: the same 25 and Show more.

## Requirements

- **FR-001**: The database block draws no border, radius, card background or
  clipping of its own. It keeps the spacing between blocks.
- **FR-002**: Inside a document, the view's toolbar, table, list and gallery
  have no side padding of their own and no bottom padding, so their content
  lines up with the document's text and ends at its last row.
- **FR-003**: A table's row gutter (spec 022) hangs into the page margin to the
  left of the text column, so the grid lines up with the text.
- **FR-004**: The title is a plain line above the toolbar: no bottom rule and
  no padding at the sides; it still opens the database.
- **FR-005**: In a document, a table, list or gallery draws at most 25 rows
  until "Show more" is pressed; each press adds 25. Summaries count every row.
- **FR-006**: The limit is the person's own, for this visit: nothing is stored.
  It starts at 25 again for another view and on reload.
- **FR-007**: A board keeps its capped height (no change).
- **FR-008**: Nothing changes on a database page or in a peek.

## Decisions

- **Q1. Long databases** (owner, 2026-11-23, "accept your proposal"): 25 rows,
  then Show more; boards keep the capped height. Turned down: growing without
  limit (a 500-row database would push the rest of the document out of reach),
  and a fixed height with scrolling (what the owner asked to remove).
- **Q2. Gallery** is treated like a table and a list (not asked separately): a
  gallery of 300 cards is the same problem as a table of 300 rows, and one rule
  for every view that lists rows is easier to predict. Turned down: a gallery
  without a limit.
- **Q3. Show more adds 25** rather than showing everything: one press on a
  10,000-row database must not freeze the page (each row is a React row with
  its cells). Turned down: "Show all".
- **Q4. The title stays a plain heading line** (issue 910's recommendation):
  it still names the database and opens it. Turned down: dropping the title
  (two databases in one document could not be told apart).

## Success Criteria

- **SC-001**: An embedded one-row table's block ends within 16px of its summary
  row (was about 56px with the card's padding and border).
- **SC-002**: Text, title, first tab and first column start at the same x
  (±2px) at 1280px and 390px wide.
- **SC-003**: An embed of a 120-row table draws 25 rows; three presses of Show
  more draw 100, a fourth draws 120 and the button is gone.
- **SC-004**: The full-page table of the same database draws all 120.
