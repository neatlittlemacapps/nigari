---

description: "Tasks for a view chooses how its pages open"
---

# Tasks: A view chooses how its pages open

**Input**: `specs/007-open-pages-in-peek/` (plan.md, spec.md, research.md, data-model.md, contracts/)

**Tests**: required (salt.md). Refusal paths for every gate.

**Issues**: none yet

**Delivery**: Phases 1–6 are the first pull request (side peek). Phase 7 is the
follow-up pull request (centre peek).

## Format: `[ID] [P?] [Story] [surface] Description`

---

## Phase 1: Setup

- [ ] T001 [ui] Tokens: primitive `layer.panel` = 100 in `web/tokens/primitives.tokens.json`; component `side-panel.width` (720px) and `side-panel.layer` (→ `layer.panel`) in `web/tokens/component.tokens.json`, the way `dialog.*` is built; rebuild `web/src/tokens.css` with `node scripts/build-tokens.mjs`

---

## Phase 2: Foundational (blocks every story)

- [ ] T002 [backend] New `server/viewopen.go`: `centerPeekShipped = false`, `checkViewOpenIn(view)` (known value; not on a form view; `center_peek` refused while unshipped; `full_page` stored as no key) and `normalizeViewsOpenIn(raw)` for a whole views array (research R2)
- [ ] T003 [P] [test] Table test in `server/viewopen_test.go` for T002: each value, missing, an unknown value, a non-string, a form view with and without a value, `center_peek` while unshipped, `full_page` removed from the stored view
- [ ] T004 [P] [ui] New `web/src/peek.ts`: `rowOpenAction(click, openIn, prefs, wide)` per the table in research R3 (narrow side peek → navigate until centre peek ships)
- [ ] T005 [P] [test] New `web/scripts/check-peek.mjs`: every row of the research R3 table against T004, added to `npm run check` in `web/package.json`

**Checkpoint**: the server knows which values are allowed; the browser knows what a click does.

---

## Phase 3: User Story 1: look at a row without leaving the view (P1) 🎯 MVP

**Goal**: in a side-peek view, a click opens the row beside the view.

**Independent Test**: a table view set to Side peek; click a row; the page opens beside the table, which stays scrollable.

- [ ] T006 [US1] [ui] New `web/src/ui/SidePanel.tsx` + `SidePanel.css` (research R6): non-modal, `role="complementary"`, `aria-label`, fixed right, width `min(50vw, var(--side-panel-width))`, layer `--side-panel-layer`, existing shadow token; focus to its heading on open and back to the opener on close (`nav.ts`); Escape closes unless a menu or dialog inside is open (`escapeTarget`); light and dark; README entry in `web/src/ui/README.md`
- [ ] T007 [P] [US1] [ui] Catalogue section for `SidePanel` in `web/catalog/` (checked by `web/tests/catalog.mjs`)
- [ ] T008 [US1] [ui] `Editor.tsx`: replace `inDialog` with `container: 'page' | 'dialog' | 'peek'`; in a peek the top bar keeps the page's controls and swaps the sidebar button for **Close** and **Open as full page** (`ui/IconButton`/`Button`); `TemplateEditDialog` passes `container="dialog"`
- [ ] T009 [US1] [ui] New `web/src/components/PeekPanel.tsx`: `SidePanel` + `Editor` with `key={peekId}` and `container="peek"`; `onMissing` closes the peek with the toast "This page is no longer available."
- [ ] T010 [US1] [ui] `App.tsx`: `peekId` beside `currentId`; open pushes `/p/{pageId}?peek={rowId}` with `peek` in the history state; close goes back if the peek pushed the entry, else replaces; `onPop` restores it; a load with `?peek` opens it; a page change closes it (research R4); `PeekPanel` rendered beside the page
- [ ] T011 [US1] [ui] `pageOpen.ts`: `openCollectionRow(e, id, openers, openIn)` calls `rowOpenAction`; `PageOpeners` gains `onPeek`; `blockContext` passes it, so embedded databases peek beside the embedding page
- [ ] T012 [US1] [ui] Every row opener passes its view's `openIn`: table rows, board cards, list, gallery, calendar items, timeline bars (`CollectionView.tsx`, `ListView.tsx`, `GalleryView.tsx`), and the spec 005 toast's **Open**; `View` type in `web/src/types.ts` gains `openIn`
- [ ] T013 [P] [US1] [i18n] German (required) and Spanish for "Open as full page", "Close" (if new), "This page is no longer available." (if new)
- [ ] T014 [US1] [test] Playwright `web/tests/side-peek.mjs` (added to `web/tests/package.json`): a view set to side peek (seeded through the API); click a row → panel beside the view; click another → panel switches; Escape closes and the scroll position is unchanged; Back closes; reload with `?peek` reopens; **Open as full page** navigates; ⌘/Ctrl-click opens a new tab; a full-page view still navigates (SC-003)

