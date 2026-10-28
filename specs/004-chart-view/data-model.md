# Data model: Chart views of a database

No table or column changes.

- **Chart view** (`collections.views`, JSON): a view with `type: "chart"` and
  - `chartKind`: `bar` | `hbar` | `line` | `donut` | `number` (default `bar`)
  - `groupBy`: a property id of a type that groups (research R2), or `"__row"` for Each row (one group per row, R18); absent on a number chart
  - `groupPeriod`: `day` | `week` | `month` | `year`, only with a date grouping (default `month`)
  - `agg`: `count` | `sum` | `avg` | `min` | `max` (default `count`)
  - `aggProp`: a number, formula or rollup property, required unless `agg` is `count`
  - `showEmpty`: whether the "No value" group is drawn (default `true`); read for older
    views and agents, while the panel writes `hiddenGroups` (R15)
  - `chartSort`: `auto` | `label_asc` | `label_desc` | `value_asc` | `value_desc` (default `auto`)
  - `hiddenGroups`: group keys not drawn (`""` = No value), at most 500
  - `showZero`: options with no rows drawn as zero (bar, hbar, line; default `false`)
  - `chartStyle` (all optional, R16):
    - `palette`: `auto` | `colorful` | `colorless` | `blue` | `yellow` | `green` | `purple`
      | `teal` | `orange` | `pink` | `red` (default `auto`)
    - `height`: `small` | `medium` | `large` | `xlarge` (default `medium`)
    - `legend`: `bottom` | `right` | `none` (donut and line; default `bottom`)
    - `labels`: value labels on bars, slices, points (default `false`)
    - `center`: the total in a donut's centre (default `true`), `centerLabel` (≤ 60
      characters, default the translated "Total")
    - `caption`: text under the chart (≤ 280 characters)
    - `title`: a number chart's title (≤ 120 characters, default its aggregate's name)
  - the usual `id`, `name`, `filters`, `openIn` (for the drill-down rows)
  Validated by `checkChartView` on both doors; copied whole by duplicate, import/export
  and workspace blueprints, like every view.
- **Database block** (document content, `type: "database"`): unchanged `collectionId`
  and `local` (`{viewId, views}`, #26); new `chartKind` (one of the five kinds, only while
  no database is chosen yet, R14). Cleared once the chart view exists.
- **Aggregate request** (not stored): `aggSpec{GroupBy, Period, Agg, AggProp}` plus the
  filters and the reader's day.
- **Aggregate result** (not stored): `groups[]` of `{key, label, value, rows, missing}` in
  display order, `leftOut` (rows without a number, for sum/avg/min/max), `total` (rows the
  filters let through). Without a grouping (number chart, FR-029): one group with key
  `"*"`, its value the aggregate over every row the filters let through. Folding into "Other" happens in the browser (`chartLayout.ts`).
