# Feature Specification: A row's page manages its database's properties

**Feature Branch**: `claude/spec-015-row-properties`

**Created**: 2026-11-13

**Status**: Draft

**Issues**: #582

**Input**: Owner, #582 (2026-11-06), with eight Notion screenshots:

> "Properties can be CRUD on collection item detail page. Properties can also
> be "hidden" A "show hidden properties" CTA appears under the properties.
> Doing so temporarily shows the properties until dismissed again. This does
> not carry over to other nodes. It is just a temp show/hide hidden
> properties so one can adjust their visibility."

The screenshots show, on a row opened as a page: a click on a property's
name opens a menu (Rename, Edit property, Property visibility with *Always
show* / *Hide when empty* / *Always hide*, Duplicate property, Delete
property); **Edit property** opens a small panel for that one property
(name, Type, the type's own settings, Delete property); **+ Add a property**
sits under the list; hidden properties fold into **N more properties**,
which unfolds them with **Hide N properties** to fold them again.

## Context

How a row's page shows its properties today, from the code graph and the
source (`codegraph explore` on `RowProperties`, `ColHead`, `SchemaEditor`,
`PropDef`, `mcpUpdateSchema`, 2026-11-13):

- **The row's page** (`RowProperties` in `Editor.tsx`, one caller,
  `PageHeader`) lists every property of the database in schema order, each
  name as plain text beside its value. Values can be changed, and a select's
  options edited in place; nothing about a property itself can be. The same
  component draws a row opened in a peek (spec 007).
- **Properties are changed in one place**: the **Edit properties** dialog
  (`SchemaEditor`, from the database's Settings, spec 012), which edits the
  whole schema and saves it at once. Deleting a property there asks first
  and names the database (#524, PR #573). There is no "duplicate property"
  anywhere.
- **A table's column heading** (`ColHead`) has its own menu: move left/right
  and **Hide in view**. That hiding belongs to the view (spec 012) and does
  not touch the row's page.
- **Nothing is hidden on a row's page**: `PropDef` has no visibility field,
  and nothing in the server reads one.
- **Agents** change properties with `update_schema` (`mcpUpdateSchema`):
  add, change and remove properties, with the same checks as the REST route
  (`handlePutCollection`). `get_page` returns a row's values, all of them.
- **Public pages** do not draw a row's properties, so this spec does not
  reach them.

## Clarifications

### Session 2026-11-13

- Q: What does Edit property open? → A: A small panel for that one property,
  beside its name, as in Notion; not the full Edit properties dialog (owner,
  "A", recommendation).
- Q: Whose is a property's visibility? → A: The database's: one setting for
  everyone and every row, as in Notion (owner, "A", recommendation).
- Q: Does a change made from a row's page ask first? → A: Only deleting asks,
  as in the table and the Edit properties dialog; the row belongs to the
  database itself, unlike an embed in a document (owner, "A",
  recommendation).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Change a property from the row you are reading (Priority: P1)

Someone filling in a meeting's page sees that "Date" should be called
"Meeting date", or that "Category" needs another option. Today they leave the
page, open the database, open Settings, find the property in the full list,
and come back. From now on they click the property's name on the row's page
and change it there.

**Why this priority**: it is the core of #582: properties managed where they
are used.

**Independent Test**: open a row's page, click a property's name, rename it,
change its type, and see the database's table show the same change.

**Acceptance Scenarios**:

1. **Given** a row's page and someone who may change the database, **When**
   they click a property's name, **Then** a menu opens with Rename, Edit
   property, Property visibility, Duplicate property and Delete property.
2. **Given** that menu, **When** they choose Rename, type a new name and
   press Enter, **Then** the property is renamed for the whole database (every
   row, every view).
3. **Given** that menu, **When** they choose Edit property, **Then** they can
   change the property's name, type and the settings its type has (a select's
   options, a number's display, a relation's database…) for that property
   alone, in a small panel beside the name (not the full Edit properties
   dialog).
4. **Given** that menu, **When** they choose Duplicate property, **Then** a
   copy named "Copy of {name}" with the same type and settings appears right
   under it, empty on every row.
5. **Given** that menu, **When** they choose Delete property, **Then** the
   same confirmation as today's (#524) names the property and the database,
   and only after it the property goes.
6. **Given** someone who may only read the database, **When** they look at a
   row's page, **Then** the names are plain labels: no menu, no Add a
   property.

---

### User Story 2 - Add a property from a row (Priority: P1)

Writing a task, someone realises the database needs an "Estimate". They add
it under the row's properties without leaving the page.

**Independent Test**: on a row's page choose **+ Add a property**, pick a
type, name it, and fill in its value on that row.

**Acceptance Scenarios**:

1. **Given** a row's page and someone who may change the database, **When**
   they choose **+ Add a property** under the properties, **Then** they pick
   a type and a name, and the property is added to the database, last in
   order, with its value field ready on this row.
2. **Given** a name another property already has, **When** they add it,
   **Then** the property is still added, with the name made unique the way
   the Edit properties dialog does it.

---

### User Story 3 - Hide properties on a row's page (Priority: P1)

A database with fifteen properties makes every row's page start with a wall
of mostly empty fields. The owner hides the ones rarely filled in, or hides a
field only while it is empty.

**Independent Test**: set one property to *Always hide* and another to *Hide
when empty*; open a row where the second is empty and one where it is
filled.

**Acceptance Scenarios**:

1. **Given** the menu's Property visibility, **When** they choose *Always
   show*, *Hide when empty* or *Always hide*, **Then** every row's page of
   the database follows it, for everyone: one setting per property, not one
   per person.
2. **Given** hidden properties on a row's page, **Then** under the list a
   line reads "N more properties" (N counting what is hidden on this row);
   **When** it is clicked, the hidden ones appear, each marked as hidden,
   and the line reads "Hide N properties".
3. **Given** hidden properties shown, **When** they choose "Hide N
   properties", or open another page, **Then** they are folded away again:
   the unfolding is for this page, this time, and is not remembered.
4. **Given** a property set to *Hide when empty* that has a value on this
   row, **Then** it shows like any other; **When** its value is cleared while
   the page is open, **Then** it stays in place until the page is opened
   again (a field does not vanish under the cursor).
5. **Given** visibility on a row's page, **Then** tables, boards and the
   other views are not affected: their own **Hide in view** stays as it is.

---

### User Story 4 - Agents can do the same (Priority: P2)

An agent setting up a database for someone hides the bookkeeping properties
on the row pages, as a person can.

**Independent Test**: with `update_schema`, set a property's visibility on
the row pages, then read it back with `get_collection`.

**Acceptance Scenarios**:

1. **Given** an agent that may change the database, **When** it sets a
   property's row-page visibility through `update_schema`, **Then** the
   setting is stored and checked as the interface's is (one of the three
   values; anything else is refused with a clear error).
