# Implementation Plan: A gallery chooses where its card images come from

**Branch**: `claude/spec-027-card-image` | **Date**: 2026-11-27 | **Spec**: [spec.md](spec.md) | **Issue**: #980

**Input**: Feature specification from `/specs/028-gallery-card-image/spec.md`

## Summary

Three pieces, in three pull requests:

1. **Files & media property** (US3, FR-006a–g): a new property type `files`
   whose value is an ordered list of uploads. It can be edited in a table
   cell and on the row page, and is shown compactly in every view. The value
   is checked by one function on both doors (REST `propsPatch`, MCP
   `set_properties`). The file index records the row as the files' carrier.
   Filters offer empty or not empty only. Markdown and HTML export include
   the files. Agents add the type with `update_schema` and set values with
   `set_properties` after `upload_file`.
2. **Files in forms and on shared pages** (FR-006h, FR-006i): an upload
   route for public forms, tied to the submission and cleaned up when it
   never comes. A shared database page shows and serves its rows' files.
3. **Card image** (US1, US2, FR-001–FR-005, FR-007–FR-011): a gallery view's
   `cardImage` setting, resolved by one pure function. Each row's first
   content image is kept in a stored column, so the gallery reads it with the
   rows and never opens their content.

## Technical Context

**Language/Version**: Go 1.27 (`server/`), TypeScript 5.6 + React 18 (`web/src/`)

**Primary Dependencies**: none new.

**Storage**: two upgrade steps in `server/upgrade_steps.go`, each with its
fixture written first: step 4 (PR 2) adds the table `form_uploads` (D8);
step 5 (PR 3) adds the column `pages.first_image` (D4) and fills it for
existing pages. `filesVersion` goes from 3 to 4, so the file index is rebuilt once with
property values in it (D3).

**Testing**: Go (`testServer`, `callTool`, refusal paths, the upgrade
fixture), `npm run check` with new `check-cardimage.mjs` and
`check-filesvalue.mjs`, Playwright `web/tests/files-property.mjs` and
`web/tests/gallery-card-image.mjs`.

**Target Platform**: one binary; browser, desktop shell, MCP clients.

**Performance Goals**: a 5,000-row gallery opens no more than 10% slower than
`main` (SC-002), measured median of 5. The rows query reads one more column
and no content.

**Constraints**: English source, de/es/nl; design system only; agent parity;
`CollectionView.tsx` is over 1,400 lines, so new views and cells go in their
own modules.

**Scale/Scope**: databases of thousands of rows; files up to the instance's
upload limit (`max_upload_mb`, default 50).

## CodeGraph

- `codegraph_explore "GalleryView coverStyle gallery-cover CollectionView gallery rows cover icon view settings card"`:
  `GalleryView` has 1 caller (`CollectionView`). A card draws the row's
  cover or its icon, nothing else. `loadRows` maps `cover` and `icon` from
  the rows route, so those two sources are free. `ViewSettingsMenu` has 1
  caller.
- `codegraph_explore "ViewDef cardSize collection rows cover handleCollectionRows rowJSON first image content blocks"`:
  views are stored as sent after `normalizeViews` (REST PUT and MCP
  `set_view` share it). `handleCollectionRows` (2 callers, tested) reads no
  content. A page's content is a JSON block list in `pages.content`.
- `codegraph_explore "handleUpload files.go serve file permissions canRead file page upload_file MCP propertyTypes"`:
  `handleUpload` checks `canWrite` only when `?page=` is given. The file
  index (`recordFile`, `scanBlocksForFiles`, `migrateFileIndex`) learns
  carriers from blocks and the cover. `handleListFiles` filters by `canRead`
  per carrier. `canRead` has 39 callers; this plan adds none.
- `codegraph_explore "validPropTypes ... checkPropertyVisibility"`:
  `validPropTypes` (`mcp_schema.go`) is the server's type list and
  `TYPES` (`propertyTypes.tsx`) the interface's. `check-wiki.mjs` reads
  `propTypes` (every type must be in the wiki). `changePropertyType` (5
  callers) is non-destructive: values stay and are coerced when drawn.
- `codegraph_explore "FORM_TYPES FormView formField handlePublicFormSubmit ..."`:
  two form doors, `FormView` → `api.createPage` (signed in) and
  `PublicForm` → `handlePublicFormSubmit` (anonymous, `formRate` 20/min per
  IP, `coerceFormValue` per type). `formField` has 3 callers (`FormView`,
  `PublicForm` ×2), so one new case serves both forms.
