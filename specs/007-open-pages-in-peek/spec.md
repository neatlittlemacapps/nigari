# Feature Specification: A view chooses how its pages open

**Feature Branch**: `claude/vigilant-babbage-bvoiel`

**Created**: 2026-10-27

**Status**: Draft

**Issues**: #177 (the fork's take on upstream saltmd/salt.md#92)

**Input**: User description: "Per-view 'Open pages in' (Side peek / Center
peek / Full page; default Full page), readable and writable via `set_view`.
Side peek in this feature; centre peek in a follow-up PR."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Look at a row without leaving the view (Priority: P1)

A person works through a board of tasks. Today every click on a card replaces
the board with the task's page; to see the next task they go back, find their
place again and click the next card. With this feature they set the board's
**Open pages in** to **Side peek**. A click on a card opens the task in a panel
beside the board. The board stays where it was, and a click on another card
shows that task in the same panel.

**Why this priority**: It is the whole point of the feature: reading and
editing rows one after the other without losing the view.

**Independent Test**: Set a table view to Side peek, click a row; the row's
page opens beside the table and the table is still on screen and scrollable.

**Acceptance Scenarios**:

1. **Given** a view set to Side peek, **When** the person clicks a row,
   **Then** the row's page opens in a panel beside the view, with its title,
   properties and content, editable as on its own page.
2. **Given** a row open in the side peek, **When** the person clicks another
   row of the view, **Then** the panel shows that row instead; no second panel
   opens.
3. **Given** a row open in the side peek, **When** the person presses Escape,
   clicks the panel's close button or presses the browser's Back button,
   **Then** the panel closes and the view is exactly as it was (scroll
   position, filters, selection).
4. **Given** a row open in the side peek, **When** the person chooses **Open as
   full page**, **Then** the tab navigates to the row's page, as a click does
   today.
5. **Given** a row open in the side peek, **When** the person copies the
   address and opens it elsewhere, **Then** the view opens with the same row in
   the side peek.
6. **Given** a view set to Side peek, **When** the person ⌘/Ctrl-clicks or
   middle-clicks a row, **Then** the row opens in a new tab, as today: a
   modifier always means a new tab.
7. **Given** a board, gallery, list, calendar or timeline set to Side peek,
   **When** the person clicks a card, item or bar, **Then** it opens in the
   side peek the same way.

---

### User Story 2 - Each view keeps its own choice (Priority: P1)

A database has a *Board* for daily work and a *Table* for bulk edits. The
person wants peeks on the board and full pages from the table. The choice is a
setting of each view, saved with it like its filters, so everyone who opens
that view gets the same behaviour.

**Why this priority**: Without a per-view setting there is no feature: the
upstream suggestion of one switch per account was rejected for this fork.

**Independent Test**: Set the board to Side peek and leave the table on Full
page; a click in the board peeks, a click in the table navigates.

**Acceptance Scenarios**:

1. **Given** a new view, **When** it is created, **Then** **Open pages in** is
   **Full page** and clicks behave exactly as today.
2. **Given** a view, **When** a person with write access opens the view's
   settings, **Then** they see **Open pages in** with **Full page**, **Side
   peek** and **Center peek** and can change it.
3. **Given** a person who may only read the database, **When** they click a
   row in a view set to Side peek, **Then** the row opens in the side peek
   (read-only), and they cannot change the setting.
4. **Given** an existing view saved before this feature, **When** anyone opens
   it, **Then** it behaves as **Full page**.
5. **Given** a database embedded in a page, **When** its view is set to Side
   peek, **Then** a click on a row opens the side peek beside the page that
   embeds it.

---

### User Story 3 - An agent reads and sets the choice (Priority: P2)

An agent asked "make the sprint board open tasks in a side panel" can set the
view's **Open pages in**, and an agent describing a database can say how each
view opens pages.

**Why this priority**: Agent parity is a project principle: a person can
change it, so an agent can too, with the same checks.

**Independent Test**: Over MCP, set a view's open mode to side peek; reading
the database back shows it, and a person clicking a row in that view gets the
side peek.

**Acceptance Scenarios**:

1. **Given** a view, **When** an agent changes it with the open mode set to
   side peek, **Then** the view opens rows in the side peek for everyone.
2. **Given** a view, **When** an agent reads the database, **Then** every
   view's open mode is in the answer.
3. **Given** an agent that passes an unknown open mode, **When** it changes
   the view, **Then** the call is refused with a message naming the allowed
   values, and nothing changes.
4. **Given** an agent that creates a view without an open mode, **Then** the
   view opens rows as a full page.
5. **Given** an agent token with read scope, **When** it tries to change the
   setting, **Then** it is refused, as any view change is today.

---

### User Story 4 - Center peek (Priority: P3, follow-up pull request)

Some people prefer the page in the middle of the screen, with the view dimmed
behind it, as a focused reading mode.

**Why this priority**: Same need as Story 1 in a different shape; agreed to
ship after the side peek.

**Independent Test**: Set a view to Center peek, click a row; the page opens
in a centred panel over the dimmed view.

**Acceptance Scenarios**:

1. **Given** a view set to Center peek, **When** the person clicks a row,
   **Then** the row's page opens in a centred panel over the view, editable.
2. **Given** a row open in the centre peek, **When** the person presses Escape,
   clicks outside the panel, clicks the close button or presses Back, **Then**
   the panel closes and the view is as it was.
