# Feature Specification: A click on a table row's name edits it; an Open button opens the row

**Feature Branch**: `claude/spec-026-title-cell-edit`

**Created**: 2026-11-26

**Status**: Draft

**Issues**: #981

**Input**: Owner, 2026-11-24, on #981, with screenshots of another app's
table: "rows should behave like table cells: a click edits". Today the name
cell is a link, so a click opens the row instead of renaming it. The name
should be edited in place, and a small Open button in the cell should open the
row, reading Close while that row is open in a peek. The answers to the open
questions (2026-11-24 and 2026-11-26) are in the issue's comments and under
Decisions below.

## Context

From the code graph (`codegraph explore` on `TableView`, `db-title-link`,
`useOpenRow`, `openCollectionRow`, `RowTitleInput`, `useRowKeys`, `editCell`,
`rowOpenAction`, `PeekPanel`, 2026-11-26) and the source:

- **The name cell is one button that opens the row.** In `TableView`
  (`CollectionView.tsx`) the title cell draws `.db-title-link`. A click calls
  `useOpenRow`, which follows the view's "Open pages in" setting through
  `rowOpenAction` (`peek.ts`): full page, side peek or centre peek, with
  ⌘/Ctrl and the middle button opening a new tab. Renaming a row from the
  table is not possible except for a row just added.
- **An in-place name field already exists.** `RowTitleInput` is drawn in the
  cell only for the row the gutter's + has just added (`editTitleId`, spec 022
  US4): Enter or leaving saves, Escape cancels. It is the field this feature
  reuses, so the two ways into it behave the same.
- **The table does not know which row is in the peek.** `App` owns the peek
  (`peekId`, carried in the address as `?peek=`) and renders `PeekPanel`. The
  table only receives `onPeek` to open one, so drawing "Close" on the open
  row means passing that knowledge down. This includes a database embedded in
  a document, which opens its rows in the same peek.
- **The same row can be drawn twice.** In a grouped table (spec 024) a row
  with several values appears in each of its groups. Sub-items (a tree on a
  relation) are drawn indented under their parent. Both are title cells like
  any other.
- **Keyboard:** the row shortcuts (`useRowKeys`: ⌘/ for the row menu,
  ⌘⇧↑/↓ to move it) work when anything in the row has focus. Today Tab
  reaches the name button and Enter opens the row.
- **Other views are not in scope.** The list, board, gallery, calendar and
  timeline open a row from its title, as they do today (Assumptions).
- **Agents are not affected.** Renaming a row is already `update_page` over
  MCP, and opening a row is a matter of the interface. No route or tool
  changes.

## Clarifications

### Session 2026-11-26

- Q: On which screens is every row's Open button shown all the time, instead of only on hover? → A: On touch screens that cannot hover (phones and tablets alike); on hover elsewhere, however narrow the window (owner "A").
- Q: Does the new behaviour apply to tables only, or also to lists, boards and galleries? → A: Tables only; the other views keep opening a row from its title (owner "A").
- Q: What is clicked to edit, the name's text or the cell? → A: The cell (owner, 2026-11-26: "The element you're working with is the cell, not the text in the cell"). A click anywhere in the name cell edits, including the empty space beside a short name; the keyboard focus ring goes round the cell.
- Q (mockup C1): What does the button look like? → A: The word "Open" (and "Close"), outlined, sentence case (owner "C1 a"). Turned down: icon only (B), capitals as in the reference app (C).
- Q (mockup C2): How is the row open in the peek marked? → A: A soft tint (the soft accent colour) on the whole row, with its Close button (owner "C2a"). Turned down: the Close button alone (B), a tint on the name cell only (C).
- Q (mockup C3): Does a name cell show it can be edited when the pointer is over it? → A: A text cursor only, as every text cell; the row's hover shade and the Open button already say the row is live (owner "C3a"). Turned down: a faint outline round the cell (B).

## User Scenarios & Testing

