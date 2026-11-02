# Feature Specification: Database views read comfortably and handle the way people expect

**Feature Branch**: `claude/handoff-14` (spec); the helper stream's branch for the build

**Created**: 2026-11-02

**Status**: Draft

**Issues**: epic #426; this spec covers #131, #132, #133, #280, #270

**Input**: Owner, 2026-11-02: the database views epic (#426), "Ok" to writing
its spec. Answered while asked: two specs, this one for how views look and
handle and spec 013 for what views store ("1 A"); dragging a column header
changes the order in that view only ("2 A"); anyone who can edit a database
may lock its views ("3 A", which belongs to spec 013).

## Context

How a database view works today, from the code graph and the source
(`codegraph explore` on the views code, 2026-11-02):

- **Text size.** Table cells are 13.5px and the header 12.5px
  (`web/src/styles.css`, `.db-table th, .db-table td`), literal sizes outside
  the design system's type scale, which has 13px (`--font-size-sm`) and 14px
  (`--font-size-md`). Documents read at a larger size, so a table inside a
  document looks smaller than the text around it (#131).
- **Column order.** A column can be resized by dragging the edge of its
  header; the width is stored on the view (`colWidths` in the view's
  settings), so two views of one database can be laid out differently. The
  order of columns can only be changed in the Properties dialog, which moves
  the property for every view (#132).
- **Board drag.** Cards are dragged with pointer events
  (`web/src/boardDrag.ts`), so mouse and touch both work: a floating card
  follows the pointer and the column under it is highlighted. Nothing shows
  where in the column the card will go; on release it joins the column and
  takes its place by the view's sort (#133).
- **Toolbar.** The toolbar above a view (`CollectionView.tsx`) is always
  shown, on a database's own page and in a database embedded in a document.
  It holds Filter, Sort, Search, a **Properties** button (with the sliders
  icon people expect for Settings), an unlabelled **⋯** "View options" menu
  (rename, move left or right, remove, how rows open), loose dropdowns for
  some view types (a timeline's start and end date, a table's sub-items), and
  **New** (#270, #280).
- **What a later feature must respect.** Every menu is the design system's
  menu component with one icon per function (spec 010, `check-menu-icons`);
  raw buttons and literal sizes only go down (spec 001, `check-tokens`); an
  embedded database shows a reduced toolbar and keeps its own view settings
  (#22, #26).

## Clarifications

### Session 2026-11-02

- Q: One spec for the whole epic, or two? → A: Two (owner: "1 A"). This spec
  is the five issues about how a view looks and handles, which are mostly in
  the interface and can start first. Spec 013 takes the five about what a
  view stores (#18 Status, #19 quick filters and sub-groups, #279 personal
  filters, #281 lock, #178 activity log), which change the server and the
  agent tools.
- Q: Dragging a column header changes the order where? → A: In that view only,
  as column widths already are (owner: "2 A"). The Properties dialog still
  sets the order a view starts from.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A table is as easy to read as the text around it (Priority: P1)

A person opens a database, on its own page or embedded in a document, and
reads the table without leaning in. Cells and headers are on the same type
scale as the rest of the product, so the table no longer looks a size smaller
than the paragraph above it.

**Why this priority**: it affects every table every day, it is the first
thing the owner noticed (#131), and it is small.

**Independent Test**: open a table in light and dark at desktop and phone
width; the cell and header text use the type scale's sizes, and rows and
columns still fit their content.

**Acceptance Scenarios**:

1. **Given** a table view, **When** it is shown, **Then** its cells are at the
   type scale's body size and its header one step smaller, no longer the old
   literal sizes.
2. **Given** a table with long titles and many columns, **When** it is shown at
   the new size on a desktop and a phone, **Then** rows stay one line high
   unless a cell wraps by design, and no column is cut off that was not
   before.
3. **Given** a database embedded in a document, **When** it is shown, **Then**
   its table text is the same size as on the database's own page.

---

### User Story 2 - Move a column by dragging its header (Priority: P1)

A person wants Status next to the title in this view. They drag the Status
header sideways; a marker shows where it will drop; they let go and the
column is there. Another view of the same database keeps its own order. A
person who cannot or does not use a mouse does the same from the header's
menu.

**Why this priority**: people expect it from spreadsheets and Notion, and
today the header ignores the drag (#132).

**Independent Test**: in a table view, drag one header past another and
reload; the new order is kept in that view, the other views of the database
and the Properties dialog are unchanged, and the same move is possible from
the header's menu with the keyboard.

**Acceptance Scenarios**:

1. **Given** a table view, **When** a person drags a column header sideways,
   **Then** a marker between two columns shows where it will drop, and on
   release the column moves there.
2. **Given** a column moved in one view, **When** the page is reloaded, or
   another person opens that view, **Then** the column is where it was moved.
3. **Given** a database with two table views, **When** a column is moved in
   one, **Then** the other view's order and the Properties dialog's order are
   unchanged.
4. **Given** a header's menu, **When** a person chooses **Move left** or
   **Move right** (keyboard only), **Then** the column moves one place and
   focus stays on that header.
5. **Given** a property added to the database after columns were moved,
   **When** the view is shown, **Then** the new property appears as it does
   today (after the others), and the moved columns keep their places.
6. **Given** a drag that starts on the edge of a header, **When** it moves,
   **Then** it resizes the column as today; only a drag on the header itself
   moves it.
7. **Given** the title column, **When** a person tries to drag it, **Then** it
   stays first.
8. **Given** an agent that reads or writes the view, **When** it sets or reads
   the view's settings, **Then** it can see and set the column order like the
   widths (agent parity).

---

### User Story 3 - A board drag shows where the card lands (Priority: P2)

A person drags a card to another column of a board. While they drag, the
column under the pointer is clearly the target, and a place marker in it shows
where the card will appear, which is where the view's sort puts it. They know
before letting go what will happen.

**Why this priority**: the drag works, but it does not say where the card
goes, and a card that lands elsewhere than expected feels broken (#133).

**Independent Test**: on a board sorted by a property, drag a card over
another column; a marker appears at the place the sort will give it, and on
release the card is there. Repeat with a finger on a phone and with reduced
motion turned on.

**Acceptance Scenarios**:

1. **Given** a board, **When** a card is dragged over a column, **Then** that
   column is shown as the target in the design system's colours, and a marker
   inside it shows the place the card will take.
2. **Given** a board with a sort, **When** the card is dropped, **Then** it
   appears exactly where the marker was.
3. **Given** a board without a sort, **When** a card is dragged over a column,
   **Then** the marker is at the place the card will actually take there, not
   at the pointer.
4. **Given** reduced motion, **When** a card is dragged, **Then** the marker
   appears without animation.
5. **Given** a touch screen, **When** a card is dragged with a finger, **Then**
   the target and marker show as they do with a mouse.
6. **Given** a card dragged back over its own column, **When** it is shown,
   **Then** the marker shows its own place and dropping changes nothing.

---

### User Story 4 - A view's toolbar has one Settings button (Priority: P2)

A person wants to change how a view works: its name, layout, which
properties show, how rows open, a timeline's dates, the database's
properties. Today that is spread over a **Properties** button, an unlabelled
**⋯** and loose dropdowns. Now there is one **Settings** button, with the
sliders icon, that opens a panel in sections: the view's settings first,
then the database's. Each item shows its current value. Filter, Sort,
Search and New stay in the toolbar, because they are used all the time.

**Why this priority**: three or four places to configure one view is hard to
learn, and the Properties button wears the icon that means Settings (#270).

**Independent Test**: from the Settings panel alone, everything that the
**⋯** menu, the **Properties** button and the per-view dropdowns did before
can be reached and done, by mouse and by keyboard, on desktop and phone.

**Acceptance Scenarios**:

1. **Given** a database's own page, **When** it is shown, **Then** the toolbar
   has one icon button with the sliders icon and the tooltip **Settings**,
   just before **New**, and no **Properties** or **⋯** button.
2. **Given** the Settings panel, **When** it opens, **Then** it shows a **View
   settings** section (view name, layout, property visibility with a count,
   how rows open, and the view type's own options such as a timeline's dates
   or a table's sub-items), then a divider and **Move left**, **Move right**
   and **Remove view** (in the danger colour, last), then a **Database
   settings** section (edit properties, templates).
3. **Given** an item with a current value, **When** the panel is shown,
   **Then** the value is shown on the right, and an item that opens a further
   page shows `›`.
4. **Given** the panel is open, **When** a person presses Escape, **Then** it
   closes and focus returns to the Settings button; Tab stays inside the
   panel while it is open.
5. **Given** a phone, **When** Settings is tapped, **Then** the panel opens as
   the other menus do on a phone (full width from the bottom).
6. **Given** a database embedded in a document, **When** Settings opens,
   **Then** it shows only the view settings, as the embed's reduced toolbar
   does today.
7. **Given** a person who can only read the database, **When** they open the
   toolbar, **Then** the settings that would change it are not offered, as
   today.
8. **Given** every item that was in the **⋯** menu, the **Properties** button
   and the toolbar dropdowns before, **When** the change ships, **Then** each
   one has a place in the panel; nothing is lost.

---

### User Story 5 - A database in a document stays quiet until you reach for it (Priority: P3)

A person reads a document with a database in it. The toolbar's buttons
(Filter, Sort, Settings, New) are folded away, so the document reads cleanly;
the moment the pointer is over the database, or keyboard focus enters it, the
buttons are there. On a touch screen they are always shown, because there is
no hover.

**Why this priority**: it is polish for documents that hold databases, and it
must not cost anyone the keyboard path (#280).

**Independent Test**: in a document with an embedded database, the toolbar's
buttons are hidden, appear on hover and on Tab into the view, stay while a
menu from them is open, and are always shown on a touch screen.

**Acceptance Scenarios**:

1. **Given** a database embedded in a document, **When** neither the pointer
   nor focus is in it, **Then** its toolbar's buttons are hidden but keep
   their space, so nothing below moves when they appear.
2. **Given** the same, **When** the pointer moves over the database, or Tab
   moves focus into it, **Then** the buttons appear.
3. **Given** a menu or the Settings panel opened from the toolbar, **When**
   the pointer leaves the database, **Then** the buttons stay until the menu
   closes.
4. **Given** a touch screen (no hover), **When** the document is shown,
   **Then** the buttons are always shown.
5. **Given** an active filter or sort on the view, **When** the buttons are
   folded away, **Then** the view still shows that it is filtered or sorted.
6. **Given** a database on its own page, **When** it is shown, **Then** the
   toolbar is always shown, as today.

---

### Edge Cases

- A column order stored on a view names a property that was since deleted:
  it is skipped, and the other columns keep their order.
- A view's column order and a hidden property: a hidden column keeps its
  place in the order, so showing it again puts it back where it was.
- Two people move columns in the same view at the same time: the last save
  wins, as with widths today.
- A board grouped by a property the person cannot change (read-only): no drag
  starts, as today, so no marker appears.
- A board column with hundreds of cards: the marker's place is found without
  the drag stuttering.
- The Settings panel on a view type with no options of its own: the
  view-type part is left out, not shown empty.
- A document with several embedded databases: each folds and shows its own
  toolbar on its own.
- A screen reader user: the folded buttons are still reachable and named;
  folding hides them visually, not from assistive technology.

## Requirements *(mandatory)*

### Functional Requirements

**Reading (#131)**

- **FR-001**: Table cells MUST use the type scale's body size and headers one
  step smaller, from design tokens, replacing the literal 13.5px and 12.5px.
- **FR-002**: Rows, column widths and wrapping MUST be checked and adjusted at
  the new size, on desktop and phone, in light and dark.

**Column order (#132)**

- **FR-003**: A person MUST be able to move a table column by dragging its
  header sideways, with a drop marker between columns while dragging.
- **FR-004**: The order MUST be stored on the view, like column widths, and
  MUST NOT change other views or the Properties dialog's order.
- **FR-005**: Each column header's menu MUST offer **Move left** and **Move
  right**, usable by keyboard, with focus kept on the moved header.
- **FR-006**: The title column MUST stay first; a drag on a header's edge MUST
  keep resizing.
- **FR-007**: Properties not in a view's stored order (added later) MUST
  appear after the ordered ones; deleted ones MUST be skipped.
- **FR-008**: Agents MUST be able to read and set a view's column order with
  the same checks as people (agent parity).

**Board drag (#133)**

- **FR-009**: While a card is dragged, the target column MUST be shown in the
  design system's colours, and a marker MUST show the place the card will
  take, which is the place the view's sort gives it.
- **FR-010**: On drop, the card MUST appear where the marker was.
- **FR-011**: The marker MUST appear without animation under reduced motion,
  and MUST work with a finger as with a mouse.

**Settings (#270)**

- **FR-012**: The toolbar MUST have one Settings button (sliders icon, tooltip
  **Settings**) just before **New**, replacing the **Properties** and **⋯**
  buttons and the per-view-type dropdowns.
- **FR-013**: The Settings panel MUST hold, in a **View settings** section:
  the view's name, layout, property visibility with a count, how rows open,
  and the view type's own options; then a divider with Move left, Move right
  and Remove view (danger colour, last); and in a **Database settings**
  section: edit properties and templates.
- **FR-014**: Every action the **⋯** menu, the **Properties** button and the
  toolbar dropdowns offered before MUST be reachable from the panel.
- **FR-015**: Items MUST show their current value; items that open a further
  page MUST show `›`; every item MUST have its function's icon (spec 010).
- **FR-016**: The panel MUST close on Escape with focus back on the button,
  keep Tab inside while open, and open from the bottom on a phone like the
  other menus.
- **FR-017**: An embedded database's panel MUST show only view settings; a
  read-only reader MUST NOT be offered changes.
- **FR-018**: Filter, Sort, Search and New MUST stay in the toolbar.

**Fold-away toolbar (#280)**

- **FR-019**: In a database embedded in a document, the toolbar's buttons MUST
  be hidden until the pointer is over the database or focus is inside it,
  keeping their space so the layout does not move.
- **FR-020**: The buttons MUST stay while a menu or panel opened from them is
  open, and MUST always show on a device without hover.
- **FR-021**: A filtered or sorted view MUST show that it is, even while its
  buttons are folded away.
- **FR-022**: A database on its own page MUST keep its toolbar always shown.

**Across**

- **FR-023**: Every new string MUST be translated (German, Spanish, Dutch).
- **FR-024**: The wiki pages for views and databases MUST describe the new
  behaviour, and screenshots the change makes stale MUST be retaken.
- **FR-025**: This spec MUST NOT raise the raw-button, literal-size or
  bundle budgets.

### Key Entities

- **View column order**: an ordered list of property ids stored on a table
  view, beside its column widths. Missing means the database's property
  order. Read and written wherever a view's settings are.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Table text uses the type scale's sizes, and no table text
  remains at the old literal sizes (checked by the design-system check).
- **SC-002**: A column can be moved in one drag, and in at most two key
  presses from its header's menu per place moved; the order survives a
  reload and leaves the other views alone.
- **SC-003**: In a test of ten board drags across columns, the card lands
  where the marker showed every time.
- **SC-004**: Every action the old **⋯** menu, **Properties** button and
  toolbar dropdowns offered is found in the Settings panel: a check lists the
  old actions and finds each one in the panel.
- **SC-005**: In a document, an embedded database's toolbar buttons are
  hidden at rest and reachable by Tab in one key press from the view, and
  nothing below the toolbar moves when they appear.
- **SC-006**: The raw-button and literal-size counts are no higher after this
  spec than before it.

## Assumptions

- **Size.** The body step of the type scale (14px today) is the default for
  cells and one step down (13px) for headers. #131 also asks to compare 15px;
  the plan shows both side by side, and the owner can pick 15px there.
- **Cards keep no manual order** within a board column (#133's open
  question): the view's sort decides, so the marker shows the sorted place.
  A manual card order would be a feature of its own.
- **Database settings** today means edit properties and templates; #270's
  "automations" does not exist yet and is not added here.
- **Personal view changes** (#279) are spec 013's: in this spec, changes made
  from the Settings panel are saved for everyone, as today.
- **The Settings panel** is built on the design system's existing menu or
  panel components; whether it is one menu with submenus or a panel with
  pages is decided in the plan.
- **Touch detection** uses whether the device can hover, not its width.
