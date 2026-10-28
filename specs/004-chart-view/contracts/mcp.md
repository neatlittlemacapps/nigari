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

With `aggregate` (or `aggregate_property`) and no `group_by`, the answer is one value over
every row the filters let through (a number chart, FR-029):

```json
{"value": 1250.5, "rows": 15, "left_out": 2}
```

Refusals: as REST (`invalid_chart` sentences, `too_many_periods`), plus the existing gates.

## set_view

`type` accepts `chart`. New arguments: `chart_kind` (`bar|hbar|line|donut|number`),
`period`, `aggregate`, `aggregate_property`, `show_empty`, `chart_sort`
(`auto|label_asc|label_desc|value_asc|value_desc`), `hidden_groups` (list of group keys,
`""` = No value), `show_zero`, `chart_style` (object: `palette`, `height`, `legend`,
`labels`, `center`, `center_label`, `caption`, `title`; values as data-model.md); `group_by` on a chart accepts select,
status, multiselect, person, checkbox, date and relation properties. A bar, hbar,
line or donut chart without `group_by` is refused ("a chart needs group_by"), as a board is;
a number chart takes none.

## embed_database

New optional argument `view_id`: the view of that database the block shows (written as
the block's `local.viewId`). A view of another database is refused ("view … is not a view
of database …"). With `set_view type chart` first, this puts a chart into a document.

## get_collection

Unchanged answer; the description names the chart settings (`chartKind`, `groupBy`,
`groupPeriod`, `agg`, `aggProp`, `showEmpty`).
