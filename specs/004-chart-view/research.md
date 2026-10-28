# Research: Chart views of a database

## R1. One aggregate function, the rows query's own filter

**Decision**: New `server/aggregate.go` with `(s) aggregateRows(ctx, u, colID, spec
aggSpec, flat []rowFilter, today time.Time) (aggResult, error)`. The WHERE clause is built
by a helper extracted from `collectionRowsQuery`: `(s) rowsWhere(u, colID, flat, groups,
now) (string, []any)` (row scope, `resolveSmartDates`, `typeFilters`, `where()`), which
both now call. One SQL `GROUP BY` on the read pool (`s.rdb`) under `withReadLimit`.
`groupCounts` (spec 002, used today only by its benchmark) becomes the count case of
`aggregateRows`.

**Rationale**: SC-002 asks that a chart's numbers equal the filtered table's. The only way
that holds for every operator, relative day and private-row rule is that both read the
same WHERE. Copying the filter code would drift, as #95 showed for number filters.

**Alternatives considered**: fetch rows and count in the browser (FR-008 forbids; slow and
stopped by the 5-second limit past ~10k rows); a separate SQL builder for aggregates
(drifts from the rows query).

## R2. The group key, by property type

| Grouping type | SQL key | Order of groups |
| --- | --- | --- |
| select, status | the option id (`json_extract`) | the schema's option order |
| multiselect, relation, person (several) | each element (`json_each`), a row counts under each | select: option order; others largest first |
| person (one) | the user id | largest first |
| checkbox | `json_type`: `true` → "true", anything else → "false" | checked, then unchecked |
| date | `substr(v,1,10)` day, `strftime('%G-W%V', v)` ISO week, `substr(v,1,7)` month, `substr(v,1,4)` year | time order, gaps filled with zero |

Rows without a value form the group `""` ("No value"), drawn last unless the view hides
it. A checkbox has no "No value": unticked is a value. Grouping by text, number, formula,
rollup and the timestamps is refused (FR-003 lists what groups); the error names the
types that do.

