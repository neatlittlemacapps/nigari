# Feature Specification: A database in a document has views of its own

**Feature Branch**: `claude/handoff-14` (spec)

**Created**: 2026-11-03

**Status**: Draft

**Issues**: epic #426; this spec covers #371, and the confirmation of #524
where a document changes the original database

**Input**: Owner, 2026-11-03, with Notion screenshots (a linked view's
**New view** menu listing "Views on Tasks Manager"; the dialog "Delete this
property from Tasks Manager? It will be removed from all views."):

> "You basically recreate a view from the originating database, but in itself
> it is a separate view that only exists in combo with the embed block on this
> page. So if you want to add the other views you can but you'd need to add or
> recreate these. […] That said, it is still possible to edit properties of
> the dbase and thus change the source base as well. Doing these type of
> actions (resulting in an alteration of the true source d-base or different
> views elsewhere) can happen but through a confirmation."

And #371 (owner, 2026-10-30): a nested database starts with one base view;
views added there belong to the nesting only; changing them never changes the
original's views; **New view** lists the original's views to start from, as
a copy.

## Context

How an embedded database works today, from the code graph and the source
(`codegraph explore` on `EmbedState`, `databaseSpec`, `mcpEmbedDatabase`,
2026-11-03):

- **The block.** A database in a document is a `database` block
  (`web/src/blocks.tsx`, `databaseSpec`) holding the database's id
  (`collectionId`) and, since #26, a `local` value: the view it shows
  (`viewId`) and, per view, the filters and sort it applies (`views`). The
  block lives in the document, so whoever can edit the document can change
  it; a reader's filter changes stay in their browser (`unsaved`).
- **The views are the database's.** The embed's tabs are the database's own
  views (`CollectionView`, with `embed`). Anything that changes a view from
  there (add a view, a timeline's dates, a table's sub-items) changes it for
  the database's own page and every other document that shows it. Spec 012
  keeps Settings out of embeds for this reason (research R10), and its PR 2
  removes the timeline date and sub-items pickers there too, until this spec.
- **The properties are the database's.** The Properties dialog
  (`SchemaEditor`) is not offered in embeds today. Deleting a property asks
  nothing, even on the database's own page (#524).
- **Agents.** `embed_database` (MCP) adds the block, optionally showing one of
  the database's views (`view_id`, written into `local.viewId`). An agent
  reading the document with `get_page` sees the block as a link,
  `[Collection](/p/<id>)` (`server/export.go`); the embed's filters are not
  visible to it, and it has no tool to change them.
- **Charts.** A chart view's settings live on the database's view, and a
  chart is put into a document by embedding the database showing that view
  (spec 004).
- **Spec 013** (in PR #523, not merged) keeps a person's filter changes in an
  embed per person and per embed, with **Save for everyone** writing the
  embed's own filters (#26), and leaves an embed's filters outside the views
  lock. This spec moves from "own filters" to "own views"; spec 013's
  per-embed state then attaches to the embed's own views.

## Clarifications

### Session 2026-11-03

- Q: Where do Settings in an embed act? → A: On the embed's own views, with no
  confirmation, because only this embed changes; editing the database's
  properties from there is allowed with a confirmation (owner, the quote
  above). Settings in embeds is this spec, not spec 012 (owner: "ok" to the
  split, 2026-11-03).
- Q: Which property changes made from a document ask first? → A: Every
  change saved there, not only deleting a property or an option (owner,
  "Ok" to recommendation A, 2026-11-03).
- Q: What does an embed written before this change get? → A: A copy of every
  database view it could switch between, with its own filters and sort on
  each, and the same view open; nothing visibly changes (owner, "Ok" to
  recommendation B, 2026-11-03).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A database in a document starts with a view of its own (Priority: P1)

Someone embeds the Tasks database in a project document. The embed shows one
table view that belongs to this embed. They filter it to the project, add a
board view grouped by status, rename the table "Open work". The Tasks
database's own page, and every other document showing Tasks, look exactly as
before.

**Why this priority**: it is the model the owner asked for; everything else
in this spec stands on it.

**Independent Test**: embed a database, add a view and change a filter in the
embed, then open the database's own page and a second document embedding it:
neither shows the new view or the filter.

**Acceptance Scenarios**:

1. **Given** a document, **When** a database is embedded, **Then** the embed
   shows one table view of its own, with every property shown, and no tab for
   the database's other views.
2. **Given** an embed, **When** a view is added, renamed, moved, filtered,
   sorted, grouped or removed there, **Then** only that embed changes; the
   database's views and other embeds of it are unchanged.
3. **Given** the same database embedded twice in one document, **When** one
   embed's view is changed, **Then** the other embed is unchanged.
4. **Given** an embed, **When** a row is added, edited or deleted there,
   **Then** the change is to the database's rows, seen everywhere, as today.
5. **Given** a person who can read the document but not edit it, **When**
   they filter or sort an embed, **Then** it changes for them only and is
   not saved, as today.

---

### User Story 2 - Start an embed's view from one of the database's views (Priority: P1)

In the embed, **New view** lists the view types and, under "Views on
Tasks", the database's own views. Picking "Sprint board" adds a copy of it to
the embed: same type, grouping, filters, sort, shown properties and chart
settings. Changing the copy later does not change "Sprint board".

**Why this priority**: without it, every embed's view is set up from scratch,
and a chart made on the database cannot be shown in a document.

**Independent Test**: copy a database's view into an embed, change the copy's
filter, and check the database's view is unchanged.

**Acceptance Scenarios**:

1. **Given** an embed, **When** **New view** opens, **Then** it lists the
   view types and, in a section named after the database, each of the
   database's views with its type's icon.
2. **Given** that list, **When** a database view is picked, **Then** the embed
   gains a view with the same settings and name, shown at once.
3. **Given** a copied view, **When** it is changed, **Then** the database's
   view it came from is unchanged, and the other way round.
4. **Given** a chart view on the database, **When** it is copied into an
   embed, **Then** the embed draws the same chart.
5. **Given** an agent, **When** it embeds a database with a `view_id`,
   **Then** the embed starts with a copy of that view (as today's
   `embed_database` shows it).

---

### User Story 3 - Settings in an embed (Priority: P2)

The embed has the same **Settings** button as the database's page (spec 012),
with **View settings** acting on the embed's view: name, property
visibility, how rows open, the view type's own options (a timeline's dates, a
table's sub-items), move, remove. **Database settings** offers **Edit
properties**, which changes the database itself.

**Why this priority**: it gives back, on the embed's own views, the settings
spec 012 keeps out of documents.

**Independent Test**: from an embed's Settings, change every view setting and
check only the embed changed.

**Acceptance Scenarios**:

1. **Given** an embed and a person who can edit the document, **When**
   Settings opens, **Then** View settings lists the same items as on the
   database's page and each changes only the embed's view, without asking.
2. **Given** an embed, **When** its last view is removed, **Then** it is
   refused: an embed keeps at least one view.
3. **Given** a person who can read the document but not edit it, **When**
   Settings opens, **Then** it offers no change to the embed's views.
4. **Given** a person who can edit the document but only read the database,
   **When** Settings opens, **Then** View settings works and Edit properties
   is not offered.

---

### User Story 4 - A change to the original database from a document asks first (Priority: P2)

From an embed, **Edit properties** opens the database's properties. Saving a
change there asks first: "Change the properties of **Tasks**? This changes
the database and every view of it, everywhere." Deleting a property says
what is lost: "Delete **Owner** from **Tasks**? It will be removed from all
views." Every property change saved from a document asks, not only deletions
(owner, Q1 A).

**Why this priority**: the owner asked that a change reaching beyond the
document never happens silently.

**Independent Test**: from an embed, edit a property and cancel at the
confirmation; nothing changes. Confirm; the database's page shows the change.

**Acceptance Scenarios**:

1. **Given** an embed, **When** a property change is saved, **Then** a
   confirmation names the database and says the change applies everywhere;
   **Cancel** changes nothing.
2. **Given** an embed, **When** a property is deleted, **Then** the
   confirmation names the property and the database and says it leaves every
   view.
3. **Given** a relation property, **When** it is deleted, **Then** the
   confirmation also says its links to the other database's rows go too
   (nigari computes the other side, so its back-relation shows nothing;
   there is no column to delete, unlike Notion; #524).
4. **Given** the database's own page, **When** a property is deleted,
   **Then** it asks too (#524), with the same sentence.

---

### User Story 5 - Embeds that exist today keep what they show (Priority: P1)

A document written before this change embeds Tasks, showing its "Board" view
with the embed's own filter to Project A. After the change, it shows the same
board with the same filter, as a view of its own.
It also keeps the other tabs it could switch to: each of the database's views
becomes a view of its own in that embed, so nothing visibly changes (owner,
Q2 B).

**Why this priority**: an upgrade that changes what documents show breaks
trust in every document at once.

**Independent Test**: open a document written by the previous release; the
embed shows the same rows, in the same view, with the same filters.

**Acceptance Scenarios**:

1. **Given** an embed written before this change, **When** the document is
   opened, **Then** it shows the same view type, the same rows and the same
   filters and sort as before.
2. **Given** such an embed, **When** its view is changed for the first time,
   **Then** the database's view it came from is unchanged.
3. **Given** a document with such an embed, **When** an agent reads or
   exports it, **Then** nothing about the embed is lost.

---

### User Story 6 - Agents can see and change an embed's views (Priority: P2)

An agent working on a project document can list the embed's views, add one
(of a type, or as a copy of a database view), change one with the same
settings `set_view` takes, and remove one, with the same checks as a person.

**Why this priority**: agent parity (constitution): whatever a person can do
in the interface, an agent can do.

**Independent Test**: an agent adds a filtered board to an embed; a person
opening the document sees it; the database's views are unchanged.

**Acceptance Scenarios**:

1. **Given** a document an agent may edit, **When** it reads the document,
   **Then** each embed names its database and lists its views.
2. **Given** that, **When** the agent adds, changes or removes an embed's
   view, **Then** the same rules apply as for a person (types, settings,
   at least one view), and the database's views are unchanged.
3. **Given** a document the agent may only read, **When** it tries to change
   an embed's view, **Then** it is refused and nothing changes.

---

### Edge Cases

- A property an embed's view groups, filters, sorts or shows by is deleted on
  the database: the embed's view drops it as the database's own views do.
- The database is deleted or the reader loses access: the embed shows today's
  note ("This collection is no longer available.") and keeps its views, which
  come back if the database does.
- The database is moved to trash and restored: the embed's views are intact.
- A document is duplicated, exported and imported, or restored from history:
  the embed's views go with it.
- A document is shared publicly: the public page shows the embed as today (a
  link to the database).
- An embed's view copied from a database view keeps no link to it: a later
  change to the database's view is not carried over.
- A view type an embed cannot show (a form): **New view** does not offer it,
  and a form view on the database is not listed for copying.
- Two people edit the same embed's views at the same moment: the document's
  live editing decides, as for any block.
- Spec 013's views lock covers the database's views, not an embed's.

## Requirements *(mandatory)*

### Functional Requirements

**Own views (#371)**

- **FR-001**: An embedded database MUST have a list of views of its own, kept
  with the embed in the document, with at least one view.
- **FR-002**: A new embed MUST start with one table view showing every
  property.
- **FR-003**: Adding, renaming, moving, removing or changing an embed's view
  (type settings, filters, sort, grouping, shown properties, column widths
  and order, how rows open, chart settings) MUST change only that embed.
- **FR-004**: An embed's views MUST use the same settings, rules and checks as
  a database's views, including those `set_view` applies.
- **FR-005**: Rows shown, added, edited or deleted in an embed MUST be the
  database's rows, as today; a row added in an embed's view MUST take the
  values that view's filters pin, as a database's view does (spec 005).

**Copy from the database (#371)**

- **FR-006**: **New view** in an embed MUST list the view types and, in a
  section named after the database, the database's views (forms left out).
- **FR-007**: Picking a database view MUST add a copy of it to the embed with
  every setting, independent of the original from then on.
- **FR-008**: `embed_database` with a `view_id` MUST start the embed with a
  copy of that view.

**Settings in an embed**

- **FR-009**: An embed MUST offer the Settings menu of spec 012, its View
  settings acting on the embed's view, without a confirmation.
- **FR-010**: Changing an embed's views MUST need the right to edit the
  document; a reader's filter and sort changes stay theirs and unsaved, as
  today.
- **FR-011**: **Edit properties** MUST be offered in an embed only to someone
  who may edit the database.

**Changes to the original**

- **FR-012**: A property change saved from a document MUST be confirmed
  first, naming the database and saying the change applies everywhere.
- **FR-013**: Deleting a property MUST be confirmed on every surface,
  naming the property and the database and saying it leaves every view; for
  a relation, also that its links to the other database's rows go with it.

**Existing embeds**

- **FR-014**: An embed written before this change MUST show the same view,
  rows, filters and sort after it, without a manual step, with a view of its
  own for each database view it could switch to; its first change MUST NOT
  change the database's views.

**Agents**

- **FR-015**: An agent reading a document MUST see each embed's database and
  views; an agent with write access MUST be able to add, change and remove an
  embed's views with the same checks as the interface. Content returned goes
  through the untrusted-content wrapping, as any page content.
- **FR-016**: Read-scoped credentials MUST NOT change an embed's views.

### Key Entities

- **Embed**: a database block in a document. Holds the database it shows, its
  own views, which view is open, and (spec 013) per-person changes to them.
- **Embed view**: a view owned by an embed: the same shape and rules as a
  database's view, stored with the embed. May have been copied from a
  database view; keeps no link to it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After any change to an embed's views, the database's views and
  every other embed of it are byte-for-byte unchanged (checked in tests for
  each kind of view change).
- **SC-002**: Every document written by the previous release shows the same
  rows in its embeds after the upgrade (checked against a fixture of
  documents with embeds of every view type, with and without filters).
- **SC-003**: A database view can be copied into an embed in two clicks from
  **New view**.
- **SC-004**: No change to a database's properties made from a document
  happens without a confirmation the person answered.
- **SC-005**: Every embed view action a person can take, an agent can take
  over MCP, with the same refusals (parity test).

## Assumptions

- An embed's views are stored in the document, with the block, so they go
  wherever the document goes (history, duplicate, export, import) and live
  editing settles concurrent changes. Claude's default; the plan checks it
  against the server features that read views (new rows' pinned values,
  charts, spec 013).
- Expanding an embed to the database's own page shows the database's own
  views, not the embed's.
- A public page keeps showing an embed as a link; showing embed views there
  is out of scope.
- No "save this view to the database" in this spec: copying goes from the
  database to the embed only.
- Spec 012's Settings menu and spec 013's per-embed personal changes are in
  place first; this spec adapts to them.
