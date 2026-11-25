# Feature Specification: Tables and lists can be grouped by a property, as folding groups

**Feature Branch**: `claude/spec-024-group-by`

**Created**: 2026-11-24

**Status**: Draft

**Issues**: #823 (epic: group by in every view)

**Input**: Owner, 2026-11-20, on #823:

> Let a person choose a property to group the data by, separately in each
> view of a collection. How the groups look depends on the view type. […]
> Table and list views: each group becomes an accordion: a header with the
> group's value and the number of rows in it, which expands and collapses.
> Rows with no value for the property go in a "No value" group. Expand all
> and collapse all. […] Group order follows the property's own option order,
> with a way to flip it. […] Select, multi-select, status, relation, person
> and checkbox. Date, grouped by a period (day, week, month or year). A row
> with several values appears under each of them.

## Context

How grouping works today, from the code graph (`codegraph explore` on
`BoardView`, `TableView`, `ListView`, `boardLanes`, `checkViewSubGroup`,
`normalizeViewLayout`, `groupCounts` and the personal view state, 2026-11-24)
and the source:

- **Only boards group.** A view's `groupBy` draws a board's columns, and
  `subGroupBy` its lanes (spec 013). The Group button in the view bar is shown
  for a board only. `TableView` and `ListView` draw rows flat; nothing in
  #823 for them has shipped. What is left of the epic is this spec; the board
  part (columns, lanes #817) is done.
- **Logic to reuse.** `boardLanes.ts` already turns any property's values into
  lanes (an option property in its option order, other values in the order
  met, a No value lane last, a multi-value row in each of its lanes) and
  works out what a drop between lanes writes (`dropPatch`, keeping a
  multi-value row's other values). Charts already group dates by day, week,
  month or year (`groupPeriod`, spec 004) and a status by its groups
  (`statusGroups`, spec 016). Folded lanes are already kept per person
  (`foldedLanes` in the personal view state, `viewprefs.go`).
- **A latent `groupBy` on tables.** Changing a board's layout to a table keeps
  its `groupBy` and `subGroupBy` (spec 018, `viewlayout_test.go`), so that
  changing back restores the board. Tables that were once boards therefore
  carry a `groupBy` today, and the seeded blueprints and imports may too.
  Turning `groupBy` on for tables as it is would suddenly group those tables.
- **Totals.** A table has a bottom row of totals (`footer` in `TableView`): a
  sum for number, rollup and formula columns, a count of filled cells
  otherwise.
- **Row order.** Rows follow one manual order per database (`position`, spec
  022); a drag moves a row in that order; a sorted view gives way to it on a
  drag. Per-view order is #870, later.
- **Size cap.** The main bundle was 0.9 KB under its cap; PR #935 (#934,
  merged 2026-11-24) moved the page-icon set out, leaving 31.6 KB.

## Clarifications

### Session 2026-11-23/24

Recommended by Claude on 2026-11-23 and accepted by the owner on 2026-11-24
("1 yes, 2 yes, 3 ok for now, 4 ok, 5 ok, 6 ok, 7 ok"). Mockups of the table,
the Group menu and the list (light, dark, phone) are in the project files
under `issue-823/`.

- Q1: Are empty groups shown? → A: **hidden by default**, with a per-view
  "Show empty groups" switch. A single group can be hidden from its header
  menu and brought back from the Group menu. Turned down: always showing
  every option (empty headers mostly add scrolling in a table).
- Q2: What does a group header show? → A: **the value (as its chip, for an
  option) and the number of rows**. The table's totals row also appears at
  the bottom of each open group. Turned down: a configurable summary per
  header (more settings, little gain over the per-group totals row).
- Q3: One level of grouping or two? → A: **one level** in tables and lists
  "for now". A second level is a follow-up issue. Turned down for now: two
  levels (cramped on a phone; the board already gives two with lanes).
- Q4: Whose is a folded group? → A: **each person's own**, like folded lanes.
  Expand all and Collapse all are in the Group menu. Turned down: folding
  shared by everyone on the view (one person's fold hides rows for others).
- Q5: How do drags work in a grouped table? → A: inside a group a drag
  **moves the row in the shared order** (spec 022); a drag into **another
  group sets the row's value** to that group's, as a board column does. #870
  is untouched. Turned down: no drag in a grouped table.
- Q6: Does a board changed to a table stay grouped? → A: **yes**, by the same
  property. Tables that were boards before this feature **stay ungrouped**
  until someone picks a grouping. Turned down: starting every changed board
  ungrouped (the setup is lost on a switch).
- Q7: What happens to sub-items in a grouped table? → A: **a sub-item is
  drawn under its parent, inside the parent's group**. Turned down: turning
  the tree off while grouped.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Group a table by a property (Priority: P1)

A person opens the Group menu of a table view, picks Status, and the table
splits into one group per status in the status's own order: each with a
header showing the status chip and how many rows it holds, its rows, and its
own totals row. Rows with no status are in a No value group, last. Filters
and sort apply within each group.

**Why this priority**: it is the core of #823 for the view people use most.

**Independent Test**: on a table of tasks, group by Status; see one header
per status that has rows, in option order, each with the right count and its
rows sorted as the view sorts.

**Acceptance Scenarios**:

1. **Given** a table, **When** a person picks a property in the Group menu,
   **Then** the rows are drawn in groups, one per value, in the property's
   order, each headed by its value and row count, with a No value group last.
2. **Given** a grouped table, **When** it has a sort or filters, **Then**
   each group's rows are filtered and sorted as the view says, and the
   counts count what is shown.
3. **Given** a grouped table, **When** it is drawn, **Then** each open group
   ends with its own totals row (sums and filled counts of that group only).
4. **Given** a row with two tags, **When** the table is grouped by tags,
   **Then** the row appears in both groups.
5. **Given** a grouped table, **When** a person chooses Remove grouping,
   **Then** the table is flat again.
6. **Given** a grouping, **When** it is saved, **Then** it belongs to that
   view alone: other views of the database are unchanged.

---

### User Story 2 - Fold groups (Priority: P1)

A person folds the Done group by its header; only the header stays, with its
count. They reload and it is still folded for them, while a colleague still
sees it open. Expand all and Collapse all in the Group menu open or fold
every group at once.

**Why this priority**: folding is what makes a long grouped table readable.

**Independent Test**: fold one group, reload, see it folded; sign in as
another person, see it open.

**Acceptance Scenarios**:

1. **Given** a grouped view, **When** a person activates a group header (click,
   Enter or Space), **Then** the group folds or unfolds, and the header says
   which it is to assistive technology.
2. **Given** a folded group, **When** the person reloads, **Then** it is
   still folded for them, and open for everyone else.
3. **Given** a grouped view, **When** the person picks Collapse all or Expand
   all, **Then** every group folds or opens.

---

### User Story 3 - Group a list (Priority: P2)

The same Group menu on a list view draws the same group headers between the
list's rows, without totals rows.

**Why this priority**: lists are the second view #823 names; it reuses
everything from stories 1 and 2.

**Independent Test**: group a list by Status; see headers, counts, folding.

**Acceptance Scenarios**:

1. **Given** a list view, **When** a person groups it, **Then** rows are
   drawn under group headers as in a table, and groups fold the same way.
2. **Given** a phone, **When** a grouped list or table is shown, **Then**
   the headers fit the width and folding works by tap.

---

### User Story 4 - Group by a date (Priority: P2)

A person groups a table by its Due date and picks Month: one group per month
that has rows ("August 2026"), in date order, and a No value group for rows
without a date. Day, week and year work the same way.

**Why this priority**: #823 asks for it; it reuses the chart's periods.

**Independent Test**: group by Due by month; rows of 12 and 29 August share
the August group.

**Acceptance Scenarios**:

1. **Given** a date property, **When** it is chosen in the Group menu,
   **Then** a period choice appears (day, week, month, year; month by
   default), and groups are the periods that hold rows, oldest first.
2. **Given** a grouping by week, **Then** the weeks are ISO weeks (Monday to
   Sunday), labelled "Week of" their Monday in the person's date format.
   *Amended while building (research R7): the keys are the chart's period
   keys, so a table, a list and a chart agree on a week, and hidden groups
   stored by key stay valid for everyone whatever their week start.*

---

### User Story 5 - Order, empty and hidden groups (Priority: P2)

A person flips the group order (Done first), turns on Show empty groups to
see Blocked although nothing is blocked, and hides the No value group from
its header's menu. The Group menu lists hidden groups, each with Show.

**Why this priority**: the issue asks for the flip and the owner chose how
empty and hidden groups behave (Q1).

**Independent Test**: hide a group, see it gone and listed in the Group
menu; show it again.

**Acceptance Scenarios**:

1. **Given** a grouped view, **When** Order is flipped, **Then** the groups
   are drawn in reverse, the No value group stays last.
2. **Given** an option with no rows, **When** Show empty groups is off (the
   default), **Then** it has no header; **When** on, **Then** it has a
   header with 0 and no rows.
3. **Given** a group, **When** it is hidden from its header's menu, **Then**
   it and its rows are not drawn, the Group menu lists it under Hidden groups,
   and Show brings it back. Hiding is part of the view (shared), as filters are.

---

### User Story 6 - Drag rows within and between groups (Priority: P2)

In a grouped table a person drags a row within its group to reorder it, or
into another group to change its value, as on a board.

**Why this priority**: a grouped table must not lose the drag spec 022 gave
it, and moving between groups is the quickest way to re-file a row.

**Independent Test**: drag a To do row into In progress; its status is In
progress and it sits where it was dropped.

**Acceptance Scenarios**:

1. **Given** a grouped table, **When** a row is dragged within its group,
   **Then** it moves in the database's shared order (spec 022).
2. **Given** a row dragged into another group, **When** dropped, **Then** its
   value becomes that group's (for a multi-value property: the old group's
   value replaced by the new one, others kept) and it lands at the drop spot,
   in one change.
3. **Given** a group whose property no drag can write (a formula, a rollup,
   a date grouped by period), **When** a row is dragged to another group,
   **Then** the drop is refused, and reordering within a group still works.
4. **Given** someone who may only read, **When** they view a grouped table,
   **Then** they can fold groups but not drag.

---

### User Story 7 - Agents group views (Priority: P2)

An agent sets, changes and removes a table's or list's grouping, its period,
order, empty-group switch and hidden groups, with the same checks as a person.

**Why this priority**: agent parity (constitution II).

**Independent Test**: `set_view` with a grouping on a table; the browser
shows it grouped.

**Acceptance Scenarios**:

1. **Given** an agent with write access, **When** it groups a table view,
   **Then** the view is grouped for everyone, and invalid groupings (an
   unknown property, a type that cannot group) are refused with a sentence
   that says why.
2. **Given** an agent reading a grouped view, **When** it lists the view's
   rows, **Then** it can tell the grouping from the view's settings.

### Edge Cases

- A table that was a board before this feature carries a `groupBy`: it stays
  ungrouped until a person or agent chooses a grouping (Q6).
- A board changed to a table after this feature: the table is grouped by the
  board's column property; changed back, the board is unchanged.
- The grouping property is deleted or changes to a type that cannot group:
  the view draws flat, as a board falls back today, and the stale setting is
  dropped on the next save.
- A relation or person grouping with hundreds of values: every group is drawn
  (folded groups cost one line); the counts still add up.
- Sub-items (Q7): a sub-item is drawn under its parent inside the parent's
  group, even if its own value differs; it is not repeated in its own group.
- An embedded view in a document (spec 023): grouping works there too, and its
  25-row limit counts rows, not headers; Show more continues inside the
  groups.
- A locked view (spec 013): grouping, order, empty and hidden groups cannot
  be changed for everyone; folding stays possible (it is personal).
- Grouping is a shared view setting, saved for everyone at once as a board's
  grouping is today; only filters and sort start as the person's own
  (spec 013). Folding is the one personal part (Q4).
- A checkbox grouping: two groups, Checked and Unchecked, no No value group.
- A database of 100,000 rows: grouping happens on the rows the view already
  loads; no extra request per group.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A table view and a list view MUST be able to have one grouping
  property, chosen from a Group menu in the view bar, per view.
- **FR-002**: Groupable types MUST be select, multi-select, status, relation,
  person, checkbox and date; a formula or rollup MAY group (drawn, not
  draggable between groups). A status MAY group by its status groups as charts
  do.
- **FR-003**: Groups MUST follow the property's own option order (dates oldest
  first, other values in the order met), with a per-view flip; the No value
  group MUST come last either way.
