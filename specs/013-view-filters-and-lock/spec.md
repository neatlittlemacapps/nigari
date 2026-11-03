# Feature Specification: A view's filters can be changed for oneself, offered as quick filters, sub-grouped, locked, and logged

**Feature Branch**: `claude/handoff-14` (spec); the build branch is named in the plan

**Created**: 2026-11-03

**Status**: Draft

**Issues**: epic #426; this spec covers #279, #281, #19, #178

**Input**: Owner, 2026-11-02, the database views epic (#426), split into two
specs ("1 A"): 012 for how views look and handle, 013 for what views store.
Anyone who can edit a database may lock its views ("3 A"). Answered at
`/speckit-specify` (2026-11-03): the Status property (#18) moves to a spec of
its own (014), because it is a new property type that reaches far beyond
views; a person's own filter changes are kept **on their account**, so they
follow them to every device; the activity log records **meaningful** view
changes only.

## Context

How views work today, from the code graph and the source (`codegraph
explore` on the views, filters and audit code, 2026-11-03):

- **Where a view is stored.** A database's views are one JSON list stored
  with the database (`collections.views`). The interface saves the whole list
  through `PUT /api/collections/{id}` (`handlePutCollection`); agents change
  one view at a time through MCP `set_view` (create and update) and
  `delete_view`, which load, change and save the same list (`saveCollection`).
  The rules a view must meet are applied on both doors, per view
  (`normalizeViews` for REST, `applyViewSpec` for MCP; spec 012 adds
  `checkViewColOrder` the same way).
- **Filters and sorts are shared.** Changing a view's filter or sort saves it
  for everyone at once. A database embedded in a document keeps its own
  filters and sort on the embed (#26), separate from the database's views.
  The server evaluates a view's filters itself (`rowFilter`, used by the rows
  query, aggregation, and `viewpins.go`, which fills a new row made in a
  filtered view with the values its filters pin down, spec 005).
- **Per-person settings exist.** `server/prefs.go` keeps a person's language,
  region, clock and "open rows in a new tab" on their account
  (`PUT /api/me/prefs`, signed-in browser only), with the browser as a
  first-paint cache. The browser also remembers per account which view was
  open (`web/src/pageUiState.ts`).
- **Boards group by one property.** `BoardView` draws one column per value of
  `groupBy`; there is no second level.
- **No lock.** Any person or agent who can edit a database can change any of
  its views.
- **No trace.** No path that changes a view calls `audit(...)`: not
  `handlePutCollection`, not `set_view`, not `delete_view` (`codegraph
  callers audit` lists none of them). A person or an agent can rename,
  re-filter or delete a view and the activity log shows nothing (#178).
- **What a later feature must respect.** Agent parity with the checks in one
  function (constitution II, III); the design system and one icon per menu
  function (specs 001, 010); spec 012's Settings menu, header menu and stored
  column order, which this spec builds on.

## Clarifications

### Session 2026-11-03

- Q: Does the Status property (#18) stay in this spec? → A: No, it gets its
  own spec (014). It is a new property type that touches filters, new rows in
  a filtered view, forms, CSV import, the public table and rollups.
- Q: Where is a person's own change to a view's filter or sort kept? → A: On
  their account, so it follows them to every device (not only in the
  browser). Quick filter picks follow the same rule.
- Q: Which view changes go in the activity log? → A: Meaningful ones: a view
  created, deleted or renamed; its filters, sort, grouping or quick filters
  changed; its database's views locked or unlocked. Not column widths, column
  order or which columns are hidden.
- Q: May an agent lock and unlock views? → A: No, people only. Agents see the
  lock and are refused by it; the lock is meant partly to stop agents
  changing views by accident.
- Q: Do agents get personal view changes? → A: No. An agent's view change is
  always "Save for everyone", as today.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Change a view's filter for yourself, then save it for everyone or reset (Priority: P1)

A person looks at the team's "Open tasks" view and narrows it to their own
tasks. Nobody else's view changes. A bar appears above the view: "Your
changes to this view are only visible to you", with **Reset** and **Save for
everyone**. They leave the filter on, go home, open the same view on their
phone, and it is still narrowed for them. Next week they reset it and see the
team's view again.

**Why this priority**: today one person's quick look at "only mine" changes
the view for the whole team, which is the most common way a shared view gets
broken (#279).

**Independent Test**: two accounts open the same view; account A changes the
filter and sort; A sees the change on a second device, B sees the original;
A saves for everyone and B now sees it; A changes it again and resets, and A
sees the shared view again.

**Acceptance Scenarios**:

1. **Given** a shared view, **When** a person changes its filter or sort,
   **Then** only that person sees the change, and the view shows a bar saying
   so, with **Reset** and **Save for everyone**.
2. **Given** a personal change, **When** the same person opens the view on
   another device or after signing in again, **Then** the change is still
   there.
3. **Given** a personal change, **When** the person chooses **Save for
   everyone**, **Then** the view's shared filter and sort become theirs, the
   bar goes away, and everyone sees the new view.
4. **Given** a personal change, **When** the person chooses **Reset**,
   **Then** their change is dropped and they see the shared view.
5. **Given** a person with a personal change, **When** someone else saves a
   different shared filter for that view, **Then** the person keeps seeing
   their own change, and the bar still offers Reset.
6. **Given** a person who may only read the database, **When** they change a
   filter or sort, **Then** it is a personal change as for anyone, but **Save
   for everyone** is not offered.
7. **Given** a new row made from a view with a personal filter, **When** it
   is created, **Then** it takes the values the filters the person sees pin
   down, as a new row in a filtered view does today (spec 005).

---

### User Story 2 - Lock a database's views so nobody changes them by accident (Priority: P1)

A person has set up a database's views just right. They choose **Lock
views**. From then on, nobody can rename, delete, add or rearrange the
views, or change their shared filters, sorts, groupings or settings, until
someone unlocks them. The rows themselves stay editable, and anyone can
still narrow a view for themselves (User Story 1).

**Why this priority**: views shared by a team are broken by accident more
often than on purpose, and agents change views too (#281).

**Independent Test**: lock a database's views; through the interface and
through an agent, every change to a view is refused with a message saying
the views are locked; rows can still be edited and a personal filter still
works; unlock, and the same changes go through.

**Acceptance Scenarios**:

1. **Given** a database whose views are not locked, **When** a person who can
   edit it chooses **Lock views**, **Then** its views are locked for everyone
   and the view shows that they are.
2. **Given** locked views, **When** anyone tries to add, rename, delete or
   reorder a view, or change a view's shared filter, sort, grouping, quick
   filters or settings, **Then** it is not offered in the interface and is
   refused by the server with a message saying the views are locked.
3. **Given** locked views, **When** a person edits a row, adds a row or
   changes a personal filter, **Then** it works as before.
4. **Given** locked views, **When** a person changes a view's filter for
   themselves, **Then** the bar offers **Reset** but not **Save for
   everyone**.
5. **Given** locked views, **When** a person who can edit the database
   chooses **Unlock views**, **Then** the views can be changed again.
6. **Given** a person who may only read the database, **When** they look at
   it, **Then** they see that the views are locked but cannot lock or unlock
   them.
7. **Given** an agent that tries to change a locked view, **When** it calls
   the view tools, **Then** it is refused with the same rule and message as a
   person, from the same check.
8. **Given** an agent, **When** it asks for a database's views, **Then** it
   can see whether they are locked, but it cannot lock or unlock them.

---

### User Story 3 - Quick filters: one-tap filters a view offers its viewers (Priority: P2)

The person who sets up a view adds quick filters for "Assignee" and
"Priority". Everyone who opens the view sees two chips above it. A tap on
"Assignee" lets them pick a person; the view narrows for them only, like a
personal filter. A tap on the chip's ✕ clears their pick.

**Why this priority**: it turns the most common personal filters into one tap
and shows newcomers which filters matter (#19).

**Independent Test**: add two quick filters to a view; a second account sees
the chips, picks a value, sees the view narrowed, and the first account's
view is unchanged; the pick survives a reload and another device; removing a
quick filter from the view removes the chip for everyone.

**Acceptance Scenarios**:

1. **Given** a view, **When** a person who can change it adds a quick filter
   on a property, **Then** every viewer sees a chip for it above the view,
   with no value picked.
2. **Given** a chip, **When** a viewer picks a value, **Then** the view
   narrows for that viewer only, and the pick is kept on their account.
3. **Given** a picked chip, **When** the viewer clears it, **Then** the view
   is as before for them.
4. **Given** a view with shared filters and a picked chip, **When** it is
   shown, **Then** rows must match both.
5. **Given** quick filters, **When** a viewer chooses **Save for everyone**
   with a picked chip, **Then** the pick becomes a shared filter of the view
   and the chip is cleared.
6. **Given** a property that is deleted, **When** a view had a quick filter
   on it, **Then** the chip is gone and nothing breaks.
7. **Given** an agent, **When** it sets a view up, **Then** it can add and
   remove quick filters.

---

### User Story 4 - Sub-group a board into swimlanes (Priority: P2)

A board grouped by Status is also sub-grouped by Assignee. Each person gets a
horizontal lane across the board's columns, with their cards in it. Dragging
a card to another lane changes its assignee, as dragging to another column
changes its status.

**Why this priority**: it answers "who is doing what, at which stage" on one
screen (#19).

**Independent Test**: on a board grouped by one property, choose a sub-group;
lanes appear for each value, with the right cards in each cell; a card
dragged to another cell takes both values; a lane can be folded; removing the
sub-group returns the plain board.

**Acceptance Scenarios**:

1. **Given** a board, **When** a person chooses a sub-group property in the
   view's settings, **Then** the board shows one lane per value of that
   property, each with the board's columns.
2. **Given** lanes, **When** a card is dragged to another cell, **Then** it
   takes that cell's column value and lane value, and spec 012's drop marker
   shows where it will land.
3. **Given** a card with no value for the sub-group property, **When** it is
   shown, **Then** it is in a "No value" lane.
4. **Given** a lane, **When** a person folds it, **Then** only its header and
   card count show.
5. **Given** a sub-group property that cannot be changed (a formula or
   rollup), **When** cards are shown, **Then** lanes are drawn but dragging
   between lanes is not possible.
6. **Given** an agent, **When** it sets up a board, **Then** it can set and
   clear the sub-group.

---

### User Story 5 - View changes show in the activity log (Priority: P3)

An admin wonders why the "Open tasks" view now hides finished tasks. The
activity log shows that an agent changed the view's filters yesterday, and
which view of which database.

**Why this priority**: the log is where people look when something changed;
views are the one part of a database that leaves no trace today (#178).

**Independent Test**: create, rename, re-filter, sort, regroup, lock and
delete a view, by a person and by an agent; each leaves one log entry naming
who, which database and which view, with people and agents told apart;
changing a column's width, order or visibility leaves none.

**Acceptance Scenarios**:

1. **Given** a person or agent, **When** they create, delete or rename a view,
   or change its shared filters, sort, grouping, sub-group or quick filters,
   **Then** one activity entry records who did it, the database and the view.
2. **Given** a person, **When** they lock or unlock a database's views,
   **Then** one activity entry records it.
3. **Given** a change to column widths, column order or hidden columns only,
   **When** it is saved, **Then** no entry is made.
4. **Given** one save that changes several views, **When** it is recorded,
   **Then** each changed view gets its entry, and an unchanged view gets none.
5. **Given** a personal change (User Story 1) or a quick filter pick, **When**
   it is kept, **Then** no entry is made: nothing changed for anyone else.

---

### Edge Cases

- A personal change refers to a property that is later deleted: that part
  is dropped, the rest stays.
- A view with a personal change is deleted: the personal change goes with it.
- A person's personal change on a view they can no longer read: it is never
  shown or returned, and it is removed when the view or database goes.
- The views are locked while a person has a personal change: they keep it and
  can reset it; they cannot save it for everyone.
- Two people lock and unlock at the same moment: the last one wins, and both
  are in the activity log.
- A database embedded in a document keeps its own filters on the embed
  (#26): the bar and personal changes are on the database's own views, not
  on an embed's filters, which already belong to that document.
- A board sub-grouped by a property with many values: lanes beyond what fits
  are reached by scrolling, and each lane can be folded.
- A sub-group on the same property as the board's grouping is refused.
- Quick filters and lanes on a database with hundreds of thousands of rows
  stay within the storage budgets of spec 002.

## Requirements *(mandatory)*

### Functional Requirements

**Personal changes (#279)**

- **FR-001**: A change to a view's filter or sort by a person MUST apply only
  to that person, and MUST be kept on their account, per view.
- **FR-002**: A view with a personal change MUST say so in a bar with **Reset**
  and, for someone who may change the view, **Save for everyone**.
- **FR-003**: **Save for everyone** MUST write the person's filter and sort to
  the view for everyone, with the same checks as any view change, and clear
  the personal change.
- **FR-004**: **Reset** MUST remove the personal change.
- **FR-005**: The rows a person sees, the rows the server returns to them and
  the values a new row made in the view takes MUST follow the filters they
  see, personal ones included, evaluated by the server's one set of filter
  rules.
- **FR-006**: A personal change MUST NOT be visible to, or returned for,
  anyone else, and MUST NOT appear in the activity log.

**Lock (#281)**

- **FR-007**: A database MUST have a lock on its views, set and cleared by
  anyone who can edit the database.
- **FR-008**: While locked, every change to the database's views (add, delete,
  rename, reorder, shared filters, sort, grouping, sub-group, quick filters,
  settings, column widths, column order, hidden columns) MUST be refused by
  the server, through every door, by one check, with the code
  `views_locked` and a sentence saying so.
- **FR-009**: While locked, row edits, new rows and personal changes MUST keep
  working.
- **FR-010**: The interface MUST show that views are locked, MUST NOT offer
  the changes the lock refuses, and MUST offer Lock and Unlock to people who
  can edit the database.
- **FR-011**: Agents MUST be able to see whether a database's views are
  locked, and MUST be refused by the same check. Agents MUST NOT be able to
  lock or unlock: that stays with people, a deliberate gap named in the
  manifest.

**Quick filters (#19)**

- **FR-012**: A view MUST be able to hold quick filters: a list of properties
  shown as chips above the view, set by anyone who can change the view.
- **FR-013**: A viewer's pick on a chip MUST apply only to them, MUST be kept on
  their account like a personal change, and MUST combine with the view's
  shared filters (both must match).
- **FR-014**: **Save for everyone** MUST turn picked chips into shared filters.
- **FR-015**: Agents MUST be able to add and remove a view's quick filters.

**Sub-groups (#19)**

- **FR-016**: A board MUST be able to have a sub-group property, drawn as one
  lane per value across the board's columns, with a "No value" lane.
- **FR-017**: Dragging a card to another cell MUST set both its column value
  and its lane value, with spec 012's drop marker.
- **FR-018**: Lanes MUST be foldable; a property that cannot be written MUST
  NOT accept drags between lanes.
- **FR-019**: Agents MUST be able to set and clear a board's sub-group.

**Activity log (#178)**

- **FR-020**: Creating, deleting or renaming a view, changing its shared
  filters, sort, grouping, sub-group or quick filters, and locking or
  unlocking a database's views MUST each leave one activity entry per view,
  naming the actor (person or agent, told apart), the database and the view.
- **FR-021**: Changes to column widths, column order or hidden columns only,
  personal changes and quick filter picks MUST NOT leave an entry.

**Across**

- **FR-022**: Every new string MUST be translated (German, Spanish, Dutch).
- **FR-023**: The wiki pages for views, databases and agent tools MUST
  describe the new behaviour; stale screenshots MUST be retaken.
- **FR-024**: This spec MUST NOT raise the raw-button, literal-size or bundle
  budgets, and new queries MUST stay within spec 002's budgets.

### Key Entities

- **Personal view state**: per person, per view: their own filters, sort
  and quick filter picks. Missing means they see the shared view. Removed
  with the view or the database.
- **Views lock**: per database, on or off, with who set it and when.
- **Quick filter**: on a view, an ordered list of property ids shown as
  chips.
- **Sub-group**: on a board view, one property id beside `groupBy`.
- **View activity entry**: an activity log entry for one view change: actor,
  actor type, database, view, what kind of change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: One person narrowing a shared view changes what nobody else
  sees: in a test with two accounts, the second account's rows are identical
  before and after the first account's personal change.
- **SC-002**: A personal change made on one device is shown on a second
  device signed in to the same account, without any step by the person.
- **SC-003**: While views are locked, every way to change a view, through
  the interface and through the agent tools, is refused, and a check lists
  each door and finds it refused.
- **SC-004**: A viewer narrows a view by a quick filter in at most two taps.
- **SC-005**: On a board with lanes, ten card drags between cells each land
  with both values set as shown.
- **SC-006**: Every meaningful view change in a test run appears once in the
  activity log, and no layout-only change appears.

## Assumptions

- **Status (#18) is spec 014**, written after this one.
- **Personal changes cover filter and sort** (and quick filter picks), as in
  #279 and Notion. Grouping and layout stay shared.
- **The lock does not block personal changes**: they change nothing for
  anyone else. It blocks Save for everyone.
- **Agents act on the shared view.** An agent's `set_view` is "Save for
  everyone", as today. Agents have no personal view state: they see a
  database through queries that take their own filters, not through a
  screen (owner, 2026-11-03). Locking and unlocking are for people only
  (owner, 2026-11-03). Both are deliberate parity gaps, named in the manifest
  with the reason, and `gapBudget` is raised where a reviewer sees it.
- **Embeds keep their own filters** (#26); the bar is on the database's own
  views.
- **Lock is per database**, for all its views, as in Notion; not per view.
- **Quick filter values** use the same filter operators as filters today
  ("is" for options and people, "contains" for text); no new operator.
- **Sub-groups on boards only**; tables and lists keep one grouping.
