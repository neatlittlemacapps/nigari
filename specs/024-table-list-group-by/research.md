# Research: Tables and lists can be grouped by a property

Decisions for spec 024. The owner's product choices are in the spec's
Clarifications (Q1–Q7); these are the technical ones that follow.

## R1. Where a table's grouping is stored

**Decision**: in the view's existing `groupBy` (and `groupPeriod`,
`showEmpty`, `hiddenGroups`, `statusGroups`, which charts already use), drawn
by a table or list only when the view also has `grouped: true`. Flipping the
order is a new `groupReverse: true`.

**Rationale**: a board's `groupBy` survives a change to a table (spec 018), so
tables that were boards carry one today, in databases and in documents'
embedded views. A switch that only new choices set keeps them flat (Q6, SC-004)
without an upgrade step, and an embed's views live inside documents, where an
upgrade step would have to rewrite every document. Sharing `groupBy` across
layouts is what makes a board changed to a table stay grouped by the same
property (Q6) and a table changed back to a board keep its columns.

**Alternatives considered**: a separate `group` object for tables and lists
(two fields meaning the same thing, and the layout change has to copy between
them); an upgrade step that drops `groupBy` from existing tables (cannot reach
embedded views in documents, and loses the board a table came from).

## R2. Which properties can group, and checking it once

**Decision**: one function `checkViewGrouping(view, schema, strict)` in
`server/viewgroup.go`, called from `normalizeViews` (PUT) and `applyViewSpec`
(`set_view`, and through it embeds), the way `checkViewSubGroup` is. On a
table or list with `grouped`: `groupBy` must be select, multi-select, status,
relation, person, checkbox, date, formula or rollup; `groupPeriod` only with
a date (day, week, month, year; month when absent); `statusGroups` only with a
status; `hiddenGroups` entries are kept as strings (stale ones are harmless,
as a chart's are). A stored view whose property was deleted or retyped is
drawn flat and the keys are dropped on its next save (not refused), as
`checkViewSubGroup` treats a stale lane. A new invalid choice is refused with
`invalid_view_group` and a sentence naming the property and why.

**Alternatives considered**: validating in the browser only (agents and the
REST door would differ, constitution III).

## R3. Grouping in the browser, from loaded rows

**Decision**: a pure module `web/src/rowGroups.ts`:
`groupRows(rows, prop, settings, today) → Group[]` with `{key, label, value,
rows, count}`. Option types use `lanesFor`/`laneIdsOf` from `boardLanes.ts`
(option order, No value last, a multi-value row in each group); person and
relation take their names as the board does; checkbox gives Checked then
Unchecked; dates bucket by period with `format.ts` (`firstWeekday`,
`formatMonth`, `formatDay`); a status with `statusGroups` uses its groups.
Then reverse (No value stays last), hide hidden groups, drop empty ones unless
`showEmpty`. `check-rowgroups.mjs` holds each rule.

**Rationale**: a table already loads every row (`loadRows`, pages of 200), so
grouping is one pass with no new query, and the server's `groupCounts` would
only repeat counts the browser can make from what it shows (counts must equal
the rows drawn, SC-003, which a server count would not after a personal
filter).

**Alternatives considered**: server-side grouped row pages (needed only if
tables stop loading every row; nothing in this spec changes that).

## R4. A drag into another group is one request

**Decision**: `POST /api/pages/{id}/place` takes an optional `props` object.
The handler checks `canWrite` once, applies `props` through the same function
PATCH `/api/pages/{id}` uses for properties (validation, history, webhook),
then places the row; one audit entry names both. The browser computes the
props with `dropPatch`'s rules (`laneValue`, keep a multi-value row's other
values). A property no drag can write (formula, rollup) or a date grouped by
a period refuses the drop in the browser; the server refuses an invalid
value as PATCH does.

**Rationale**: two requests leave a half-moved row when the second fails, and
two history entries for one gesture (FR-011, the board's rule in spec 013).
Agents already have both in one `update_page` call.

**Alternatives considered**: PATCH then place (two changes); a new route
(another door to gate).

## R5. Embeds, sub-items and the row limit

**Decision**: grouping runs after the view's filters and sort and after the
embed's row limit (`limitRows`, spec 023), so the limit counts rows; Show more
reveals more rows into their groups. In a tree (`subItemProp`), only top-level
rows are grouped; their sub-items stay under them (Q7).

**Rationale**: the limit exists to keep a document short; counting headers
would make the cut move as groups fold. Grouping sub-items by their own value
would tear them from their parent, which Q7 turned down.

## R6. Folded groups are personal state

**Decision**: `foldedGroups: string[]` (group keys) in the personal view
state, cleaned by `cleanViewState` beside `foldedLanes`, under the database
view's scope or the embed's. Collapse all writes every current key; Expand all
removes the key. A group key is the value id (option, page, person), `true` /
`false` for a checkbox, the period's first day for a date, `__unset__` for No
value, so a fold survives renames.

**Rationale**: Q4; the same mechanism as folded lanes, already on both scopes.