- `codegraph_explore "handleServeFile ... public share file access"`:
  `handlePublicFile` serves only files the shared page itself references
  (`publicPageReferencesFile`: icon, cover, blocks). A shared database's
  rows are drawn by `publicCollectionTable`, but their files are not
  reachable. The signed-in `GET /files/` serves any stored name to any
  signed-in user. The unguessable name is the protection there, for every
  upload today.
- `codegraph_explore "mcpUploadFile mcpSetProperties ... collectionMarkdown ... aggregate"`:
  `mcpSetProperties` (8 callers) and REST `propsPatch` (`mergePropsPatch`)
  store values as sent after `normalizePropValues`. No per-type value check
  exists on either door, so the files check must be added to both through
  one function (D2). `collectionMarkdown` (3 callers: export, MCP, shared
  table) writes strings and string lists only. `groupableTypes` does not
  list the new type, so charts already refuse to group by it.
- Text search (strings): `upload_file` (`mcp.go`) appends a block when given
  `page_id` and otherwise returns the bare `/files/` address. The wiki
  `views.md` "gallery" section says cover, else icon.

## Design decisions

- **D1. The value is a list of `{ "url": "/files/<name>", "name": "<as uploaded>" }`.**
  Only uploads to this instance (`/files/`), never outside links (a URL
  property is for those). The order is the order shown. *Turned down*: bare
  address strings (the uploaded name would be lost); outside links in the
  same list (a second kind of item with its own privacy rules).
- **D2. One check for every door: `checkFilesValue(u, rowID, value)`** in a
  new `server/filesprop.go`, called from `mergePropsPatch`'s caller (REST),
  `mcpSetProperties`, `create_rows`, the signed-in form (through the REST
  create) and the template and duplicate paths. It refuses a file that does
  not exist, or whose index entry belongs to another workspace, with code
  `invalid_files_value`. A file with no index entry yet (just uploaded, not
  attached) is accepted and recorded with the row. *Turned down*: checking
  in the browser only (an agent could link another workspace's upload into
  a shared page).
- **D3. The file index knows property values.** When a value is stored,
  each file is recorded with the row as carrier (`recordFile`).
  `migrateFileIndex` also reads `files` property values; `filesVersion` 4
  rebuilds the index once. A file taken out of a value stays on disk
  (undo, version restore) and keeps its index row, as a document's does
  today.
- **D4. The first content image is stored, not computed per request.**
  `pages.first_image` holds the first `image` block's `url` in reading order
  (nested children included). It is written by `reindexPage`, which every
  content write already calls, and returned with each row by
  `handleCollectionRows` and MCP `query_rows`. Step 5 fills it for existing
  pages. *Turned down*: reading each row's content on every gallery load
  (5,000 JSON documents per open, SC-002); computing it in the browser
  (needs every row's content).
- **D5. `cardImage` on a gallery view**: absent = Automatic, `"cover"`,
  `"content"`, `"none"`, or a property id. `normalizeViews` refuses a newly
  set property id whose property is not `files` or `url`
  (`invalid_view_card_image`). A stored value that has gone stale (the
  property was deleted or changed type) is kept and treated as Automatic, so
  a later save of the views is not refused for it (FR-009). An embed's views
  carry it the same way (spec 014). *Turned down*: one key per choice
  (several keys for one decision).
- **D6. Which image a card shows is one pure function**, `cardImageFor(row,
  view, schema)` in `web/src/cardImage.ts` with `check-cardimage.mjs`. It
  returns `{ kind: 'image', url } | { kind: 'gradient', css } | { kind:
  'icon', icon } | { kind: 'placeholder' } | { kind: 'none' }`. Automatic
  order: first image file of the first `files` property, cover, icon,
  `first_image`, placeholder (FR-002). A URL property's value counts as an
  image only by its address (an image extension, or `/files/` with one).
  A load error falls back to the placeholder in the component (edge case).
- **D7. Two new design-system pieces**, each with a README entry and a
  catalogue section, built before the property uses them (owner,
  2026-11-26):
  - **`ui/FileList`**: the files of one value, in a `compact` form (one line
    of small thumbnails and chips, then "+N", for cells and cards) and a
    `full` form (thumbnails and named rows, for the row page and the
    editor), with open, and remove and reorder when editable.
  - **`ui/FileDrop`**: the "Add files" control, a button that opens the
    file picker and a drop target, with progress and the refusal message
    (too large, refused type).
  The cell's editor is a `ui/Popover` holding `FileList` (full) and
  `FileDrop`. *Turned down*: one `FilesCell` primitive in `ui/` (it would
  know about rows and permissions); reusing BlockNote's file block (an
  editor block, not a form control).