**Checkpoint**: US1 works for a view whose setting was stored by hand.

---

## Phase 4: User Story 2: each view keeps its own choice (P1)

**Goal**: a person sets the choice per view from the interface.

**Independent Test**: board on Side peek, table on Full page; each behaves as set.

- [ ] T015 [US2] [backend] `handlePutCollection` in `server/collections.go`: run `normalizeViewsOpenIn` on the views half before storing; 400 `invalid_view_open_in` and nothing stored on a refusal
- [ ] T016 [P] [US2] [i18n] `invalid_view_open_in` in `web/src/serverErrors.ts`, German and Spanish
- [ ] T017 [US2] [test] Go tests: `PUT /api/collections/{id}` stores `side_peek`, stores `full_page` as no key, refuses an unknown value and a form view with nothing stored (neither half); a reader cannot change it (existing gate)
- [ ] T018 [US2] [ui] New `web/src/components/ViewOpenMenu.tsx`: **Open pages in** submenu in the view options menu (`CollectionView.tsx` imports it) with **Full page** and **Side peek** as radio items; hidden for form views and readers; saved through the existing views save
- [ ] T019 [P] [US2] [i18n] German and Spanish for "Open pages in", "Full page", "Side peek"
- [ ] T020 [US2] [test] Extend `web/tests/side-peek.mjs`: set Side peek from the menu on one view, the other view still navigates; a reader sees the peek but not the setting

**Checkpoint**: US1 and US2 work in the interface.

---

## Phase 5: User Story 3: an agent reads and sets the choice (P2)

**Goal**: agents set `open_in` and read `openIn`.

**Independent Test**: `set_view` with `open_in: "side_peek"`; `get_collection` shows it.

- [ ] T021 [US3] [mcp] `set_view` in `server/mcp.go` and `viewSpec`/`applyViewSpec` in `server/mcp_schema.go`: `open_in` through `checkViewOpenIn`; descriptions of `set_view` and `get_collection` per contracts/mcp.md
- [ ] T022 [US3] [test] Tests via `callTool`: set and read back; merge keeps the stored value when omitted; `full_page` clears it; unknown value, form view and `center_peek` refused with nothing changed; read-scoped token refused
- [ ] T023 [US3] [test] SC-004: one test sets the value over REST and reads it over MCP, and the reverse; a pair of acts `set view open mode` in `parity_property_test.go`

**Checkpoint**: every story works through every door.

---

## Phase 6: Polish and cross-cutting

- [ ] T024 [P] [wiki] `wiki/collections.md` new § How rows open; `wiki/mcp-tools.md` §§ set_view and get_collection; `docs/what-it-does.md` one line; retake every screenshot `check-wiki.mjs` lists as stale
- [ ] T025 [P] [perf] Bundle gzip measured against the 590,146 B cap; confirm closing a peek makes no rows request (network log in `side-peek.mjs`); numbers in the pull request
- [ ] T026 [test] Run `scripts/agent-gate.sh`; mutation-check T003, T005, T014 and T022 (each fails with its fix undone)

---

## Phase 7: User Story 4: center peek (P3, follow-up pull request)

**Goal**: a centred panel over the dimmed view.

**Independent Test**: a view set to Center peek; click a row; the page opens centred over the view.

- [ ] T027 [US4] [backend] `centerPeekShipped = true` in `server/viewopen.go`; update the T003 table test
- [ ] T028 [US4] [ui] `PeekPanel.tsx`: draw `center` with `ui/Dialog` (wide, modal, focus trap and return through `useExclusiveModal`); `peek.ts`: narrow side peek → center; update `check-peek.mjs`
- [ ] T029 [US4] [ui] `ViewOpenMenu.tsx`: **Center peek** radio item
- [ ] T030 [P] [US4] [i18n] German and Spanish for "Center peek"
- [ ] T031 [US4] [mcp] `set_view` description lists `center_peek`
- [ ] T032 [US4] [test] Playwright: centre peek opens, traps focus, closes on Escape, outside click, close button and Back; phone width side peek opens as centre; Go/MCP tests accept `center_peek`
- [ ] T033 [P] [US4] [wiki] `wiki/collections.md` and `wiki/mcp-tools.md` describe Center peek; stale screenshots retaken

---

## Dependencies

- T001 → T006. T002 → T003, T015, T021. T004 → T005, T011.
- US1 (T006–T014) is the MVP. US2 needs T002 and T011. US3 needs T002 only.
- T024–T026 once the doors are in. Phase 7 starts after the first pull request merges.
