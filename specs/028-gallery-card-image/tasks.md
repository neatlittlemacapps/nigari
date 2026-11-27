---
description: "Tasks for the Files & media property, its forms and shared pages, and the gallery's card image, in three pull requests"
---

# Tasks: A gallery chooses where its card images come from

**Input**: `specs/028-gallery-card-image/` (spec.md, plan.md). No mockup: the
owner waived it (2026-11-27); the look is judged on PR 1's screenshots.

**Tests**: required. Go tests cover every gate's refusal path (REST and MCP
through `callTool`). The two new checks and the two Playwright specs are
mutation-checked: each fails with its fix taken out.

**Issues**: parent #980; tasks T001–T044 are #1073–#1116

**Delivery**: three pull requests, each from its own branch off the newest
`main`, merged before the next starts (plan, "Order"):
- PR 1 = Phases 1–3 (Files & media, US3 core and its agent parity from US4)
- PR 2 = Phase 4 (forms and shared pages, FR-006h/i)
- PR 3 = Phases 5–7 (card image, US1, US2 and the rest of US4)

## Format: `[ID] [P?] [Story] [surface] Description`

## Phase 1: Foundations for Files & media (PR 1)

- [x] T001 [backend] `server/filesprop.go` (new): the value shape (D1, a list of `{ "url": "/files/<name>", "name": "<as uploaded>" }`) and `checkFilesValue(u, rowID, value)` (D2). It refuses: a value that is not such a list; a url outside `/files/` or not a plain stored name (`publicFileName`); a file missing from `files/`; a file whose index entry has another workspace than the row's. A file with no index entry is accepted. Refusal code `invalid_files_value`, English sentence naming the item
- [x] T002 [backend] `server/mcp_schema.go`: `files` in `validPropTypes` and `propTypeNames`; `update_schema` and `create_database` accept it. `server/aggregate.go`: `files` stays out of `groupableTypes`, and the refusal lists it as not groupable (Aggregation surface)
- [x] T003 [backend] `server/pages.go` (`PATCH /api/pages/{id}` `propsPatch`, `POST /api/pages` props), `server/mcp_db.go` (`mcpSetProperties`, `create_rows`), `server/db_templates.go` and the duplicate path: every value written to a `files` property goes through `checkFilesValue` before the transaction opens (one writer connection: no query inside it). Copies keep the same files (D11) — *Done as:* the check sits in `mcpSetProperties` (so templates' rows, batch updates, create_rows and ingest pass it), REST props, propsPatch and create; a template itself is checked through `template_of` (code review); duplicating needs no check, the copy keeps the value as it is (D11, `TestDuplicatedRowKeepsTheSameFiles`).
- [x] T004 [backend] `server/files.go`: storing a `files` value records each file with the row as carrier (`recordFile`); `migrateFileIndex` also reads `files` values of every row; `filesVersion` 3 → 4 so the index is rebuilt once (D3)
- [x] T005 [backend] `server/collections.go`: filters on a `files` property offer `is_empty` and `is_not_empty` only (an empty list counts as empty); any other op is refused with the existing filter error; sort and grouping by it are refused like other non-sortable types — *Done as:* sorting and table grouping have no type rule on the server (there was none to copy); the interface leaves the type out of the Sort list, and a board or chart already refuses to group by it. A condition left from before a type change is ignored by the rows query, dropped from a personal view, refused only when a save adds it.
- [x] T006 [P] [backend] `server/export.go` (`collectionMarkdown`), `server/export_html.go`: a `files` value is written as links named by the uploaded name, as a document's file blocks are (FR-006g) — *Done as:* only `collectionMarkdown`: the HTML export draws a database as a link, never its rows, so `export_html.go` is unchanged.
- [x] T007 [P] [test] `server/filesprop_test.go` (new): `checkFilesValue` accepts an own upload and an unindexed one; refuses another workspace's file, a missing file, an outside url, a non-list, a path with `/` or `..`; REST `PATCH` and MCP `set_properties` and `create_rows` refuse the same values (`callTool`); a read-scoped token is refused; the index has the row as carrier after a write and after the rebuild; export writes the links; a chart refuses `group_by` a `files` property (`aggregate_test.go`); filters `is_empty`/`is_not_empty` match
- [x] T008 [P] [mcp] `server/mcp.go` and `server/mcp_db.go` descriptions: how to attach a file (`upload_file` without `page_id` returns the address; then `set_properties` with `[{"url": …, "name": …}]`); what `set_properties` refuses and why. `capabilities.json` unchanged (existing capabilities). `server/parity_property_test.go`: a REST/MCP pair setting a files value

## Phase 2: The interface for Files & media (PR 1, US3, P1)

- [x] T009 [US3] [ui] `web/src/ui/FileList.tsx`, `FileList.css` (new): the files of one value. `compact` (one line: small image thumbnails and file chips, then "+N", for cells and cards) and `full` (thumbnails and named rows, for the row page and the editor). Open per file; when editable, Remove (`ui/Button`) and reorder (drag and ⌘↑/↓). Tokens only. `web/src/ui/README.md` entry and a catalogue section, light and dark (D7)
- [x] T010 [P] [US3] [ui] `web/src/ui/FileDrop.tsx`, `FileDrop.css` (new): "Add files", a `ui/Button` that opens the file picker and a drop target, with progress per file and the server's refusal shown (too large, refused). README entry and catalogue section (D7)
- [x] T011 [US3] [ui] `web/src/types.ts` (`PropType` gains `files`, a `FileItem` type), `web/src/api.ts` (upload with `?page=<row>`), `web/src/components/propertyTypes.tsx` (`TYPES` gains "Files & media" with its type icon), `web/src/filesValue.ts` (new: read a stored value into `FileItem[]`, ignoring any other shape, D10; add, remove, move) with `web/scripts/check-filesvalue.mjs` (new, in `npm run check`) — *Done as:* uploads go to `/api/upload` without `?page=`: `PropertyValue` does not know the row, and the row becomes the file's carrier when the value is stored (`recordRowFiles`).
- [x] T012 [US3] [ui] `web/src/components/FilesValue.tsx` (new), drawn by `PropertyValue.tsx` for `files`: in a table cell `FileList` compact; a click or Enter opens a `ui/Popover` with `FileList` full and `FileDrop`; a reader sees and opens files only. On the row page (`RowProperties.tsx`) `FileList` full and `FileDrop` inline. On board, list and gallery cards `FileList` compact, read-only (FR-006b, FR-006c)
- [x] T013 [US3] [ui] `web/src/components/CollectionView.tsx` filter menu: `files` offers "is empty" and "is not empty" only; the sort and group pickers leave it out (FR-006e)
- [x] T014 [US3] [ui] `web/src/menuIcons.ts`: icons for "Add files", "Open file", "Remove file", the Files & media type, each function its own (`check-menu-icons.mjs`)
- [x] T015 [P] [i18n] `web/src/locales/de.json`, `es.json`, `nl.json`: "Files & media", "Add files", "Drop files here", "Remove {name}", "Open {name}", "+{count}", "Uploading {name}", the upload refusals; `web/src/serverErrors.ts`: `invalid_files_value`
- [x] T016 [test] `web/tests/files-property.mjs` (new), in `web/tests/package.json`: add a Files & media property; upload two images and a PDF to a row by picker and by drop; the cell's thumbnails and "+N"; reorder; remove; reload keeps it; a reader opens but cannot add or remove; the row page in a side peek; a phone viewport (390) with touch; light and dark

## Phase 3: Wiki, registry and reviews for PR 1

- [x] T017 [wiki] `wiki/databases.md` (or the property-types page `check-wiki` names): the Files & media type, what it holds, who can add and open files; `wiki/mcp-tools.md`: files values in `set_properties` and `create_rows`, attaching with `upload_file`; `docs/what-it-does.md`: the new type. Retake the shots `check-wiki` names as stale
- [x] T018 [backend] `.specify/memory/surfaces.md`: new row "File references" (plan, New concepts) with what a later feature checks
- [x] T019 [perf] `server/bench_world_test.go`: the rows query and a `set_properties` with a files value within their p95 budgets; nothing new on the rows path in PR 1
- [x] T020 [test] Reviews before PR 1 is offered: `/code-review`, `ux-ui-audit` (light and dark, 1280 and 390), `/security-review` (a new value gate); screenshots in the PR; `codegraph callers` on every export added

## Phase 4: Files in forms and on shared pages (PR 2, FR-006h, FR-006i)

- [x] T021 [backend] `server/upgrade_steps.go` step 4 with `server/testdata/upgrade/step-3.db` written first: table `form_uploads(file_name TEXT PRIMARY KEY, collection_id TEXT NOT NULL, claim TEXT NOT NULL, created_at TEXT NOT NULL)` and an index on `created_at`; the same in the `schema` constant in `server/db.go` — *Done as:* the `schema` constant is left alone: it is step 1's, frozen (`TestUpgradeStepOneIsFrozen`); steps 2 and 3 never touched it either. The claim is stored hashed.
- [x] T022 [backend] `server/public_form.go`: `POST /api/public/form/{token}/upload` (route in `server/server.go`, no `auth`): `formRate` per address (429 `form_upload_limit`), `max_upload_mb`, `sanitizeExt`, writes the file and a `form_uploads` row, returns `{ url, name, claim }`. Not served to anyone until claimed (D8)
- [x] T023 [backend] `server/public_form.go`: `formFillable` and `coerceFormValue` accept `files`: only items whose claim belongs to this form's collection; on submit the claims are removed and the files recorded with the new row. The signed-in form (`FormView` → `POST /api/pages`) uses `/api/upload` and `checkFilesValue` (T003) — *Done as:* a file that cannot be claimed refuses the submission (`form_upload_unclaimed`) instead of being dropped, since a lost file goes unnoticed.
- [x] T024 [backend] the maintenance tick (where `stopCleanup` drives cleanup): delete `form_uploads` rows older than 24 hours and their files
- [x] T025 [backend] `server/public_assets.go` (`handlePublicFile`): also serve a file held in a `files` value of a non-trashed row of the shared database that `privateRowRule("")` lets an anonymous visitor see; find the row through the file index and confirm it in the row's stored value (D9). `server/public_collection_table.go`: draw images as thumbnails and other files as links through `publicAssetURL`
- [x] T026 [ui] `web/src/components/CollectionView.tsx` (`FORM_TYPES`, `formField` case `files` with `FileDrop`) and `web/src/components/PublicForm.tsx` (uploads through the public route, claims sent with the submission); the form editor's preview shows the field
- [x] T027 [P] [i18n] locales: any new form strings; `web/src/serverErrors.ts`: `form_upload_limit`
- [x] T028 [test] Go: an upload past the per-address limit refused; over size refused; a claim from another form refused on submit; an unclaimed upload deleted by the cleanup after 24 hours (clock injected); a pending upload not served by `/public/…/files/`; a shared database serves a shared row's file and refuses a private row's, a trashed row's and an unshared database's; `crossorigin_test.go` case for the new POST with `Sec-Fetch-Site: same-site`; the upgrade fixture for step 4. Playwright: `web/tests/files-property.mjs` adds a public form upload and a shared page's thumbnail
- [x] T029 [wiki] the forms page: uploads, the limit, the 24-hour cleanup; `wiki/sharing.md`: a shared database shows its files; `capabilities.json`: the public route listed as public
- [x] T030 [test] Reviews before PR 2 is offered: `/code-review`, `/security-review` (anonymous uploads, a new public file rule), `ux-ui-audit` on the form

## Phase 5: The first content image (PR 3, US1, P1)

- [x] T031 [US1] [backend] `server/upgrade_steps.go` step 5 with `step-4.db` written first: column `pages.first_image TEXT NOT NULL DEFAULT ''` (also `ensureColumn` in `server/db.go`), filled from every page's content — *Done as:* no step 5 and no new column. `pages.thumb` already holds the first image block's address in reading order, written by `reindexPage` on every content write and filled for every page by the existing reindex (the notes list reads it); a second column would have been the same value twice. So no `step-4.db` either.
- [x] T032 [US1] [backend] `server/pages.go` (`reindexPage`): write `first_image`, the `url` of the first `image` block in reading order, nested children included (D4); `server/collections.go` (`handleCollectionRows`) and MCP `query_rows` return it as `firstImage` / `first_image` — *Done as:* nothing new in `reindexPage` (see T031); `collectionRowsQuery` selects `thumb` and returns it as `firstImage`, in the rows route and in `query_rows` alike (the rows' other keys are camelCase there too, so not `first_image`).
- [x] T033 [P] [US1] [test] Go: `first_image` after a content write, after a write that removes the image, nested in a toggle and a column, and from the step 5 fixture; the rows route and `query_rows` return it — *Done as:* `TestRowsCarryTheFirstContentImage` (reading order, a toggle's child, a column, removed, `query_rows`); no fixture case, as there is no step 5.

## Phase 6: The card image setting (PR 3, US1 and US2, P1)

- [x] T034 [US2] [backend] `server/collections.go` (`normalizeViews`): a gallery view's `cardImage` is absent, `"cover"`, `"content"`, `"none"` or a property id. A newly set id whose property is not `files` or `url` is refused (`invalid_view_card_image`); an unchanged stale one is kept (D5). Embeds' views through `server/embedviews.go` the same way. MCP `set_view` takes `card_image` with the same check — *Done as:* `checkViewCardImage` in `server/cardimage.go`, run by `normalizeViews` (REST) and `applyViewSpec` (`set_view`, an embed's own views); a card image on a view that is not a gallery is refused too. The views lock also keeps a locked gallery's card image property from being removed (`viewPropertyRefs`).
- [x] T035 [P] [US2] [test] Go: `normalizeViews` refuses a select as card image (REST and `set_view`), keeps a stale id, refuses while the views are locked (View lock); an embed case in `server/testdata/embedviews`; a parity pair in `parity_property_test.go` — *Done as:* `server/cardimage_test.go` (REST, `set_view`, a stale id kept, locked, an embed), the parity pair "set a card image", and `testdata/embedviews/gallery-card-image.json`; seven mutations, each caught.
- [x] T036 [US1] [ui] `web/src/cardImage.ts` (new): `cardImageFor(row, view, schema)` per D6 (Automatic: the first image of the first `files` property, cover, icon, `firstImage`, placeholder; each other choice uses its source only; `none` removes the area; a stale property is Automatic). `web/scripts/check-cardimage.mjs` (new, in `npm run check`): every choice and every step of the order — *Done as:* `cardImageFor(row, stored, schema)`; Automatic looks for an image in each Files & media property in schema order, not only the first property, so a property of PDFs before one of photos still gives the photo. A URL value counts only as an upload or an http(s) address with an image extension. `check-cardimage.mjs`, 32 cases, five mutations caught.
- [x] T037 [US1] [ui] `web/src/components/GalleryView.tsx`: draw what `cardImageFor` returns; an image fills the area, cropped (FR-008, FR-013); a load error shows the placeholder; `none` has no image area. `web/src/components/CollectionView.tsx` passes `firstImage` with the rows — *Done as:* an `<img>` with `object-fit: cover`, loaded lazily, the placeholder on a load error; the title's small icon is left out when the picture is the icon.
- [x] T038 [US2] [ui] `web/src/components/ViewSettingsMenu.tsx`: for a gallery, a "Card image" submenu (`ui/Menu`, `MenuValues`) with Automatic, Page cover, Page content, the `files` and `url` properties, None; shown only to someone who may change the view; icons in `web/src/menuIcons.ts`; the view action list in `web/src/actions/` lists it — *Done as:* the Settings menu builds its view settings itself, and `web/src/actions/` has no view action list, so there was none to add it to. The choice is labelled "No image", not "None": Spanish "Ninguno" does not agree with "imagen" (the same reason the menu's other radios name their none).
- [x] T039 [P] [i18n] locales: "Card image", "Automatic", "Page cover", "Page content", "None"; `web/src/serverErrors.ts`: `invalid_view_card_image` — *Done as:* "Automatic" was already translated; "No image" replaces "None" (T038).
- [x] T040 [US4] [mcp] `wiki/mcp-tools.md` and the `set_view` / `query_rows` descriptions in `server/mcp.go`: `card_image` and `first_image` — *Done as:* the field is `firstImage` (T032).
- [x] T041 [test] `web/tests/gallery-card-image.mjs` (new), in `web/tests/package.json`: US1's four rows (cover, icon, content image, nothing); each Card image choice and reload; a property's image; None; an embed keeps its own choice; light and dark, 1280 and 390 — *Done as:* also a property, a broken picture, a stale choice and phone width; the embed keeping its own choice is held by the Go test and the embed case (T035), and light and dark by the audit's screenshots (T044). Four mutations caught; 15 runs in a row pass.

## Phase 7: Wiki, measurement and reviews for PR 3

- [x] T042 [wiki] `wiki/views.md` gallery section: where card images come from and the Card image setting; retake the gallery shots `check-wiki` names — *Done as:* the wiki has no gallery screenshot to retake; the seven shots `check-wiki` named were retaken (only `agents-connect` changed in pixels, for the `query_rows` description).
- [x] T043 [perf] A 5,000-row gallery opened on `main` and on the branch, median of 5, no more than 10% slower (SC-002); the rows query's `EXPLAIN QUERY PLAN` before and after; `bench_world_test.go` within budget — *Done as:* opening to the 5,000th card, median of 5 after a warm-up, twice in opposite orders: main 2760 and 2895 ms, branch 2974 and 2875 ms; over all ten, main 2828 ms and branch 2945 ms, +4.2%. `BenchmarkStorageQueryRows` p95 8.6 ms at 1k rows (budget 18) and 19.2 ms at 10k (budget 50), medians no slower than main. The query plan cannot change: only `thumb`, a column of the same `pages` row, joined the select list; its WHERE and ORDER are untouched.
- [x] T044 [test] Reviews before PR 3 is offered: `/code-review`, `ux-ui-audit` (light and dark, 1280 and 390); screenshots in the PR — *Done as:* `/code-review` (a review agent) found 2 important and 2 nits, all fixed: a property choice is stored as `prop:<id>` (ids are made from names, so "Cover" was the page cover), a content image needs no image extension, one error prefix, one CSS rule. The ux-ui-audit (light and dark, 1280 and 390) found nothing in the change; it found two older bugs, filed under the epic and fixed here (#1125, #1124), and one report it withdrew on measuring again (#1123).

## Dependencies

- PR 1 (T001–T020) before PR 2 (T021–T030) before PR 3 (T031–T044).
- Within PR 1: T001 before T003, T004 and T007; T009 and T010 before T012;
  T011 before T012 and T013.
- Within PR 2: T021 before T022–T025.
- Within PR 3: T031 before T032; T034 and T036 before T037 and T038.
- After each PR merges: one open bug fixed in its own pull request (owner's
  rule, 2026-11-26).

## Parallel opportunities

- PR 1: T006, T007 and T008 once T001–T003 are in; T009 and T010 together;
  T015 beside the interface work.
- PR 3: T033 and T035 beside the interface tasks; T039 any time.
