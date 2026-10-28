# Data model: Chart views of a database

No table or column changes.

- **Chart view** (`collections.views`, JSON): a view with `type: "chart"` and
  - `chartKind`: `bar` | `line` | `donut` (default `bar`)
  - `groupBy`: a property id of a type that groups (research R2)
  - `groupPeriod`: `day` | `week` | `month` | `year`, only with a date grouping (default `month`)
  - `agg`: `count` | `sum` | `avg` | `min` | `max` (default `count`)
  - `aggProp`: a number, formula or rollup property, required unless `agg` is `count`
  - `showEmpty`: whether the "No value" group is drawn (default `true`)
  - the usual `id`, `name`, `filters`, `openIn` (for the drill-down rows)
  Validated by `checkChartView` on both doors; copied whole by duplicate, import/export
  and workspace blueprints, like every view.
- **Aggregate request** (not stored): `aggSpec{GroupBy, Period, Agg, AggProp}` plus the
  filters and the reader's day.
- **Aggregate result** (not stored): `groups[]` of `{key, label, value, rows, missing}` in
  display order, `leftOut` (rows without a number, for sum/avg/min/max), `total` (rows the
  filters let through). Folding into "Other" happens in the browser (`chartLayout.ts`).