- **D8. Public form uploads are held until the submission claims them.**
  New route `POST /api/public/form/{token}/upload` (no sign-in). It counts
  against `formRate` per address, applies `max_upload_mb`, writes the file
  and a `form_uploads` row (file name, collection, time) and returns a
  one-time claim. `handlePublicFormSubmit` accepts a `files` value only from
  claims of that form's collection, removes them from `form_uploads` and
  records the files with the new row. A cleanup on the existing maintenance
  tick deletes unclaimed uploads, file and row, after 24 hours (Claude's
  default, named in the wiki). The signed-in `GET /files/` serves stored
  names to signed-in users only, and no anonymous route serves a pending
  upload. *Turned down*: reusing `/api/upload` for forms (it needs a
  sign-in, and an anonymous upload there would land outside any rule).
- **D9. A shared database serves its rows' files.** `handlePublicFile`
  also accepts a file that a non-trashed, non-private row of the shared
  database holds in a `files` value (the same rows `publicCollectionTable`
  draws, `privateRowRule("")`). The file index finds the candidate row, and
  the row's stored value is read to confirm it, since the index is not
  authority (`public_assets.go`). `publicCollectionTable` draws images as
  thumbnails and other files as links through `publicAssetURL`.
- **D10. Spec corrections from the code** (the spec is updated in this PR):
  - SC-006 said a file of a page someone may not read is never *served* to
    them. The signed-in `/files/` route serves any upload by its
    unguessable name, for document files as well. Changing that is a
    separate question. SC-006 now says such a file is never *listed* to
    them and never reachable through a share link they hold.
  - The edge case "values that cannot be converted are cleared after a
    confirmation" contradicts the existing type change, which keeps values
    and coerces them when drawn (`changePropertyType`). A `files` property
    shows only values in its shape, and a changed type keeps the stored
    values, as every other type change does.
- **D11. Copies reference the same files.** A duplicated or template row
  keeps the value as it is (D3 records the copy as a carrier too). *Turned
  down*: copying the files themselves (doubles storage for every duplicate).

## Constitution Check

- I. One binary, no external services ✅: files on disk as today; no new
  process; the steps upgrade an existing instance by themselves.
- II. Agent parity ✅: the type over `update_schema`, values over
  `set_properties` and `create_rows` after `upload_file`, the card image
  over `set_view`, `first_image` in `query_rows`. Public form uploads have
  no agent counterpart (anonymous visitors only).
- III. Gates are one function ✅: `checkFilesValue` (D2) for every door
  that writes a value; `normalizeViews` for the card image; the public file
  rule in `handlePublicFile` (D9). Every one is tested on its refusal path.
- IV. Derive from code ✅: `check-cardimage.mjs`, `check-filesvalue.mjs`;
  `check-wiki.mjs` already fails on an undocumented type.
- V. English source ✅: every new string through `t()`, de/es/nl.
- VI. Every surface, every time ✅: table below, and a new registry row
  (File references).
- VII. Measured, not assumed ✅: the 5,000-row gallery open (SC-002), the
  rows query's plan before and after.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | New `checkFilesValue` (D2) on every value door; property writes keep their existing `canWrite`, audit and webhook. Public form upload: `formRate`, size limit, claim (D8). Shared file rule (D9). | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | `pages.first_image` (`ensureColumn`) and `form_uploads` with an index on `created_at` for the cleanup (D4, D8). The rows query selects one more column; the shared-file lookup uses the existing `files` index on `file_name` (primary key) plus `pages.id`. Checked with `EXPLAIN QUERY PLAN`. | backend |
