# Research: Database views read comfortably and handle the way people expect

Spec: [spec.md](spec.md). Each entry: decision, why, what was turned down.

## R1 — Table text: tokens, 14px default

**Decision**: `.db-table td` takes `--font-size-md` (14px) and `.db-table th`
`--font-size-sm` (13px), replacing the literals 13.5px and 12.5px. The two
literals leave the `fontSize` budget (374 today, `check-tokens.mjs --measure`
2026-11-02); the budget is lowered to the count measured after the change.
PR 1 adds a catalogue section with the table at 14px and at 15px
(`--font-size-md` against a one-off 15px preview) in light and dark, for the
owner to choose; if 15px wins, a component token `table.cell-font-size` is
added rather than a literal.

**Header, decided** (owner, 2026-11-03): the header is drawn by theme.css,
not styles.css, as a 11.5px uppercase label, which the first draft of this
entry missed. Of four options shown side by side (13px, 12px and 11px
uppercase, 13px plain) the owner chose **12px uppercase**: `--font-size-xs`
in both theme.css and styles.css, keeping the label's letter-spacing, weight
and brand mono.

**Cells, decided** (owner, 2026-11-03: "go with 14"): 14px, `--font-size-md`.
The 15px preview leaves the catalogue, which shows the table as built.

**Why**: the type scale is the one source of sizes (spec 001). 14px is the
scale's body step and the size the issue proposes first.

**Turned down**: keeping 13.5px (it is the complaint); 15px by default (not on
the scale today, and the issue asks to compare first).

## R2 — Column order lives on the view as `colOrder`

**Decision**: a table view gets an optional `colOrder: string[]` of property
ids, stored beside `colWidths` in the view's JSON. Missing means the schema's
order. Drawing: the ids in `colOrder` that still exist, in that order, then
every other visible property in schema order. The title column is not in it
and always comes first.

**Why**: the owner chose per view ("2 A"). `colWidths` already sets the
pattern: a per-view layout setting inside the view's JSON, saved through the
same view update.

