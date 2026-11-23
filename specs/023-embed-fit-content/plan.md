# Implementation Plan: An embedded database fits its content and sits on the page without its own card

**Branch**: `claude/spec-023-embed-fit` | **Date**: 2026-11-23 | **Spec**: [spec.md](spec.md) | **Issue**: #910

## Summary

CSS takes the card off the database block and the full page's padding off the
views inside a document; a pure module (`embedRows.ts`) decides which rows a
document's table, list or gallery draws; `CollectionView` keeps the limit per
view and draws Show more. One pull request. No server, MCP or stored change.

- **Card**: `.bn-db-embed` keeps only its block spacing; the title is a plain
  line (FR-001, FR-004).
- **Padding**: `.collection-scroll.is-embed` zeroes the sides of the toolbar,
  `.table-wrap`, `.gallery`, `.board`, and the foot of the table and gallery
  (FR-002).
- **Gutter**: `.table-wrap` hangs 52px left in a document, so spec 022's row
  gutter sits in the page margin; on a phone (≤768px) only the page's 18px,
  so the handle stays on the screen (FR-003; decision in `docs/decisions.md`).
- **Rows**: `limitRows` draws the first 25 plus a row just added; `nextLimit`
  adds 25. The limit is React state keyed by view id; nothing stored
  (FR-005, FR-006). The table's summary reads every row.

## Technical Context

**Language/Version**: TypeScript 5.6 + React 18 (`web/src/`), CSS

**Primary Dependencies**: none new; `ui/Button`.

**Storage**: none.

**Testing**:
- Check `check-embedrows.mjs` (new): the limit, the reveal, SC-003.
- Playwright `embed-fit.mjs` (new): no card, alignment and the block's foot at
  1280px and 390px (SC-001, SC-002), the gutter on the screen and beside the
  grid, Open as page on hover, 25 → 120 by Show more with the summary counting
  every row (SC-003), list and gallery, another view back at 25, a new row
  drawn past the limit, the board's cap, the database page drawing all 121
  (SC-004). `SHOTS=<dir>` writes light, dark and phone screenshots.
- Kept passing: `embeds.mjs`, `embed-views.mjs`, `embed-toolbar-fold.mjs`,
  `row-handle.mjs`, `view-layout.mjs`, `chart-view.mjs`,
  `property-confirm.mjs`, `personal-view.mjs` (the specs that open an embed).

**Target Platform**: browser at desktop and phone widths; the desktop shell.

**Performance Goals**: a long database in a document draws 25 rows instead of
all of them; nothing new is loaded (the rows were already loaded in full).

**Constraints**: design system (tokens; two literals marked `token-ok` with
the width they mirror); `CollectionView.tsx` is over 1,400 lines, so the
decision is in `embedRows.ts`; bundle cap (~1.8 KB left before this).

**Scale/Scope**: 1 issue, 1 PR, 0 routes, 0 tools, 1 string.

## CodeGraph

Index checked with `codegraph status`: up to date (2026-11-23).

- `codegraph explore "bn-db-embed databaseSpec CollectionView embed TableView
  ListView GalleryView table-wrap"`: `databaseSpec` renders `CollectionView`
  with `embed`; `TableView` is a function inside `CollectionView.tsx` with one
  caller; `GalleryView` one caller (`CollectionView`).
- `codegraph callers ListView`: two, `CollectionView` and `ChartView`. The
  limit is applied in `CollectionView` before the rows reach `ListView`, so a
  chart's list is untouched.
