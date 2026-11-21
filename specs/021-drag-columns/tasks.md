---

description: "Tasks for one landing decision and sideways columns, in two pull requests"
---

# Tasks: Dragging a block makes columns, and shows where it lands

**Input**: `specs/021-drag-columns/` (spec.md Q1–Q3, plan.md, research.md R1–R5)

**Tests**: required.
- `check-droptarget.mjs` and `check-columnwidths.mjs` (pure decisions).
- Go tests for four columns in every reader.
- The browser spec `block-drop.mjs`, in Chromium and WebKit (the owner drags in Safari).
- The #810 probe before and after (SC-003).

**Issues**: none yet

**Delivery**: two pull requests, each from its own branch off `main`.
- PR 1: the landing spot (US1).
- PR 2: sideways columns, the opening and four columns (US2, US3). Start after PR 1 merges, since both change the drop module.

**CodeGraph** (before writing these tasks; `codegraph status`: up to date):
- **`ColumnsBlock`**: one caller (`columnsSpec`). Changes to it reach no other component.
- **`columnsStyle`**: three callers (public, print, Markdown export), all covered by `columns_test.go`.
- **`columnsFromSections`**: one caller (Markdown import), reached by `write_content`.
- **`holdSideMenuWhileHovered`**: one caller (`Editor.tsx`). The drop module installs beside it.

## Format: `[ID] [P?] [Story] [surface] Description`

---

## PR 1 — The line and the drop agree (US1)

- [ ] T001 [US1] [ui] `web/src/dropTarget.ts`: `dropTarget(pointer, boxes)` returns a *between* target (the block it goes before, or after the last) for any spot (R1, R2). Each gap gets one target. A column's first line counts as being inside its column. Pure, no imports from the editor.
- [ ] T002 [P] [US1] [test] `web/scripts/check-droptarget.mjs`, added to `npm run check`:
  - every spot of the spec's test page, as boxes: plain blocks, each line of a 3-column layout, a column's first and last line, after the columns block;
  - the measured twitch pairs map to one target;
  - mutation-checked.
- [ ] T003 [US1] [ui] `web/src/blockDrop.ts`, installed in `Editor.tsx` next to the side-menu hold:
  - feeds `dropTarget` to BlockNote's `computeDropPosition`, so the line is drawn at the target;
  - adds a ProseMirror `handleDrop` that moves the dragged block to the same target, so ProseMirror's own `dropPoint` never decides;
  - external file drops are left as today.
- [ ] T004 [US1] [ui] A columns block left with an empty column after a drag drops that column and its share of the widths. A layout left with one column becomes plain blocks (FR-008, R4).
- [ ] T005 [US1] [test] `web/tests/block-drop.mjs` (in the test script): SC-001 and SC-002 on the spec's test page with small pointer steps. Includes the #824 case (a drop on a column's first line stays in the column) and the emptied column. Runs in Chromium; the WebKit run is noted in the pull request.
- [ ] T006 [US1] [perf] SC-003: the #810 probe on a 300-block page, per drag step before and after, in Chromium and WebKit. Figures go in the pull request.
- [ ] T007 [US1] [wiki] `editor-blocks.md`: the "Not right yet" note from PR #827 goes, along with the claim about #824's half. Screenshots the PR makes stale are retaken.
- [ ] T008 [US1] [test] Reviews: `/code-review`; UX check light/dark, desktop and phone width.

---

## PR 2 — Sideways columns, the opening, four columns (US2, US3)

- [ ] T009 [US2] [ui] `columnWidths.ts`:
  - `insertColumnWidths(widths, at)`: the Q3 rule (R4);
  - `removeColumnWidths`;
  - count 2–4;
  - a "4 equal" preset (R5).
- [ ] T010 [P] [US2] [test] `check-columnwidths.mjs`:
  - the owner's example (40/30/30 → 40/20/20/20);
  - 50/50 → 33/33/34;
  - no two alike, in proportion;
  - the 15% floor;
  - sums of 100;
  - mutation-checked.
- [ ] T011 [US2] [ui] `dropTarget.ts`: a *new column* target at a column's left or right edge.
  - In a row of 3, only the right edge of the last column (Q1).
  - A row of 4 offers none.
  - None where the columns stack (FR-010).
  - Cases added to `check-droptarget.mjs`.
- [ ] T012 [US2] [ui] `ColumnsBlock` (`blocks.tsx`):
  - takes 2–4 columns;
  - while a new-column target is active, renders the opening as an empty track through its own `<style>` (R3);
  - the track animates with `--motion-duration-base` / `--motion-easing-out`, with no transition under reduced motion (FR-007).
- [ ] T013 [US2] [ui] `blockDrop.ts`: draws the vertical line at the edge (BlockNote's `block-vertical-*`, focus colour). A drop on a new-column target inserts the block as a column, with the widths from T009, in one change.
- [ ] T014 [US3] [ui] `dropTarget.ts` + `blockDrop.ts`: the left and right edges of an ordinary top-level block give a new two-column layout (Q2). Nothing is offered inside lists or nested blocks.
- [ ] T015 [US2] [ui] Editor CSS for `data-count='4'`; the vertical line's look from tokens. Light and dark.
- [ ] T016 [US2] [i18n] The screen-reader announcement when a new column will be made, and the "4 columns" preset label: de, es, nl.
- [ ] T017 [P] [US2] [backend] Readers take four columns:
  - `renderPublicBlock` (`public_blocks.go`);
  - the print view in `renderBlockHTML` (`export_html.go`) and its CSS.
  - Go tests in `columns_test.go`.
- [ ] T018 [P] [US2] [mcp] `columnsFromSections` (`mdimport.go`) keeps four sections and folds from the fifth. The `write_content` spelling text says up to four. Go tests: a 4-column round trip through `get_page` / `write_content`.
- [ ] T019 [US2] [test] `block-drop.mjs`:
  - the opening and its reverse (US2);
  - the drop into a new column with the Q3 widths;
  - Q1 in a row of 3;
  - Q2 beside a paragraph;
  - reduced motion;
  - run in WebKit too.
- [ ] T020 [US2] [perf] SC-003 again with the opening, both engines.
- [ ] T021 [US2] [wiki]
  - `editor-blocks.md`: sideways columns, up to four, widths.
  - `mcp-tools.md`: up to four columns.
  - The release-notes line about older versions showing four as two.
  - Stale screenshots retaken.
- [ ] T022 [US2] [test] Reviews: `/code-review`; UX check light/dark, desktop and phone width, with a before/after picture of the opening for the owner.

---

## Dependencies

- T001 → T002, T003. T003 → T004, T005. PR 1 merges before PR 2 starts.
- In PR 2: T009 → T012, T013; T011 → T013, T014. T017 and T018 are independent of the editor work.

## Implementation strategy

PR 1 alone fixes every wrong drop (#809, #824) and is worth shipping on its own. PR 2 adds the new gesture on top of the same decision.
