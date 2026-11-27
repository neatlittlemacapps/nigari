# Feature Specification: A gallery chooses where its card images come from

**Feature Branch**: `claude/spec-027-card-image`

**Created**: 2026-11-26

**Status**: Draft

**Issues**: #980

**Input**: Owner, 2026-11-24, on #980: in a gallery, let the view choose which
field a card's image comes from. With nothing chosen, the card falls back in
order: a media property, the page's cover, the page's icon, the first image in
the page's content, and only then the plain placeholder. The picker lists only
fields that can hold an image, plus an "off" choice. The reference was another
app's gallery menu ("card preview": none, cover, a property, the content);
nigari's version follows its own menus and wording.

## Context

From the code graph (`codegraph explore` on `GalleryView`, `coverStyle`,
`CollectionView`, `ViewSettingsMenu`, `ViewDef`, `handleCollectionRows`,
2026-11-26) and the source:

- **A card shows the row's cover or its icon, nothing else.** `GalleryView`
  draws `.gallery-cover` from the row's `cover` (an uploaded image or a
  gradient). Without one it shows the page icon large on a plain panel (📄
  when there is no icon). There is no per-view choice and no other source.
- **The rows arrive with their cover and icon already.** `loadRows` in
  `CollectionView` maps `cover` and `icon` from the rows the server sends
  (`GET /api/collections/{id}/rows`), so those two sources cost nothing more.
- **A page's content is stored as a list of blocks**, in the `content` column
  of `pages`, and an image is a block of type `image` with a `url`. Finding the
  first one means reading a row's whole content. The rows request does not do
  that today, and doing it for every row on every load would read every page
  of the database.
- **No property type holds a file or an image.** `PropType` has text, number,
  select, multi-select, status, date, checkbox, checklist, url, person,
  relation, back-relation, rollup, formula and last activity. A `url`
  property can hold a link to an image.
- **Uploads already exist for documents.** `POST /api/upload` stores a file
  under `/files/`, and the file index (`files` table, `recordFile`,
  `scanBlocksForFiles` in `files.go`) ties each file to the page that carries
  it. That page's read permission decides who may list it (`handleListFiles`
  checks `canRead` per carrier page). The index learns about files from a
  page's blocks and its cover. A file held in a property value is not among
  those today, so it would count as unreferenced and its carrier page would
  be unknown.
- **Per-view settings live on the view** (`ViewDef`: grouping, hidden
  properties, column widths …) and are set from the view's Settings menu
  (`ViewSettingsMenu`). The server checks what a view may store in
  `normalizeViews`, the same rules for REST and MCP `set_view`, and an embed
  in a document keeps its own copy of its views (spec 014).
- **Only the gallery draws an image.** Board cards and list rows show none.
- **The wiki** (`views.md`, "gallery") says the top of the card is the row's
  cover, else its icon.

## Clarifications

### Session 2026-11-26

