# Decisions

Decisions about how this fork is built and worked on, with the reasoning and the
options turned down. A decision explained only in a chat is lost when the chat is.
Newest first. A decision that changes gets a new entry pointing at the old one;
entries are not edited away.

---

## 2026-11-25 — How things look is checked, not only measured: mockups first, a look checklist on screenshots

- **What went wrong.** The owner, on a table on a phone: "Clearly the
  indentations and the way this looks is sucky". Every check passed: the
  ux-ui-audit measures contrast, tap sizes, focus and names, never whether a
  screen reads well. Spec 024's grouped table went ahead without the owner's
  yes on its mockups, and its group headers lined up with nothing (the name
  at 377 px between the handles at 365 and the first column at 393).
- **Decided (owner, "yes" to A + B):** a new layout gets mockups the owner
  approves before it is built (B), and every visible change is checked
  against a written look checklist on light and dark screenshots at desktop
  and phone width, which go into the pull request (A). The checklist is in
  `.claude/rules/frontend.md`, so every session reads it.
- **Turned down for now:** the design-critique skill on every pull request
  (C): more time per change for a second opinion that is still a model's
  taste; it can be added if A and B do not catch enough.
- **First use:** spec 024 PR 3. The group header's arrow moved into the rows'
  leading slot and its name to where the rows' content starts (one left edge,
  measured to the pixel); the header's line no longer juts out over the
  handle gutter; a group's totals lost their grey band and the grouping
  column's own total.

---

## 2026-11-24 — A dragged block held at the page's edge scrolls the page, on a frame loop (#810, spec 025)

- **The page scrolls itself while a block is held in a 72 px zone at its top
  or bottom**, faster with the square of the depth, from 1 px to 24 px a frame
  (about 1,400 px a second), at full speed over the header above the page.
  The page scrolls inside `.page-body`, where the browser's own drag scrolling
  does nothing (measured: 2 s held at the top, no scroll). Claude's default,
  not asked: a page is far longer than a table, so the row drag's fixed 14 px
  steps in 48 px would take over a minute across a long page and jump at the
  zone's border. Measured: 1,185 px to the top in under 2 s.
- **A frame loop, not a scroll per `dragover`.** A resting pointer gets a
  `dragover` only every 350 ms or so, which would scroll in jerks. The loop
  runs only while the pointer is in a zone and a block drag from this editor
  is on, and stops on drop, drag end and at the end of the page.
- **`scrollParent` is shared** by the block and row drags (`dragScroll.ts`);
  the board and column drags scroll their own inner boxes and keep theirs.
- **The "wrong block" seen while building this is not the scrolling.** A
  first move of 20 px or more after pressing a handle lets BlockNote's side
  menu switch to the block above before the drag starts, on a short page too:
  #984, fixed on its own.

---

## 2026-11-24 — A block chosen with the keys gets a thin ring beside its tint (#943)

- **A 2px ring in the focus colour, only when keys made the choice** (owner,
  2026-11-24: "perhaps a thin ring is acceptable", after #943 measured the
  tint at 1.16:1 against the page, under SC 1.4.11's 3:1 where it is the only
  sign). `inputModality.ts` keeps `data-input="keys" | "pointer"` on the
  page's root from the last pointer press or the last key that moves the
  caret (arrows, Tab, Home/End, Page Up/Down; not typing, not a ⌘/Ctrl chord,
  not a key inside a menu, so a block the mouse chose does not start ringing
  on ⌘C or ↓ in its menu), and `styles.css` draws
  the ring for `ProseMirror-selectednode` under `keys`. This amends the entry
  below ("no ring"): the mouse still gets none. Turned down: `:focus-visible`
  (a ProseMirror node selection is not focus), a stronger tint (it would be
  loud for the mouse too), and a box-shadow under the tint's see-through
  outline (it showed through, twice as thick, seen in the screenshot).

---

## 2026-11-24 — A chosen block is tinted, ⌘/ opens its menu, and the column gap belongs to the resize grip (#818, #820)

- **The selection is nigari's soft tint, shown only when a block is chosen**
  (owner, 2026-11-24: option 4, `--color-primary-subtle`; "There should not
  be a hover ring. The handle appearing is the affordance"). BlockNote's 4px
  blue outline on a selected node is replaced in `styles.css`; the block an
  open menu acts on is tinted by a `<style>` the menu writes (`MenuTint` in
  `slashIcons.tsx`), not by a class on the editor's DOM (that makes
  ProseMirror redraw the node, see ColumnsBlock). Turned down: a focus ring
  on click or keyboard selection (the owner declined it), a tint on hover.
- **⌘/ opens the block menu of the caret's line** (`blockMenuKey.ts`), the
  same chord as a table row's menu. BlockNote has no call for "show the side
  menu for this block"; its side-menu view is asked what it asks on a mouse
  move, with a point on the caret's line, and the handle it draws is clicked.
  Closing that menu gives the caret back. Turned down: a menu of our own
  rendered from the keyboard (a second copy of the block menu to keep in
  step).
- **The gap between columns belongs to the resize grip** (owner,
  2026-11-24: "ok, as long as the divider line … is higher", "Longer"). The
  grip now fills the gap and reaches 8px past the row; the handle of a line in
  a later column moves one gap further left, over the column before, so the
  pointer crosses the grip on its way to it. Over the grip, and on the handle,
  BlockNote's side menu keeps the block it shows (`holdOnHandleAndGrip` in
  `blockNoteGuards.ts`): BlockNote resolved the grip to the columns block and,
  from its right edge, to the last column. The same hold mends a phone bug
  found on the way: the mouse move a tap sends ahead of its click moved the
  menu to the last column, so a tap on a first column's handle opened another
  line's menu. Decided at the point BlockNote looks, not on the event's
  target: the two differ by a fraction of a pixel at the grip's edge.
  Turned down: the handle winning the gap (the owner chose the grip), and
  freezing the menu from `sideMenuHold.ts` on the grip (it decides on the
  event target, which disagreed with BlockNote at the edge, measured).
- **A sideways drop waits for a 0.4 s rest at its edge** (owner, 2026-11-24;
  `sidewaysDwell.ts`). Passing through shows the ordinary line, so a block
  dragged along a column no longer becomes a column. Applies to both
  sideways drops, a new column and a layout beside a block. No timer: the
  browser repeats dragover while the pointer rests. Turned down: a narrower
  edge (the edges are already 16px, and a narrower one is harder to hit on
  purpose).

---

## 2026-11-23 — The Umbrel store is updated only when the owner asks

Owner: "No I mean only build store version when I ask". Since 2026-11-12 every
release opened a store pull request and closed the one before it; with several
releases a day that was a pull request the owner did not want each time.
Replaces "Each release proposes itself to the Umbrel store" (2026-11-12).

- **The store job moved out of `release.yml` into `umbrel-store.yml`,
  started by hand** (`workflow_dispatch`), with an optional version that
  defaults to the latest release. A release no longer touches the store.
- **It still closes older open `nigari-<version>` store pull requests**
  (2026-11-12, "A newer Umbrel store pull request closes the older ones").
- **Without `UMBREL_STORE_TOKEN` the run now fails.** In a release a missing
  store update must not fail the release; here the store update is the whole
  point of the run, so a silent pass would mislead.
- Rejected: a version input on `release.yml`'s own `workflow_dispatch` (a
  manual release run would build and publish a new release too); a store pull
  request only every Nth release (still not when the owner asks).

---

## 2026-11-23 — BlockNote's pointer handling is corrected by swapping two plugin-view methods (#825, #826), and a drop commits the line it showed (#820)

- **#825 and #826 swap one method each on BlockNote's plugin views**
  (`web/src/blockNoteGuards.ts`): the table handles skip a database's table,
  and the side menu asks `editorOwner.ts` which editor is on top under the
  pointer. Both views call these methods through `this.<name>` and remove
  their listeners through the same property, so a swap is used on every call
  and cleaned up with the editor. The views are not exported; they are found
  among ProseMirror's `pluginViews` by the method they carry, and the
  development build warns when one is missing after a BlockNote upgrade
  (`block-guards.mjs` fails then too). Turned down: stopping the events
  before BlockNote sees them (`sideMenuHold.ts` records why: other code
  listens to the same mousemove, and Playwright no longer saw a drag start);
  stopping mousemove and mouseup at the database block (ProseMirror finishes a
  text selection on a mouseup that would then never come); rendering the peek
  before the page in the DOM so it wins BlockNote's tie (it changes the Tab
  order and what a screen reader reads first); a patched copy of BlockNote
  (nothing else is patched, and an upgrade would drop it silently).
