---
description: "Tasks for a database in a document that fits its content, in one pull request"
---

# Tasks: An embedded database fits its content and sits on the page without its own card

**Input**: `specs/023-embed-fit-content/` (spec.md, plan.md)

**Tests**: required.
- `check-embedrows.mjs` (new): the limit and the reveal.
- Playwright `embed-fit.mjs` (new): SC-001 to SC-004, light, dark, 1280px and 390px.
- Both mutation-checked (they fail with their fix taken out).

**Issues**: parent #910; tasks T001–T008 are #912–#919

**Delivery**: one pull request from `claude/spec-023-embed-fit`.

## Format: `[ID] [P?] [Story] [surface] Description`

## Phase 1: The rows (US2)

- [x] T001 [US2] [ui] `web/src/embedRows.ts` (new): `EMBED_ROW_STEP`, `limitRows` (the first rows plus a row to reveal), `nextLimit`
- [x] T002 [P] [US2] [test] `web/scripts/check-embedrows.mjs` (new), in `npm run check`
- [x] T003 [US2] [ui] `CollectionView.tsx`: the limit per view in state; list and gallery draw `limitRows`; TableView takes `rowLimit`, `revealId`, `onShowMore` and limits the rows as drawn; `ShowMoreRows`; a row from New is revealed
- [x] T004 [P] [US2] [i18n] "Show more" in de, es, nl

## Phase 2: No card (US1, US3)

- [x] T005 [US1] [ui] `styles.css`: `.bn-db-embed` without border, radius, background, clipping; the title a plain line; `.is-embed` toolbar, table, gallery, board and Show more without the page's sides and foot; the gutter in the margin (18px on a phone); budgets lowered

## Phase 3: Tests, wiki, reviews

- [x] T006 [test] `web/tests/embed-fit.mjs` (new), in `web/tests/package.json`
- [x] T007 [wiki] `wiki/collections.md`; retake the screenshots `check-wiki.mjs` lists; `docs/decisions.md`
- [x] T008 [test] Reviews: `/code-review`, `ux-ui-audit` (light, dark, desktop, phone); the embed specs listed in plan.md pass