- Not from the graph (CSS is not indexed): the padding comes from
  `.table-wrap`, `.gallery`, `.collection-toolbar` and `.board`, shared with
  the database page; `.bn-db-embed:hover`/`:focus-within` drive the folding
  toolbar (#280), so the block keeps its class. The Playwright specs that open
  an embed came from text search on `bn-db-embed`.

## Constitution Check

- I. One binary, no external services: ✅ nothing new.
- II. Agent parity: ✅ how many rows a document draws is presentation; an agent
  reads rows with `query_rows` as before. `gapBudget` unchanged.
- III. Gates are one function: ✅ no gate.
- IV. Derive from code: ✅ `check-embedrows.mjs`; no research, data model,
  contracts or quickstart.
- V. English source: ✅ "Show more" through `t()`, de/es/nl.
- VI. Every surface: ✅ table below. New concept: none.
- VII. Measured: ✅ the numbers in the spec and here are from `embed-fit.mjs`.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | No change: presentation only, no gate or write | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | No change: no query | backend |
| REST routes (`server/server.go`, middleware) | No change: no route | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | No change: an agent reads every row with `query_rows`; how many a document draws is the screen's | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: nothing closed | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | `blocks.tsx` unchanged in markup; `styles.css` (Embedded database section, `.is-embed` rules); `CollectionView.tsx` (the limit, `ShowMoreRows`, TableView's `rowLimit`/`revealId`/`onShowMore`); `embedRows.ts` (new). Light and dark checked; Show more is a `ui/Button` in the tab order after the rows | ui |
| Translations (`t()`, `de.json`/`es.json`/`nl.json`) | "Show more": Mehr anzeigen, Mostrar más, Meer tonen | i18n |
| Server error codes (`web/src/serverErrors.ts`) | No change: no error | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots, `docs/what-it-does.md`) | `wiki/collections.md` (Collections inside documents): no box, 25 and Show more, the board. Screenshots `check-wiki.mjs` lists as stale (their sources include `CollectionView.tsx`) retaken. `mcp-tools.md` and `what-it-does.md`: no change, no tool or capability | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | See Technical Context; both new tests mutation-checked | test |
| Performance (query plans, payload size, per-request work) | Fewer rows drawn in a document; no new request | perf |
| Manifest (`capabilities.json`, `gapBudget`, parity acts) | No change: no route or tool | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets, catalogue) | `ui/Button`; spacing from tokens; the card's literals went, so the fontSize and radius budgets go down by one each | ui |
| Storage budgets (benchmarks on the seeded workspace, p95 budgets, read time limit) | No change: no query | perf |
| Page containers (full page, side peek, centre peek) | A document in a peek draws the same block, so the same CSS and limit; a database page or a database in a peek has no `embed` and draws every row (FR-008) | ui |
| Aggregation (`server/aggregate.go`) | No change; the table's summary still reads every loaded row | backend |
| Stored data (`server/upgrade_steps.go`) | No change: nothing stored; the limit is state for the visit | backend |
| Outside names (env vars, cookies, storage keys, …) | No change | backend |
| Menu icons (`ui/Menu`, `menuIcons.ts`, `check-menu-icons.mjs`) | No change: Show more is a button, not a menu item | ui |
| View lock (`checkViewsUnlocked`, `auditViewChanges`) | No change: nothing writes a view | backend |
| Cross-origin requests (`server/crossorigin.go`) | No change: no route | backend |
| Embedded views (`web/src/embedViews.ts`, `server/embedviews.go`) | The limit is per embed view, by id, in the block's React state; nothing is added to the embed's stored views | ui |
| Content actions (`web/src/actions/`) | No change: Show more is not an action on content | ui |

**New concepts**: None.

**Parity statement**: Agents read and change the same rows with `query_rows`
and `set_properties`; the 25-row limit is how a document draws them, not
something to do.

## Project Structure

**Files touched**: `web/src/embedRows.ts` (new),
`web/scripts/check-embedrows.mjs` (new), `web/package.json`,
`web/src/components/CollectionView.tsx`, `web/src/styles.css`,
`web/tokens/budgets.json`, `web/src/locales/{de,es,nl}.json`,
`web/tests/embed-fit.mjs` (new), `web/tests/package.json`,
`wiki/collections.md`, `wiki/img/*` (retaken), `docs/decisions.md`.

Shared with the issue 906 thread (`claude/fix-906-list-scroll`): `styles.css`
only, in different sections; agreed 2026-11-23.

## Complexity Tracking

No violations.