- **A drop commits the target the line showed** (`blockDrop.ts`). It used to
  decide again at the drop from boxes read then. While a column opening was
  still closing, the layout sat 19px to the right, so a block dragged up a
  column's edge past a database dropped as a new column while the line showed
  it under the line above (measured). Only a drop with no dragover before it
  is decided at the drop. Turned down: waiting for the opening to settle
  before the drop (a drop cannot wait), and reading the boxes on every
  dragover (SC-003's per-step budget).

---

## 2026-11-23 — Every pull request says what the code graph showed, and a check holds it to that (#926)

- **A `## CodeGraph` section in every pull request, checked by its own
  workflow** (owner, 2026-11-23, "I guess"). #907, #920 and #922 were opened
  by project threads that clone after the session starts, so the SessionStart
  hook never built the graph and nothing said so. The rule existed only as
  instructions (AGENTS.md, `.claude/rules/codegraph.md`, handoff rule 36);
  "Derive, do not remember" asks for a check. Turned down: leaving it to
  instructions and to the coordinator reading each PR (it was missed three
  times), and a step in `ci.yml` (it does not run when only the description is
  edited, so a fixed description stays red until the next push).
- **Placeholder and near-empty sections fail too**: the template's comment, an
  empty section, "n/a", or under 30 characters. A change to docs only passes
  by saying so. The heading may read "CodeGraph" or "Code graph".
- **Bots and outside contributors are not asked**: a bot author, or any author
  GitHub does not mark as owner, member or collaborator (a first contribution
  like #821). They have no session and no graph; a red mark would only tell
  them about our tooling.
- **Not a required check yet.** A red mark shows on the pull request; merging
  is not blocked. Like the catalogue, it is made required in the ruleset after
  it has been right on a few pull requests.
- **The check runs main's copy of the script**, so a pull request cannot
  loosen the check that judges it; only the pull request that adds the script
  runs its own. A pull request with merge conflicts gets no mark at all (GitHub
  cannot build its merge ref), so a missing mark is not a pass.

## 2026-11-23 — A phone list scrolls sideways in one piece (#906)

- **On a phone a list row stays one line and the whole list scrolls
  sideways** (owner, 2026-11-23: "I'd rather not have reflow here"). Until
  then the properties wrapped onto a second line under the title below
  768px. Turned down: each row scrolling on its own (the owner agreed to the
  recommendation against it), because the properties drift apart from row to
  row and a swipe moves one line out of step with the rest.
- **The rows are CSS subgrids of one grid, on a phone only.** That is what
  keeps a property at the same place in every row. Desktop keeps the quiet
  flex row with no column grid. ListView renders the same cells in every
  row for it: an empty tags cell when some row has tags, and one wrapper per
  property, since a compact empty value renders nothing.
- **The title is as wide as the longest one, up to 60vw**, then cut off with
  an ellipsis; tracks are max-content, never squeezed. With `auto` or
  `fit-content` the grid squeezed the title and wrapped "To do" over two
  lines instead of scrolling.
- **The other phone layouts already scroll or are not rows**: the table and
  the board scroll sideways, the gallery is a grid of cards, and the only
  other phone reflow (an agent's skill card in settings) is a form, not a
  list of rows.
## 2026-11-23 — Spec 023: a database in a document fits its content, with no card

- **No card** (owner, 2026-11-23: "Just take the contents and put that on the
  page"). The block lost its border, radius and background, and inside a
  document the views lost the full page's 48px sides and 40px foot, which were
  the indent and the empty band in the owner's screenshot. Selection still
  shows: it is BlockNote's outline on the block, not the card's border.
- **25 rows, then Show more, by 25** (owner, "accept your proposal"), for a
  table, list and gallery. Turned down: no limit (a long database pushes the
  rest of the document out of reach) and a fixed height with scrolling (what
  was asked to go). Steps rather than "Show all": one press on a huge database
  must not draw every row at once. The gallery is included without being
  asked: the same problem, and one rule is easier to predict.
- **A row made from the embed is drawn after the 25** (New, a row's +,
  Duplicate; every one made in the visit), alone, not with every row before
  it: the first version drew all 121 rows of a 120-row table to reach the new
  one (found by `embed-fit.mjs`), and kept only the last one made (code
  review). The cut never splits a tree of sub-items, and a keyboard move steps
  only among the unbroken first rows, so it never jumps over rows not drawn
  yet.
- **A board keeps its capped height** (owner): its columns scroll on their own,
  which needs a height.
- **The row gutter hangs into the page margin** on a desktop, so the grid lines
  up with the text. On a phone the margin is 18px, too narrow for the 52px
  gutter: the table reaches the screen's edge and the grid starts 34px in.
  Turned down: hanging it out anyway (a tapped row's handle was off the
  screen), and dropping the handle in a document on a phone (the owner chose
  a handle on the tapped row for spec 022).

## 2026-11-23 — Spec 022 PR 2: the row's handle, +, menu and keys

- **A drag in a sorted view drops just the person's own sort** (owner,
  2026-11-23). The rows are drawn in their own order the moment the drag
  starts, so the line shows where the row really goes; the bar offers Reset
  and Save for everyone, and the shared sort stays. Turned down: removing the
  view's sort for everyone (one person's drag would change everybody's
  view), and refusing the drag in a sorted view (the commonest table is a
  sorted one).
- **On a phone the handle shows only on the row last tapped** (owner,
  2026-11-23, over the recommendation to show it always). The tap keeps its
  old meaning; hidden buttons take no touches, and the tap that shows them is
  not also a press on one.
- **Only top-level rows drag in a tree.** Sub-items come from a
  self-relation, and their order under a parent is the relation's array, not
  `position`: a drag would change nothing on screen. Their grip opens the
  menu only.
- **A board card's menu is the row's menu.** Drawn from `rowActions.ts`;
  "Open in new tab" moved under Open in › with the peeks. The card keeps Move
  to a column and leaves out Add row below and Edit property, each with its
  reason in `rowActionReasons.ts` (a card edits nothing in place).
- **The drop line is painted on the rows, not through React.** With it in
  state, a 300-row table was drawn again on every gap change: 37 ms of script
  a step in Chromium. Now React hears only the start and the end of a drag:
  0.5 ms script, 0.6 ms layout, 0.3 ms style a step.
- **The menu says "Edited {time}", not "by {name}"** as research R6 planned.
  A person's edit to a property is recorded nowhere with its author, so the
  newest activity entry named whoever commented on or created the row (code
  review). The time is the row's own `updated_at`, which a move leaves alone.
- **A sorted view's rows move only where the sort can go as the person's
  own** (code review). An embed without a place for personal state would
  have dropped the sort for everyone on the first move of a drag; there the
  rows do not move while the view is sorted.
- **`mod+/` and `mod+shift+↑/↓` work on the row holding the focus**, and are
  listed in the shortcut sheet whenever a table is on screen. On a layout
  where `/` needs Shift (German), `mod+/` is not reachable; the handle and the
  right-click still are.

---

## 2026-11-22 — Spec 022 PR 1: a row is placed by its neighbour, one order per database

- **One order per database** (owner, Q1). A row's place is its page's
  `position`, shared by every view without a sort. A view keeping its own
  order, with a "change everywhere" choice, is #870 (owner: later). Room is
  kept for it: both doors already accept a view id and check it against the
  database's views, which is where #870 will decide whose order a move writes.
- **By neighbour, not by number.** `POST /api/pages/{id}/place` and the MCP
  `update_page`/`create_page` take `after` or `before` a sibling's id; the
  server finds the row on the other side and writes the midpoint. Turned down:
  the browser sending a raw `position` (the sidebar's way), because next to a
  filter's hidden rows the browser cannot know the database's neighbours, and
  an agent has no positions at all. Turned down: renumbering every row on each
  move (one write per row). Ties and gaps too small are renumbered 1…n inside
  the same transaction, the rare path.
- **A move is not an edit.** `updated_at` stays, so "last edited" does not
  change because a row was dragged.
- **One activity entry per act.** The REST door logs `reorder_page`; an
  agent's call is logged by `mcpCall` like every tool call. `placePage`
  logging too would have recorded each agent move twice.
- **The + and Duplicate land next to their row.** Create checks the anchor
  before inserting, so a refused anchor leaves no page behind; a duplicated
  database row goes right after its source by both doors.
- **No new index** (constitution VII). 10,000 rows: p95 6.9 ms, inside the
  8 ms write budget, once the neighbour read became two short reads instead
  of reading every sibling (25.5 ms).
- **Ties are broken by the id everywhere.** Two rows with the same position
  and created_at (a copied database) were in the table's order only by chance;
  every query that shows rows now ends on the id, as the move does, so "next
  to" on the server is "next to" on the screen (found by review).
- **Created means created.** If the anchor goes to the trash between the
  check and the placing, the new row stays at the end instead of the request
  failing after the row exists (a retry would make a second one). A page
  placed as it is created or duplicated announces only `page.created`.
- **"Move to" another database** is not part of this (owner, Q2): #869.

---

## 2026-11-21 — Spec 021 PR 2: a block dragged sideways makes a column, up to four

- **Where a sideways drop is offered** (owner, Q1 and Q2). At the left or right
  edge of a column a dragged block opens a new column there. A row of two opens
  one at any edge; a row of three only at the right edge of its last column;
  a row of four takes no more. At the left or right edge of an ordinary
  top-level block the two go side by side in a new two-column layout, as in
  Notion. Not beside a list item (its edge belongs to the bullet), not beside
  a block inside a column, and not with a whole layout dragged.
- **Not under 480px of editor width** (FR-010). The editor keeps columns side
  by side on a phone, so a column there would be a few letters wide; only
  print and the shared page stack them. Turned down: offering it and stacking
  the result, which would show something other than what was drawn.
- **The opening is drawn through the layout's own `<style>`** (R3): an empty
  grid track grows from 0 to the new column's width in 150 ms, and not at all
  under reduced motion. The drop line stands in the empty track.
- **Widths** (owner, Q3, plus two defaults). The largest group of columns
  within 1% of each other shares its room with the new one; the others keep
  theirs (40/30/30 → 40/20/20/20, 50/50 → 33/33/34). With no two alike, all
  shrink in proportion. A column under 15% after either is not drawn that way:
  everything shrinks in proportion, and if one is still under 15%, the columns
  become equal. Whole percents summing to 100, leftover points to the largest
  remainders. A column emptied by a drag closes, and its room goes to its
  neighbours in proportion; a layout left with one column unwraps back into
  plain blocks, so no one-column layout is left behind.
- **Four columns everywhere, not only in the editor** (R5): the shared page,
  the HTML export, Markdown import (a fifth section joins the fourth) and the
  MCP tools read 2 to 4. An older version reads a count of 4 as 2 and wraps the
  extra columns below, losing nothing: that goes in the release notes.
- **A drop is all or nothing** (found by review). The dragged blocks are taken
  out first and the layouts they leave are closed, so a drop that then finds
  no place, such as a column dropped just above its own layout which the drag
  has just unwrapped, lost the blocks. The drop above an unwrapped layout now
  lands above the blocks that replaced it, and any drop that still finds no
  place throws inside BlockNote's `transact`, which then dispatches nothing.
- **The left margin reorders, it does not make columns** (found by review).
  The left edge zone starts at the block's own left edge, because the margin
  left of it is where the drag handle is: a block moved straight down from its
  handle offered "side by side" on every row. The right edge stays open past
  the edge; nothing is dragged from there.
- **More than four is drawn as four** by the server's readers, as the editor
  draws it; they had drawn 2 (found by review).
- **Safari was not tried.** Grid track transitions are supported there from
  18; the browser tests run in Chromium only.

## 2026-11-21 — Spec 021 PR 1: nigari decides where a dragged block lands, and draws the line itself; the column layouts move to the block menu

- **One decision for the line and the drop** (`dropTarget.ts`, spec 021 R1/R2;
  #809, #824). Both come from the boxes of the lines on the page: before the
  first line whose middle is below the pointer, or after the last one; over a
  columns layout, inside the nearest column. A drop on a column's first line
  makes the block that column's new first line instead of a new column.
- **The line is nigari's, not BlockNote's, for a block from the handle.**
  Turned down: handing the decision to BlockNote through `computeDropPosition`
  (the plan's first idea). BlockNote draws its line from a ProseMirror position,
  and the position before a column's first block reads as "after the previous
  column", so the line still showed in the column to the left however right
  the position was. BlockNote's line stays for text dragged inside a line and
  for files.
- **The drop is taken over in a capture listener**, not ProseMirror's
  `handleDrop` prop: ProseMirror asks `handleDrop` only when the pointer is over
  a text position and gives up silently elsewhere (the gap between two
  columns), where the line had shown a spot. The block moves through
  BlockNote's block calls, so its id, comments and children go with it. A copy
  (Alt, or Ctrl off a Mac) and a block from another editor stay ProseMirror's:
  only the editor the drag started in takes it over, because BlockNote hands
  the dragged blocks to every editor on the page (found by review). A layout
  inside a column is one line to the decision, and a layout is never dropped
  into another layout's column; both would make a column by accident (#824).
- **The layout bar goes; the layouts move to the block menu.** The bar took
  a line of its own above every columns block, 23px measured, empty unless
  hovered. The owner asked to "make it overlap … instead of having it take up
  space", so it was first built floating over the block's top right corner.
  Shown, it covered the end of the line above, and a tap there hit a preset
  (found by review). The owner's answer: "Perhaps just remove it and add the
  functions in the options menu for the columns block". So the bar is
  removed, and the five layouts are a "Column layout" submenu of the block
  menu (built like BlockNote's own Colour item, with its own icon). A columns
  block has no handle of its own (BlockNote's side menu picks the column's
  first block), so the item shows in the menu of every block inside a layout
  and changes the nearest layout. The block menu opens only under a pointer
  or a tap, so the layouts are also / menu entries while the caret is in a
  layout: the keyboard reached the bar with Tab (found by review). A tap on a
  phone shows the handle (tested). Turned down: the floating bar; a bar in
  the page's right margin (a phone has none).
---

## 2026-11-21 — The starter page carries the nigari mark; merged branches stay deleted

- **Starter page icon** (#815, owner: "replace the salt icon on the default
  start page"): a new instance's "Welcome to nigari" now has nigari's mark
  (`/logo.svg`, an image icon) instead of the 🧂 emoji from salt.md, and its
  first line no longer ends in 🧂. The admin's test mail lost its 🧂 too.
  Claude's default, stated in the pull request: the mark rather than another
  emoji or no icon, since it is the one image that says nigari. Existing
  instances keep their starter page as it is: it is the person's page now.
  Found by review and fixed with it: a downloaded HTML export pointed the
  icon at `file:///logo.svg` (now the instance's address, as links are);
  the Markdown heading printed `/logo.svg` as text (#828, folded in because
  this change put it on every new instance: only an emoji goes in a
  heading); `logo.svg` joins the files sent with `no-cache`.
- **The favicon itself was already the new mark** in every file since v2.1.18
  (2026-11-09). An instance on an older release, Safari's own icon cache, or
  the Umbrel store's tile icon (in the store repository) can still show the
  old one; findings on #815.
- **Merged branches are not recreated** (owner, 2026-11-21: "Yes"). The
  handoff's rule 9 had each merged branch fast-forwarded back; it only
  refilled the branch list. The steward skill says so.

---

## 2026-11-20 — Dragging blocks, first part (#808, #809 line, #811)

Research in #812 (measured, with the causes). What this part decides:

- **The handle holds still while the pointer is on it** (#808), through
  BlockNote's own `freezeMenu`/`unfreezeMenu`, thrown on a pointermove onto
  the side menu and released on the first move off it (`sideMenuHold.ts`).
  The cause was nigari's own columns block: BlockNote's paid one has a
  hit-test fix ours does not get. Turned down, each tried and measured:
  widening the columns' hover area (BlockNote's right-edge check then
  landed in the next column); swallowing the mousemove (Playwright, and
  any other listener, no longer saw a drag start); holding on
  pointerover/pointerout (a stray pointerover after every drop froze the
  handle again). Bringing back `xl-multi-column` stays rejected.
  After `/code-review`: each editor holds only its own handle (a peek beside
  a document is a second editor, and freezing its menu threw); while the
  block menu is open the hold lets BlockNote own the freeze and picks it up
  again afterwards; a finger is left alone (a touch sends no move to release
  it). The decision is a pure function with `check-sidemenuhold.mjs`.
- **Handle size B** (owner, from a picture of A/B/C): 20×24 buttons, an
  18px icon, in the muted text colour (4.88:1 light, 4.99:1 dark;
  BlockNote's was 1.49:1 light). Tokens `editor.side-menu.*`. The colour
  is set on the two icons only, not through BlockNote's
  `--bn-colors-side-menu`, which also colours the empty-line placeholder,
  the nesting guides and the table handles (found by review).
- **The drop line is the focus colour, 2px** (owner: "All ok" to the
  picture). BlockNote's `#ddeeff` was 1.13:1 on the light page. The colour is
  `var(--color-focus)` passed to BlockNote directly, because a component
  token that aliases a themed role is flattened to its light value by the
  token build.
- **#810 (slow in Safari) stays open.** Per drag step under 2 ms in WebKit
  and Chromium, with or without a database view and with or without the
  `:has()` rules; not reproduced. The owner tries again in Safari with the
  visible line; an unseen line can feel like a stuck drag.
- **The wiki said a sideways drop makes columns.** It never did in nigari
  (that was the paid block); corrected, with #824 and the line/drop mismatch
  named as not right yet.

---

## 2026-11-19 — Spec 020 PR 4: what stays a raw button, and how the check knows

- **Only BlockNote's own controls are marked.** The 8 buttons `blocks.tsx`
  renders inside BlockNote blocks carry `button-ok: <reason>`. The marker
  goes in a comment on the button's line or the line above, and
  `check-tokens.mjs` counts it apart (`markedButtons`, budget 8). A marker
  without a reason fails. A marker in a string, a marker that would also
  excuse the next button, and `token-ok` on a button do not count (found
  by review). Turned down: marking the leftovers inside cards and rows
  (the owner's Q4, "A").
- **The other 80 wait for #763**, listed there by file and line and
  grouped by kind: cards, tree and list rows, result rows, pickers and
  property cells, chips, tabs and bars, controls on an image. Four more
  are invisible to the check because of #805 (`accept="image/*"` read as a
  comment). Fixing that raises the measured count, so it is the owner's
  call on a check.
- **Tooltips go above every layer** (`layer.tooltip` 1000 → 1300): the
  anchored icon picker sits on `top` (1200) and hid its own trash
  button's tooltip.
- **The page's Emoji / Cover / Description** are low, small Buttons in the
  button typeface. Before, they were soft grey chips; Claude's default.

---

## 2026-11-19 — Spec 020 PR 3: Tabs, ToggleGroup, and the role choice's rank colours

- **The role choice keeps its rank colours** (owner, option **1**, after a
  picture of both). The workspace role row (No access / Viewer / Member /
  Admin) fills the chosen role in its level's colour, grey to amber as the
  role reaches further. It is a `ToggleGroup` whose items take `rank`, and
  the colours are spec 019 roles (`color.rank.*` on the stone, blue, green
  and orange palettes, white text checked by the token build). Turned down:
  the one tint for every choice (2), which showed "No access" in raspberry,
  the opposite of what it means; leaving the row hand-built for #763 (3).
- **Tabs and ToggleGroup own their arrow keys** (`data-nav-skip`). nav.ts's
  way in took ArrowRight from the settings tabs and moved focus behind the
  dialog: it does not count a `ui/Dialog` as open. That wider problem is
  #802; the parts opt out with the attribute nav.ts already reads.
- **The library, the template gallery and the icon picker load on demand.**
  The new parts put the main chunk 4.3 KB over its cap; loading three
  screens that open on request brought it 12 KB under. Turned down: raising
  the cap (the owner's call, rule 33).
- **Not moved, with the reason in #763:** a database's view tabs (per-tab
  double-click and right-click, and Add view in the same row: `ui/Tabs`
  would need per-tab events and a trailing slot for one row) and how an
  agent connects (two-line choice cards, not a row of buttons).
- **Beyond the plan's list:** the notes list's All / Untagged (Tabs) and the
  icon picker's Lucide / Material (ToggleGroup) are the same kinds of row and
  moved too. The login switch was on the plan's Tabs list, but it is one
  button: a link-emphasis `Button`.

---

## 2026-11-18 — Spec 020 PR 2: where the class buttons' mapping did not say

Plan R1 maps `btn`, `btn primary`, `btn danger` and `btn dialog-close` onto
the Button's properties. Moving every class-built button turned up cases it
did not cover. Claude's defaults, each one property value to change:

- **A link that looks like a button** (sign-in, the OAuth providers, the
  calendar link, a file download) uses a new `href` on `Button`, which
  renders a real `<a>`. Turned down: Base UI's `render={<a/>}` with
  `nativeButton={false}`, which puts `role="button"` on the link, so a screen
  reader calls a link a button; and leaving the links on the old `.btn`
  rules, which would have kept them alive.
- **A toolbar button that shows something is set** (Filter, Sort, Group) is
  medium in the primary tone. Turned down: `pressed`, which makes it a toggle
  button for a screen reader while it opens a menu.
- **The page's toggles** (comments, structure, favourite, private) are
  `pressed`, with a name that does not change. Turned down: names that flip
  with the state ("Remove from favorites") beside `aria-pressed`, which the
  review found read as two opposite states. Favourite and private lose the
  gold they had borrowed; the filled star and the closed lock still show the
  state. Share opens a panel, so a live link is the primary tone, not pressed.
- **New ▾** stays one shape: two Buttons whose group squares the inner corners
  and draws the hairline. Turned down: a split-button property on `Button`
  for one place.
- **The Connect buttons of mail sign-in** lost their faded look while OAuth is
  not set up: they are ordinary buttons whose click says what to set up first,
  now reachable by keyboard. Turned down: `disabled`, which would swallow the
  click that explains why.
- **A class that hides a Button** (`.menu-btn`, `.topbar-wide-only`,
  `.collapse-btn`) names `.ui-button` too, because `Button.css` loads after
  `styles.css` and its `display` won otherwise (found by review).

---

## 2026-11-17 — Spec 019: the palette step table, as built

Building spec 019 changed its R1 table in three places, each measured
against today's colours (before/after of every colour variable):

- **Step 0 (white, f = +1)** added: cards and the dark pill's hover are pure
  white, which no fraction below 1 gives.
- **Step 100 at +0.91** instead of +0.905: at +0.905 the light sidebar came out
  a hair darker and light muted text fell to 4.48:1 on it (the build's
  contrast check refused it). The measured fraction of today's sidebar is
  +0.907, so +0.91 fits as well.
- **Step 450 (+0.2)** added: every dark chart colour sits at +0.2 from its
  light one. With only 400 and 500 the nearest step moved each by 0.08 in
  lightness (visible); 450 fits all thirteen within 0.001.

Light accent and danger are exactly as before (each is its palette's 500);
every interface colour moved by at most 0.015 in lightness, chart shades by
at most 0.022.

Two choices beyond the plan:

- **The neutral roles keep their names** (`color.surface.*`, `color.text.*`,
  `color.border.*`, `color.hover`, `color.active`, `color.pill.*`): they were
  already named by role, so they were pointed at `stone`/`slate` rather than
  given new names with the old ones as aliases. Accent and danger got new
  role names (`primary`, `destructive`) because those are what spec 020
  builds on; `--accent`, `--danger` and `color.accent.*` are aliases.
- **The chart backgrounds** (only the frame of Save chart as) get four soft
  palettes of their own, `frame-orange`, `frame-blue`, `frame-red` and
  `frame-yellow`, each with today's frame's hue and chroma (0.019–0.04), at
  100 (light) and 850 (dark). The owner chose this (**B**, 2026-11-18) after
  a side-by-side picture: the dark frames match today's within a few units
  per channel. Turned down: **A**, the nearest step of the chart hue
  palettes, which turned the dark frames deep brown, navy and maroon (a
  step keeps its palette's chroma); keeping them as hex (no hex in the role
  tier, FR-003).

A translucent role names its step and an opacity
(`io.github.neatlittlemacapps.nigari.alpha`), because DTCG cannot put an alpha
on an alias. Turned down: writing those colours out again as hex (they would
no longer follow their palette).

---

## 2026-11-17 — Spec 018: a view still named after its layout takes the new name

The UX audit of spec 018 found tabs reading "Table" over a calendar, and a
second "Board" beside the board, because FR-002 kept the name. The owner
chose **A**: a view whose name is still its layout's default takes the new
layout's name; a name somebody chose stays. "Default" is either spelling a
new view gets: the capitalised type set_view gives ("Board") or the
interface's name in the person's language ("Bord" in Dutch). One rule in
switchViewLayout and switchLayout, held by the shared cases.

Turned down: **B**, always keeping the name as FR-002 said (no work, the
misleading tabs stay); renaming always (a chosen name such as "Open tasks"
would be lost).

Also from that audit, left to their own issues: every toast looking like an
error, with dark-mode text at 2.57:1 (#744), and the confirm dialog taking
no focus (#745).

---

## 2026-11-17 — Spec 017's speed target (SC-003) becomes "no noticeable delay"

The owner chose **A**: SC-003 no longer asks for the comment list to stay
within 10% of its time before reactions, but for no delay a person can
notice. Measured on 200 comments (`BenchmarkPageComments`): 0.46 ms before;
after, 0.58 ms with no reactions and 1.8 ms with three on each. The cost is
reading one row per reaction; the network round trip around it takes far
longer.

Turned down:
- **B, a stored per-comment summary of the reactions** (who, with what),
  kept up to date on every react. A plain count would not do: the chips
  need the names and whether you reacted. It would save about 1 ms at the
  price of the same facts stored twice, which can drift apart.
- **C, keeping 10% as written**, a target the code does not meet.
- **Loading reactions after the comments, with a skeleton**: a second round
  trip makes the total longer, and a skeleton shown for a few ms reads as
  flicker. Worth it only for threads of thousands, where loading the list in
  batches would be its own issue.

---

## 2026-11-16 — Spec 017: comment edits and reactions, where the plan left room

Choices made while building spec 017, beyond research R1–R7:

- **A read gate as well as the three the plan named.** `commentForRead`
  (`canRead` and `credentialMayEnter` on the comment's own page) serves
  `history` and the versions route, and the write gate builds on it, so a
  caller who may not read the page gets "comment not found" before any
  question of writing. Turned down: checking read rights in each handler.
- **`comments` actions are writes unless they are `list` or `history`**,
  an unknown action word included. Turned down: listing the writing actions
  (the old way), where a new action left off the list would be open to a
  read-only token.
- **The list stays two queries.** Measured on 200 comments
  (`BenchmarkPageComments`, this container): no reactions 0.46 ms before,
  0.58 ms after; three reactions on each 1.8 ms. Folding the reactions into
  the comment query as a JSON column per comment measured the same with
  reactions and 0.69 ms without, so it was dropped. SC-003's "within 10%"
  is not met with reactions; the absolute cost stays under 2 ms. Whether to
  keep that target is for the owner.
- **An edit over MCP writes one log entry**, `comment.edit`, like the REST
  route, and not also the generic `comments` entry every MCP write gets.
- **Viewers see no Resolved, Edit or Add reaction**, and see reaction chips
  they cannot press. The panel now takes `canWrite`. Before, a Viewer was
  shown Resolved and the action failed silently.
- **REST takes reaction keys only; MCP takes the key or the emoji.** As R2
  planned; the emoji matches with or without its variation selector.

---

## 2026-11-15 — Spec 016 PR 1: how a status is built where the plan left room

Choices made while building the status property, beyond research R1–R11:

- **A new row's To-do default is filled after the door stores the row**
  (`fillStatusDefaults`), not merged into the props before the insert as R4
  planned. The doors merge a template, a view's pin and the caller's values
  in different orders; filling only what is still empty afterwards lets all
  three win without each door having to order the merge the same way.
  Turned down: the planned `withStatusDefaults(schema, props)` before the
  insert (it would have to sit at a different point in each door, and a
  template's value is only known after the copy).
- **A multi-select converted to a status keeps its rows as stored**
  (`["id"]`), with every reader taking the first value. Turned down:
  rewriting the rows to a scalar at conversion. Filters already match an
  array element like a scalar, and the type change stays non-destructive
  (Q23), as every other type change is.
- **An option sent without a group keeps the group it has.** Only a status
  whose options carry no group at all (new, or converted) is guessed and
  gets its empty groups filled. Turned down: guessing every option without a
  group, which would move an agent's renamed "Blocked" back to To-do.
- **Rows without a status sort last in both directions**, like a select's
  empty rows. Turned down: one CASE sorted as a whole, which put them first
  when descending.
- **A conversion refused because rows hold two values has its own code**,
  `status_rows_hold_several`, with the row count. Turned down: sharing
  `invalid_status_options`, whose sentence (groups, names) never mentions the
  rows.

---

## 2026-11-14 — One session at a time; the handoff is a pinned issue edited in place

Two sessions acted as lead at once (a scheduled check-in woke an old one) and
their handoff pull requests collided (#638 against a drafted 23rd file). The
handoff file had also grown to ~140 corrections plus live state (branches,
open pull requests) that GitHub tells better and that went stale.

- **One session works at a time, and the handoff is a pinned GitHub issue
  ([#643](https://github.com/neatlittlemacapps/nigari/issues/643)) edited in
  place**, holding only what GitHub cannot tell: rules, preferences,
  corrections, half-made decisions. Live state is read at session start
  (owner: "A").
- Turned down: **B**, a slimmer handoff file with one session (still a file
  changed through pull requests, so it still collides and goes stale, and
  each handoff is a release); **C**, only one session, keeping the file (the
  file is the part that grew and drifted).
- `docs/handoffs/handoff-nigari.md` is removed (owner: "Remove"); git history
  keeps it. `handoff-saltmd.md` stays as the pre-rename history.
  Rule 31's "the handoff file goes to `main`" no longer applies.

---

## 2026-11-13 — Each kind of content lists its actions once; menus are built from the list

The owner asked whether the code graph keeps track of which actions belong to
which kind of content, to avoid menus growing wild. It does not: it shows
where menus are and which functions they hold, not what belongs in them, and
`check-menu-icons.mjs` only keeps one icon per function. The same content
already offers different actions in different places: a page's ⋯ and its
sidebar row name 12 and 11 functions and share 2 (Move to trash, Export
Markdown); a property has a column-heading menu (move, hide), the Edit
properties dialog (rename, type, delete), and spec 015 was about to add a
third set.

- **One action list per kind of content in `web/src/actions/`**; every menu
  acting on that content is built from it, and a place that leaves an action
  out says why in the list (owner: "B"). Properties first, in spec 015 (the
  row's page and the table's column heading); pages, rows, views and the
  rest in a later spec (#604).
- **Actions are grouped by what they relate to; a group of more than 3
  related actions gets its own submenu**, a group of 3 or fewer stays on the
  first level behind a separator, and a choice among values is a submenu
  (owner: "not all ends up on one big level 1", then "I would not limit to
  7 specifically. I would try to assess the number of related items. If
  those go beyond 3 for example, they might earn their own menu.").
- **Guidelines**: a **Content actions** row in `.specify/memory/surfaces.md`
  (every later plan answers it) and a paragraph under Menus in
  `.claude/rules/frontend.md`; `check-content-actions.mjs` comes with spec
  015's build.
- **Turned down**: a spec for every content type before #582 (A: #582 waits
  on a large refactor of menus that work); only a registry row and a report
  of differences (C: writes the problem down without fixing it); a first
  level of at most 7 entries (Claude's first proposal, replaced by the
  owner: the size of a group decides, not a cap); a submenu for every pair
  of actions (two clicks for common ones).

---

## 2026-11-13 — The Docker and Podman volume is called `nigari-data`

Reverses one line of the 2026-10-29 rename entry below ("The compose and Quadlet
volume keeps the name `salt-data`"). The owner read `-v salt-data:/data` in the
README and asked why the product's own install command still said salt (#577).
An explanation under the command did not stop the question; a new user would
ask the same.

- **`nigari-data` in the README, the wiki, `docker-compose.yml` and
  `deploy/nigari.container`** (owner: option B). The wiki's self-hosting page
  gains "An install that uses `salt-data`": keep the old name in your own
  command, or copy the data across once (stop, copy, check, then remove the old
  volume), with the Compose prefix (`nigari_salt-data`) spelled out, and what
  to do after starting on an empty volume by mistake (remove it before
  copying, so the empty database's files are not mixed with yours).
- **The copy was tried, not assumed** (2026-11-13, image 2.1.28): an account
  made on `salt-data`, the documented stop and `alpine cp -a`, then nigari on
  `nigari-data` signs that account in (200), files still owned by uid 1000.
- **The cost, accepted**: an install that reruns the new compose or Quadlet
  file without reading the note starts on an empty workspace. Its data is
  untouched in `salt-data`. Installs made from the README since v2.0.0 are the
  ones affected; Umbrel and the binary installs use no named volume.
- **Turned down**: keeping `salt-data` (A: the question keeps coming); renaming
  only the typed `docker run` lines and keeping it in the compose and Quadlet
  files (C: "salt" stays in the files people read); compose's `name: salt-data`
  under a new key (turned down in spec 011 too: it still names the old volume);
  having nigari find the old volume itself (a container cannot see other
  volumes).

---

## 2026-11-14 — A personal view edit that the browser fails to send is sent again on the next open (#594)

A filter or sort edit waits 400 ms before it is sent, and when the page leaves
first it is sent with `keepalive`. Measured on `main`: after a reload straight
after an edit the server received no request at all in 7 of 14 reloads (its own
log showed none), so the person's own filter came back as the shared one.

- **The edit is also written to the browser's storage when the page leaves**
  (`nigari-view-outbox`, `viewStateOutbox.ts`) and the next open of that
  database in this browser shows it and sends it again; sending the same state
  twice changes nothing, so the entry does not need to know whether the first
  request arrived. An entry lives one minute: it is for the reload or the link
  that follows the edit, and a person who signs in as someone else on the same
  browser must not hand them a filter.
- Rejected: `navigator.sendBeacon` (POST only, and the state's route is PUT);
  sending every keystroke at once (a request per character of a filter
  value); a longer wait before leaving (the person feels it); fixing it in the
  browser's networking (not ours).
- A regression test makes the loss happen in the page (`personal-view-outbox.mjs`)
  because a request made while the page unloads is not visible to the test
  driver.

---

## 2026-11-12 — A newer Umbrel store pull request closes the older ones

The release job opens one pull request per release on `yokogaki-umbrel`, and
left an older one open "until the owner merges or closes it". All of them
change the same three lines (version, release notes, image pin), so merging
one made every other open one conflict: the store's #3 (2.1.25) could not be
merged after #2 (2.1.24) was.

- **The job closes every other open `nigari-<version>` pull request on the
  store when it opens its own**, with a comment pointing at the new one.
  Their branches are left alone. The newest always carries the latest version,
  so nothing is lost by closing the older ones.
- Rejected: one standing branch rewritten each release (a force-push to a
  branch the owner may be reviewing, and the pull request's history lost);
  rebasing the older ones (the same three lines, so a rebase is a rewrite);
  leaving it to the owner to merge in order (the owner merges from a phone,
  and the next release was already open by then).
- Only branches named `nigari-` and a version are touched, so a pull request
  someone else opens on the store is never closed.

---

## 2026-11-12 — A database in a document: how its views are kept and shown (spec 014 PRs 2 and 3)

The owner's model (2026-11-03) is in `specs/014-embed-own-views/`; these are
the choices made while building it that the spec leaves open.

- **The interface holds the embed's views as the block's `local` string and
  asks `embedViews.ts` for the next one.** One place knows what an old embed
  becomes: opening another tab of an old embed rewrites only its open view,
  and the first change to a view writes the new shape. Rejected: converting
  when a document opens (opening would write to the document and show up in
  its history); a separate `viewSource.ts` as the plan named it (there is no
  second source to hide once the list is one string; `saveViews` in
  `CollectionView.tsx` is the one switch).
- **The views lock is the database's and does not touch an embed.** An
  embed's views are the document's, and the server's `set_view` with
  `embed_id` never calls `checkViewsUnlocked`; the interface follows it, so
  a locked database shows no lock marker in a document. Rejected: letting
  the lock reach embeds (a person who may edit the document could not lay
  out their own page because someone locked a database elsewhere).
- **A new row in an embed's view sends the view's finished filters, not a
  view id.** The server has no such view; the filters travel and it pins
  from them (`pinsForFilters`). Unfinished conditions stay out, as in the
  rows query, or a half-typed one would make the row "not match".
- **The tab strip of an embed scrolls inside itself above phone width, and
  its ＋ stays at its end.** From four views on the toolbar ran past the
  embed and took New with it (found by `ux-ui-audit`, measured 45px outside
  a 788px embed). Rejected: wrapping the toolbar to a second row (it would
  push the text below the embed down every time a view is added).
- **A copy of a database view is named "Copy of {name}"** (owner,
  2026-11-12, asked because a copy kept its name and an embed could show two
  tabs called "Table"). The interface uses the existing "Copy of {name}"
  string; an agent's `copy_of` does the same unless it passes a name. An
  embed made by `embed_database` with a `view_id` keeps the view's own name:
  it is the embed's only view, not a second one beside the original.

---

## 2026-11-12 — Each release proposes itself to the Umbrel store

Owner: "2", choosing automatic over moving the pin by hand. The store pinned
2.1.15 while `main` had released 2.1.21; nothing moved it, and by hand it was
forgotten.

- **A job after the release opens a pull request on `yokogaki-umbrel`** with
  the new version, release-notes link and index digest. The owner merges it,
  so what reaches Umbrels is still the owner's call. Rejected: pushing to the
  store's `main` directly (every daily release would reach every Umbrel
  untested); moving the pin by hand (forgotten, as shown).
- **nigari's own `umbrel/` copy keeps its first pin.** A commit to `main` is a
  release; a release that committed the new pin to `main` would release
  again, forever. Rejected: a `[skip release]` marker (one more rule in the
  release workflow, for a copy nobody installs from).
- **It needs a token the owner makes** (`UMBREL_STORE_TOKEN`, fine-grained,
  that one repository). Without it the job passes and says so: a missing
  store update must not mark a release failed.

---

## 2026-11-12 — One branch per pull request; no work that collides with an open one

Owner: "ok", after asking "why do we keep working on the same branch. Is that
normal?" and after the conflict between #586 and #587.

- **One branch per pull request, named after the work.** Since handoff #14
  every cloud session was handed `claude/handoff-14` and reused it for every
  pull request, resetting it to `main` after each merge. The name said
  nothing, and a new job started while a pull request was open would pile
  onto it. The owner allowed, once for all sessions, a new branch per pull
  request even when a session is handed a fixed one. Rejected: the owner
  starting every session on a fresh branch (more work for the owner, same
  result).
- **The handoff file goes to `main`.** It lived only on the work branch.
- **A suggested task names the open pull request it must wait for**, and
  **before a pull request is offered, sessions and open pull requests are
  checked for the same files.** #586 (BoardView.tsx out of CollectionView.tsx)
  was a task Claude suggested without "start after #587 merges"; another
  session built it, it merged first, and #587's lanes were ported by hand.
  Rejected: a lock file or a label per file (nobody would keep it true);
  forbidding refactors while a feature is open (the refactor was wanted).

Written into `.claude/skills/steward/SKILL.md`.

---

## 2026-11-09 — nigari's own mark and icons, from one folder of artwork (#322)

The owner sent the artwork on 2026-11-06: the mark, a light and a dark tile,
and an animation. Every logo and icon is now drawn from `brand/`.

- **The mark is flattened.** As drawn it coloured the overlap with
  `mix-blend-mode`; a blend mixes with whatever is behind the SVG, and on a
  dark page the front shape turned black (rendered and checked in Chromium;
  the owner's dark tile showed it too). The copies draw three plain shapes in
  the colours the blend gave on white (`#A98AFB`, `#6542E8`, `#391FA2`).
  Owner: "yes". Rejected: a second, dark-mode mark (one flattened mark reads
  on both); `isolation: isolate` around the blend (fixes it in Chromium, but
  leaves every copy depending on a renderer that supports blending; three
  plain shapes depend on nothing).
- **The mark keeps its colours in both themes.** The old mark was one colour
  that took the text colour around it; the new one is drawn in colour, as the
  owner drew it.
- **Home-screen tile: the owner's lilac square**, replacing the white tile.
  Still a plain square: iOS and Android round it themselves.
- **Desktop icon: the same squares on Apple's 824 px grid**, rounded and with
  a shadow, because macOS does not round or shrink an app icon.
- **One script renders every raster** (`build-app-icons.mjs`, now including
  `favicon.ico` and the desktop PNGs); the old `desktop/build/*.svg` sources
  and the unused `desktop/icon-dark.png` are gone.
- **`check-brand.mjs`** finds every inline copy of the mark itself (six: the
  React logo, `logo.svg`, `favicon.svg`, the shared-page header, the desktop
  sign-in pages, the desktop connect screen), compares each with
  `brand/mark.svg`, requires the overlap to be clipped, refuses a blend mode
  and refuses any leftover of the old mark. A first version compared a fixed
  list of four and passed while the desktop pages still drew the old mark
  (found by `/code-review`).
- **The manifest's splash colour is the tile's lilac** (`background_color`),
  so an Android splash shows the icon on its own colour; `theme_color` is the
  light sidebar colour, as in `index.html`, replacing the old green.
- **The animation is kept, not used.** The owner wants it on the empty screen
  later, with a set of situational icons still to come; the Welcome page and
  its 🧂 icon are left alone.
- **The accent colour stays green.** Changing the product's colours to match
  the mark is a separate decision for the owner, not part of #322.

---

## 2026-11-06 — Specs and plans hold decisions, not facts the code graph regenerates

**Decision** (owner: "I just want to avoid creating a huge blob of data to wade
through", then "add the rule"): constitution IV, "Derive from code", now covers
specs and plans (version 1.3.0). They record what the code cannot tell — intent,
requirements, decisions with the options turned down, numbers measured at the
time — and do not copy what the code graph or the code produce on demand: file
lists, caller inventories, symbol counts, pasted query output, code bodies. The
plan's CodeGraph section keeps one line per query with its conclusion. A plan
artifact with nothing of its own (`research.md` without a decision,
`data-model.md` without a new entity, `contracts/` without a new route or tool,
`quickstart.md` repeating the tasks) is not written. The spec template, the plan
template override, the `/speckit-plan` skill and `AGENTS.md` carry the rule.

**Why:** the twelve specs measured 9,575 lines of Markdown on 2026-11-06, 300 to
1,350 per feature. Much of the bulk is inventory the graph rebuilds current every
session; copied into a spec it goes stale the day the code moves and buries the
decisions a reader came for. The graph answers *what the code is*, the spec
*why it is that way*; each should hold only its own half.

**Turned down:** a check that measures spec length or flags pasted listings
(whether a line is a decision or a copied fact is judgement, and a length limit
would cut decisions as readily as noise, so review holds this rule, an exception
to IV's "a rule arrives with its check"); trimming the existing specs 001–012
now (they are the record of why shipped code is as it is, and code comments and
`check-peek.mjs` point into them; a spec is trimmed when it is next touched);
deleting shipped specs (same reason).

---

## 2026-11-05 — Browser requests from another address are refused; `NIGARI_TRUST_PROXY`

Found while auditing nigari for Umbrel (owner's brief, 2026-11-05).

**Decision 1**: every non-GET request carrying a sign-in cookie, and the
live-editing WebSocket, must come from one of nigari's own pages
(`server/crossorigin.go`, Go's `http.CrossOriginProtection`: `Sec-Fetch-Site`,
else `Origin` against `Host`, and then against `X-Forwarded-Host` or the
configured public address, for proxies that rewrite `Host`). Requests with an
agent key, the machine endpoints that carry their own credential
(`/mcp/{token}`, `/oauth/token`, `/oauth/register`, `/oauth/revoke`), the two
anonymous public routes (a shared page's password, a public form), and the
desktop app's code exchange arriving with no Origin or `null` are not judged
by origin.

Browsers send `Sec-Fetch-Site` only over HTTPS and to localhost (found by
`/code-review`), so on a plain-HTTP LAN install, Umbrel's included, the
`Origin` comparison does the work. That is why `X-Forwarded-Host` counts: a
page on another address cannot add that header without a CORS preflight,
which nigari never grants.

**Why:** the session cookie is SameSite=Lax, and "same site" ignores ports and
subdomains. On a home server with several apps (Umbrel serves each on its own
port of one host) or under a shared domain, any other app's page could send
nigari a `text/plain` POST with the cookie attached (no CORS preflight; the
JSON decoder ignores the content type), and could open `/collab/{id}` and read
the page, because the socket took every origin. Measured: before the change, a
`PUT /api/me/prefs` with `Sec-Fetch-Site: same-site` answered 200.

**Turned down:** (a) the WebSocket library's own origin check: it compares
`Origin` with `Host` only, so the socket would not get the
`X-Forwarded-Host` fallback the writes get; (b) a CSRF token in every form and fetch:
far more code for what the browser already says; (c) a list of allowed origins
the admin keeps: nothing to configure is better, and the browser knows the
page's origin exactly; (d) waiting: the hole is real on every multi-app host.

**Decision 2**: `NIGARI_TRUST_PROXY=1` does what the admin checkbox "Run behind
a reverse proxy" does, for installs that always have a proxy in front. The
admin's choice wins both ways; unticking now stores `"0"` so that it can, the
dialog writes the setting only when the checkbox changed (it shows the
variable's value, and saving the mail settings must not freeze it), and the
tunnel switches it on only when nobody has chosen.

**Why:** behind Umbrel's proxy every visitor otherwise arrives with the
proxy's address and shares one login rate limit until somebody ticks a box
they have no reason to know about. **Turned down:** switching proxy headers on
automatically when they are present (they are the caller's own words without
a proxy) and making the variable outrank the admin (the house order is admin,
then environment, then default, as for `NIGARI_TRASH_DAYS`).

---

## 2026-11-04 — Spec 013's lock and personal-state routes are "closed" to agents, not "gap"

**Decision**: in `capabilities.json` the views-lock routes (spec 013 PR 1) and
the personal view state routes (PR 2) are `"agent": "closed"` with a reason,
and `gapBudget` stays 10. This replaces spec 013's plan, which named them gaps
and raised the budget 10 → 11 → 12. The owner's decision (2026-11-03) stands:
agents see the lock through `get_collection` and are refused by it, only a
person locks or unlocks, and agents have no personal view state.

**Why:** the manifest's own legend defines a gap as "a person can do it, an
agent cannot **yet**": something waiting to be built. Both of these are
deliberate and permanent, listed in `not_available_via_mcp` with
session-only routes, which is what "closed" means; `workspaces.rules` is the
precedent. A gap would tell a reader the work is pending.

**Turned down:** (a) as planned, "gap" with the budget raised: it raises a
budget that may only go down, for something that will never close.

---

## 2026-11-04 — Spec 014's task issues go under #371, not straight under #426

**Decision**: spec 014's task issues are sub-issues of #371 (the spec's own
issue, itself under epic #426), replacing "straight under #426" from the
entry below. Owner: "whatever makes it easiest for you".

**Why:** `scripts/tasks-sync.sh` closes a task's issue by matching its ID
(`T001`) among one parent's sub-issues, and reads only the first 100 of
them. #426 already holds spec 012's T001–T040, all ticked, so spec 014's
T001–T036 would be closed the moment they were created; and #426 has 52
sub-issues, so it would soon pass 100.

**Turned down:** straight under #426 with tasks numbered T101–T136 (works,
but #426 reaches 88 sub-issues and the next spec hits the limit); a new
parent issue like #477 (one more issue for what #371 already is).

---

## 2026-11-03 — Embed views live in the document, old embeds are read in both shapes (spec 014 plan)

**Decision**: an embed's views are stored in its `database` block's `local`
prop, in a new shape (`{v: 2, viewId, views: [...]}`). An embed written
before spec 014 is read as a copy of every database view it could switch
to, with its own filters on top, and written in the new shape on its first
change. No upgrade step rewrites documents. Agents reach embed views through
`get_collection`, `set_view` and `delete_view` with an `embed_id`, not new
tools. New rows in an embed view pin from the filters the browser sends.
Spec 014's task issues go straight under epic #426, with no parent of their
own (owner, "Straight under").

**Why:** the server never reads the editor's live document (Yjs);
`pages.content` is the browser's delayed copy. An upgrade step would have to
reset the live state of every document with an embed and lose edits not yet
saved. Storing views in the document carries them through history,
duplicate, transfer and backup with no new code. One tool with an argument
keeps the tool list small (`.claude/rules/mcp.md`). Full reasoning:
`specs/014-embed-own-views/research.md` R1–R13.

**Turned down:** a server table of embed views (copy, restore and cleanup
rules of its own); an upgrade step (data loss risk); converting on open
(writes a document nobody changed); four new MCP tools; reading the
document on the server for the browser's new rows (lags the live
document).

---

## 2026-11-03 — An embedded database owns its views (spec 014, #371)

**Decision** (owner, with Notion screenshots): a database embedded in a
document has views of its own, kept with the embed: it starts with one
table view, and **New view** offers the view types plus the database's own
views to copy. Changing an embed's view never changes the database's views.
Settings in an embed acts on the embed's views without asking; editing the
database's properties from there is allowed to whoever may edit the
database, and anything that changes the original (deleting a property or an
option, changing a type) asks first, saying it changes every view. This is
spec 014 (#371, under epic #426). Spec 012 ships Settings on a database's
own page only, and spec 013 stays as planned.

**Why:** the owner's model of a linked database. Spec 012's research R10
had left Settings out of embeds for a reason that did not hold (it cited
"#22", an upstream issue number); the owner's own #270 asked for them.
Building Settings into embeds before embeds own their views would let a
rename in a document rename the view everywhere.

**Turned down:** Settings in embeds on the database's shared views now;
showing all view settings except rename, move and remove (option B2, which
the owner's model makes unnecessary); #371 inside spec 012 (doubles it) or
spec 013 (already planned at 45 tasks).

Also found while working this out: deleting a property asks no confirmation
today (#524).

---

## 2026-11-03 — Spec 013: Status is its own spec; personal view changes live on the account; agents neither lock nor keep personal views

**Decision** (owner, at `/speckit-specify` for spec 013):

1. The Status property (#18) leaves spec 013 and becomes spec 014. This
   changes the 2026-11-02 split ("1 A"): 013 is now #279, #281, #19, #178.
2. A person's own change to a view's filter or sort (#279), and their quick
   filter picks (#19), are kept **on their account**, like the language and
   time settings in `server/prefs.go`, so they follow the person to every
   device.
3. The activity log records **meaningful** view changes only: created,
   deleted, renamed, shared filters, sort, grouping, sub-group, quick
   filters, lock and unlock. Not widths, column order or hidden columns.
4. Agents can see the views lock and are refused by it, but **cannot lock
   or unlock**.
5. Agents get **no personal view state**: an agent's view change is always
   "Save for everyone", as today.

**Why:**

1. Status is a new property type. The code graph showed it reaching filters,
   new rows in a filtered view (`viewpins.go`), charts, forms, CSV import,
   the public table and rollups: a feature of its own, which would have held
   back the four view changes.
2. The owner's choice: a filter kept only in the browser would differ
   between phone and laptop, the complaint `prefs.go` was written for.
3. Widths and order change with every drag (spec 012); logging them would
   bury the changes people look for.
4. The lock is meant partly to stop agents changing views by accident; an
   agent that can unlock defeats it.
5. Agents see a database through queries with their own filters, not
   through a screen. Points 4 and 5 are deliberate parity gaps, named in the
   manifest when built.

**Turned down:** Status in 013 (one long spec, nothing shipping for longer);
personal changes only in the browser; every view save in the log; agents
locking and unlocking; personal view state for agents.

---

## 2026-11-03 — A read-only token may call named POST routes that only read

**Decision:** the read-only check in `auth` (`server/users.go`) lets a
read-scoped token through on the routes listed in `readOnlyPOSTRoutes`,
matched by the mux's pattern. Today one: `POST /api/collections/{id}/aggregate`.
A test checks every listed pattern is a registered route.

**Why:** spec 004 decided a read-scoped credential may aggregate, and MCP
`query_rows` let it, while REST refused every POST: one token, two answers
(#473). Aggregate takes its filters and grouping in a body, which is why it
is a POST.

**Turned down:** making aggregate a GET (its body would move into a long
query string, and the browser's chart code would change for a gate rule);
a wrapper per route at registration (a second way to express the same gate,
for one route); exempting POST by handler name (not available to middleware).

---

## 2026-11-03 — Work goes by Priority; only a breaking bug jumps the queue

**Decision** (owner: "Things I give P1 have priority. Only if it is a bug And
it has breaking does the bug become priority as well. Otherwise a bug remains
just a bug and whatever priority I give it will be that."): the order of work
is the board's Priority field. A bug labelled `bug` **and** `breaking` gets P1
from the board sync; any other bug has the priority the owner gives it. This
replaces "Bugs go before features" (2026-10-30), under which every open bug
went before the next feature. The board sync now asks for both labels, not
`breaking` alone (2026-11-02 entry).

**Why:** the owner sets the order. A small non-breaking bug no longer stops a
P1 feature, and "breaking" on something that is not a bug does not raise it.

**Turned down:** keeping every bug first (the owner's correction); P1 for
`breaking` alone (a feature labelled breaking would be raised).

---

## 2026-11-02 — A breaking bug is P1, set by the board sync from a `breaking` label

**Decision** (owner: "If there is a breaking bug it is p1"; option A, "Yes"):
a bug that breaks nigari gets Priority **P1 - High** on the board. The rule
runs one way: P1 is not only for bugs. Whoever files a breaking bug labels it
`bug` and `breaking`; `scripts/board-sync.sh` then sets the board's Priority
to P1 while the issue is open, when the label is added or the issue has no
Priority yet (so the owner can still lower it by hand afterwards), and the label mirror turns that into
`priority:1`. "Breaking" means data is lost, nigari does not start, or a
core task (editing, saving, signing in) cannot be done.

**Why:** an agent in a cloud session can set labels but cannot reach the
board's fields, and the owner asked that the Action, not an agent, keeps the
board ("The GitHub action should tackle this, not you"). A label is also
visible on the issue itself.

**Turned down:** the agent labels `breaking` and the owner sets P1 by hand
(option B: a step to remember every time); P1 reserved for breaking bugs
only (not what the owner meant); the agent setting `priority:1` itself (the
next sync overwrites labels from the board).

---

## 2026-11-02 — The database views epic is two specs; column order is per view; anyone who can edit may lock

**Decision** (owner: "1 A, 2 A, 3 A", for epic #426):

1. Two specs instead of one. **012** covers how a view looks and handles:
   #131 text size, #132 dragging columns, #133 the board drop marker, #280
   the fold-away toolbar, #270 the Settings panel. **013** covers what a view
   stores: #18 Status, #19 quick filters and sub-groups, #279 personal
   filters, #281 lock, #178 the activity log.
2. Dragging a column header changes the order **in that view only**, stored
   on the view beside its column widths. The Properties dialog still sets the
   order a view starts from.
3. **Anyone who can edit a database** may lock and unlock its views (#281,
   spec 013).

**Why:**

1. 012 is mostly interface and can ship first; 013 changes the server and
   the agent tools. One spec for all ten would be one long plan with nothing
   shipping for a long time.
2. Widths are already per view (`colWidths`), so two views of one database
   can be laid out for different jobs. An order that moved every view would
   undo that.
3. The lock guards against accidents, not against people: whoever may edit
   the views may also lift the lock.

**Turned down:** one spec for the whole epic; a column drag that changes the
property order everywhere; locking reserved for workspace owners and admins
(a permission of its own, with its own gates and tests, for a guard rail).

---

## 2026-11-02 — The board's Priority field is copied onto priority:N labels by the board sync

**Decision** (owner: "can't you find a job or something that mirrors project priority to a field
tag?", then "The GitHub action should tackle this, not you"): the owner sets priority in the
board's Priority field (`P1 - High`, `P2 - Medium`, `P3 - Low`). `scripts/board-sync.sh`, which
already reads every board item with `BOARD_TOKEN`, writes it onto the issue as `priority:1`,
`priority:2` or `priority:3` and removes any other `priority:*` label. The board is the source;
a `priority:N` label set by hand is overwritten on the next sync. An issue with no Priority on
the board keeps its labels; a value without a number is left alone with a warning. Each run's
log also prints every issue's Priority.

**Why:** an agent in a cloud session cannot read a board's fields: its GitHub tools have no
Projects access and `BOARD_TOKEN` exists only inside Actions. A label is what the issue page,
the issue list and those tools all show. A user's board sends no event when a field changes, so
the label follows on the nightly run (03:17 UTC) or on Actions → Board sync → Run workflow.

**Turned down:** reading the priority from the run log only (agents would have to dig through
logs, people would see nothing on the issue); a screenshot of the board each time (stale as
soon as a priority changes); the agent running the sync itself (owner: the Action does it).

---

## 2026-11-02 — The release with spec 010's database menus is v2.1.0

**Decision** (owner: "Yes"): `server.Version` moves from 2.0.0 to 2.1.0 in the pull request
that finishes spec 010 (#422), so the release workflow starts the 2.1 line at v2.1.0
instead of continuing with v2.0.16.

**Why:** spec 010 changes how every menu behaves, for every person: arrow keys and
type-to-jump everywhere, a right-click opening the same menu, bottom sheets on a phone,
and a modal menu that takes the next outside click. A patch number would understate that.

**Turned down:** v2.0.16 (the automatic next number; it would say nothing changed for
users); v3.0.0 (nothing is removed or incompatible: the same data, routes and tools).

---

## 2026-11-02 — Spec 010 rebuilds the menus on Base UI, not only their icons

**Decision** (owner: "B"): spec 010 also does the menus part of spec 001's next batch.
Every menu except the editor library's two becomes `ui/Menu` (Base UI `Menu`, with
a right-click opening the same menu at the pointer), so every menu gets arrow keys,
type-to-jump, Escape and focus return in one place. `AnchoredMenu` and `menuStyleFor` are
removed. `anchoredMenu.ts` and its check stay: on a phone the toolbar menus remain bottom
sheets, and `ColumnsControl` still uses the module (found by CodeGraph, research R13). Two pull
requests: the sidebar, page and account menus first, then the database menus.
`specs/010-menu-icons/research.md` R10–R12.

**Why:** with icons only, every menu would be rewritten twice, once for the icons and
again when the menus move to Base UI. Doing both at once costs more testing now, but
less work overall, and the keyboard gain reaches every menu at the same time.

**Turned down:** icons only (option A: smaller, but leaves the menus without arrow
keys and means a second rewrite); rebuilding the editor's `/` and block menus too
(they are BlockNote's, already work from the keyboard, and would need its internals
forked).

---

## 2026-11-02 — Menu icons: one pairing, our icons on the editor's items, view types are values

**Decision** (spec 010 plan; the verb-alone rule is the owner's "A", 2026-10-29): every
menu item is drawn by `ui/MenuItem`, which takes its icon from one module,
`web/src/menuIcons.ts`, by function name. The editor library's `/` and block menu items
get their icons from the same module, keyed by BlockNote's own item keys. The view types
in the add-view menu, and the workspace, template and column lists inside menus, are
values (`ui/MenuValues` with a reason), not functions. `check-menu-icons.mjs` enforces it.
The full pairing and the collisions it resolves are in
`specs/010-menu-icons/data-model.md` and `research.md` R5.

**Why:** with the icon looked up by function, one function cannot show two icons, and
the check only has to compare one list. BlockNote draws `react-icons`, a second icon set,
so "the same icon" means nothing across the two sets. Owning the icon for each library
key makes a collision impossible, and a library upgrade that adds an item fails the build
until someone picks its icon. The view types keep the icon their tab shows, which is the
one a person learns.

**Turned down:** keeping icons inline and checking by label (labels differ for one
function, "Export Markdown" / "Markdown (.md)", so the check would need its own pairing:
two lists); a full `Menu` component that also places the menu (bigger than asked;
`AnchoredMenu` works); comparing the library's icons with ours (different icon sets);
leaving the library's items out (the owner said they count); counting view types as
functions (eight type icons in the pairing, colliding with the `/` menu's table and
chart blocks, which are different things).

---

## 2026-11-02 — Every session uses CodeGraph, from the spec on

**Decision** (owner: "You should use codegraph also whilst speccing"; "Ensure any new
session always uses codegraph"): the graph is the first step wherever the code has to be
understood, specifying and planning included. Five places carry it, so no single one has
to be remembered: `AGENTS.md` (read by every agent), `.claude/rules/codegraph.md`, the
session-start message of `.claude/hooks/codegraph.sh`, the Spec Kit skills
(`speckit-specify`, `speckit-plan`, `speckit-tasks`), and the plan template's new
**CodeGraph** section, which `check-surfaces.mjs` requires in every plan dated
2026-11-03 or later.

**Why:** spec 010's plan was written from text search while the graph sat unused, and
one graph query then found what it had missed (spec 001's planned menu batch, the
raw-button budget the change must lower). An instruction in one rules file had not been
enough; a check makes the plan show its queries.

**Turned down:** turning the per-message prompt hook back on (see 2026-11-01: it pasted
unrelated code into every turn); a check on specs as well (a spec describes behaviour,
and its Context section is prose; the plan is where an inventory lives); a check on
commits (nothing in a commit shows whether the graph was asked).

---

## 2026-11-01 — CodeGraph's per-message prompt hook is off

**Decision** (owner: "yes"): the `codegraph prompt-hook` entry that `codegraph install`
adds to `~/.claude/settings.json` (UserPromptSubmit) is taken out again by
`.claude/hooks/codegraph.sh` on every session start. The MCP server, its permission and
`.claude/rules/codegraph.md` stay.

**Why:** the hook matches the words of every message against symbol names and pastes
the source it finds. A question about how the graph had helped, with the word "graph" in
it, brought in the app's `GraphView` and the server's graph tool: unrelated code read on
every turn. The graph is worth its cost when a task asks a structural question, and the
rule already says to query it then.

**Turned down:** keeping it (noise and tokens on every chat line); a flag on the
installer (there is none in 1.6.2: `codegraph help install`).

---

## 2026-11-01 — Cloud sessions get a code graph (CodeGraph)

**Decision** (owner's request): agents in Claude Code cloud sessions work with
[CodeGraph](https://github.com/colbymchenry/codegraph) 1.6.2, a local graph of the code's
symbols and calls in SQLite, served to Claude over MCP. A SessionStart hook,
`.claude/hooks/codegraph.sh`, installs the pinned npm package when it is missing, wires
Claude Code with the package's own `codegraph install --target=claude --location=global`,
and builds the index (`codegraph init`) or catches it up with the checkout (`codegraph
sync`, `codegraph index --force` if that fails). `.claude/rules/codegraph.md` tells
agents to use it before and after a change. Anonymous telemetry is switched off.

**Why:** the history of this repository is surfaces missed on one side of a change (a
check on the REST path and not the MCP one). A grep finds a word; the graph finds the
callers, the rendered components and the route behind a handler, and the blast radius
of a change, in one call. Measured here: 382 files, 6,964 nodes, 22,574 edges; built in
10 s on a machine with nothing installed, 1 s when the index is already current.

**How it stays current:** nothing of it is committed and nothing is assumed to survive.
Each session start compares the index with the checkout (`codegraph status`) and syncs
only what changed. While the MCP server runs it watches the files and syncs edits
within its 2-second debounce (tested: a new file was in the graph and gone again
without a command). The index lives in `.codegraph/`, ignored through
`.git/info/exclude` because `.gitignore` is a protected file.

**Turned down:** committing the index (25 MB, machine-specific, stale on the next
commit); the install line from `raw.githubusercontent.com` (the sessions' network
policy blocks GitHub; npm is the package's documented alternative); a repository
`.mcp.json` (the installer's global entry is the documented route, and it keeps the
repository free of tool configuration a person's own machine would also pick up); the
instructions in `CLAUDE.md` (gitignored here on purpose; rules in `.claude/rules/` are
shared); an external store or service for the graph.

**Limits:** on a machine where the hook runs for the first time, Claude Code may start
its MCP servers before the hook has written the entry; the `codegraph` CLI works at
once, the MCP tool from the next start. The environment's setup script, which runs
before Claude Code starts, closes that gap: `npm install -g @colbymchenry/codegraph@1.6.2
&& codegraph install --target=claude --location=global --yes`. The hook runs only in
cloud sessions.

---

## 2026-10-30 — Bugs go before features

**Decision** (owner, option A of two): an open `bug` issue goes before starting the next
feature or spec, and a bug found while working is filed at once and fixed in its own small
pull request. Written into `AGENTS.md` § How work flows.

**Why:** the owner reported a chart that replays its animation once per row (#368) while
#317, #318, #319 and #320 had been waiting since 2026-10-29 behind specs 008 and 011. A
bug the owner sees every day costs more trust than a feature that starts a week later,
and a bug fixed while its cause is fresh is cheaper than one fixed after the code moved on.

**Turned down:** B, bugs first only when visible in daily use: it puts the judgement of
"visible" on the agent, and every bug filed so far was found by using the app.

---

## 2026-10-30 — The interface speaks Dutch, and Dutch is required like German

**Decision** (owner, #324): nigari ships a Dutch catalogue, `web/src/locales/nl.json`,
for every string the interface uses. The owner works in Belgium and reads it ("include
Dutch in your translation related actions from now on").

- **Required, not reported.** `check-i18n.mjs` now fails on a Dutch gap as it does on a
  German one. `.claude/rules/i18n.md` had said Dutch becomes required once complete; it
  arrived complete, so it is required from its first commit. Spanish stays reported:
  nobody here reads it, and a gap shows the English.
- **Informal address** (*je/jij*), matching the German *du*; buttons are infinitives
  ("Opslaan"), as Dutch software writes them. Neutral Dutch that reads in Belgium and the
  Netherlands rather than Flemish or Hollands specifically; dates and numbers already
  follow the browser's region (`nl-BE` or `nl-NL`) through `format.ts`.
- **Written by a helper, reviewed by Claude, not yet by a native speaker.** The owner
  is the first native reader; corrections go straight into `nl.json`. No
  `nl.machine.json` (the list `translate.mjs` keeps of unread lines): every line would be
  on it, so it would say nothing a sentence here does not, and `check-i18n.mjs` reads
  every `*.json` in the folder as a catalogue and would print a "behind" note for it on
  every run. `translate.mjs --list` therefore shows Dutch as fully read; this entry is
  the record that it is not.
- **Plural forms only where `plural()` asks.** The helpers' first pass, like
  `translate.mjs`, made `{one, other}` objects of every key holding `{n}`. Three of those
  keys are read by `t()`, which shows the English for an object, so "{n} skipped" stayed
  English in Spanish since it was contributed. `check-i18n.mjs` now fails on that shape in
  any catalogue.
- **Glossary**, so later strings use the same words: workspace *werkruimte*, page
  *pagina*, database *database*, collection *verzameling*, property *eigenschap*, view
  *weergave*, board *bord*, chart *grafiek*, template *sjabloon*, comment *opmerking*,
  trash *prullenbak*, member/guest/owner/admin *lid/gast/eigenaar/beheerder*, sign in/out
  *aanmelden/afmelden*, peek *snelweergave*, sidebar *zijbalk*, rename *naam wijzigen*.

**Turned down:** reporting Dutch like Spanish until later (the rule already set "complete"
as the moment, and a reported language drifts); a formal *u* (the German is informal, and
the two would read as two products); a Flemish variant `nl-BE` catalogue (one catalogue per
language, region only for formatting, see `i18n.ts`).

---

## 2026-10-29 — The fork becomes nigari, internals included, with no transition

**Decision** (owner, spec 011): the fork takes its own name, **nigari**, everywhere,
internals included ("C. Rename everything, internals too"). The old names stop with the
first nigari release ("Q1 immediately"), which is **v2.0.0** ("Q2 B"). Data still moves
once: `salt.db` becomes `nigari.db`, and browser preferences move to their new keys.

**Decided with the plan** (`specs/011-rename-nigari/plan.md`, research R1–R15):
- **A `SALT_*` variable without its `NIGARI_*` name refuses the start** with one sentence
  naming both. Ignoring it would start an empty workspace that looks like lost data.
- **The database file is renamed without a copy** (owner: "No copy"). The rename changes
  no byte; a WAL checkpoint first makes the file complete. With both files present the
  start is refused.
- **Desktop app id `io.github.neatlittlemacapps.nigari`** (owner: "yes"): a reverse domain
  the owner controls; `md.salt` was never the fork's.
- **The release rule gains one case**: a version line with no tag releases its base as is,
  so `2.0.0` ships as v2.0.0, not v2.0.1. Amends the 2026-10-29 release entry below.
- **The repository is renamed just before the merge**: the image name follows the
  repository, so renaming after would publish v2.0.0 under the old image name.
- **The compose and Quadlet volume keeps the name `salt-data`**: a renamed volume is a new,
  empty one.

**Turned down**: keeping the name (A); renaming the product only (B); a transition period
reading old names; a copy of the database before the rename; a goose step for the rename
(a step runs inside the file and cannot rename it).

---

## 2026-10-29 — Third-party notices list what the released binaries link, not the module graph

**Decision** (owner chose B, while adding goose for spec 008): `scripts/licenses.mjs`
lists the Go modules `go list -deps` reports for the main package, merged over every
`build <os> <arch>` target in `.github/workflows/release.yml`. Before, it listed
`go list -m all`, the whole module graph.

**Why**: goose v3.29.0 added 79 modules to the graph and only 5 to the binary; the rest
are its drivers for other databases. The old script would have added about 10,000 lines
of notices for code salt.md does not ship. It already listed 17 modules that never
shipped (the SQLite driver's code generator, test tools): 33 listed, 16 linked. The
notice has to travel with what ships (the script's own header), and that is what the
linker sees. The targets are read from the release workflow so a new platform cannot be
forgotten here.

**Turned down**:
- A. Keep `go list -m all`: no script change, but notices about ten times longer and
  mostly about code that is not in any download.
- One fixed platform: the linked set differs (go-isatty on darwin and windows only,
  google/uuid not on windows).

A module that only a test imports (goose until `server/upgrade.go` uses it) is not
listed; it is once the binary links it, the next time the script runs.

---

## 2026-10-29 — The fork releases every push to main, on its own 1.6 line

*Amended by "The fork becomes nigari" above: a version line with no tag yet
releases `server.Version` itself, so the first nigari release is v2.0.0.*

**Decision** (owner's issue #265, with the version rule left to us): every push to `main`
publishes a GitHub Release of this fork and its container image. Each gets the next patch
number on the line named by `server.Version`'s major.minor (1.6 today: v1.6.9, v1.6.10, …).
`install.sh`, the admin's update notice, the Docker image and the docs point at the fork.

**Why this rule**:
- The update check only treats plain `x.y.z` as a release (`server/update.go`), so
  build-metadata versions like `1.6.8+42` would make every instance silent about updates.
- Every fork release must sort above the upstream tags the fork carries (v1.1.2–v1.1.4),
  and the 1.6 line already does.
- If an upstream merge moves `server.Version` to a new major.minor, the fork follows that
  line from its patch + 1.

`make build` stamps the same version into the frontend and the server, from
`git describe`. Before, a local build was "dev" in the browser and "1.6.8" on the server.

**Turned down**:
- `server.Version` plus the run number: rejected by the update check, as above.
- Pushing a tag from one workflow for `release.yml` to react to: tags pushed with
  `GITHUB_TOKEN` start no other workflow, so the release job creates the tag and calls the
  image build itself.
- Marking these releases as prereleases: `/releases/latest` skips them.

---

## 2026-10-29 — Safe upgrades run on a migration library: goose

**Decision** (owner, shown the research's options for #263 with B recommended: "No, go with
c"): the numbered upgrade steps of spec 008 run on a migration library rather than a runner
written by hand. Of the two libraries the research measured, **pressly/goose v3** is used.
Research: `specs/008-safe-upgrades/research.md`.

**Why goose and not golang-migrate**: salt.md stores views, property schemas and row
values as JSON inside columns, and reshaping those needs steps written in Go. goose runs Go
functions as steps (and SQL files), each in a transaction. golang-migrate runs SQL files
only. Both build with `CGO_ENABLED=0` on salt.md's SQLite driver (measured).

**What it costs** (measured in the research, against a minimal program on the same driver):
+83 modules in the build graph and +1.16 MB of binary for goose (golang-migrate: +192
modules, +0.12 MB). Principle I asks a new dependency to state its reason: this entry is it.

**What changes from the research's recommendation**: the step number lives in goose's own
version table, not in `PRAGMA user_version`. The pre-upgrade copy, the refusal to open a
database newer than the binary, `salt restore` reporting the version, the fixture databases
and the check stay as recommended; goose provides none of them, so they are written here.

**Turned down**: option B, the same steps on a runner of our own (the research's
recommendation; the owner preferred a known library); golang-migrate (SQL steps only);
down migrations (going back is restoring the copy taken before the upgrade); Litestream
(an external process and service).

---

## 2026-10-28 — Mechanical tasks go to Sonnet helpers; judgement stays on Opus

**Decision** (owner: "can you hand off to sonnet if you think it is useful?" — yes, and
"capture that behaviour for other sessions"): a Claude Code session may hand a task to a
Sonnet subagent where that saves time or cost without risking quality. The rule is in
`.claude/rules/claude-code.md`, which every Claude Code session loads.

**Why**: nothing in the repository is tied to a model — the instructions, Spec Kit and the
gate behave the same on any — so the choice is about judgement. Translations, wiki text after
an existing page, screenshot retakes and test runs follow a pattern and the gate catches
slips; specs, plans, surfaces, new server logic, new primitives and gates do not.

**Turned down**: whole sessions on Sonnet for feature work (the thinking steps are where a
miss is not caught by a check); Haiku (too weak for this repository's rules).

---

## 2026-10-28 — Agents author their own commits in this fork

**Decision** (owner, asked whether to keep the owner as author or switch to Claude:
"Claude"): commits made by an agent carry the agent as author, not `neatlittlemacapps`.
`AGENTS.md` § Commits says so. Replaces the earlier rule (owner as author, agent in a
`Co-Authored-By:` trailer).

**Why**: the owner works on this fork, not upstream ("I don't care about pushing it back
to them"), and the fork's CI skips the CLA check, so the reason for the old rule — upstream's
CLA bot cannot match an agent's address to a signature — no longer applies to everyday
work. The session's own git identity is already the agent, so the history tells apart what a
person and what an agent wrote.

**Turned down**: keeping the owner as author (the history hides which work was the agent's,
and every session has to override git's configured identity).

**Still true**: anything offered to upstream is re-committed with the owner as author first.

---

## 2026-10-28 — Spec 004 grows a chart builder, modelled on Notion's

**Decision** (owner: "spec it and start the build", after a 20-screenshot walk-through of
Notion's chart flow): charts get five kinds (bar, horizontal bar, line, donut, number), five
`/` menu entries that put a chart into a document through the existing database block, one
settings panel (kind, data, sort, groups, palette, style), a tooltip, and Save chart as PNG.
Spec 004 US5, FR-018 to FR-029; research R13 to R17.

**How, and why that way**:
- A chart in a document is the database block showing a chart view (`local.viewId`, #26),
  not a new block: one way to put a database into a page, and agents already have
  `embed_database` (it gains `view_id`).
- Every setting is stored on the view, not the block, so one chart looks the same wherever
  it is embedded and an agent styles it with `set_view`.
- The settings panel is offered inside a document's database block too, for charts only:
  an exception to #22, because a chart inserted from the `/` menu has to be finished where
  it was inserted.
- Single-colour palettes have three shades per hue, not Notion's five: the lighter ones
  fail the 3:1 contrast rule (FR-015). Labels tell repeated shades apart.
- A new `ui/Popover` primitive carries the panel; the layer had none.

**Left out, with the reason** (spec FR-017): a second grouping, reference lines and axis
range (with stacked bars, later); Download SVG (Chart.js draws on a canvas); creating a new
database or importing a CSV from the picker; "Save for everyone"/"Reset" on filters, the
folding toolbar and "Lock views" (they change every view type: separate backlog items);
"Hide negative values", "Load limit", "Show data source title".

---

## 2026-10-28 — Spec 004: charts are drawn with Chart.js

**Decision** (owner): Chart.js 4.5.1, loaded only with a chart view. Supersedes "hand-drawn
SVG" in the spec 004 plan entry below.

**Why**: a mature library, with room for more chart types later (area, scatter, stacked).
The project rule is "a new dependency needs a stated reason", not "none": the "no new
dependency" in spec 004 was Claude's default, copied from issue #20, which Claude wrote.

**What it costs, and how it is met**: 60,694 B gzip (measured), kept out of the main
bundle in a lazy chunk; a canvas gives keyboard and screen readers nothing, so the chart
gets focusable group buttons, a summary and a table beside it (research R8); Chart.js's
options are built from the design tokens at draw time and rebuilt on a theme switch.

**Rejected**: hand-drawn SVG (Claude's recommendation), uPlot (no donut), Recharts and
ECharts (112 and 179 KB).

---

## 2026-10-28 — Spec 004 plan: charts aggregate on the server, drawn by hand

**Decision**:
- **One function, the rows query's WHERE.** `aggregateRows` groups in one SQL query over
  the WHERE extracted from the rows query, so a chart's numbers are the filtered table's.
  Formulas and rollups, which exist only in Go, take a measured second path.
- **Agents through `query_rows`** (`group_by`, `aggregate`), not a new tool.
- **Hand-drawn SVG**, lazy-loaded, colours as 12 chart tokens with a 3:1 contrast check.
- **At most 12 groups drawn**, the rest as "Other"; dates up to 400 periods.
- **A group's rows** are the ordinary rows query with one more filter, shown as a list
  that follows the view's Open pages in.
- **New registry row "Aggregation".**

**Why**: SC-002 (the chart equals the table) only holds when both read one WHERE; a
browser-side count is stopped by the 5-second limit exactly where charts matter; a chart
library adds 23–179 KB gzip for three shapes (measured, research R8), and the canvas
ones give a keyboard or screen reader nothing to hold.

**Rejected**: counting in the browser; a separate aggregate SQL builder; a new MCP tool;
a chart library; canvas (no focus or screen reader).

---

## 2026-10-28 — Upstream #85 (full width as its own column): not taken

**Decision**: the fork keeps full width as the page prop `_fullWidth`. Upstream
saltmd/salt.md#85 moves it to a column of its own; we do not follow.

**Why**:
- **Nothing to gain.** Upstream moves it out of the props so it cannot mix with database
  properties. Here only documents use it, and documents have no database properties.
- **Already open to agents.** `update_page full_width` sets it and `get_page` reports it,
  with tests (`mcp_appearance_test.go`, `page_width_test.go`).
- **It already travels.** Duplicate, templates, import/export, workspace blueprints and
  history copy props, so the setting goes with the page without any code knowing about
  it; that was the reason for the prop in the first place (`server/public.go`).
- **The cost would be real:** a schema column, a migration of existing values, every
  copy path taught the new column, the wiki and the tool changed, for no visible change.

**Rejected**: following upstream for its own sake (owner, 2026-10-27: implement the
maintainers' changes only when they make sense for us).

---

## 2026-10-27 — Spec 007: the centre peek is a panel of its own, not a Dialog

**Decision**: the centre peek is drawn by a new `ui/CenterPanel` (option A): modal, with
its own focus trap and Escape, sharing that behaviour with `ui/SidePanel`. It does not
join `useExclusiveModal`.

**Why**: the page inside a peek opens dialogs of its own (version history, share), and
the coordinator closes every other modal when one opens, so with `ui/Dialog` each of
them would have closed the peek. A separate panel keeps the app-wide one-modal rule
(#134) as it is.

**Rejected**:
- B: `ui/Dialog` and letting coordinated modals stack: changes that rule for every
  dialog in the app.
- C: no centre peek: story 4 of the spec undelivered.

---

## 2026-10-27 — Spec 007: a view chooses how its pages open

**Decision**:
- **A setting of each view**, `openIn` in the view's JSON: full page (missing, the
  default), side peek, centre peek. Agents set it with `set_view` `open_in` and read
  it from `get_collection`; one server function validates it for both doors.
- **A view's peek beats the account's "Open rows in new tab".** The account setting
  keeps deciding for views on full page; ⌘/Ctrl always opens a new tab.
- **The address carries the peeked row** (`?peek=`), so reload, copied links and
  Back behave as people expect.
- **The peek is the ordinary page editor** inside a new non-modal `ui/SidePanel`.
- **Side peek first; centre peek in a follow-up pull request**, behind a flag so no
  door stores a value nothing honours.
- **New registry row "Page containers"**: later page-level features must work in
  every container a page renders in.

**Why**:
- **Per view, not per account** (owner, 2026-10-27): a board for daily work and a
  table for bulk edits want different behaviour.
- **The peek beats the account preference** because someone chose it for this view
  on purpose; leaving the preference in charge of full-page views changes nothing
  for existing views.
- **The ordinary editor** keeps every page feature in the peek without a copy that
  drifts.

**Rejected**:
- The upstream maintainer's account-level side panel for saltmd/salt.md#92.
- A modal side panel (the view behind would be inert), and shrinking the view to
  make room (moves the columns and loses the scroll position).
- Peek state inside the collection view (lost on reload; two embedded views could
  each open one).

---

## 2026-10-27 — Spec 005: a new row takes what its view's filters pin down

**Decision**:
- **Only an armed "is" with exactly one value pins a value**, written in the
  property's stored form: a select option id, a number as a number, a box as
  true/false, a relative day as the date it means, lists for multiselect,
  relations and several people. Two filters naming different answers for one
  property pin nothing.
- **The server works the values out**, in `server/viewpins.go`, for every door:
  `POST /api/pages` and the template route (`viewId`), MCP `create_page` and
  `create_rows` (`view_id`).
- **Precedence: template, then view, then explicit values.**
- **"Does the row show?"** is answered with the rows query's own filter SQL.
  The interface shows a toast with an **Open** action when it doesn't.
- **Only the view's AND list counts.** Views store no OR groups.

**Why**:
- **One answer only.** A range or a set has no value to pick without guessing,
  and a guess stored as data stays.
- **The server.** A second copy of the filter rules in the browser would drift
  from the agent path, as the number and checkbox filters did (#95).
- **The view beats the template.** It is the one the person is looking at when
  they press **New**.
- **The same SQL.** The notice can never disagree with what the view then shows.
- **Measured cost:** +0.45 ms per create on the 1k-row seeded database.

**Rejected**: picking a value from a range or a set; pins computed in the
browser; a dialog instead of a toast; naming the view in the agent's answer
(its name is a person's text and would need `wrapUntrusted`).

## 2026-10-27 — Owner's answers: auto-merge, search, outside edits, column order, board drops

**Decision** (the owner, 2026-10-27):
- **Auto-merge on** for pull requests the agent opens. They merge once the
  required checks pass.
- **Search (#78): left as it is.** CI p95 is 122.8 ms and nobody has
  complained in real use. If search ever feels slow, the next step is
  `workspace_id` in `chunks_fts` (option b).
- **Outside writes into an open page (#26):** the open editor applies the
  change, not the server. This covers every outside write (edits, rewrites,
  agent writes). With no editor open, today's path stays.
- **Column order (#132): per view**, stored like column widths.
- **Board drops (#133): no manual order inside a column.** The view's sort
  decides, and the drop marker shows only the target column.
- **Peek views (upstream #92):** side peek first. Centre peek follows in its
  own pull request.

**Why**:
- **Auto-merge.** The owner works from a phone and merged within minutes
  anyway. The required checks are the gate either way.
- **Search.** Option a ranks fewer hits and option b changes the index. Neither
  is worth it without a measured problem.
- **Outside writes.** The editor already knows the document format, and the
  server would have to learn it to apply Yjs updates itself. One path for all
  outside writes means one behaviour to test.
- **Column order.** Widths are already per view, and each view serves its own
  job.
- **Board drops.** A manual order is a feature of its own: a stored position,
  conflicts with sort, and MCP parity. It can come later.
- **Peek.** Smaller pull requests are easier to test and review.

**Rejected**: #78 options a and b for now; a server-side Yjs apply for #26; a
column order shared by every view; a manual card order in board columns.

## 2026-10-27 — Design system batch 1: what the first screen decided

**Decision**: the first screen built from `web/src/ui/` is the instance
settings dialog, Webhooks tab included. That brings in:
- **`Checkbox` joins batch 1**, because the tab's events are checkboxes.
- **Removing a webhook stays one click.** No `AlertDialog` in front of it.
- **`Dialog` has no close button of its own.** Mounted means open; the footer's
  Cancel or Close is wrapped in `DialogClose`. A `returnFocus` ref covers a
  dialog opened from a menu item that disappears.
- **The catalogue lives in `web/catalog/`**, outside `src/`.
- **Today's dialog values (radius 16px, title 24px, layer 100) are component
  tokens.** They are not moved onto the scales yet.
- **The catalogue's screenshots are compared with the base branch, drawn on
  the same CI runner, and a difference is a warning.** No baselines are
  committed (spec FR-013 amended).

**Why**:
- **The screen.** The spec named "the webhook dialog" for US1. In the code it is
  a tab of the settings dialog, and three checkboxes are its only controls
  besides a text field and buttons.
- **Remove.** A confirmation would change behaviour, and this feature encodes
  the look and the behaviour rather than redesigning them.
- **No X.** Today's dialogs close through their footer, so an X would change
  every migrated screen.
- **The catalogue.** It is dev tooling: the translation check and the literal
  ratchet scan `src/` and should not count its demo labels.
- **Today's values.** The spec's edge case says old and new must look the same
  while the migration runs, so the old values stay until every dialog has moved.
- **What it fixed.** The migrated dialog fixed two bugs the old markup had: Tab
  walked out of it into the page, and closing it left focus on nothing.
- **The screenshots.** Committed baselines differed from CI's runner by about a
  thousand pixels per section with nothing changed: the runner draws text
  differently from any other machine. A reference drawn on the same runner
  differs only where something changed.

**Rejected**:
- **`Select` or `Switch` for the events** (the screen does not use them; they
  are built and proven in the catalogue instead).
- **A visually hidden close button** (an invisible focus stop for keyboard
  users).
- **Moving the dialog onto the type and radius scales now** (old and new
  dialogs would differ side by side).
- **The catalogue in `web/src/catalog/` with an exemption for each check.**
- **A looser pixel tolerance** (it cannot tell another machine's text from a
  real change).
- **Baselines committed by a CI bot** (its commits carry no CLA signature
  upstream).

## 2026-10-27 — Design tokens: light muted text darkened for AA, and the bundle baseline corrected

**Decision**: the token build checks every text colour against the surfaces it
sits on, in both themes, and fails below WCAG AA (spec 001, FR-004). Light
muted text (`--muted`) moves from `#7e7d78` to `#6f6e6a`: the same grey,
darkened just enough to reach 4.5:1 on the sidebar, the darkest light surface
(4.89:1 on the document). Nothing else in the look changes; light-mode muted
text in the wiki screenshots is the one visible difference. The radius scale is
built as `radius.scale.*` (`--radius-scale-sm`), because `--radius-sm` and
`--radius-lg` already name today's 7px and 14px. The bundle cap is 590,146 B
gzip: the main chunk on `main` (528,706 B) plus 60 KB.

**Why**: the first build measured `#7e7d78` at 3.95:1 on the document and
3.64:1 on the sidebar. It is used for hints and labels at body size, where AA
asks 4.5:1. Dark muted text already passes (4.78:1 or more). The plan's bundle
baseline, 790,888 B, was never reproduced: the raw size matched to the byte,
the gzip size did not, so it was a measuring mistake, and a cap on it would
have allowed 320 KB of growth instead of 60.

**Rejected**: declaring muted text "large or UI" (3:1) to pass. It is not;
the check would then guard nothing for the colour that needs it most. Keeping
`#7e7d78` with an exception and an issue (it ships a known AA failure behind a
green check). Renaming the legacy `--radius`, `--radius-sm` and `--radius-lg` (15 uses in
`theme.css` and the public pages' styles in `server/`; they move onto the
scale batch by batch).

## 2026-10-26 — A read-only pool beside the one writer connection

**Decision**: long analytical reads (a database's rows, rollups,
backrelations, grouped counts) run on `s.rdb`, a read-only pool of four
connections opened with `mode=ro`. Every write, every read inside a
transaction and the short permission lookups stay on `s.db`, the single writer
connection. Reads on the pool still stop after 5 s. Spec 002 research P5
changes from "measured, not built" to built; #82.

**Why**: measured, not assumed. Five agents' writes waited ~2.7 s at p95 behind
back-to-back 100k-row reads on the shared connection; the write budget is
8 ms. On the read pool the same writes take ~5 ms. WAL lets readers and the
writer run at once, and a read on the pool sees every committed write, so
saving and reloading still shows the save. `database/sql` does not serve
waiters in order, so a busy reader could keep winning the one connection; a
separate pool removes the contest.

**Rejected**: a read pool for every read (it would split the cursor rule
across all code for little gain; the short lookups are fast). A pool without
`mode=ro` (a stray write would take a second writer's lock instead of
failing). Waiting until charts (#20) land (they are the heaviest reads, and
the writes would already be suffering).

## 2026-10-26 — Storage budgets record today's speed; targets stay with issues

**Decision**: the latency budgets in spec 002 research P3 are the CI runner's
measured p95 × 1.5, as SC-002 says. That holds even where the measurement is
worse than the spec's guess: full-text search at 20k pages gets 301 ms (guess
50 ms) and `query_rows` at 10k rows gets 113 ms (guess 50 ms). The 50 ms targets
stay with #78 and #79, and a fix lowers its budget in the same PR.

**Why**: the registry's Storage budgets row holds every new or changed
hot-path query to its budget. A budget set below what the code does today would
fail every feature that touches search, however well that feature behaves, and
teach everyone to ignore budgets. Set from a measurement, it catches the next
slowdown. Making search fast is a separate piece of work, tracked in the issues.

**Rejected**: keeping 50 ms as the budget (every search-touching plan would
miss it, with nothing that plan could do about it). Measuring after the driver bump #80 (that would tie
this PR to #80; the bump only adds headroom, so the budgets are conservative).

## 2026-10-26 — Test branches in GitHub Codespaces

**Decision**: a dev container (`.devcontainer/`) builds the branch a codespace
is opened on and runs it on port 8420 with the wiki's invented content. The
owner tests from a phone browser, including pull requests before they merge.

**Why**: the owner works mostly from a phone and asked for a remote way to try
what has been built. A codespace needs nothing installed, keeps its address
private to the owner's GitHub account, and costs nothing within the monthly
allowance.

**Rejected**: a permanent hosted demo (a server to pay for and keep safe, and
a public address for an unreleased build). An `:edge` image to run locally:
useful, but not remote; it can follow later.

## 2026-10-26 — The board derives its columns; nobody moves cards

**Decision**: `board-sync.yml` sets every issue's Status from GitHub's own state: closed,
an open PR that closes it, the `in-progress` and `spec` labels, and whether it is a
feature's task. A task ticked in `tasks.md` on `main` closes its issue. A nightly run
catches anything no event reports.

**Why**: spec 003 merged with its twenty task issues still open, and no card had moved.
A feature PR's `Closes #13` does not close sub-issues, and moving cards was a step people
and agents had to remember. A cloud agent cannot reach the board at all, but it can set a
label.

**Rejected**: moving cards by hand, or by the agent (no board access from cloud
sessions). GitHub's built-in project workflows alone: they cover "closed → Done" and
"PR merged → Done", but not In review, In progress or a feature's progress through its
tasks.

## 2026-10-26 — The list of surfaces is a registry that grows with new concepts

**Context**: the owner's standing instruction is that every feature request is
thought through against every aspect of the code. When a request introduces a new
concept, such as the design system, that concept joins the list every later feature
is checked against.

**Decision**: `.specify/memory/surfaces.md` is the one list of surfaces, each with what
a feature checks and the date it was added. Every plan's Surfaces table has a row per
entry, and `check-surfaces.mjs` (in `npm run check` and the gate) fails a plan that
skips one or leaves it empty. A feature that introduces a concept adds it to the
registry in the same pull request. The first two added this way are the design
system (spec 001) and storage budgets (spec 002), along with the manifest, which had
been a loose line in each plan. Constitution VI now points at the registry (v1.1.0).

**Rejected**: keeping the list in the plan template only. A surface added later reached
the next plan only if its writer remembered, which is the failure the constitution
exists to prevent. Also rejected: asking older plans to answer surfaces that did not
exist when they were written, because a plan records what was considered at the time.

## 2026-10-25 — Find-and-replace edits reload open editors; live delivery comes later

**Context**: spec 003 (#13), FR-008. An agent's edit has to reach people who have the
page open.

**Decision**: option C. This feature reloads open editors, as every outside write does
today (unsaved keystrokes go into the page history, `docgen.go`). Delivering the edit
live into running sessions is follow-up #26.

**Rejected**: A, live delivery now. The server only relays Yjs updates (`collab.go`); it
would have to build and send them itself, which is a feature of its own. B alone. It
leaves the interruption in place with no plan to remove it.

## 2026-10-25 — Spec Kit for specs, a GitHub Projects board for tracking

**Decision**: features go through Spec Kit (github/spec-kit, pinned 1.2.3). `tasks.md`
is the source of truth. Issues on the board mirror it and are created by
`/speckit-github-taskstoissues`.

**Why**: the owner chose it. Specs keep the reasoning; the board keeps the status.

## 2026-10-25 — `AGENTS.md` is the shared instruction file; `CLAUDE.md` stays local

**Decision**: project instructions live in `AGENTS.md` and `.claude/rules/`. `CLAUDE.md`
remains gitignored.

**Why**: `.gitignore` excludes `CLAUDE.md` on purpose, because a committed one once
carried deployment details into the public repository.

**Rejected**: committing `CLAUDE.md`.

## 2026-10-25 — Agent parity is enforced by a manifest, a check and a property test

**Decision**: `capabilities.json` names every route and MCP tool. `check-parity.mjs`
(in `npm run check`) fails on anything the manifest does not know.
`parity_property_test.go` checks that REST and MCP give the same access verdicts. Gaps
are counted in `gapBudget`, which may only go down.

**Why**: checks used to be added on one door and found missing on the other.

**Rejected**: a generic code knowledge graph. Grep and a language server are enough at
about 70k lines, and the manifest is the graph that matters. In the Codebase-Memory
paper a graph used about 10× fewer tokens but answered correctly 83% of the time,
against 92% without one.

## 2026-10-25 — Shared capability code goes in `server/cap_*.go`

**Decision**: functions that REST and MCP both call live in `server/cap_*.go`.

**Why**: `server/ops.go` already exists (operational hardening), so `ops_*.go` would
mislead.

## 2026-10-25 — Workspace membership: no MCP tool; an admin's read-write token may manage members (#1, option B)

**Decision**: there is no MCP tool for membership. A workspace admin's read-write REST
token may manage members, as `wiki/workspaces.md` already documents. The README and
`whoami` say so. In `capabilities.json`, `workspaces.membership` is `tokenReachable`
with `"accepted": true`.

**Why**: what the wiki documented and what the code did disagreed. The owner chose to
keep the documented behaviour.

**Rejected**: A, closing the routes to tokens.

## 2026-10-25 — Keep SQLite (spec 002)

**Decision**: stay on SQLite (`modernc.org/sqlite`). Upgrade the driver and measure with
benchmarks.

**Rejected**: DuckDB. It needs cgo, which breaks `CGO_ENABLED=0` release builds. It
downloads extensions at runtime. Its optimistic concurrency produces conflicts when two
writers touch the same row.

## 2026-10-25 — Design system: DTCG tokens and a Base UI component layer (spec 001)

**Decision**: W3C/DTCG 2025.10 tokens, plus a component layer in `web/src/ui/` built on
Base UI (headless). BlockNote keeps `@blocknote/mantine` for now.

**Rejected**: Mantine as the app's component library. It is styled, and those styles
would be overridden everywhere. shadcn/ui, because it requires Tailwind.

## 2026-10-25 — Feature branches folded into the working branch

**Decision**: the four `feat/*` branches (full width, column presets, picker
descriptions, database templates) were merged into `parity-manifest`.

**Why**: the owner asked for the functionality to be in one place.

## 2026-10-25 — No agent teams yet

**Decision**: one agent at a time on this codebase for now.

**Why**: agent teams are experimental. Parallel agents would collide in the hotspot
files (`server/server.go`, `web/src/styles.css`) until those are split.
