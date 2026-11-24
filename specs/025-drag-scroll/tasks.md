---
description: "Tasks for scrolling the page while a dragged block is held near its edge, in one pull request"
---

# Tasks: The page scrolls while a dragged block is held near its edge

**Input**: `specs/025-drag-scroll/` (spec.md, plan.md)

**Tests**: required.
- `check-dragscroll.mjs` (new): the zone, the ramp, the narrow scroller; SC-002.
- Playwright `block-drop-scroll.mjs` (new): SC-001, SC-003, SC-004, and no scrolling in the middle.
- Both mutation-checked (they fail with their fix taken out).

**Issues**: parent #810; tasks T001–T007 are #985–#991

**Delivery**: one pull request from `claude/drag-autoscroll-810`.

## Format: `[ID] [P?] [Story] [surface] Description`

## Phase 1: The speed (US1)

- [x] T001 [US1] [ui] `web/src/dragScroll.ts` (new): `SCROLL_EDGE`, `SCROLL_MAX`, `scrollSpeed(y, top, bottom)`, and `scrollParent` moved here from `web/src/rowDrag.ts` (its one caller, `startDrag`, imports it)
- [x] T002 [P] [US1] [test] `web/scripts/check-dragscroll.mjs` (new), in `npm run check` in `web/package.json`

## Phase 2: The loop (US1, US2)

- [x] T003 [US1] [ui] `web/src/blockDrop.ts`: a document `dragover` listener (trusted events, a block drag from this editor only) notes the pointer and starts one frame loop; each frame scrolls `scrollParent` of the editor (else the document's scroller) by `scrollSpeed` and decides the line again with `overAt` when the pointer is over this editor
- [x] T004 [US2] [ui] `web/src/blockDrop.ts`: the loop stops at speed 0, at the end of the scroller, on `drop`, `dragend` and teardown

## Phase 3: Tests, wiki, reviews

- [x] T005 [test] `web/tests/block-drop-scroll.mjs` (new), in `web/tests/package.json`; mutation-checked
- [x] T006 [wiki] `wiki/editor-blocks.md` (dragging): holding a block at the top or bottom edge scrolls the page; `docs/decisions.md` (the speed ramp and the frame loop, with the options turned down)
- [x] T007 [test] Reviews: `/code-review`; `ux-ui-audit` does not apply (nothing drawn changes, said in the PR); the drag specs listed in plan.md pass; `scripts/agent-gate.sh`

## Dependencies

T001 → T002, T003 → T004 → T005. T006 any time after T004.

## Implementation strategy

One pull request. US1 and US2 are one loop: shipping the scrolling without its stop conditions would scroll after a drop.