2. **Given** an agent reading a row with `get_page`, **Then** it still gets
   every value, hidden or not: hiding is about the page, not about the data.
3. Duplicating a property needs no new tool: `update_schema` can already add
   a property with the same settings.

### Edge Cases

- The title is not a property in the list and has no menu here.
- A computed property (formula, rollup, backrelation, last activity) can be
  renamed, edited, duplicated, hidden and deleted; it has no value to fill.
- Duplicating a relation copies its target and makes a second, independent
  relation; it does not copy the links.
- Changing a property's type keeps the values the change can keep, exactly
  as the Edit properties dialog does today (same rule, one place).
- A row with every property hidden shows only the "N more properties" line.
- Two people change the same property at once: the last save wins, as with
  the Edit properties dialog today; the other page shows the change when it
  next loads the database.
- A row's page in a peek behaves the same as a full page.
- A change made from a row's page asks first only when it deletes (FR-005);
  a rename, an edit, a duplicate, a visibility change or a new property is
  saved at once, as in the table and the Edit properties dialog.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A property's name on a row's page MUST open a menu (click, and
  the keyboard) for anyone who may change the database, with Rename, Edit
  property, Property visibility, Duplicate property and Delete property, each
  with its own icon (rule: one function, one icon app-wide).
- **FR-002**: Rename MUST edit the name in place; Enter saves, Escape
  cancels; an empty name is not saved.
- **FR-003**: Edit property MUST change one property's name, type and type
  settings, with the rules the Edit properties dialog applies today (types,
  options, relations, rollups, formulas, number display, person settings).
- **FR-004**: Duplicate property MUST add "Copy of {name}" with the same type
  and settings, directly after the original, holding no values.
- **FR-005**: Delete property MUST use the existing confirmation (#524),
  including its relation sentence and the refusal for a property a locked
  view uses (spec 013).
- **FR-006**: **+ Add a property** MUST appear under the properties for
  anyone who may change the database and add the property last.
- **FR-007**: Each property MUST carry a row-page visibility: *Always show*
  (the default, also for every existing property), *Hide when empty*, or
  *Always hide*.
- **FR-008**: Hidden properties MUST fold into one line "N more properties"
  that shows them until folded again ("Hide N properties") or until the page
  is left; this is not stored.
- **FR-009**: The visibility MUST be checked by the server on every door that
  writes a schema (REST and `update_schema`): only the three values.
- **FR-010**: A reader MUST see no menu and no Add a property; a hidden
  property stays hidden for a reader, who can still unfold it to read it.
- **FR-011**: Every new string MUST be in German, Spanish and Dutch.

### Key Entities

- **Property visibility on a row's page**: one of three values on a
  property of a database; read by the row's page only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Renaming a property from a row's page takes 2 clicks and the
  name, against at least 5 steps today (Settings, Edit properties, find it,
  rename, save).
- **SC-002**: A row's page with 10 properties of which 6 are hidden shows 4
  fields and one "6 more properties" line.
- **SC-003**: Every action in the menu has the same effect through the
  interface and through `update_schema`, checked by a parity test.
- **SC-004**: No property that existed before the change is hidden after it.

## Assumptions

- Comment on a property, Customize layout, Property access, date/time format
  and notifications, and AI autofill (all in the screenshots) are out of
  scope: nigari has none of them for properties today. Each can be its own
  issue.
- Reordering properties on the row's page by drag is out of scope; the order
  stays the schema's, changed in the Edit properties dialog.
- "Copy of {name}" follows the naming the owner chose for copied views
  (2026-11-12).
- The board's Status property type (#18) is not part of this spec.