| REST routes (`server/server.go`, middleware) | New `POST /api/public/form/{token}/upload` (public, no `auth`, rate-limited). `GET /api/collections/{id}/rows` returns `firstImage`. `PATCH /api/pages/{id}` and `POST /api/pages` run the files check. | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | `validPropTypes` gains `files`; `update_schema` and `create_database` accept it; `set_properties` and `create_rows` take a files value (D1) through `checkFilesValue`; `set_view` takes `card_image`; `query_rows` returns `first_image`. Descriptions say how to attach a file: `upload_file` without `page_id`, then `set_properties`. Read scope refuses as for any write. | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: everything a person can do is open to agents. The public form upload is for anonymous visitors, not a signed-in capability. | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | New `web/src/components/FilesValue.tsx` (cell, row page, card), `formField` case `files`, `GalleryView` via `cardImage.ts` (D6), `ViewSettingsMenu` "Card image" submenu, `propertyTypes.tsx` `TYPES` and `FORM_TYPES`, filter menu (empty/not empty only), sort and group menus leave it out. Keyboard: Tab to the cell, Enter opens the editor, Delete removes the focused file, ⌘↑/↓ reorders. Light and dark, 1280 and 390. | ui |
| Translations (`t()`, `de.json` and `nl.json` required, `es.json`) | "Files & media", "Add files", "Card image", "Automatic", "Page cover", "Page content", "None", "Remove {name}", "Open {name}", "+{count}", upload refusals: de/es/nl. | i18n |
| Server error codes (`web/src/serverErrors.ts`) | `invalid_files_value`, `invalid_view_card_image`, `form_upload_limit` (429 on the form upload). | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots) | `views.md` gallery section (where card images come from, the Card image setting); `databases.md` or the property types page: Files & media; the forms page: uploads and the 24-hour cleanup; `sharing.md`: a shared database shows its files; `mcp-tools.md`: `set_properties` files values, `set_view` `card_image`, `query_rows` `first_image`. Retake the gallery and property shots `check-wiki` names. `docs/what-it-does.md`: the new type. | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | Go: `checkFilesValue` refuses another workspace's file, a missing file, a non-list (REST and MCP, `callTool`); read scope refused; `normalizeViews` refuses a non-image property and keeps a stale one; public form upload refused past the limit and over size, unclaimed upload removed by the cleanup, a claim from another form refused; shared file served for a shared row, refused for a private row and for an unshared database; `first_image` written by content writes and by step 5 (fixture); index rebuild includes values. Checks: `check-cardimage.mjs` (the order, each choice, stale property), `check-filesvalue.mjs` (the browser's shape helpers). Playwright: `files-property.mjs` (add type, upload, reorder, remove, reader, form upload, phone), `gallery-card-image.mjs` (US1 four rows, US2 each choice, reload, embed). `parity_property_test.go` acts for the value and the setting. | test |
| Performance (query plans, payload size, per-request work) | Rows payload grows by one short string per row. No content read on gallery open. Thumbnails use the stored image (no server resizing in this feature: a cell shows at most a few). 5,000-row gallery open measured on `main` and the branch (SC-002). | perf |
| Manifest (`capabilities.json`, `gapBudget`, parity acts) | New route `POST /api/public/form/{token}/upload` listed as public (no agent capability). The files value and `card_image` extend existing capabilities (`set_properties`, `set_view`). `gapBudget` unchanged. | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets, catalogue) | New `ui/FileList` and `ui/FileDrop` (D7), README entries and catalogue sections, light and dark, tokens only (thumbnail size, chip radius from existing tokens; new `--file-thumb-*` tokens if needed, with contrast checked). No raw buttons: open, remove and add are `ui/Button`. **No mockup**: the owner waived it for this feature (2026-11-27, "No mockup for me. I trust you for this one"); the look is judged on PR 1's screenshots. | ui |
| Storage budgets (benchmarks on the seeded workspace, p95 budgets, read time limit) | `handleCollectionRows` with the new column benchmarked on the seeded workspace (`bench_world_test.go`), within its p95 budget. | perf |
| Page containers | The files editor and the row page's Files & media work in the full page, the side peek and the centre peek (the shared `Editor`/`RowProperties`). | ui |
| Aggregation | `files` neither groups nor aggregates: `groupableTypes` leaves it out (a chart refuses it with the existing message, which now lists it as not groupable), and counting rows with or without files is a filter (empty / not empty). A case in `aggregate_test.go` shows the refusal. | backend |
| Stored data | Step 4 (PR 2, fixture `step-3.db`) adds `form_uploads`; step 5 (PR 3, fixture `step-4.db`) adds `pages.first_image`, filled from existing content. Expand only; nothing is dropped. A new JSON shape inside `pages.props` (D1) needs no step: absent means no files. | backend |
| Outside names | No change: no environment variable, cookie, header, storage key or data-directory file name. Uploads keep the `files/` directory. | backend |
| Menu icons | "Card image" submenu and its choices, "Add files", "Open", "Remove" in the files editor get icons from `menuIcons.ts`, each function its own icon; the property type gets its type icon. `check-menu-icons.mjs`. | ui |
| View lock | `card_image` is a view setting: written through `normalizeViews` and the existing view doors, so `checkViewsUnlocked` and `auditViewChanges` already cover it. A test with the lock on refuses a card image change. | backend |
| Cross-origin requests | The new public upload is a POST: `ServeHTTP` judges it like every non-GET request, and the public form page is same-origin. No bypass entry. A test sends it `Sec-Fetch-Site: same-site`. | backend |
| Embedded views | `cardImage` is part of the view object, so an embed's own views carry it in the document (`embedViews.ts`, `server/embedviews.go`); `normalizeViews` checks both. A case in `server/testdata/embedviews`. | ui |
| Content actions | Property actions list (`actions/`): no new action, the type is chosen in the existing type picker. View actions: "Card image" is a view setting in the Settings menu (a choice among values, so a submenu). Row actions: none new. | ui |
| File references | Introduced here (New concepts): `checkFilesValue` on every door, the row recorded as carrier (`recordRowFiles` from `reindexPage`, `filesVersion` 4), the Markdown export writes links, a removed file stays stored. PR 2 adds the shared-row rule for share links (D9). | backend |