### User Story 1: Rename a row by clicking its name (P1)

Someone with edit rights scans a table and wants to fix a row's name. They
click the name, the cell turns into a text field with the name in it, they
type, and Enter (or clicking elsewhere) saves it. Today the same click opens
the row, and renaming means opening it, editing the title and coming back.

**Why this priority**: this is the request. Without it nothing else in this
spec matters.

**Independent Test**: in a table, click a row's name, change it, press Enter:
the new name is stored and shown, and nothing opened.

**Acceptance Scenarios**:

1. **Given** an editor and a table, **When** they click a row's name, **Then**
   the cell becomes a text field holding the name, with the cursor in it, and
   no page or peek opens.
2. **Given** a name being edited, **When** they press Enter or move the focus
   out of the field, **Then** the new name is saved and the cell shows it.
3. **Given** a name being edited, **When** they press Escape, **Then** the old
   name stays and nothing is saved.
4. **Given** an empty name saved, **Then** the row reads "Untitled", as an
   unnamed row does today.
5. **Given** a name being edited, **When** they double-click inside it,
   **Then** a word is selected, as in any text field; the row does not open.
6. **Given** a phone, **When** they tap a row's name, **Then** the name is
   edited in place with the keyboard up, as on a computer.

---

### User Story 2: Open a row with the Open button (P1)

The click on the name no longer opens the row, so the cell offers an Open
button at its right edge. It opens the row the way the view is set to open
pages: full page, side peek or centre peek.

**Why this priority**: without it, US1 takes away the quickest way to open a
row.

**Independent Test**: point at a row, press its Open button: the row opens as
the view's "Open pages in" setting says.

**Acceptance Scenarios**:

1. **Given** a computer and a table, **When** the pointer is over a row or
   its name cell has the focus, **Then** that row's name cell shows an Open
   button at its right edge. Other rows show none.
2. **Given** a touch screen that cannot hover (a phone or a tablet), **Then** every
   row's name cell shows its Open button all the time.
3. **Given** a long name in a narrow column, **Then** the Open button sits
   over the end of the name, and the name is cut off under it, not wrapped.
4. **When** the Open button is pressed, **Then** the row opens as the view is
   set to open pages, exactly as a click on the name did before.
5. **When** the Open button is ⌘/Ctrl-clicked or middle-clicked, **Then** the
   row opens in a new tab.
6. **Given** a name being edited, **Then** that row's icon and Open button are
   hidden, and the field shows the whole name, flat in the cell (a slightly
   lighter fill and a thin rounded outline, no lift or shadow). Every other
   row keeps its Open button. When editing ends, they come back.

---

### User Story 3: Close the peek from the row (P2)

A row opened in a side peek stays visible in the table beside it. Its button
now reads Close and stays visible, so the same place that opened the peek
also closes it, and the open row is marked.

**Why this priority**: it completes the Open button, but closing the peek
already works from the peek's own Close button.

**Independent Test**: open a row in a side peek with its Open button: the
button reads Close and the row is marked; press it and the peek closes.

**Acceptance Scenarios**:

1. **Given** a row open in a peek, **Then** its name cell shows a Close
   button, visible without hovering, and the row is marked as the open one.
2. **When** Close is pressed, **Then** the peek closes and the button reads
   Open again (shown on hover, or always on a phone).
3. **Given** a row open in a peek, **When** another row's Open button is
   pressed, **Then** the peek shows that row; the Close button and the mark
   move to it.
4. **Given** the same row drawn twice (a grouped table, a row in two groups),
   **Then** both copies show Close and the mark.
5. **Given** a view that opens pages as a full page, **Then** there is no
   Close state: Open leaves the table, as a click on the name did.

---

### User Story 4: Keyboard (P2)

Someone working without a mouse reaches a row's name with Tab or the arrow
keys and renames or opens it.

**Why this priority**: the keyboard path is part of every table interaction
here, but most people will use the pointer.

