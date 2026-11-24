# Implementation Plan: The page scrolls while a dragged block is held near its edge

**Branch**: `claude/drag-autoscroll-810` | **Date**: 2026-11-24 | **Spec**: [spec.md](spec.md) | **Issue**: #810

## Summary

A pure module (`dragScroll.ts`) decides how fast to scroll for a pointer
position; `blockDrop` runs a frame loop while a block drag that started in its
editor is held in an edge zone, scrolls the nearest scroller, and decides the
line again after each step. One pull request, frontend only. No server, MCP or
stored change.

- **Speed** (FR-002, FR-003): `scrollSpeed(y, top, bottom)`, a 72 px zone
  (narrower on a short scroller, at most a quarter of it), speed growing with
  the square of the depth, 1 to 24 px a frame, full speed past the edge.
- **Loop** (FR-001, FR-006): a `dragover` listener on the whole document
  notes the pointer and starts one `requestAnimationFrame` loop; the loop
  stops when the speed is 0, at the end of the scroller, and on `drop`,
  `dragend` and teardown.
- **Line** (FR-004): after each step, if the pointer is over this editor,
  `overAt` decides the line again for the same point. The existing scroll
  listener has already dropped the cached boxes.
- **Whose drag** (FR-007): only while `origin` is set (the drag started in
  this editor's container) and `isBlockDrag` holds; `isTrusted` events only.
- **Scroller**: the nearest ancestor that scrolls vertically, shared with the
  row drag: `scrollParent` moves from `rowDrag.ts` to `dragScroll.ts`, and
  `blockDrop` falls back to the document's scroller when there is none.

## Technical Context

**Language/Version**: TypeScript 5.6 (`web/src/`)

**Primary Dependencies**: none new.

**Storage**: none.

**Testing**:
- Check `check-dragscroll.mjs` (exists on the branch, 16 cases): the zone,
  the ramp, the narrow scroller, the middle at rest; SC-002.
- Playwright `block-drop-scroll.mjs` (new): a page scrolled 1,185 px with a
  two-column layout at the top and a database view near the bottom; the
  database dragged up and held over the header reaches the top in under 2 s
  (SC-001), then dropped into the right column lands there with every other
  block in order (SC-003, 3 runs per test run); after the drop, the scroll
  position stays put for 500 ms (SC-004); a drag held in the page's middle
  does not scroll. Mutation-checked: without the loop, SC-001 fails.
- Kept passing: `block-drop.mjs`, `block-drop-ids.mjs`, `block-guards.mjs`,
  `block-handle.mjs`, `row-handle.mjs` (the row drag shares `scrollParent`),
  `scroll-memory.mjs` (FR-008).

**Target Platform**: desktop browsers, mouse and trackpad.

**Performance Goals**: one frame callback while scrolling; nothing per frame
when the pointer is away from the edges. The boxes are read again once per
scroll step, as they already are for a scroll by hand.

**Constraints**: `Editor.tsx` is over 1,400 lines: nothing is added there.

**Scale/Scope**: 1 issue, 1 PR, 0 routes, 0 tools, 0 strings.

## CodeGraph

Index checked with `codegraph status` and synced (2026-11-24).

- `codegraph_explore "blockDrop overAt onScroll isBlockDrag rowDrag
  autoscroll edge scroll boardDrag page-body scroller"`: `blockDrop` has one
  caller, `BlockContent` in `Editor.tsx`, with no test within 3 hops (the
  browser specs drive it over HTTP and are not linked). It already listens for
  `scroll` (capture) and `resize` and drops its boxes on either, so a scroll
  made by the loop is picked up without new code.
- The same query found the other three drags' own edge scrolling: `rowDrag.ts`
  (`EDGE` 48, `EDGE_STEP` 14, `scrollParent`), `boardDrag.ts` (40 / 12) and
  `columnDrag.ts` (sideways, 40 / 12). Each scrolls on its own pointer events.
  So the block is the only draggable thing without it.
- `codegraph callers scrollParent`: one, `startDrag` in `rowDrag.ts`. Moving
  it into `dragScroll.ts` changes that one import; the WIP branch's
  `scrollerOf` in `blockDrop.ts` was a copy of it and goes.
- `onScroll` in `Editor.tsx` (from the same query) saves the page's place
  through `writePageScroll` only within 2 s of a wheel or touch gesture, so
  FR-008 holds without a change.
- `draggedIds` (read from the source after the graph pointed at
  `blockDrop.ts`): the blocks that move come from the selection BlockNote set
  at drag start. A probe showed the "wrong block" seen on this branch comes
  from BlockNote's side menu switching blocks before the drag starts, also
  without any scrolling. That is #984, not this plan.
- Not from the graph: the Playwright specs that drag blocks were found by text
  search on `bn-side-menu`.

## Constitution Check

- I. One binary, no external services: ✅ nothing new.
- II. Agent parity: ✅ an agent moves blocks by writing content
  (`write_content`, `update_page`); scrolling a screen during a drag has no
  agent counterpart. `gapBudget` unchanged.
- III. Gates are one function: ✅ no gate.
- IV. Derive from code: ✅ `check-dragscroll.mjs`; no research, data model,
  contracts or quickstart (nothing of their own).
- V. English source: ✅ no new string.
- VI. Every surface: ✅ table below. New concept: none.
- VII. Measured: ✅ the spec's figures come from the probe on this branch.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | No change: nothing is written but the move that already exists | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | No change: no query | backend |
| REST routes (`server/server.go`, middleware) | No change: no route | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | No change: an agent moves a block by writing content; there is no screen to scroll | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: nothing closed | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | `dragScroll.ts` (new: `scrollSpeed`, `scrollParent`), `blockDrop.ts` (the loop), `rowDrag.ts` (imports `scrollParent`). Nothing drawn changes, so light and dark are the same. Keyboard: a block moved with the keyboard (block menu, Move up/down) keeps the cursor in view already; no drag there | ui |
| Translations (`t()`, `de.json`/`es.json`/`nl.json`) | No change: no string | i18n |
| Server error codes (`web/src/serverErrors.ts`) | No change: no error | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots, `docs/what-it-does.md`) | `wiki/editor-blocks.md` (dragging): one sentence on holding a block at the top or bottom edge. No screenshot lists `blockDrop.ts` or `rowDrag.ts` among its sources (`wiki/screenshots.json`), so none goes stale. `mcp-tools.md`, `what-it-does.md`: no change | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | See Technical Context; the new spec is mutation-checked | test |
| Performance (query plans, payload size, per-request work) | One frame callback while scrolling, none at rest; no request | perf |
| Manifest (`capabilities.json`, `gapBudget`, parity acts) | No change: no route or tool | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets, catalogue) | No change: nothing drawn | ui |
| Storage budgets (benchmarks on the seeded workspace, p95 budgets, read time limit) | No change: no query | perf |
| Page containers (full page, side peek, centre peek) | The loop scrolls the nearest scroller of the editor the drag started in: the page body on a full page, the peek's body in a peek | ui |
| Aggregation (`server/aggregate.go`) | No change | backend |
| Stored data (`server/upgrade_steps.go`) | No change: nothing stored | backend |
| Outside names (env vars, cookies, storage keys, …) | No change | backend |
| Menu icons (`ui/Menu`, `menuIcons.ts`, `check-menu-icons.mjs`) | No change: no menu | ui |
| View lock (`checkViewsUnlocked`, `auditViewChanges`) | No change: no view written | backend |
| Cross-origin requests (`server/crossorigin.go`) | No change: no route | backend |
| Embedded views (`web/src/embedViews.ts`, `server/embedviews.go`) | No change: an embed is moved as one block, its views go with it as before | ui |
| Content actions (`web/src/actions/`) | No change: a drag is not an action in a menu | ui |

**New concepts**: None.

**Parity statement**: Agents move blocks by writing the page's content; the
scrolling only helps a hand reach a place that is off screen.

## Project Structure

**Files touched**: `web/src/dragScroll.ts` (new), `web/src/blockDrop.ts`,
`web/src/rowDrag.ts`, `web/scripts/check-dragscroll.mjs` (new),
`web/package.json`, `web/tests/block-drop-scroll.mjs` (new),
`web/tests/package.json`, `wiki/editor-blocks.md`, `docs/decisions.md`,
`specs/025-drag-scroll/`.

Shared with the open pull request #983 (spec 024): only
`web/package.json`, where both add a check to the same `check` line (its
other web files are `rowGroups.ts`, `viewLayout.ts`, `viewState.ts`, `api.ts`,
`types.ts`, the locales and the wiki's `mcp-tools.md`). The second of the two
to merge takes `main` first.

## Complexity Tracking

No violations.
