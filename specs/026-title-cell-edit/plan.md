# Implementation Plan: A click on a table row's name edits it; an Open button opens the row

**Branch**: `claude/spec-026-title-cell-edit` | **Date**: 2026-11-26 | **Spec**: [spec.md](spec.md) | **Issue**: #981

**Input**: Feature specification from `/specs/026-title-cell-edit/spec.md`

## Summary

In a table, the name cell stops being one button that opens the row. For
someone who may edit the database, a click, tap or Enter on the name opens the
in-place name field that a row added with + already gets (`RowTitleInput`). An
Open button at the cell's right edge opens the row as the view says. It shows on
hover or focus, and always on touch screens. It reads Close, always shown, while
that row is open in a peek. A reader's click on a name still opens the row, and
⌘/Ctrl or the middle button opens a new tab for everyone. This is a frontend
change only: no route, tool or stored data changes.

## Technical Context

**Language/Version**: TypeScript 5.6 + React 18 (`web/src/`). No Go change.

**Primary Dependencies**: none new.

**Storage**: no change. A rename is today's `api.updatePage(id, { title })`
(`finishTitle` in `useTableRowActions`).

**Testing**: `npm run check` (a new `check-titlecell.mjs`), a Playwright
spec `web/tests/title-cell.mjs`, and `row-handle.mjs` /
`table-groups.mjs` re-run.

**Target Platform**: browser, desktop shell. Touch screens are told apart by
`(hover: none)`, as the spec's clarification asks.

**Performance Goals**: a 5,000-row table draws no slower than on `main`
(SC-005). One extra button per drawn row is the only new per-row work.

**Constraints**: English source strings; de/es/nl; design-system components and
tokens only; `CollectionView.tsx` is over 1,400 lines, so the new title cell
goes in a module of its own (`.claude/rules/frontend.md`).

**Scale/Scope**: table views only (clarification), in a database page and in
a document.

## CodeGraph

- `codegraph_explore "TableView title cell db-title-link openRow useOpenRow openCollectionRow RowTitleInput"`:
  the name is one `.db-title-link` button in `TableView`. Its click goes through
  `useOpenRow` → `openCollectionRow` → `rowOpenAction`. `RowTitleInput` has 3
  callers, all in `CollectionView.tsx`, and none is a test. `useOpenRow` has 10
  callers across table, list, board and gallery. This plan leaves
  `useOpenRow` as it is and only changes which control in the table calls it,
  so the other views are untouched (scope = tables).
- `codegraph_explore "useRowKeys editCell tapReachesButtons rowOpenAction PeekPanel onPeek"`:
  - `useRowKeys` works for any focused element in the row, so a new button in
    the cell keeps ⌘/ and ⌘⇧↑/↓ without change.
  - `tapReachesButtons` already keeps the tap that shows a row's buttons from
    also pressing one. The Open button on a touch screen is always shown, so
    it does not need that guard.
  - `PeekPanel` has 1 caller (`App`). App owns `peekId`.
- `codegraph_explore "finishTitle useTableRowActions CollectionView onPeek peekId databaseSpec"`:
  - `CollectionView` has 1 caller (`Editor`, through the database block in
    `blocks.tsx`). `onPeek` reaches it through the block context (`useBlockCtx`).
  - Nothing passes the peeked row's id down: this is the one new piece of data
    the table needs (decision D2).
  - `finishTitle` already saves, redraws and reloads on failure, so it does
    all the saving here.
- Source read after the graph (`CollectionView.tsx`, where `TableView` is drawn): `onTitleDone` is passed
  for readers too. Only the + path, which readers do not have, ever sets
  `editTitleId`. From now on the click sets it too, so the reader check
  moves into the click decision (D1).
- Text search (strings the graph does not index): `.db-title-link` is in
  `styles.css`, `theme.css`, `web/tests/*.mjs` (selectors) and
  `shoot-wiki.mjs`. `wiki/views.md` line 147 says "the name opens the row". The
  `open` row action (`actions/rowActions.ts`) already exists for the row menu.

## Design decisions

- **D1. What a click on the name does is one pure function**, in a new
  `web/src/titleCell.ts` checked by `check-titlecell.mjs` (the rule in
  `.claude/rules/frontend.md` for decision logic). `titleClick({ canEdit,
  metaKey, ctrlKey, button })` returns `'edit'`, `'open'` or `'new_tab'`:
  ⌘/Ctrl or the middle button means a new tab, then a reader opens, then an
  editor edits. Enter on the focused name is a click, so Q1 comes out of the
  same answer. *Turned down*: deciding inside `TableView` (untested branch
  logic in a 3,000-line file).