**Independent Test**: Tab to a row's name, press Enter, type, Enter: saved.
Tab once more from the name: the Open button has the focus; Enter opens.

**Acceptance Scenarios**:

1. **Given** a name cell with the focus, **When** Enter is pressed, **Then**
   the name is edited in place (owner's Q1 = A).
2. **Given** a name cell with the focus, **When** Tab is pressed, **Then** the
   focus moves to that row's Open (or Close) button; Enter or Space presses
   it.
3. **Given** a name cell or its button with the focus, **Then** ⌘/ still
   opens the row's menu and ⌘⇧↑/↓ still moves the row.

---

### User Story 5: Readers (P2)

Someone who may only read the database opens rows as today.

**Why this priority**: readers must not lose the way into a row.

**Independent Test**: as a reader, click a row's name: the row opens; the
Open button is there too.

**Acceptance Scenarios**:

1. **Given** a reader, **When** they click or tap a row's name, **Then** the
   row opens as the view is set to open pages, as today; nothing becomes
   editable.
2. **Given** a reader, **Then** the Open (and Close) button behaves as for an
   editor (owner's Q3: "Open remains").
3. **Given** anyone, **When** they ⌘/Ctrl-click or middle-click a row's name,
   **Then** the row opens in a new tab.

### Edge cases

- **Sub-items:** an indented row's name edits and opens the same way; the
  expand/collapse arrow before it keeps its own click.
- **Row icons and tags:** the page icon stays before the name (hidden while
  editing, US2 6); tags under the name are not part of the field.
- **A row added with the gutter's +:** it opens with its name in edit, as
  today (spec 022 US4); this spec does not change that path.
- **A row being dragged** (spec 022, 024): pressing on the name to edit must
  not start a row drag; the handle is the only way to drag.
- **The row's long-press / right-click menu** stays as today; a right-click
  inside the field being edited keeps the browser's own menu (paste,
  spelling), as for other fields.
- **The name changes elsewhere while it is being edited** (another person, an
  agent): the field keeps what is being typed; on save the typed name wins,
  as with other cells.
- **Saving fails** (connection lost, rights withdrawn): the old name comes
  back and the reason is shown, as for other cells.
- **A database in a document**: same behaviour, and Close shows for the row
  open in the peek beside that document.
- **The peek is closed some other way** (its own Close, Escape, Back): the
  row's button reads Open again and the mark goes.

## Requirements

### Functional Requirements

- **FR-001**: For someone who may edit the database, a click, a tap or Enter
  on a row's name cell in a table MUST edit the name in place; it MUST NOT open
  the row. The target is the whole cell, not only the text: the empty space
  beside a short name edits too, and the keyboard focus ring goes round the
  cell (owner, Clarifications).
- **FR-002**: The field MUST save on Enter and on leaving it, MUST cancel on
  Escape, and MUST save an empty name as an unnamed row ("Untitled"). It MUST
  behave the same as the field a row added with + gets today.
- **FR-003**: A double click on a name MUST do what a single click does (edit;
  the second click selects a word). It MUST NOT open the row.
- **FR-004**: Each row's name cell MUST have an Open button at its right
  edge. On a screen with a hovering pointer it MUST show while the row is
  hovered or its name cell holds the focus; on a screen without one it MUST
  show at all times.
- **FR-005**: The Open button MUST open the row as the view's "Open pages in"
  setting says, with the same rules as today's click on the name (⌘/Ctrl and
  the middle button open a new tab; the account's "Open rows in new tab"
  applies to full-page views).
- **FR-006**: The Open button MUST sit over the end of a name too long for the
  column, which is cut off under it; the row's height MUST NOT change.
- **FR-007**: While a name is edited, the field MUST fill the cell flat
  (lighter fill, thin rounded outline, no lift or shadow) and show the whole
  name; that row's icon and Open button MUST be hidden.
