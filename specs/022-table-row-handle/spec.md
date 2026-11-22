# Feature Specification: Every table row has a drag handle, a + and a row menu

**Feature Branch**: `claude/spec-022-row-handle`

**Created**: 2026-11-22

**Status**: Draft

**Issues**: #370 (P1); #4 (agents put pages in order)

**Input**: Owner, 2026-10-30, on #370 (marked important), with three Notion
screenshots:

> Every row in a table view gets, on hover (and for the keyboard on focus),
> the same two controls a block in a document has: a drag handle (⋮⋮) to move
> the row up or down by hand; a row menu (click the handle, or a shortcut)
> with what can be done to that row: open it (and "Open in" side peek / new
> tab), edit a property, copy link, duplicate, move to, move to trash, plus
> "last edited by / when" as information. A + beside the handle adds a new
> row right there.
>
> Dragging a row undoes the view's sorting: once a person puts rows in their
> own order, the sort no longer applies and the view shows the manual order.
> (Notion shows "Remove sort?" in this case; the owner's call is that the drag
> itself removes it.)

## Context

How table rows work today, from the code graph (`codegraph explore` on the
table view, row actions, row position and view sort, 2026-11-22) and the
source:

- **A row is a page** whose parent is the database page. Every page already
  has a `position` (a number), and a database's rows are read in
  `position, created_at` order when no sort applies
  (`handleCollectionRows`, `server/collections.go`). So one manual order per
  database already exists in the data; nobody can change it for rows yet.
- **Moving a page among its siblings** exists for the sidebar: the browser
  sends a new `position` halfway between its neighbours (`PATCH` a page,
  `server/pages.go`), and `reindex-siblings` renumbers 1, 2, 3, … when the gap
  gets too small. A move writes one row, not every row.
- **Agents cannot set a position**: `update_page` moves a page under a parent
  but not among its siblings. That is parity gap `pages.order` in
  `capabilities.json`, filed as #4.
