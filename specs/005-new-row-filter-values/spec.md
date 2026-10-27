# Feature Specification: A new row takes the values its view's filters pin down

**Feature Branch**: `claude/vigilant-babbage-bvoiel`

**Created**: 2026-10-27

**Status**: Draft

**Issues**: #139 (the fork's take on upstream saltmd/salt.md#91)

**Input**: User description: "New row takes the view's filter values: a new row
gets the values the view's filters pin to a single answer; a notice if it still
won't show."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A row made in a filtered view stays in it (Priority: P1)

A person has a view "To do" on a task database, filtered to *Status is To do*.
They press **New**. Today the row is created empty and vanishes from the view at
once, because an empty Status is not *To do*; the person has to find it in
another view and set the status by hand. With this feature the new row arrives
with *Status* set to *To do* and stays where they made it.

**Why this priority**: It is the whole point of the feature, and the case people
hit every day: a view per status, per owner or per project.

**Independent Test**: In a view filtered to one value of a select property,
press **New**; the row appears in the view with that value set.

**Acceptance Scenarios**:

1. **Given** a view filtered to *Status is To do*, **When** the person presses
   **New**, **Then** the new row has *Status* = *To do* and is shown in the view.
2. **Given** a view filtered to *Status is To do* AND *Owner is Ada*, **When**
   the person presses **New**, **Then** the row has both values set.
3. **Given** a view filtered to *Done is checked* on a checkbox property,
   **When** the person presses **New**, **Then** the row's box is ticked.
4. **Given** a view filtered to *Due is today* (a relative day), **When** the
   person presses **New** on 2026-10-27, **Then** *Due* is 2026-10-27, the date
   the filter means today, not the word "today".
5. **Given** a board grouped by *Status* and filtered to *Owner is Ada*,
   **When** the person presses **＋ New** under the *Doing* column, **Then** the
   row has *Status* = *Doing* (the column) and *Owner* = *Ada* (the filter).
6. **Given** a view filtered to *Status is To do*, **When** the person makes a
   row from one of the database's templates whose *Status* is *Done*, **Then**
   the row has *Status* = *To do*: the view the person is looking at decides.

---

### User Story 2 - A row that still can't show says so (Priority: P2)

Some filters can't be satisfied by setting one value: *Estimate > 3*, *Title
contains "bug"*, *Status is not Done*, *Status is To do or Doing*. A row made in
such a view still disappears, and today nothing tells the person where it went.
With this feature a short notice says the new row doesn't match this view's
filters and offers to open it.

**Why this priority**: Without it the P1 fix makes the remaining cases more
confusing, since most rows now stay and a few still vanish without a word.

**Independent Test**: In a view filtered to *Estimate > 3*, press **New**; a
notice appears with an **Open** action that opens the new row.

**Acceptance Scenarios**:

1. **Given** a view filtered to *Estimate > 3*, **When** the person presses
   **New**, **Then** the row is created, a notice says it doesn't match this
   view's filters, and **Open** in the notice opens the row.
2. **Given** a view filtered to *Status is To do*, **When** the person presses
   **New**, **Then** no notice appears (the row is shown).
3. **Given** a view with no filters, **When** the person presses **New**,
   **Then** nothing changes from today: the row is created empty, no notice.

---

### User Story 3 - An agent creating a row "as seen in" a view gets the same (Priority: P2)

An agent asked "add a task to my *To do* view" can name the view when it creates
the row and gets the same pinned values and the same "won't show" information a
person gets.