- **D2. The peeked row reaches the table through a context, not props.**
  `App` provides `PeekedRowContext` (the open peek's row id, or null) around
  the page and the peek, and the new title cell reads it. *Turned down*:
  threading a prop through `Editor` → block context → `blocks.tsx` →
  `CollectionView` → `TableView` (four files for one id); putting it on
  `RowOpenCtx` (built per view inside `CollectionView`, which does not have the
  id either).
- **D3. One copy of a row edits at a time.** In a grouped table a row in two
  groups is drawn twice. `editTitleId` becomes `{ id, group }` for a click, so
  only the copy clicked turns into a field, and two autofocused inputs never
  fight. The + path keeps editing the row's first copy. Close and the open-row
  mark show on every copy (FR-008).
- **D4. Shown or hidden is CSS, not state.** The Open button is always in the
  DOM. Under `(hover: hover)` it is hidden until the row is hovered or the cell
  holds the focus (`:focus-within`), and on `.is-peeked` it shows. Under
  `(hover: none)` it always shows. No pointer listeners per row are added (SC-005).
- **D5. Two new design-system pieces, built in `web/src/ui/` first** (owner,
  2026-11-26: "when relevant build out the component in the DS and implement
  that"). Each gets an entry in `web/src/ui/README.md` and a section in the
  catalogue (`web/tests/catalog.mjs` checks both), light and dark, and is only
  then used by the title cell:
  - **`Input` `variant="cell"`** (`ui/Field.tsx`, `Field.css`): the flat field
    that fills a table cell. Lighter fill, thin rounded outline, no lift or
    shadow, tokens only (FR-007). `RowTitleInput` uses it, so the + path and the
    click path look the same. The column heading's rename (`th-rename`) can
    move onto it later; that is not part of this spec.
  - **`CellAction`** (`ui/CellAction.tsx`, `CellAction.css`): a small outlined
    `Button` placed at a cell's end, over the cell's text. It shows on hover or
    focus inside its host (the row), always under `(hover: none)` with a 44 px
    tap area, and always when `pinned`. It hides while the host is editing.
    The Open/Close button is a `CellAction` reading "Open" or, `pinned`,
    "Close" (FR-004 to FR-006, FR-008, FR-014). Why a component and not CSS in
    the table: the reveal, the touch rule and the tap area are a pattern that
    every "act on this item" button in a cell or card will need. The list and
    the board already showed the request may come for them.
  - *Turned down*: plain `ui/Button` with table-only CSS (the reveal and touch
    rules would live in `styles.css`, out of the catalogue's sight, and be
    copied by the next view); a single `TitleCell` primitive in `ui/` (it
    knows about rows, peeks and permissions, which `ui/` components do not).
- **D6. The cell's long-name cut-off stays as today's** (ellipsis). The
  button sits on top at the right edge with the cell's background behind it,
  so the row height never changes (FR-006).

## Constitution Check

- I. One binary, no external services ✅: frontend only.
- II. Agent parity ✅: renaming is `update_page` (unchanged). Opening a row
  is interface only.
- III. Gates are one function ✅: no gate changes. The server still refuses
  a reader's rename.
- IV. Derive from code ✅: the click decision gets `check-titlecell.mjs`.
  The plan copies no inventories.
- V. English source ✅: "Open", "Close" and the accessible names go through
  `t()`, with de/es/nl.
- VI. Every surface, every time ✅: table below.
- VII. Measured, not assumed ✅: a 5,000-row draw is measured before and
  after (SC-005).

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | No change: a rename is the existing page update, behind its existing `canWrite`, audited as today. | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | No change: nothing new is stored or queried. | backend |
| REST routes (`server/server.go`, middleware) | No change: `PATCH /api/pages/{id}` is reused. | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | No change: agents already rename rows with `update_page`; opening a row is interface only. | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: no new capability. | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | New `web/src/components/TitleCell.tsx` (the name, the field, the Open/Close button), drawn by `TableView`. New `web/src/titleCell.ts` (D1). `useTableRowActions` edit state carries the group (D3). `App.tsx` provides `PeekedRowContext` (D2). `styles.css` for the button and the flat field (FR-007). Keyboard: Enter edits, Tab reaches the button (US4). Light and dark at 1280 and 390 px. | ui |
| Translations (`t()`, `de.json` and `nl.json` required, `es.json`) | "Open", "Close", "Open {name}", "Close {name}" in de/es/nl. | i18n |
| Server error codes (`web/src/serverErrors.ts`) | No change: a failed rename shows the existing message (`fail` in `useTableRowActions`). | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots) | `wiki/views.md`: the table section says a click on the name renames it and the Open button opens it (line 147 and the table's rows). Retake the table shots `check-wiki` names as stale. `mcp-tools.md`: no change. | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | `check-titlecell.mjs` for D1. New Playwright `web/tests/title-cell.mjs`: click edits and saves, Escape cancels, double click, the Open button per view setting, ⌘-click new tab, a reader's click opens, Close in a side peek, a grouped copy, a phone viewport with the button always shown. Existing specs whose selectors click `.db-title-link` to open a row are updated. Go: no change. | test |
| Performance (query plans, payload size, per-request work) | No query. Per row: one more button and no listeners beyond its click. 5,000-row draw measured before and after (SC-005). | perf |
| Manifest (`capabilities.json`, `gapBudget`, parity acts) | No change: no route or tool. | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets, catalogue) | New `ui/CellAction` and `Input` `variant="cell"` (D5), each with a `web/src/ui/README.md` entry and a catalogue section, light and dark, tokens only. The title cell is built from them and from `ui/Button` (inside `CellAction`). The raw-button count in `check-tokens.mjs` does not go up: the name's own button moves into `TitleCell.tsx` as the one already counted. |
| Storage budgets (benchmarks on the seeded workspace, p95 budgets, read time limit) | No change: no query. | perf |
| Page containers | The table in a full page and in a peek (a database inside a peeked row) draws the same cell. Close shows only for the row in the one peek (D2). | ui |
| Aggregation | No change: no property type. | backend |
| Stored data | No change: nothing stored changes shape. | backend |
| Outside names | No change: no environment variable, cookie, header, storage key or file name. | backend |
| Menu icons | No change: the Open button is not a menu item; the row menu's "Open" keeps its icon. | ui |
| View lock | No change: renaming a row is not a view change, and the lock is about views. | ui |
| Cross-origin requests | No change: no new write route. | backend |
| Embedded views | The same title cell in an embed (spec 014). Close shows for the row in the peek beside that document (D2). An embed's reader (`canEditDatabase` false) gets the reader's click. | ui |
| Content actions | No change to the list: the button runs the existing `open` row action's opener (`useOpenRow`). The in-place rename is the cell's own editing, as for other cells, not a menu action. | ui |

**New concepts**: None.

**Parity statement**: Agents can rename a row over MCP via `update_page`, with
the same checks as `PATCH /api/pages/{id}`. Opening a row in a peek is an
interface matter with no agent counterpart.

## Project Structure

### Documentation (this feature)

```text
specs/026-title-cell-edit/
├── spec.md
├── plan.md        # this file
├── checklists/requirements.md
└── tasks.md       # /speckit-tasks
```

No `research.md` (the decisions are D1–D6 above), `data-model.md` (no entity),
`contracts/` (no route or tool) or `quickstart.md` (it would repeat the tasks).

### Source Code

**Files touched**: `web/src/ui/CellAction.tsx` and `.css` (new), `web/src/ui/Field.tsx` and `Field.css` (`variant="cell"`), `web/src/ui/README.md`, the catalogue (`web/catalog/`), `web/src/titleCell.ts` (new), `web/scripts/check-titlecell.mjs`
(new), `web/src/components/TitleCell.tsx` (new), `web/src/components/CollectionView.tsx`
(`TableView` draws `TitleCell`), `web/src/components/useTableRowActions.ts` (D3),
`web/src/App.tsx` and a small `web/src/peekedRow.ts` for the context (D2),
`web/src/styles.css`, `web/src/locales/{de,es,nl}.json`, `web/package.json`
(check list), `web/tests/title-cell.mjs` (new) and the specs that click
`.db-title-link`, `web/tests/package.json`, `wiki/views.md`, retaken shots.

**Mockup**: approved by the owner on 2026-11-26 ("Yes"), with C1 A, C2 A, C3 A and the cell as the target (spec FR-001, FR-014 to FR-016). It is the private Design canvas "Title cell mockup (#981)", linked from #981's comments.

**Order**: the mockup page for the owner first (no code until it is approved),
then D1 with its check, D2, the cell, the tests, the wiki.

## Complexity Tracking

None.