- Q1: Where do card images from a property come from, given that no property type holds a file today? → A: Build a "Files & media" property type in this feature (owner "B"). Turned down: A, URL properties only now with the new type in its own spec later (Claude's recommendation); C, no property choice at all.
- Q2: Does the card image setting apply to gallery cards only, or to board cards too? → A: Gallery only (owner "A"). Turned down: B, gallery and board with board cards defaulting to None; it can be added later without redoing this.
- Q3: Are image fit and card size part of this feature? → A: Neither; images fill the image area, cropped, and cards keep their size (owner "A"). Turned down: B, a Fit image switch (Claude's recommendation); C, Fit image plus Card size.

### Session 2026-11-27

- Q: Should a form view, public forms included, let people upload files into a Files & media field? → A: Yes, every form, with the same size limit as document uploads (owner "C"). Turned down: A, forms leave the field out (Claude's recommendation: anonymous uploads need limits of their own); B, only forms filled in by signed-in members.
- Q: When a database page is shared publicly by link, may link visitors see and open the files in a Files & media column? → A: Yes: images as thumbnails, other files as links, openable, as in a shared document (owner "A"). Turned down: B, names only; C, the column left out of shared pages.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cards fill themselves from what the rows already have (Priority: P1)

Someone opens a gallery of rows that have no cover set but do have an image
in their page, or an icon. Today every such card shows a grey panel with a
large 📄. With this feature, each card shows the first source that has
something, in the fallback order, without anyone changing a setting.

**Why this priority**: It improves every existing gallery at once, with no
setting to learn. It is the default behaviour the issue asks for.

**Independent Test**: A gallery with four rows: one with a cover, one with
only an icon, one with only an image in its content, one with nothing. Each
card shows, respectively, the cover, the icon, the content image and the
placeholder.

**Acceptance Scenarios**:

1. **Given** a row with a cover and an image in its content, **When** the
   gallery is shown with no card image setting, **Then** the card shows the
   cover.
2. **Given** a row with no cover but an icon, **When** the gallery is shown,
   **Then** the card shows the icon as today.
3. **Given** a row with neither cover nor icon and an image in its content,
   **When** the gallery is shown, **Then** the card shows that image, cropped
   to fill the card's image area.
4. **Given** a row with none of these, **When** the gallery is shown, **Then**
   the card shows the plain placeholder as today.

---

### User Story 2 - The view says where the image comes from (Priority: P1)

The person arranging a gallery opens its Settings and picks "Card image".
The menu lists Automatic (the fallback order), Page cover, Page content, the
database's properties that can hold an image, and None. Picking one makes
every card take its image from there only; picking None removes the image
area, so the cards are text only.

**Why this priority**: It is the setting the issue asks for. Without it the
fallback order cannot be overridden, for example to show a product photo held
in a property instead of a decorative cover.

**Independent Test**: In a gallery, choose each option in turn and check that
every card follows it, and that a reload keeps the choice.

**Acceptance Scenarios**:

1. **Given** a gallery, **When** its Settings menu opens, **Then** it offers
   "Card image" with the current choice shown, Automatic by default.
2. **Given** "Page cover" is chosen, **When** a row has no cover, **Then** its
   card shows the placeholder, not its content image or icon.
3. **Given** "None" is chosen, **When** the gallery is shown, **Then** no card
   has an image area.
4. **Given** a property is chosen, **When** a row's value in it is empty or is
   not an image, **Then** its card shows the placeholder.
5. **Given** a choice was made in an embed of the database in a document,
   **When** the database page itself is opened, **Then** its own gallery is
   unchanged (the embed's views are its own, spec 014).

---

### User Story 3 - A database holds files and images in a property (Priority: P1)

Someone adds a "Files & media" property to a database, for example "Photos"
on a product list. In a row's cell (table) or on its page they upload one or
more files, see them as thumbnails (images) or named chips (other files),
open one, reorder them, and remove one. A gallery set to Automatic, or to
that property, shows the property's first image on the card.

**Why this priority**: The owner chose to build it in this feature (Q1 "B").
It is step 1 of the fallback order and the only property the picker can offer
besides links.

**Independent Test**: Add a Files & media property, upload two images and a
PDF to one row, check the cell, the row page and the gallery card, remove the
first image and check the card shows the second.

**Acceptance Scenarios**:

1. **Given** a database, **When** someone adds a property, **Then** "Files &
   media" is among the types, with an icon of its own.
2. **Given** a Files & media cell, **When** someone who may edit the row
   uploads files (picker or drag and drop), **Then** they appear in the cell
   in the order added and stay after a reload.
3. **Given** a cell with files, **When** it is shown in a table, **Then** it
   shows the first files as small thumbnails or chips and a count of the
   rest, on one line, like other multi-value cells.
4. **Given** a file in a cell, **When** someone clicks it, **Then** it opens
   (an image in a preview, another file in a new tab, as a document's file
   block does).
5. **Given** a reader who may not edit the row, **When** they open the cell,
   **Then** they see and open the files but cannot add or remove any.
6. **Given** a file in a row of a page someone may not read, **When** they
   ask for the workspace's files, **Then** it is not listed for them (the
   row page is its carrier, as for a document's files).

---

### User Story 4 - An agent can read and set the same choice (Priority: P2)

An agent arranging a gallery over MCP sets the card image source with the
same rules the interface uses, and sees it when it reads the view. It can
also add a Files & media property, put a file it uploaded into a row's value,
and read the files back.

**Why this priority**: Agent parity is a principle of the project. A view
setting the interface can store must be one an agent can store, with the same
checks.

**Independent Test**: Through `set_view`, set the card image to a property,
read the view back, then try a property that cannot hold an image and get a
refusal that says why.

**Acceptance Scenarios**:

1. **Given** a gallery view, **When** an agent sets its card image to "cover",
   **Then** the view stores it and the interface shows it.
2. **Given** a select property, **When** an agent sets it as the card image
   source, **Then** the request is refused with a message naming the property
   types that are allowed.
3. **Given** a Files & media property, **When** an agent uploads a file and
   sets it as a row's value, **Then** the row shows it in every view, as if a
   person had uploaded it.
4. **Given** a value naming a file the agent may not reach (another
   workspace's, or one that does not exist), **When** the agent sets it,
   **Then** it is refused.

---

### Edge Cases

- A chosen property is later deleted or changed to a type that cannot hold an
  image: the view falls back to Automatic and the menu shows Automatic; the
  server does not refuse the schema change.
- A content image whose file is gone or whose link no longer loads: the card
  shows the placeholder, not a broken-image mark.
- A cover that is a gradient counts as a cover: the card shows the gradient,
  as today.
- A page whose first image sits inside a toggle, a column or a callout: it
  still counts as the page's first image (reading order).
- A database of thousands of rows: opening its gallery is not noticeably
  slower than today (SC-002).
- A row whose content changes in another tab or by an agent: its card shows
  the new first image the next time the rows load, as other row changes do.
- A reader who may not edit the database sees the images but no Card image
  item.
- A file removed from a cell: it leaves the cell at once; the stored file
  is not deleted on the spot, so an undo or a version restore can bring it
  back (as with a document's files).
- A row duplicated or made from a template: the copy's cell names the same
  files.
- A property changed to another type, or from another type to Files & media:
  values that cannot be converted are cleared after a confirmation, as for
  other conversions.
- An upload too large or of a type the server refuses: the cell says why and
  keeps what it had.
- A shared database page: link visitors open its rows' files, and no file of
  a row in a database that is not shared (FR-006i).
- Someone fills in a public form, uploads a file and leaves without
  submitting: the file is never part of a row, nobody else can reach it, and
  it is removed later (FR-006h).
- A public form is sent many uploads from one address: the form's existing
  limit per address refuses them past that limit, and the form says to try
  again later.
- A Files & media property in a filter: "is empty" and "is not empty" only;
  it cannot be sorted or grouped by, or charted.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A gallery view MUST have a card image setting with the choices
  Automatic, Page cover, Page content, each property that can hold an image,
  and None. Automatic is the default, for new views and for existing ones.
- **FR-002**: Automatic MUST use the first source that has something, in this
  order: an image property (when the database has one), the page cover, the
  page icon, the first image in the page's content, the placeholder.
- **FR-003**: Any other choice MUST use that source only, and MUST show the
  placeholder when the source is empty.
- **FR-004**: None MUST remove the card's image area.
- **FR-005**: The choice MUST be offered in the gallery's Settings menu, built
  from the design system's menu, with an icon of its own, and only to someone
  who may change the view.
- **FR-006**: The picker MUST list only properties that can hold an image:
  Files & media properties and URL properties (owner, Q1 "B": the new type is
  built in this feature).
- **FR-006a**: A database MUST offer a "Files & media" property type that
  holds an ordered list of uploaded files per row.
- **FR-006b**: Someone who may edit a row MUST be able to add files (picker
  and drag and drop), open, reorder and remove them from the row's cell in a
  table and from the row's page. A reader MUST be able to see and open them
  only.
- **FR-006c**: Each view MUST show the property compactly: thumbnails for
  images and named chips for other files, on one line with a count of the
  rest in a table, and on cards and list rows as other multi-value properties
  are shown.
- **FR-006d**: A file in a property value MUST be in the file index with the
  row as its carrier page, so the same read rules decide who may see it as
  for a document's files, and it is not counted as unreferenced.
- **FR-006e**: Filters on the property MUST offer "is empty" and "is not
  empty"; sort, grouping and charts MUST NOT offer it.
- **FR-006f**: An agent MUST be able to add the property over MCP and set,
  read and clear a row's files with the same checks as a person: only files
  the credential may reach, in the row's workspace.
- **FR-006g**: Markdown and HTML export MUST include the property's files as
  links, as they do for a document's file blocks.
- **FR-006i**: A database page shared publicly by link MUST show a Files &
  media column's images as thumbnails and other files as links that link
  visitors can open, as a shared document's files are (owner, clarify
  2026-11-27). Only files in that shared database's own rows are reachable
  this way.
- **FR-006h**: A form view, public forms included, MUST offer a Files & media
  field, with the same size limit as document uploads (owner, clarify
  2026-11-27). An upload from a public form MUST: be counted against the
  form's existing per-address submission limit; be tied to the row that
  form's submission creates and to no other page; and stay unreachable by
  its address, to anyone outside the database's readers, if the submission
  never completes. Files of a submission that never completes MUST be
  removed after a set time.
- **FR-007**: The first image in a page's content MUST be known for every row
  without reading each row's whole content when the gallery loads.
- **FR-008**: A content or property image MUST fill the card's image area,
  cropped to it, as a cover does today.
- **FR-009**: A choice that names a property the database no longer has, or
  one that can no longer hold an image, MUST be treated as Automatic.
- **FR-010**: The server MUST refuse a card image choice naming a property
  that cannot hold an image, with an English message and a code the interface
  translates, through every door that stores a view (REST and MCP `set_view`).
- **FR-011**: An embed's views MUST keep their own card image choice (spec 014).
- **FR-012**: The card image setting MUST apply to gallery cards only; board
  cards stay without an image (owner, Q2 "A").
- **FR-013**: Images MUST fill the card's image area, cropped, as covers do
  today; cards keep their size. Image fit and card size are not part of this
  feature (owner, Q3 "A").
- **FR-014**: Every new string MUST be translated into German, Spanish and
  Dutch, and the wiki's gallery section MUST say where card images come from.

### Key Entities

- **Card image source** (a setting of a gallery view): Automatic, cover,
  content, none, or a property's id.
- **Files & media value** (a row's value in such a property): an ordered list
  of files, each with the stored file's address and the name it was uploaded
  under.
- **A page's first content image**: the address of the first image block in
  the page's content, in reading order, kept up to date as the content
  changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a gallery whose rows have content images but no covers, every
  such card shows its image with no setting changed (today: none do).
- **SC-002**: Opening a 5,000-row database's gallery takes no more than 10%
  longer than on `main` (median of 5 loads, measured on the same machine).
- **SC-003**: A person can switch a gallery to show a property's images in at
  most three clicks from the view (Settings, Card image, the property).
- **SC-004**: An agent can set and read the same choice over MCP, and is
  refused with a reason for a property that cannot hold an image.
- **SC-005**: A person can add a Files & media property and upload an image
  to a row in under a minute, and the gallery card shows it without a setting
  changed.
- **SC-007**: An anonymous form submission with a file creates the row with
  the file in it; a file uploaded through a form without a submission cannot
  be fetched by anyone who may not read the database (a test of the
  refusal).
- **SC-006**: A file in a property value of a page someone may not read is
  never listed or served to them (a test of the refusal, REST and MCP).

## Assumptions

- A `url` property counts as able to hold an image. A value that does not
  load as an image shows the placeholder (FR-003).
- The first content image is the first `image` block in reading order.
  Videos, files and images inside an embedded database do not count.
- Automatic follows the issue's order: icon before the content image. So a
  row with an icon shows its icon even when its page holds a picture; a row
  without an icon shows the picture.
- Rows of a database are pages, so a row's cover, icon and content are the
  same ones its page shows.
- Lists, calendars, timelines and tables are out of scope for the card
  image: they show no card image today. They do show a Files & media
  property's value like any other property (FR-006c).
- Upload limits (size, allowed types) are the ones document uploads already
  have.
- The new property type is a new concept for the registry
  (`.specify/memory/surfaces.md`): later features that touch property types,
  exports or the file index must account for it.