**Turned down**: rewriting the schema order (every view moves); a separate
table (the view JSON already carries per-view layout); storing the full list
of all properties (a property added later would have to be inserted into
every view's list).

## R3 — No upgrade step for `colOrder`

**Decision**: no step in `server/upgrade_steps.go`. Nothing stored is rewritten:
existing views have no `colOrder` and draw exactly as today.

**Why**: the Stored data surface asks for a step when stored data is reshaped.
An optional key that readers treat as absent changes no existing row; it is
the "expand" half of expand/contract with nothing to contract. `openIn`
(spec 007) and the chart keys (spec 004) were added the same way.

**Turned down**: a step that writes `colOrder` from the schema into every view
(it would freeze today's order into every view, so a later schema reorder in
the Properties dialog would no longer reach them).

## R4 — The server checks `colOrder` in the shared view rules

**Decision**: one rule, `checkViewColOrder` (`server/viewopen.go`), called by
`normalizeViews` (REST `PUT /api/collections/{id}`) and by `applyViewSpec`
(MCP `set_view`, which does not go through `normalizeViews`; corrected at
`/speckit-tasks` from the graph), accepts `colOrder` only
on a table view, as an array of strings, drops ids that are not properties of
the schema and duplicates, and caps it at the schema's length. MCP `set_view`
gets a `column_order` argument (array of property ids; `[]` clears it), and
`get_collection` already returns each view's JSON, so agents read it there.
A new error code `invalid_view_column_order` for a non-array or a non-table
view, with an entry in `web/src/serverErrors.ts`.

**Why**: agent parity (FR-008) with the checks in one function (constitution
III). Agents cannot set `colWidths` today; widths are cosmetic per reader,
order is not: an agent building a view for people ("put Status first") needs
it.

**Unknown ids over MCP** (conductor, 2026-11-03, from `/code-review`): an id
an agent passes in `column_order` that is not a property is refused ("not a
property of this database"), in `applyViewSpec` before `checkViewColOrder`,
as `hidden` and `group_by` refuse one. An agent passing names instead of ids
otherwise got a success and no change. The stored-data rule stays: ids in a
view saved earlier, or sent by the interface's own save, that are no longer
properties are dropped, not refused.

**Turned down**: an interface-only setting (a parity gap for something agents
are asked to do); a separate MCP tool (`set_view` already merges view keys).

## R5 — Dragging a header: pointer events, drag only from the label

**Decision**: a pointerdown on the header's label (not on `.col-resize`, not on
the title column) arms a drag after the same 5px threshold `boardDrag.ts`
uses. While dragging, a vertical marker (a token-coloured 2px line) sits on
the gap the pointer is nearest; the dragged header is dimmed. On release the
new `colOrder` is saved; Escape or a release outside the header row cancels.
Auto-scroll at the table's sides, as the board does. Code goes in a new
`web/src/columnDrag.ts` (pure "which gap" function plus a hook), with a
`check-columndrag.mjs` for the pure part.

**Why**: pointer events work for mouse, pen and touch in one path, as the
board drag already proved; native HTML5 drag paints a ghost and does nothing
on touch (`boardDrag.ts` header comment). The resize handle keeps
`stopPropagation` on its pointerdown, so the two never start together.

**Turned down**: a drag library (one more dependency for one gesture);
native `draggable` (no touch, no marker control).

## R6 — The header menu: Move left / Move right

**Decision**: each property column's header gets a menu (`ui/Menu`, opened by a
click on the header's label and by a right-click), with **Move left** and
**Move right** (functions `moveLeft`, `moveRight`, which already exist in
`menuIcons.ts` with their arrows) and **Hide in view** (function `hide`,
reusing the property-visibility the Columns control sets). The first column
has no Move left, the last no Move right. Focus returns to the header after a
move (`returnFocus`).

**Why**: FR-005's keyboard path. A click opens the menu and a drag moves the
column: the 5px threshold tells them apart, as it tells a card click from a
card drag.

**Turned down**: arrow-key shortcuts on a focused header (undiscoverable, and
they would clash with the table's arrow-key navigation).

## R7 — Board marker: the sorted place, computed from the rows on screen

**Decision**: while a card is over column C, the board computes where the card
would sit in C if its group value were C: the column's cards in the view's
sort order, with the card inserted by the same comparator the view sorts
with (by row order when the view has no sort). A placeholder the height of
the card is drawn there; the column under the pointer gets a target style
from tokens (`--color-hover` background, `--color-border-strong` outline).
Over its own column the placeholder is its own place. Reduced motion: no
transition on the placeholder. Code: the "where" is a pure function in
`boardDrag.ts` (`dropIndex(cards, card, sort)`), checked by
`check-boarddrag.mjs`.

**Why**: the owner's default in the spec (no manual card order): the marker
must show where the card will really land, which is the sorted place, not
the pointer's position (#133).

**Turned down**: an insertion line at the pointer (it promises a place the
card will not keep); a manual card order (a feature of its own, out of
scope).

## R8 — Settings: one `ui/Menu` with submenus, not a new panel component

**Decision**: the Settings button opens a `ui/Menu` (`narrow="sheet"`, so a
phone gets the bottom sheet the other toolbar menus have) built only from
existing parts:

- `MenuLabel` **View settings**
  - Rename view (`rename`, opens the rename dialog)
  - Layout (`MenuSubmenu`, a `MenuRadioGroup` of the view types) — today
    changing type is not offered at all; see R9
  - Property visibility (`MenuSubmenu` of `MenuCheckboxItem`s, value "3 of 8"
    shown on the right) — what `ColumnsControl` does now
  - Open rows in (`MenuSubmenu` with today's `ViewOpenMenu` radio group)
  - Timeline only: Start date, End date (`MenuSubmenu` radio groups) — today's
    two `<select>`s
  - Table only, when a self-relation exists: Sub-items (`MenuSubmenu` radio
    group) — today's `<select>`
  - `MenuSeparator`, then Move left, Move right, Remove view (`danger`, last) —
    today's `ViewActionItems`
- `MenuSeparator`, `MenuLabel` **Database settings**
  - Edit properties (`editProperties` or the function the Properties dialog
    has; opens `SchemaEditor`)

`ui/Menu` needs one addition: a value on the right of a `MenuSubmenu`
(`value` prop), styled from tokens. `›` is already drawn for submenus.

**Why**: everything in #270's acceptance (current values, `›`, dividers,
danger last, Escape and focus return, Tab containment, phone sheet) is what
`ui/Menu` already does, with its keyboard tests (spec 010). A new panel
component would repeat all of it and need its own catalogue section and
checks.

**Turned down**: a new `ui/SettingsPanel` with pages (more code and a second
keyboard model for the same job); keeping **Properties** as its own button
(the issue's point is one place).

## R9 — Layout: changing a view's type is in scope only as far as today

**Decision**: the **Layout** item is shown only if the interface can already
change a view's type. It cannot today (a view is created with a type and
keeps it). So Layout is **left out** of this spec; the Settings menu shows the
view's type as the label of its first item instead ("Table view settings").
A follow-up issue is filed for changing a view's layout.

**Why**: #270 lists Layout among the panel's items, but changing type means
converting group-by, dates and chart settings between types: a feature of its
own, with a server side. FR-014 asks that nothing is lost, not that new
abilities are added.

**Turned down**: adding layout switching here (scope creep into the server).

## R10 — Embedded databases keep no settings (spec amended)

**Decision**: a database embedded in a document shows **no Settings button**,
as it shows no **Properties** or **⋯** today. The spec's User Story 4
scenario 6 and FR-017 are amended to say so.

**Why** (corrected 2026-11-03, owner): the first version of this entry gave
"#22" as the reason, read from a code comment written before the fork; in
this repository #22 is about comments, so it explained nothing. The owner's
own #270 asked for Settings in embeds, with view settings only. The real
reason to leave them out of spec 012 is the owner's model of an embed
(2026-11-03, with Notion screenshots): an embed **owns its own views**,
separate from the database's, copied from them when wanted (#371). Settings
in an embed acts on those views, with no confirmation since only the embed
changes, and on the database's properties only with a confirmation that
says the original changes everywhere. Today an embed shows the database's
own views, so Settings there would rename or remove them everywhere. That
model is **spec 014** (#371, under epic #426), and Settings in embeds is
built there, on embed-owned views.

The embed also loses, until spec 014, the timeline's two date pickers and the
table's sub-items picker it showed before: they too wrote the database's
shared view, and they moved into Settings (conductor, 2026-11-03, asked by the
helper while building PR 2).

**Turned down**: Settings in embeds now, on the database's shared views
(a rename in a document would rename everywhere); pulling #371 into spec 012
(it roughly doubles the spec and delays PR 1's fixes); folding it into spec
013 (already planned at 45 tasks around per-person filters).

## R11 — Fold-away toolbar: CSS only, opacity not visibility

**Decision**: inside an embed (`.collection--embed`), the toolbar's control
group gets `opacity: 0` and becomes visible on `.collection--embed:hover`,
`:focus-within`, and while a menu from it is open (`[data-menu-open]` set by
the toolbar's menus' `onOpenChange`). Under `@media (hover: none)` it is
always visible. The view tabs, and a small "Filtered" / "Sorted" marker when
the view has filters or a sort, stay visible (FR-021). `transition` on
opacity, dropped under reduced motion.

**Why**: `opacity` keeps the buttons in the tab order and the accessibility
tree, so Tab reaches them and `:focus-within` reveals them (`visibility:
hidden` or `display: none` would take them out of both, and Tab could never
reveal them). Keeping their box means nothing below moves (FR-019).

**Turned down**: JavaScript hover tracking (CSS does it); hiding by width
(the layout would jump).

## R12 — Two pull requests, one helper stream

**Decision**: PR 1 = User Stories 1–3 (text size, column order with its
server and MCP part, board marker). PR 2 = User Stories 4–5 (Settings menu,
fold-away toolbar), which both rework the toolbar and its screenshots. Built
by the helper stream (stream B) on its own branch; the conductor reviews each
diff before it is offered (steward skill). During spec 012 the helper owns
`CollectionView.tsx`, `CollectionMenus.tsx`, `ViewOpenMenu.tsx`,
`boardDrag.ts`, `ui/Menu.tsx`/`.css` and the files below; the conductor writes
spec 013 meanwhile and touches none of them.

**Why**: PR 1 is three independent changes that ship value at once; PR 2 is
one toolbar change best reviewed whole. The steward skill's rule: each
stream owns the files its plan names.

## R13 — Found on the way

- `CollectionView.tsx:2026` carries a German comment ("Zeiger-basiertes Ziehen
  statt des ruckeligen nativen Drags"). AGENTS.md says German anywhere in the
  source fails the build; `check-i18n.mjs` does not catch comments. Filed as
  a bug of its own (rule 19), fixed in its own small pull request, with the
  check widened to comments.
- The board's empty state says "Open ⚙ Properties to add one". With
  Properties moving into Settings, PR 2 changes it to "Open Settings, then
  Edit properties, to add one" (new string, three translations).