**Why this priority**: Agent parity is a project principle. Without it an agent
has to read the view's filters and translate them into values itself, and gets
smart dates and checkboxes wrong the way the server once did (#95).

**Independent Test**: Over MCP, create a row in a database naming a view
filtered to *Status is To do*; the row has that status, and the answer says
whether the row matches the view.

**Acceptance Scenarios**:

1. **Given** a database with a view *To do* filtered to *Status is To do*,
   **When** an agent creates a row in it naming that view, **Then** the row has
   *Status* = *To do*.
2. **Given** the same view, **When** the agent also passes *Status* = *Doing*
   explicitly, **Then** the explicit value wins and the answer says the row does
   not match the view.
3. **Given** an agent that names no view, **When** it creates a row, **Then**
   nothing changes from today.
4. **Given** a view id that doesn't belong to the database, **When** the agent
   names it, **Then** the call is refused with a message saying so, and no row
   is created.

---

### Edge Cases

- **Two filters on one property that agree** (*Status is To do* twice): pinned
  once. **That disagree** (*Status is To do* and *Status is Doing*): nothing is
  pinned for that property; the view can't show any row, and the notice says
  so.
- **A filter that is not armed yet** (a property picked, no value): ignored, as
  the view ignores it.
- **"is empty"**: nothing to set; a new row is already empty there.
- **"is" with several values** (*Status is To do or Doing*): not pinned, since
  there is no single answer. The notice says the row doesn't match.
- **Properties nobody can write** (formula, rollup, created time, last edited,
  unique id): never pinned.
- **A select option that no longer exists**: not pinned; the stored value would
  be an option the property no longer has.
- **Multiselect, person (several), relation "is X"**: pinned as a list holding
  just X, which matches "holds X".
- **The title** (*Name contains "bug"*): never pinned; a new row has no title
  of its own (upstream `1f4e886`).
- **A form view**: not affected. It has no filters, and its fields are what the
  person fills in.
- **A filter value the person can't see** (a person filter naming somebody who
  is not a member any more): pinned as stored. The view filters on the same
  stored value, so the row shows.
- **A view changed by someone else while the person presses New**: the server
  reads the view as it is stored at that moment, which is what the person will
  see on the next refresh.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Creating a row from a view MUST set every property that the view's
  armed filters pin to exactly one value: *is* with a single value, on a
  property that can be written.
- **FR-002**: Values given explicitly (a board column, the agent's own
  properties, a form's fields) MUST win over pinned values for the same
  property.
- **FR-003**: Pinned values MUST win over a database template's values for the
  same property; the template fills everything else.
- **FR-004**: A relative date in a filter (*today*, *tomorrow*, …) MUST be
  pinned as the date it resolves to at the moment the row is created, by the
  same rule the view filters with.
- **FR-005**: Pinned values MUST be stored in the property's own form: a select
  option's id, a number as a number, a checkbox as true/false, a list for
  multiselect, several people and relations.
- **FR-006**: Two filters that pin different values for the same property MUST
  pin nothing for it.
- **FR-007**: After the row is created, if it doesn't match all of the view's
  filters, the person MUST see a notice saying so, with an action that opens
  the row.
- **FR-008**: A view with no armed filters MUST create rows exactly as today.
- **FR-009**: The pinned values MUST be worked out by the server, by one function
  that the interface and the agent tools both call. A client never translates
  filters into values itself.
- **FR-010**: Agents MUST be able to name a view when they create a row in a
  database (create a single row, or several at once), and MUST get the same
  pinned values and the same "doesn't match" answer a person gets.
- **FR-011**: Naming a view that doesn't belong to the database MUST be refused
  with a clear message, before anything is created.
- **FR-012**: The usual checks MUST apply unchanged: the person or agent needs
  write access to the database, and naming a view grants nothing on its own.
- **FR-013**: The notice text MUST be translated (German required).
- **FR-014**: The wiki MUST describe the behaviour on the page about database
  views and in the agent tool reference.

### Key Entities

- **View filter**: a property, an operator and a value (or several, or a
  range), stored on the view. Only *is* with one value pins anything.
- **Pinned values**: the property → value map worked out from a view's filters
  at the moment a row is created. Not stored; computed every time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a view filtered to one value per property, 100% of rows made
  with **New** stay visible in that view, against 0% today.
- **SC-002**: Every row that leaves the view it was made in is announced: no
  silent disappearance in any of the edge cases above.
- **SC-003**: An agent and a person making a row in the same view get the same
  stored values, checked by one test that does both.
- **SC-004**: Creating a row takes no noticeably longer: the extra work is
  reading one view the server already loads, with no new query per row.

## Assumptions

- "The view the person is looking at decides" (FR-003) is the expectation behind
  pressing **New** in a filtered view, so pinned values beat a template's.
  Explicit values beat both, because a person or agent typed them.
- Filter groups joined by OR, which agents can use in `query_rows`, are not
  stored on views. Views hold only the AND list, so only that list pins.
- The notice uses the existing toast with an action; no new component.
- Board columns keep doing what they do; the filter values are added around
  them.
