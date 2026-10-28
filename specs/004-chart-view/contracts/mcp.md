# MCP contract

## query_rows

New arguments: `group_by` (property id), `period` (`day|week|month|year`, dates only),
`aggregate` (`count|sum|avg|min|max`, default `count`), `aggregate_property` (required
unless count), `view_id` (take grouping, aggregate and filters from a chart view; explicit
arguments override). With `group_by` or a chart `view_id`, the answer is groups instead of
rows:

```json
{"groups": [{"key": "todo", "label": "To do", "value": 12, "rows": 12}], "left_out": 0, "total": 15}
```

wrapped in `wrapUntrusted` (labels are option names, people's names and page titles).
Description addition: "Pass group_by to get counts or totals per group in one call instead
of fetching rows: the same numbers a chart view shows, and the way to answer 'how many per
X' on a large database."

Refusals: as REST (`invalid_chart` sentences, `too_many_periods`), plus the existing gates.

## set_view

`type` accepts `chart`. New arguments: `chart_kind` (`bar|line|donut`), `period`,
`aggregate`, `aggregate_property`, `show_empty`; `group_by` on a chart accepts select,
status, multiselect, person, checkbox, date and relation properties. A chart without
`group_by` is refused ("a chart needs group_by"), as a board is.

## get_collection

Unchanged answer; the description names the chart settings (`chartKind`, `groupBy`,
`groupPeriod`, `agg`, `aggProp`, `showEmpty`).