**New concepts**: **File references.** This feature is the second place,
after document blocks, where a stored value points at an upload. Every later
feature that stores a `/files/` reference (a new block type, a new property,
a comment attachment) must: record the carrier in the file index, include it
in `publicPageReferencesFile` or the shared-row rule if a share link may show
it, include it in export, and keep the file when the reference is removed.
Added to `.specify/memory/surfaces.md` in PR 1, with its row in this table
from then on.

**Parity statement**: Agents can add the property with `update_schema` and
set files with `set_properties`/`create_rows` (after `upload_file`), with the
same `checkFilesValue` as `PATCH /api/pages/{id}`; they set the card image
with `set_view`, with the same `normalizeViews` as `PUT
/api/collections/{id}`. The anonymous form upload is a public visitor's
action with no signed-in counterpart.

## Project Structure

### Documentation (this feature)

```text
specs/028-gallery-card-image/
├── spec.md
├── plan.md        # this file
├── checklists/requirements.md
└── tasks.md       # /speckit-tasks
```

No `research.md` (the decisions are D1–D11), `data-model.md` (the value
shape, the column and the table are in D1, D4 and D8), `contracts/` (one new
route, described in D8, and argument additions listed under Surfaces) or
`quickstart.md` (it would repeat the tasks).

### Source Code

**Files touched**:

- PR 1 (Files & media): `server/filesprop.go` (new), `server/files.go`,
  `server/pages.go`, `server/mcp_db.go`, `server/mcp_schema.go`,
  `server/mcp.go` (descriptions), `server/export.go`, `server/export_html.go`,
  `server/collections.go` (filters), Go tests; `web/src/ui/FileList.tsx`,
  `web/src/ui/FileDrop.tsx` and their CSS, `web/src/ui/README.md`, the
  catalogue; `web/src/components/FilesValue.tsx` (new),
  `PropertyValue.tsx`, `propertyTypes.tsx`, `RowProperties.tsx`, the filter
  and sort menus, `types.ts`, `api.ts`, locales, `web/tests/files-property.mjs`,
  wiki, `.specify/memory/surfaces.md`.
- PR 2 (forms and shared pages): `server/public_form.go`,
  `server/public_assets.go`, `server/public_collection_table.go`,
  `server/db.go`, `server/upgrade_steps.go` (step 4),
  `web/src/components/PublicForm.tsx`, `CollectionView.tsx`
  (`FORM_TYPES`, `formField`), tests, wiki.
- PR 3 (card image): `server/pages.go` (`reindexPage`),
  `server/collections.go` (rows, `normalizeViews`), `server/upgrade_steps.go`
  (step 5),
  `web/src/cardImage.ts` (new), `web/scripts/check-cardimage.mjs` (new),
  `GalleryView.tsx`, `ViewSettingsMenu.tsx`, `types.ts`, locales,
  `web/tests/gallery-card-image.mjs`, wiki and shots.

**Order**: PR 1, PR 2, PR 3 (no mockup: waived by the owner, 2026-11-27). Each is reviewed and merged
before the next starts. After each feature PR merges, one bug is fixed
(owner's rule, 2026-11-26).

## Complexity Tracking

None.
