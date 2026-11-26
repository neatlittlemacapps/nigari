---
description: "Tasks for editing a table row's name in its cell and opening the row with an Open button, in one pull request"
---

# Tasks: A click on a table row's name edits it; an Open button opens the row

**Input**: `specs/026-title-cell-edit/` (spec.md, plan.md). The mockup was approved
2026-11-26 (plan, "Mockup").

**Tests**: required.
- `check-titlecell.mjs` (new): what a click on the name does (D1).
- Playwright `title-cell.mjs` (new): every user story, light and dark, at 1280 and
  390 px.
- Both mutation-checked (they fail with their fix taken out).

**Issues**: none yet

**Delivery**: one pull request from `claude/spec-026-title-cell-edit` (the spec,
plan and code together).

## Format: `[ID] [P?] [Story] [surface] Description`

## Phase 1: Foundations

- [ ] T001 [ui] `web/src/titleCell.ts` (new): `titleClick({ canEdit, metaKey, ctrlKey, button })` → `'edit' | 'open' | 'new_tab'`. ⌘/Ctrl or the middle button means a new tab, then a reader opens, then an editor edits (D1, FR-001, FR-010, FR-011)
- [ ] T002 [P] [test] `web/scripts/check-titlecell.mjs` (new), added to `npm run check` in `web/package.json`: every combination of editor or reader and plain, ⌘, Ctrl or middle click
- [ ] T003 [P] [ui] `web/src/peekedRow.ts` (new): `PeekedRowContext` (the open peek's row id or null). `web/src/App.tsx` provides it from `peekId` around the page and the peek (D2)
- [ ] T004 [P] [ui] `web/src/ui/Field.tsx`, `Field.css`: `Input` gains `variant="cell"`, the flat field filling a table cell (lighter fill, thin rounded outline, no shadow, tokens only). It gets a `web/src/ui/README.md` entry and a catalogue section, light and dark (D5, FR-007)
- [ ] T005 [P] [ui] `web/src/ui/CellAction.tsx`, `CellAction.css` (new): a small outlined `Button` at a cell's end. It shows on hover or focus inside its host, always under `(hover: none)` (30 px high, 44 px tap area), always when `pinned`, and is hidden while the host edits. It gets a README entry and a catalogue section, light and dark (D5)

## Phase 2: Edit the name in the cell (US1, P1)

- [ ] T006 [US1] [ui] `web/src/components/useTableRowActions.ts`: the edit state carries which copy is edited (`{ id, group }`) so that in a grouped table only the clicked copy turns into a field. The + path keeps the row's first copy (D3)
- [ ] T007 [US1] [ui] `web/src/components/TitleCell.tsx` (new), drawn by `TableView` in `web/src/components/CollectionView.tsx` in place of today's title `<span>`/`.db-title-link`:
  - The name keeps the class `.db-title-link` and the whole cell is its target (FR-001).
  - A click or Enter goes through `titleClick`. `'edit'` opens `RowTitleInput`, `'open'` and `'new_tab'` go through `useOpenRow`.
  - A double click does what a single click does (FR-003).
  - The sub-item toggle, `AgentDot` and tags stay where they are.
- [ ] T008 [US1] [ui] `web/src/components/RowTitleInput.tsx`: the field is `Input` `variant="cell"` (T004), so the + path and the click path look the same. While editing, the row's icon is hidden and the whole name scrolls in the field (FR-007). The cursor over an editor's name cell is a text cursor, with no other hint (FR-016)

## Phase 3: The Open button (US2, P1)

- [ ] T009 [US2] [ui] `web/src/components/TitleCell.tsx`: the Open button is a `ui/CellAction` (T005) reading "Open", accessible name "Open {name}", over the end of a long name. The row height stays the same, and it runs `useOpenRow` with the click's modifiers (FR-004 to FR-006, FR-014)
- [ ] T010 [US2] [ui] `web/src/components/TitleCell.tsx`: the table row is the `CellAction`'s host (hover and focus reveal it), and the row being edited tells it to hide. Nothing about showing the button lives in `styles.css` (D4, D5, FR-004, FR-007)

## Phase 4: Close from the row (US3, P2)

- [ ] T011 [US3] [ui] `web/src/components/TitleCell.tsx`, `web/src/styles.css`: the row whose id is in `PeekedRowContext` gets a `pinned` `CellAction` reading "Close" (accessible name "Close {name}"), and pressing it closes the peek. Its `tr` gets `.is-peeked`, a soft tint of the accent colour (token) over the whole row, on every copy (FR-008, FR-015)

## Phase 5: Keyboard (US4, P2) and readers (US5, P2)

- [ ] T012 [US4] [ui] `web/src/components/TitleCell.tsx`: Enter on the focused name edits. Tab reaches Open/Close next. The focus ring goes round the cell. ⌘/ and ⌘⇧↑/↓ (`useRowKeys`) keep working from both (FR-009)
- [ ] T013 [US5] [ui] `web/src/components/TitleCell.tsx`: a reader (`canEdit` false, or an embed with `canEditDatabase` false) opens on click and sees the same button (FR-010)

## Phase 6: Translations, tests, wiki, reviews

- [ ] T014 [P] [i18n] `web/src/locales/de.json`, `es.json`, `nl.json`: "Open", "Close", "Open {name}", "Close {name}" (FR-012)
- [ ] T015 [test] `web/tests/title-cell.mjs` (new), in `web/tests/package.json`. Covers:
  - a click on the cell (also beside a short name) edits; Enter saves; Escape cancels; double click;
  - Open per view setting (full page, side peek); ⌘-click new tab;
  - a reader's click opens;
  - Close and the tint in a side peek, also on a grouped copy;
  - keyboard Enter and Tab;
  - a 390 px touch viewport with the button always shown.
- [ ] T016 [test] Update the specs that open a row by clicking its name to press its Open button instead. Find them by text search for `.db-title-link` clicks and `getByText(<row title>).click()` before a peek or page check (today `row-properties.mjs`, `view-settings.mjs`, and the peek and embed specs). Run `row-handle.mjs`, `table-cells.mjs` and `table-groups.mjs` unchanged
- [ ] T017 [perf] Measure drawing a 5,000-row table on `main` and on this branch, both in the same container. Write the numbers in the pull request (SC-005)
- [ ] T018 [wiki] `wiki/views.md`: the table section says a click on the name renames it and the Open button opens the row, with Close beside a peek (line 147 today). Retake the screenshots `check-wiki` names as stale, and no others
- [ ] T019 [ui] Look checklist (`.claude/rules/frontend.md`) on screenshots in light and dark at 1280 and 390 px, with left edges measured, and `ux-ui-audit`. Then `/code-review`. The screenshots and findings go into the pull request

## Dependencies

T001 → T007, T013. T003 → T011. T004 → T008. T005 → T009, T010, T011. T006 → T007. T007 → T008 to T013. T014 can run
alongside anything. T015 and T016 come after T013. T018 and T019 come last.

## Implementation strategy

One pull request. US1 and US2 together are the smallest useful step: the name
edits, and the row still opens. US3 to US5 follow on the same branch.