- **FR-008**: While a row is open in a peek, its name cell MUST show a Close
  button that is always visible, and the row MUST be marked as the open one,
  in every copy of that row the table draws. Pressing Close MUST close the
  peek.
- **FR-009**: Tab from a name cell MUST reach that row's Open/Close button.
  The row shortcuts (⌘/, ⌘⇧↑/↓) MUST keep working from both.
- **FR-010**: For a reader, a click or tap on a name MUST open the row as
  today, and the Open/Close button MUST be shown as for an editor.
- **FR-011**: ⌘/Ctrl-click and a middle click on a name MUST open the row in
  a new tab, for editors and readers alike.
- **FR-012**: The button's text ("Open", "Close") MUST go through translation
  (German, Spanish, Dutch), and the button MUST have an accessible name that
  says which row it opens or closes.
- **FR-013**: The button and the field MUST be built from the design system
  (`web/src/ui/`, its tokens), in light and dark.
- **FR-014**: The button MUST read "Open" (and "Close" for the row in the
  peek) as a word, outlined, in sentence case (mockup C1 A).
- **FR-015**: The row open in the peek MUST be marked by a soft tint of the
  accent colour over the whole row (every copy of it), beside its Close
  button (mockup C2 A).
- **FR-016**: Over a name cell an editor's pointer MUST be a text cursor, with
  no outline or other hint beyond the row's hover shade (mockup C3 A).

## Decisions

| # | Decision | Turned down |
| --- | --- | --- |
| Phone | The Open button is always shown; a tap on the name edits (owner, 2026-11-26, correcting 2026-11-24) | Tap opens and no button on touch screens (owner's first answer, withdrawn) |
| Editing look | Flat in the cell, lighter fill, thin rounded outline, whole name shown, icon and button hidden on that row (owner's screenshots, 2026-11-26: "Not raised") | A raised field over the cell |
| Q1 | Enter on a focused name edits; Tab then reaches the button (owner "Q1a") | Enter opens and F2 or typing edits (B) |
| Q2 | A double click equals a single click (owner "Q2a") | A double click opens the row (B) |
| Q3 | Readers keep click-to-open and also see the button; ⌘/Ctrl and middle click open a new tab for everyone (owner: "Open remains", "Yes") | No button for readers (A); button for readers with a dead click on the name (B) |
| Always shown | Decided by the kind of pointer (a touch screen that cannot hover, phones and tablets alike), not by width: a narrow window on a computer still hovers (owner "A", 2026-11-26, Claude's recommendation) | By screen width, 720 px or less (B); always, on every screen (C) |
| Scope | Table views only (owner "A", 2026-11-26, Claude's recommendation): names sit in cells and get renamed in passing there; cards and list lines are mostly opened | Tables and lists (B); every view with a title (C) |

## Success Criteria

### Measurable Outcomes

- **SC-001**: An editor renames a row from the table in one click, typing and
  Enter, without the row opening (today: open, edit the title, come back).
- **SC-002**: Every way a row opened before (the view's setting, new tab,
  account preference) still opens it from the Open button, and a reader's
  click on a name still opens it.
- **SC-003**: On a phone at 390 px wide, every row in view shows its Open
  button, and editing a name shows the whole name.
- **SC-004**: With a row open in a side peek, its Close button is visible
  without hovering, and one press closes the peek.
- **SC-005**: The table draws no slower than today: a table of 5,000 rows,
  measured before and after, takes no measurably longer to draw.

## Assumptions

- Only table views change (owner, Clarifications). The list, board, gallery,
  calendar and timeline keep opening a row from its title; a later request can
  bring them in line.
- The column's own name (the heading "Name") and its menu are not part of
  this change.
- How the button looks (text or icon, size, where the mark goes on an open
  row) is settled by the mockup the owner approves before anything is built
  (`.claude/rules/frontend.md`), within FR-004 to FR-008.
- No server, MCP or stored data changes: a rename is today's page update, and
  which row is in the peek is already known to the app.