- **The table view** (`TableView`, `web/src/components/CollectionView.tsx`)
  draws each row as a title cell plus one cell per property. A row has no
  handle, no menu and no right-click; it opens by clicking its title
  (`useOpenRow`, `peek.ts`). Column headers already drag (spec 012, #132), and
  sub-items draw as a tree when the view has a sub-item relation.
- **A board card has a menu** (`CardMenu`, `BoardView.tsx`): Open, Open in new
  tab, Move to (another column), Move to trash. The sidebar's page menu has
  more (favourites, duplicate, move to workspace, export, trash). These are
  the actions a row menu reuses; spec 010 says each function keeps one icon in
  every menu.
- **Sort is per view and can be personal** (spec 013): a sort change made in
  a view is the viewer's own until they choose "Save for everyone" in the bar
  (`usePersonalViews`, `ViewChangeBar`). A locked view's settings cannot be
  saved for everyone (`checkViewsUnlocked`).
- **Earlier decisions to respect** (`docs/decisions.md`): column order is per
  view (2026-11-02); board cards keep no manual order inside a column
  (2026-10-27, "a manual order is a feature of its own: a stored position,
  conflicts with sort, and MCP parity"). This spec is that feature, for
  tables. Board cards stay as they are.

## Clarifications

### Session 2026-11-22

Decided by Claude on the recommendations, at the owner's request ("Choices?
Seriously. You need to do a better job of helping me out", 2026-11-22):

- Q: Is the manual order one per database, or one per view? → A: **one per
  database**: the rows' existing `position`. A drag in one table view moves
  the row in every view without a sort. Nothing new is stored, a move writes
  one row, and agents get the same move (closes #4). Turned down: one order
  per view (a stored list of every row id in each view, every new row placed
  in every list, a per-view move for agents; about twice the work).
- Q: What does "Move to" in the row menu do? → A: **left out of this spec**,
  filed as #869: moving a row into another database or out of one
  drops or remaps properties, which needs its own design. Turned down: a row
  becomes a plain page (properties dropped), and a move to another database
  keeping matching properties.
- Owner, 2026-11-22, on Q1: "Later we'll add a "change everywhere" option per
  view". So views will get an order of their own later, with a "change
  everywhere" option that applies a move to the shared order. This spec builds
  only the shared order, and must not block that: the place a drag or an
  agent's move writes its order is decided in one function, a move names its
  view (unused today), and nothing assumes a view can never hold an order of
  its own. Filed as #870.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Drag a row to a new place (Priority: P1)

A person hovers a row in a table view. A handle (⋮⋮) and a + appear to the
left of the row, as they do beside a block in a document. They drag the
handle up or down; a line shows where the row will land; they let go and the
row stays there, after a reload too, for everyone who sees the database
without a sort.

**Why this priority**: it is the core of #370, and the order a person makes
by hand is what the rest builds on.

**Independent Test**: on a table view with no sort, drag the third row above
the first, reload, and see it first.

**Acceptance Scenarios**:

1. **Given** a table view with no sort, **When** a person drags a row's handle
   between two other rows and drops, **Then** the row lands between them, the
   line showed that spot during the drag, and the new order survives a
   reload.
2. **Given** a drag in progress, **When** the person presses Escape or drops
   outside the table, **Then** nothing moves.
3. **Given** a view with a filter, **When** a row is dragged between two
   visible rows, **Then** it lands between those two in the database's order,
   whatever hidden rows lie between them.
4. **Given** a view showing sub-items as a tree, **When** a row is dragged,
   **Then** it moves among the rows at its own level under the same parent,
   and the line refuses a spot at another level.
5. **Given** someone who may only read the database, **When** they hover a
   row, **Then** no handle and no + appear; the row menu still opens from
   the keyboard and right-click, with only the actions they may take.

---

### User Story 2 - A drag in a sorted view removes the sort (Priority: P1)

A person drags a row in a view that has a sort. The drag itself removes the
sort (no "Remove sort?" question, the owner's call), the view now shows the
manual order with the row where it was dropped, and the bar that already
offers "Save for everyone" or "Reset" for a personal view change shows it.

**Why this priority**: without it a drag in a sorted view would snap back,
which reads as broken.

**Independent Test**: sort a view by name, drag the last row to the top,
see the sort gone and the row first.

**Acceptance Scenarios**:

1. **Given** a view sorted by a property, **When** a row is dropped, **Then**
   the sort is removed for this person, the rows show in the manual order
   with the dropped row where the line showed it, and the bar offers "Save
   for everyone" and "Reset".
2. **Given** a sort was removed by a drag, **When** the person chooses
   "Reset", **Then** the sort is back; the row keeps its new place in the
   manual order.
3. **Given** a sorted view whose views are locked, **When** a person hovers a
   row, **Then** the handle still opens the row menu, but the row cannot be
   dragged, and the handle's tooltip says why (the view is locked and
   sorted).
4. **Given** a sorted view, **When** the drag starts, **Then** the rows show
   in manual order at once, so the line shows a spot in the order the drop
   will keep.

---

### User Story 3 - The row menu (Priority: P1)

A person clicks a row's handle, right-clicks the row, or presses a shortcut
on a focused row. A menu opens with what can be done to that row.

**Why this priority**: half of #370, and the only way to these actions in a
table today is opening the row first.

**Independent Test**: open the menu on a row from the handle, from a
right-click and from the keyboard; use each item once.

**Acceptance Scenarios**:

1. **Given** a row, **When** its menu opens, **Then** it offers: Open, Open
   in (side peek, centre peek, new tab), Edit property (a submenu of the
   row's properties, each opening its editor), Add to/Remove from
   favourites, Comment, Copy link, Duplicate, Move to trash, and at the
   bottom, as text, when it was last edited and by whom.
2. **Given** the menu, **When** the person picks Duplicate, **Then** a copy
   of the row appears right below it, with the same properties and content
   and the title marked as a copy, as a page duplicate is today.
3. **Given** the menu, **When** the person picks Move to trash, **Then** the
   row leaves the view and can be restored from the trash, as from the board
   card's menu.
4. **Given** the menu, **When** it is opened with the keyboard, **Then** focus
   moves into it, arrows move through it, Escape closes it and returns focus
   to the row.
5. Every item has an icon from the menu registry; no two functions share
   one (spec 010).

---

### User Story 4 - The + adds a row right there (Priority: P2)

A person hovers a row and clicks the + beside its handle. A new, empty row
appears right below it with its title ready to type.

**Why this priority**: useful but smaller; "+ New" at the bottom already
adds rows.

**Independent Test**: click + on the second row, type a title, see the new
row third, also after a reload.

**Acceptance Scenarios**:

1. **Given** a view with no sort, **When** a person clicks a row's +, **Then**
   a new row appears directly below it, its title in edit mode.
2. **Given** a view with a filter, **When** a row is added with +, **Then**
   it gets the values that keep it inside the filter, as "+ New" does
   today.
3. **Given** a sorted view, **When** a row is added with +, **Then** the sort
   stays, and the new row lands where the sort puts it (an empty value sorts
   as it does today); its manual place is below the row whose + was used.
4. **Given** Alt/Option held while clicking +, **Then** the row is added
   above instead of below.

---

### User Story 5 - Keyboard and touch (Priority: P2)

A person without a mouse moves a row and opens its menu with the keyboard.
A person on a phone, where nothing hovers, can do the same by touch.

**Why this priority**: #370 asks for the keyboard path, and the owner works
from a phone.

**Independent Test**: focus a row, open its menu by shortcut, move the row
two places up with keys; on a phone-sized touch screen, open the menu and
move a row.

**Acceptance Scenarios**:

1. **Given** keyboard focus on a row, **When** the person presses the row
   menu shortcut (⌘/ on a Mac, Ctrl+/ elsewhere, Notion's shortcut, free in
   nigari's shortcut list today), **Then**
   the row menu opens.
2. **Given** keyboard focus on a row, **When** the person presses
   ⌘/Ctrl+Shift+↑ or ↓, **Then** the row moves one place up or down in the
   manual order (removing a sort as a drag does), and focus stays on it.
3. **Given** a device that cannot hover, **When** the table shows, **Then**
   each row's handle is visible without hovering, a tap on it opens the
   row menu, and a press-and-hold on it starts a drag.
4. **Given** the hover tooltip, **Then** it reads "Drag to move" and "Click or
   ⌘/ to open menu" (the shortcut shown for the platform).

---

### User Story 6 - Agents move rows too (Priority: P2)

An agent can put a row (and any page) in a given place among its siblings,
with the same checks as a person, so agents and people can do the same
things (constitution II).

**Why this priority**: agent parity is a rule of the project, and #4 asks for
the same move for pages.

**Independent Test**: an agent moves a row after another row; a person sees
the new order.

**Acceptance Scenarios**:

1. **Given** an agent with write access, **When** it moves a row to just
   after (or before) a named sibling, **Then** the order changes as a
   person's drag would, and the activity log names the agent.
2. **Given** an agent with read scope, or a workspace closed to agents,
   **When** it tries the move, **Then** it is refused with the same reason a
   person would get.
3. **Given** the move, **Then** it removes no view's sort: sorting is a view
   setting, and an agent changes it with the view tools it already has.

---

### Edge Cases

- **Two people drag at once**: the later move wins; the other person's view
  picks up the new order through the existing live update.
- **Running out of room between two positions** after many moves: the
  existing renumbering happens, without the person noticing.
- **A row dragged onto itself or back to its own place**: nothing is written.
- **A drag in an embedded database's own view** (spec 014): it removes the
  embed's sort, not the database's; the manual order is the database's.
- **Grouped tables** (the coming Group by epic #823): a drag stays inside its
  group; changing group by dragging is #823's work.
- **Very long tables** (rows loaded page by page): a row can only be dropped
  next to rows that are loaded; the view scrolls while dragging near its top
  or bottom edge.
- **A row the person may not edit** in a database they may edit (row-level
  access does not exist today): not applicable; the database's access
  decides.
- **The title cell's own click** still opens the row; the handle is a
  separate target, so opening and dragging never compete.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each row of a table view MUST show a drag handle and a + to its
  left on hover and on keyboard focus, for anyone who may edit the
  database; on a device that cannot hover, the handle MUST be visible at all
  times.
- **FR-002**: Dragging a row's handle MUST show a line where the row will
  land, and the drop MUST land exactly there.
- **FR-003**: A drop MUST store the row's new place in the manual order, by
  writing that one row only, and the order MUST survive a reload and show for
  every viewer of a view without a sort.
- **FR-004**: A drop in a sorted view MUST remove that view's sort for the
  person dragging, as a personal view change the existing bar can save for
  everyone or reset; no confirmation is asked.
- **FR-005**: In a sorted view whose views are locked, rows MUST NOT drag;
  the handle's tooltip MUST say why.
- **FR-006**: In a tree of sub-items, a drag MUST keep a row among the rows
  at its own level under the same parent.
- **FR-007**: A row menu MUST open from the handle (click or tap), from a
  right-click on the row, and from ⌘/ or Ctrl+/ on a focused row, and MUST
  offer the items in US3 scenario 1 that the person may use.
- **FR-008**: Every row menu item MUST be built from the shared menu
  component with an icon from the menu registry, one icon per function, the
  same icon as the same function elsewhere.
- **FR-009**: The menu MUST show when the row was last edited and, where
  known, by whom (a person or an agent).
- **FR-010**: The + MUST add a new row directly below the row (above with
  Alt/Option), carrying the view's filter values, with its title ready to
  type; in a sorted view the sort stays.
- **FR-011**: ⌘/Ctrl+Shift+↑/↓ on a focused row MUST move it one place in the
  manual order, under the same rules as a drag.
- **FR-012**: An agent MUST be able to put a row, or any page, before or
  after a named sibling, through the same checks a person's move passes
  (permission, workspace gate, read scope refused), logged in the activity
  log.
- **FR-013**: Every new string MUST be translated into German, Spanish and
  Dutch.
- **FR-014**: The wiki's table view page and agent tools page MUST describe
  the handle, the menu, the manual order and the agent move, with fresh
  screenshots.

### Key Entities

- **Row**: a page inside a database; its `position` is its place in the
  manual order.
- **Manual order**: the order of a database's rows when no sort applies (one
  per database).
- **View sort**: a view's sort, shared or the viewer's own (spec 013); a drag
  removes it as a personal change.
- **Row menu**: the actions on one row, shared in content and icons with the
  board card's and the sidebar's menus.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person can move a row to any loaded place in a table in one
  drag, and the row lands where the line showed it in 100% of the browser
  test's drops.
- **SC-002**: A drop writes one row: moving a row in a 10,000-row database
  changes one stored position (apart from the rare renumbering), and the move
  answers within the existing write budget.
- **SC-003**: Every row menu action is reachable without a mouse, and the
  browser test reaches each one by keyboard.
- **SC-004**: A row drag in a sorted view never snaps back: after the drop,
  the row is where it was dropped.
- **SC-005**: An agent's move and a person's move give the same order, shown
  by a REST/MCP parity test.
- **SC-006**: No design-system budget (raw buttons, literal sizes, colours)
  goes up.

## Assumptions

- **Table views only.** List, board, gallery, calendar and timeline keep
  their behaviour; board cards keep no manual order (decision 2026-10-27).
  A handle for list rows can follow as its own issue.
- **"Removes the sort" is personal first** (spec 013): the drag clears the
  sort for the person dragging, and the existing bar's "Save for everyone"
  makes it everyone's. This keeps one rule for every view change; the
  owner's "the drag itself removes it" holds (no question asked).
- **"Open in"** offers side peek, centre peek and new tab, which all exist
  (spec 007).
- **"Comment"** opens the row with its comments panel open (spec 017).
- **"Last edited by"** comes from the activity log's newest entry for the row;
  when there is none (old rows), only the time shows.
- **"Search actions"** at the top of Notion's menu is left out: the row menu
  is short enough to scan.
- **"Edit icon"** is left out of the menu: the icon is edited on the row's
  page.
- **The drop line** looks like the block drop line in a document (2px, the
  focus colour), so both drags read the same.
- **Touch**: press-and-hold on the handle starts a drag, a tap opens the
  menu; touch drag uses pointer events, as HTML drag does not work on touch.