- **FR-004**: A row with several values MUST appear in each of its groups; a
  row without a value MUST be in a No value group.
- **FR-005**: Each group header MUST show the value (an option as its chip) and
  the number of rows shown in it, and MUST fold and unfold by pointer and
  keyboard, exposing its state to assistive technology.
- **FR-006**: In a table, each open group MUST end with its own totals row,
  computed from that group's rows.
- **FR-007**: Filters and sort MUST apply within each group.
- **FR-008**: Folded groups MUST be kept per person and per view, across
  reloads; Expand all and Collapse all MUST be offered.
- **FR-009**: Empty groups MUST be hidden unless the view's Show empty groups
  is on; a group MUST be hideable from its header's menu and shown again from
  the Group menu; hidden groups are part of the view.
- **FR-010**: A date grouping MUST offer day, week, month and year (month by
  default), with labels in the person's date format. Weeks are ISO weeks
  (amended while building, research R7: the chart's keys, shared by everyone).
- **FR-011**: In a grouped table a drag within a group MUST move the row in the
  shared order; a drag to another group MUST set the row's value to that
  group's in one change, keeping a multi-value row's other values, and MUST
  be refused where the property cannot be written that way.
- **FR-012**: A board changed to a table or list MUST keep its grouping; a
  table or list that carried a board's grouping before this feature MUST NOT
  become grouped by it.
- **FR-013**: Agents MUST be able to read, set and clear a table's or list's
  grouping and its settings through the same checks as the browser; a locked
  view refuses it for both.
- **FR-014**: Grouping MUST work in an embedded view as on the database page,
  with the embed's row limit counting rows only.
- **FR-015**: The feature MUST keep the main bundle under its size cap without
  raising it.

### Key Entities

- **View grouping**: on a table or list view: the property, a date period,
  the order flip, the Show empty groups switch and the hidden groups. Shared,
  like filters and sort.
- **Folded groups**: per person, per view: which groups are folded.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person groups a table by a property in two clicks from the
  view bar.
- **SC-002**: On a table of 5,000 rows, grouping, folding and unfolding
  respond without a visible delay (within one frame budget of the flat table's
  draw time, measured before and after).
- **SC-003**: Every group header's count equals the rows drawn in that group,
  in every test.
- **SC-004**: No table that was ungrouped before the release is grouped after
  it.
- **SC-005**: An agent can do every grouping action the Group menu offers.

## Assumptions

- The board keeps its own grouping UI; this spec adds tables and lists only.
  Gallery, calendar and timeline are out of scope.
- A second grouping level for tables and lists is a follow-up issue (Q3).
- Group headers have no per-group "+ New" in this spec; New still adds a row
  (with the filters' values, spec 005). A per-group + may follow.
- Per-view row order (#870) is out of scope; nothing here prevents it.