3. **Given** the centre peek, **Then** keyboard focus stays inside the panel
   while it is open and returns to the clicked row when it closes, as in the
   app's other dialogs.
4. **Given** the centre peek, **When** the person chooses **Open as full
   page**, **Then** the tab navigates to the row's page.

---

### Edge Cases

- **Narrow screens** (a phone): there is no room beside the view, so Side peek
  opens the page as Center peek would, filling the screen, with a close button
  that returns to the view. Before Center peek ships, it opens as a full page.
- **The account's "Open rows in new tab"**: applies only to views set to Full
  page. A view set to a peek has made its own choice; ⌘/Ctrl still opens a new
  tab in every case.
- **The peeked row is deleted or moved to the trash** (by this person, someone
  else or an agent): the panel closes and a notice says the page is gone.
- **The peeked row stops matching the view's filters** after an edit in the
  peek: the panel stays open on that row; the row leaves the view behind it,
  as it does today after an edit.
- **The person loses access** to the database while peeking: the panel closes
  as on any page they can no longer read.
- **Someone else edits the peeked page**: the peek shows the live page, with
  presence and live edits, exactly as the full page does.
- **The spec 005 notice** ("The new row doesn't match this view's filters"):
  its **Open** action opens the row the way the view opens pages.
- **New** keeps not opening the new row (a deliberate choice in the code
  today); it only follows the view's setting when the person opens the row.
- **A link inside the peeked page** to another page navigates the tab, as on a
  full page; the peek is for the view's own rows.
- **A row of another database** reached through a relation cell: opens as
  today, a full page; only the view's own rows peek.
- **A form view**: shows no rows, so the setting is not offered for it.
- **A row opened in a peek and then refreshed**: the address carries the row,
  so the reload shows the view with the same row peeked.
- **Unsaved typing in the peek** when another row is clicked: kept, as when
  leaving a page today (pages save as you type).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every view except a form MUST have an **Open pages in** setting
  with three values: Full page, Side peek, Center peek. The default MUST be
  Full page.
- **FR-002**: A view set to Full page, and every view saved before this
  feature, MUST open rows exactly as today, including the account's "Open rows
  in new tab".
- **FR-003**: A plain click on a row, card, item or bar in a view set to Side
  peek MUST open the row's page in a panel beside the view, leaving the view
  visible, scrollable and usable.
- **FR-004**: The peeked page MUST be the full page: title, icon, properties,
  content, comments, history and live collaboration, with the same permissions
  as on its own page.
- **FR-005**: At most one peek MUST be open; opening another row replaces it.
- **FR-006**: The peek MUST close on Escape, on its close button and on the
  browser's Back button, leaving the view as it was.
- **FR-007**: The peek MUST offer **Open as full page**.
- **FR-008**: The address MUST name the peeked row, so a reload, a copied link
  and Back/Forward reproduce what was on screen.
- **FR-009**: ⌘/Ctrl-click and the middle button MUST open a new tab in every
  mode.
- **FR-010**: The setting MUST be stored with the view, so every person and
  agent sees the same behaviour; changing it needs the same right as any other
  view change.
- **FR-011**: Agents MUST be able to read every view's setting when they read a
  database, and to set it when they create or change a view, with the same
  validation the interface applies; an unknown value MUST be refused before
  anything is stored.
- **FR-012**: On a narrow screen, a peek MUST still let the person read and
  edit the page and return to the view in one step.
- **FR-013**: The peek MUST be usable with the keyboard alone: it can be
  reached, read, edited and closed without a mouse.
- **FR-014**: Every new label MUST be translated (German required).
- **FR-015**: The wiki MUST describe the setting on the page about database
  views, and the agent tool reference MUST describe the new field.
- **FR-016**: Center peek (Story 4) MAY ship in a follow-up pull request. Until
  it does, the interface MUST NOT offer it and agents MUST be told it is not
  available yet, rather than storing a value nothing honours.

### Key Entities

- **View**: gains one setting, *open pages in*: full page, side peek or center
  peek. Missing means full page.
- **Peek**: a page shown inside a view's screen rather than instead of it. Not
  stored; the address carries which row is peeked.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a view set to Side peek, going from one row to the next takes
  one click, against three today (open, back, find the next row).
- **SC-002**: Closing a peek returns the view with the same scroll position
  and the same rows on screen, every time.
- **SC-003**: A view on Full page behaves identically to today: the existing
  row-opening tests pass unchanged.
- **SC-004**: A person and an agent set and read the same value, checked by one
  test that does both.
- **SC-005**: Opening a row in a peek is no slower than opening it as a page
  today, and closing it shows the view without reloading its rows.

## Assumptions

- **The view's choice beats the account's "Open rows in new tab"** when the
  view is set to a peek: someone chose a peek for this view on purpose. The
  account preference keeps deciding for Full page views, so nothing changes for
  existing views.
- **Anyone who may change the view may change the setting**, as with filters
  and sort; there is no personal override per person.
- **Only the view's own rows peek.** Links in pages and relation cells keep
  navigating, so a peek never opens a peek.
- **On a phone the side peek fills the screen**, because a panel beside a
  phone-width view would leave neither readable.
- **The address carries the peeked row**, so Back closes the peek; this is the
  behaviour people know from other tools with peeks.
- **Center peek ships in a follow-up pull request**, as agreed (2026-10-27);
  this spec covers both so the setting's shape is decided once.
