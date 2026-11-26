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

## Phase 2: Edit the name in the cell (US1, P1)

- [ ] T004 [US1] [ui] `web/src/components/useTableRowActions.ts`: the edit state carries which copy is edited (`{ id, group }`) so that in a grouped table only the clicked copy turns into a field. The + path keeps the row's first copy (D3)
- [ ] T005 [US1] [ui] `web/src/components/TitleCell.tsx` (new), drawn by `TableView` in `web/src/components/CollectionView.tsx` in place of today's title `<span>`/`.db-title-link`:
  - The name keeps the class `.db-title-link` and the whole cell is its target (FR-001).
  - A click or Enter goes through `titleClick`. `'edit'` opens `RowTitleInput`, `'open'` and `'new_tab'` go through `useOpenRow`.
  - A double click does what a single click does (FR-003).
  - The sub-item toggle, `AgentDot` and tags stay where they are.
- [ ] T006 [US1] [ui] `web/src/styles.css`, `web/src/components/RowTitleInput.tsx`: while editing, the field fills the cell flat (lighter fill, thin rounded outline, no shadow, tokens only). The icon is hidden and the whole name scrolls in the field (FR-007). The cursor over an editor's name cell is a text cursor, with no other hint (FR-016)

## Phase 3: The Open button (US2, P1)

- [ ] T007 [US2] [ui] `web/src/components/TitleCell.tsx`: the Open button is `ui/Button` (`size="sm"`, outlined, the word "Open", accessible name "Open {name}"). It sits at the cell's right edge over a long name, the row height stays the same, and it runs `useOpenRow` with the click's modifiers (FR-004 to FR-006, FR-014)
- [ ] T008 [US2] [ui] `web/src/styles.css`: under `(hover: hover)` the button shows on row hover and `:focus-within`. Under `(hover: none)` it always shows, 30 px high with a 44 px tap area. It is hidden on the row being edited (D4, FR-004, FR-007)

## Phase 4: Close from the row (US3, P2)

- [ ] T009 [US3] [ui] `web/src/components/TitleCell.tsx`, `web/src/styles.css`: the row whose id is in `PeekedRowContext` reads "Close" (accessible name "Close {name}"), always shown, and pressing it closes the peek. Its `tr` gets `.is-peeked` with a soft tint of the accent colour over the whole row, on every copy (FR-008, FR-015)

## Phase 5: Keyboard (US4, P2) and readers (US5, P2)

- [ ] T010 [US4] [ui] `web/src/components/TitleCell.tsx`: Enter on the focused name edits. Tab reaches Open/Close next. The focus ring goes round the cell. ⌘/ and ⌘⇧↑/↓ (`useRowKeys`) keep working from both (FR-009)
- [ ] T011 [US5] [ui] `web/src/components/TitleCell.tsx`: a reader (`canEdit` false, or an embed with `canEditDatabase` false) opens on click and sees the same button (FR-010)

## Phase 6: Translations, tests, wiki, reviews

- [ ] T012 [P] [i18n] `web/src/locales/de.json`, `es.json`, `nl.json`: "Open", "Close", "Open {name}", "Close {name}" (FR-012)
- [ ] T013 [test] `web/tests/title-cell.mjs` (new), in `web/tests/package.json`. Covers:
  - a click on the cell (also beside a short name) edits; Enter saves; Escape cancels; double click;
  - Open per view setting (full page, side peek); ⌘-click new tab;
  - a reader's click opens;
  - Close and the tint in a side peek, also on a grouped copy;
  - keyboard Enter and Tab;
  - a 390 px touch viewport with the button always shown.
- [ ] T014 [test] Update the specs that open a row by clicking its name to press its Open button instead. Find them by text search for `.db-title-link` clicks and `getByText(<row title>).click()` before a peek or page check (today `row-properties.mjs`, `view-settings.mjs`, and the peek and embed specs). Run `row-handle.mjs`, `table-cells.mjs` and `table-groups.mjs` unchanged
- [ ] T015 [perf] Measure drawing a 5,000-row table on `main` and on this branch, both in the same container. Write the numbers in the pull request (SC-005)
- [ ] T016 [wiki] `wiki/views.md`: the table section says a click on the name renames it and the Open button opens the row, with Close beside a peek (line 147 today). Retake the screenshots `check-wiki` names as stale, and no others
- [ ] T017 [ui] Look checklist (`.claude/rules/frontend.md`) on screenshots in light and dark at 1280 and 390 px, with left edges measured, and `ux-ui-audit`. Then `/code-review`. The screenshots and findings go into the pull request

## Dependencies

T001 → T005, T011. T003 → T009. T004 → T005. T005 → T006 to T011. T012 can run
alongside anything. T013 and T014 come after T011. T016 and T017 come last.

## Implementation strategy

One pull request. US1 and US2 together are the smallest useful step: the name
edits, and the row still opens. US3 to US5 follow on the same branch.