**Rationale**: `json_each` already gives one row per element of a list and the scalar for a
single value (`groupCounts`' comment says why one pass), so lists and scalars group alike.
`%G-W%V` is SQLite's ISO week (SQLite ≥ 3.46; we ship 3.53.4), which starts on Monday as the
reader's week usually does here; a per-reader week start is out of scope.

## R3. The aggregate

**Decision**: `count` is `COUNT(*)`. `sum`, `avg`, `min`, `max` of a number property read
`json_extract(props,'$.p')` only where `json_type(...) IN ('integer','real')`, and a second
column `SUM(CASE WHEN json_type(...) NOT IN ('integer','real') OR IS NULL THEN 1 END)` counts
the rows left out (FR-009), in the same pass. A number stored as text ("12") is left out and
counted as such: the number filters (#95) treat it the same way, so the table and the chart
agree. Negative values are summed as they are.

**Formula and rollup** (FR-002): their values are computed in Go per row
(`computeDerived`), not stored, so SQL cannot sum them. They take a second path:
`aggregateDerived` reads the filtered rows' ids and props in pages of 1,000 on the read pool
under the same `withReadLimit`, runs `computeDerived` on each page, and folds the values in
Go. It is slower by nature; its budget comes from measurement (R10), and past the 5-second
limit it gives the same sentence as any long read.

**Alternatives considered**: storing formula results (a cache to invalidate on every write
of every input, across relations); leaving formulas out (FR-002 asks for them).

## R4. How many groups, and "Other"

**Decision**: at most **12** groups are drawn: the 11 largest (or the first 11 in option or
time order) and an "Other" that adds up the rest. "No value" counts toward the 12 when
shown. Dates are not folded: a date grouping refuses more than **400** periods after gap
filling and asks for a coarser period instead. The answer carries every group; folding is
the browser's (`chartLayout.ts`), so the table alternative and agents get all of them
(FR-007).

**Rationale**: a donut with more than about eight slices and bars narrower than a label
stop being readable; 12 matches the token palette's size (R8) so no two drawn groups share
a colour. 400 periods is more than a year of days, and a line of more points than the
chart has pixels says nothing more.

## R5. Labels

**Decision**: the server labels every group, so agents and people read the same words:
option name for select and status, the person's name, the related page's title, "Yes"/"No"
keys for checkboxes (`true`/`false`; the browser translates), the period's key for dates
(the browser formats it through `format.ts`). Titles and names a person wrote travel
through `wrapUntrusted` in the MCP answer. A key whose option, person or page no longer
exists keeps its id as the label and is marked `missing`, so the number is never hidden.

## R6. The doors

**Decision**:
- **REST** `POST /api/collections/{id}/aggregate`, body `{viewId?, groupBy, period?,
  aggregate, aggregateProp?, filters?, today?}`. With `viewId` the view's stored settings
  and filters are the defaults and explicit fields override them (the interface sends the
  embed's own filters, #26). Answer: `{groups: [{key, label, value, rows, missing?}],
  leftOut, total}`. Same gates as `GET …/rows`: `canRead`, then `credentialMayEnter`.
- **MCP** `query_rows` gains `group_by`, `period`, `aggregate`, `aggregate_property` and
  `view_id`. With `group_by` it answers groups instead of rows. Its existing gates,
  `wrapUntrusted` and read-scope rules apply unchanged.

**Rationale**: one tool with an option rather than a new tool (`.claude/rules/mcp.md`:
the catalogue stays small); `query_rows` already owns filters and gates, so an aggregate
cannot see more than a row query.

**Alternatives considered**: a GET with query parameters like `…/rows` (filters as JSON in
a query string are fragile); a new `aggregate_rows` tool (a 35th tool for what is a mode
of an existing one).

## R7. The view's settings

**Decision**: an eighth view type, `chart`. Its view JSON adds `chartKind`
(`bar` | `line` | `donut`), `groupBy` (shared with the board), `groupPeriod`
(`day` | `week` | `month` | `year`, dates only), `agg` (`count` | `sum` | `avg` | `min` |
`max`), `aggProp` (a number, formula or rollup property, required unless `count`),
`showEmpty` (bool, default true). One validator `checkChartView(view, schema)` in
`aggregate.go`, called by `applyViewSpec` (MCP `set_view`) and by `PUT
/api/collections/{id}` through the same views normalisation spec 007 added
(`normalizeViewsOpenIn` becomes `normalizeViews`, running both rules). Refusals name the
setting and what it accepts; REST answers 400 `invalid_chart`. `set_view` gains
`chart_kind`, `period`, `aggregate`, `aggregate_property`, `show_empty`, and its
`group_by` is accepted on a chart with the chart's types (R2).

A chart has no rows of its own to open, so `openIn` applies to its drill-down list (R9) and
stays allowed.

## R8. Drawing: Chart.js

**Decision (owner, 2026-10-28)**: Chart.js **4.5.1** (MIT), the bar, line and doughnut
controllers registered by hand so the rest is tree-shaken. 4.5.1 rather than 4.6.1: the
newer one was released six days before this decision, under the two-week rule for new
versions. Measured for the three charts: **60,694 B gzip**. It lives in the lazy
`ChartView` chunk, so the main bundle does not carry it (SC-006).

What stays ours, in pure modules with checks:
- `web/src/chartLayout.ts`: folding into "Other", the order of groups, gap filling for
  dates, the empty state, the summary sentence, and turning an `aggResult` into Chart.js
  data (`check-chartlayout.mjs`).
- `web/src/chartTheme.ts`: reads the chart tokens and text, grid and surface tokens from
  the computed style of the chart's element and builds Chart.js options from them; called
  again when the theme changes (light/dark), so no colour is written twice.

Colours: 12 semantic tokens `color.chart.1` … `color.chart.12` with light and dark values,
each declaring `md.salt.contrast` 3:1 on `color.surface.default`, so `build-tokens.mjs`
fails a palette a theme cannot read (FR-015). A select's own option colours are used for
its bars when it has them (edge case); every bar and slice also carries its label.

**The canvas and accessibility (FR-014)**: Chart.js draws on a canvas, which offers a
keyboard or a screen reader nothing to hold. The chart therefore gets a DOM of its own
beside the canvas:
- the canvas is `aria-hidden`; the `figure` carries the caption and the summary sentence;
- a row of focusable group buttons, visually tied to the chart (the legend for a donut,
  the axis labels for bars and lines), with roving focus through `nav.ts`: arrow keys
  move, each button's name is its label and value, Enter opens its rows (R9). Moving
  focus also highlights the matching bar or slice (`chart.setActiveElements`), so a
  sighted keyboard user sees where they are;
- **Show as table** renders the groups as a `<table>`.

Animations follow `prefers-reduced-motion`. Text in the canvas uses the app's font token.

**Dependency surfaces**: `web/package.json` and the lockfile through `npm install`;
`THIRD-PARTY-NOTICES.md` through `scripts/licenses.mjs`; the reason in the pull request
(the constitution's rule).

**Alternatives considered** (measured 2026-10-28: bar, line and donut imported from each,
bundled minified with esbuild, React left out, gzip -9):

| Library | Size, gzip | Draws on | Notes |
| --- | --- | --- | --- |
| uPlot 1.6.31 | 22,678 B | canvas | no donut; bars through a plugin |
| Chart.js 4.4.7 / 4.5.1 | 60,006 / 60,694 B | canvas | chosen (4.5.1) |
| Recharts 2.15.0 | 112,446 B | SVG | plus React, already loaded |
| ECharts 5.6.0 | 179,222 B | SVG renderer | tree-shaken core |
| Hand-drawn SVG | ours | SVG | Claude's recommendation; the owner chose Chart.js for its maturity and room to grow |

## R9. Seeing the rows behind a group

**Decision**: selecting a group opens a list under the chart with the rows behind it: the
ordinary rows query with one more filter, translated from the group (`is` option, `is`
person, `is_empty` for "No value", `is true`/`false` for a checkbox, `between` the period's
first and last day for a date). The list is the existing `ListView`, so a click on a row
follows the view's **Open pages in** (spec 007). "Other" opens the rows of every folded
group (`is` with several values).

**Rationale**: no second way to read rows, and SC-002's equality becomes visible: the list
has exactly as many rows as the bar says.

## R10. Performance and budgets

- **Counts** keep the spec 002 budgets: grouped count 4 ms at 1k rows, 30 ms at 10k.
- **New benchmark** `BenchmarkStorageAggregate` on the seeded workspace: sum per select,
  count per month, and a formula sum, at 1k and 10k rows (`BENCH_LARGE=1` adds 100k). Budgets
  are the measured CI p95 × 1.5 (spec 002's rule) and go into spec 002's research table in
  the pull request.
- **No index** is added: the aggregate reads the rows of one database through the existing
  `parent_id` index, as the rows query does; the plan is checked with `EXPLAIN QUERY PLAN`.
- **Bundle**: `ChartView` is a lazy chunk; the main chunk may grow by at most **3 KB gzip**
  (SC-006), measured in the pull request.

## R11. Accessibility

**Decision**: the chart is a `figure` with a caption naming what it shows ("Count of rows by
Status") and a visually available summary ("12 groups, largest: Doing, 14"). Each bar,
point or slice is a focusable element in one roving-tabindex group (`nav.ts`): arrow keys
move, the label and value are its accessible name, Enter opens its rows (R9). A **Show as
table** switch renders the same groups as a `<table>` (FR-014). The catalogue gets a chart
section for axe and the keyboard test.

## R12. Out of scope, and what keeps the door open

Dashboards, stacked or grouped bars, a second grouping and charts on public pages are out
(FR-017). Nothing here closes them: `aggSpec` takes one grouping now and a list later; a
dashboard is a document with several embedded chart views (embeds already carry their own
filters); public pages keep showing a database as its table (`public_collection_table.go`
never reads views). Horizontal bars, first left for later, came in with the chart builder
(owner's walk-through, R13); Chart.js draws them with `indexAxis: 'y'`.

## R13. The chart builder: one panel, stored on the view

**Decision** (US5, FR-018 to FR-027): every builder setting is a field of the chart view
(data-model.md), checked by `checkChartView` on both doors (R7). No new storage: the
document's database block already stores which view it shows (`local.viewId`, #26), so a
chart in a document is a database block showing a chart view. The settings live in one
panel, `ChartSettings.tsx`, ordered as Notion's (owner's walk-through): kind (five icon
buttons), Data (what to show, period, value, sort, groups), Style (palette, more style
options folded), then Show as table and Save chart as. It opens from a settings button in
the chart's toolbar, in the database page and in the database block alike (FR-027: an
exception to #22 for charts only). The layer has no popover yet (`ui/README.md`: menus are not
in it); the panel needs one, so this feature adds `ui/Popover` on Base UI's Popover (focus
trap, Escape, outside click, anchoring), with a README entry and a catalogue section. The
hand-dialog and raw-button budgets do not grow.

Settings save through `saveConfig` (as every view change does) after a short debounce for
typed text (caption, centre label, title), so a caption is not a write per key. The chart
redraws from the panel's state immediately; a refusal restores the stored view and says
why (spec 007's pattern).

**Rationale**: a chart's look belongs to the view, not to the document, so the same chart
embedded twice looks the same, and an agent sets it through `set_view` like any view.

**Alternatives considered**: storing style on the database block (two documents would
show one chart differently, and an agent would need a block editor to style it); a modal
builder (Notion's panel lets the chart redraw beside it while settings change).

## R14. Inserting from the `/` menu

**Decision**: five slash entries (FR-018) insert a `database` block with a new prop
`chartKind` (one of the five kinds; empty = an ordinary embed, every block written before).
While the block has no `collectionId`, its picker reads "Choose a database to chart". On a
pick, the browser asks the server for the database's config, adds a chart view built by
`defaultChartView(kind, schema)` (`chartDefaults.ts`, FR-019), saves it with `PUT
/api/collections/{id}` (so `checkChartView` runs), then writes `{collectionId, local:
{viewId}}` into the block and clears `chartKind`, and asks the embed to open the settings.
If the save is refused (the person may not change that database), the block keeps the
database as an ordinary embed and a toast says why (US5.8).

`defaultChartView` is pure, in its own module with `check-chartdefaults.mjs`: first select
or status → first other groupable property (R2's list) → number chart; count; and when a
grouped kind is chosen later on a number chart, the same default grouping.

**Agents** (FR-028): `embed_database` gains `view_id` (optional): the block is written with
`local: {"viewId": …}` so the document shows that view. With `set_view type chart` first,
an agent builds the same chart a person builds from the `/` menu. The view must belong to
that database (refused otherwise, as the block would otherwise show the first view).

## R15. Sort, hidden groups, empty options

**Decision**: `chartSort` (`auto` | `label_asc` | `label_desc` | `value_asc` | `value_desc`,
default `auto` = FR-005). Sorting happens in `chartLayout.ts` before folding, so "Other"
folds the smallest when sorted by value and the last otherwise; dates sorted by label are
time order. `hiddenGroups` is a list of group keys (`""` = No value; `showEmpty` stays
for agents and older views and is read as "`""` not hidden"; the panel writes
`hiddenGroups` only). `showZero` (FR-023) adds select, status and checkbox options that have
no rows, as zero, from the schema in the browser (the server answers only groups with rows);
dates fill gaps regardless (R2).

**Rationale**: all three change only what is drawn, not what is counted, so they stay out
of the server's answer: agents get every group, and the table alternative lists hidden ones
as hidden.

## R16. Palettes and style, from tokens

**Decision**: palettes are token sets, each colour declaring `md.salt.contrast` 3:1 on
`color.surface.default` in light and dark (FR-015, FR-024):
- `colorful`: `color.chart.1` … `color.chart.12` (R8);
- `colorless`: `color.chart.gray.1` … `.3`;
- eight single colours: `color.chart.<hue>.1` … `.3` for blue, yellow, green, purple, teal,
  orange, pink, red (three shades that all pass 3:1; more groups repeat them, labels tell
  them apart, edge case);
- `auto` (default): a select's or status's own option colours (their tag colour's
  foreground, which already passes on its tag background; mapped onto the chart hue of the
  same name) and `colorful` for every other grouping.
Height is a component token per step (`chart.height.small|medium|large|xlarge`). Legend,
value labels (Chart.js' own label drawing is not shipped; values are drawn by a 1 KB
plugin of ours in `chartTheme.ts` reading the type tokens), centre total (a DOM overlay
centred on the donut, so its text is real text), caption (a `figcaption`) and the number
chart's title are DOM where they can be, so they are read by screen readers and copied as
text.

**Rationale**: Notion's single-colour palettes fade to near-white; on our 3:1 rule those
light shades would fail, so each hue has the three shades that pass, not five.

## R17. Tooltip and Save chart as

**Decision**: the tooltip is Chart.js' external tooltip hook rendering our own DOM element
(token-styled, `role="tooltip"`), showing the label, the value through `format.ts`, and
"Click to view data"; the group buttons of R8 show the same tooltip on focus, so keyboard
and pointer see one thing. "Save chart as" draws an offscreen copy of the chart at 2× on
the chosen background (surface, or `color.chart.background.1` … `.4`, four soft tokens),
with the caption and legend drawn in, then `canvas.toBlob('image/png')`: **Copy as PNG**
through `navigator.clipboard.write([new ClipboardItem(…)])`, **Download PNG** through
an object URL and a temporary link (`savePicture.ts`, the app's first browser-made file). A refused clipboard falls back to a toast and the
download (edge case). No SVG (FR-017).

**Parity**: the picture is a drawing of numbers an agent already reads with `query_rows`;
the manifest's `collections` capability says so in its note, and no route is added, so
`check-parity.mjs` has nothing new to count.

## R18. Each row (FR-030, FR-031)

**Decision**: `groupBy` takes the reserved value `"__row"`. The server's key is the row's
id and its label the row's title (`aggregateSQL` groups by `pages.id`); a row is one group,
so a sum is the row's value, and `agg` must name a number, formula or rollup property
(`count` is refused with Each row: every bar would be 1). Rows without a number are
"No value" and left out like any other. The drawing caps Each row at **50** groups, sorted by
value high to low by default, and folds the rest into "Other" (the other groupings keep 12:
a palette of 12 colours is what made 12 the cap there, and 50 bars in one colour stay
readable on a bar chart; a donut of Each row keeps the cap of 12). A click on a row's bar
opens the row instead of listing it.

`chartDefaults.ts`: when nothing groups but a number property exists, a new chart is bars of
Each row valued by the first number, which is what the owner expected from a collection
with only a number. The settings always show "What to show", with "Each row" first when
the database has a number; a grouped kind with nothing to group by draws a sentence naming
what to add instead of falling back to a number chart.

**Rejected**: grouping by a number's distinct values (a bar per "5", per "7"), which answers
a question nobody asked here; grouping by any text property (Notion offers it) stays out
until someone asks: it is Each row with duplicate names merged, and Each row covers the
case that came up.
