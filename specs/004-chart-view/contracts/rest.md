# REST contract

## POST /api/collections/{id}/aggregate

Behind `auth`; the same gates as `GET /api/collections/{id}/rows` (read access, then the
credential's workspace).

Body:

```json
{
  "viewId": "v1",
  "groupBy": "status",
  "period": "month",
  "aggregate": "sum",
  "aggregateProp": "amount",
  "filters": [{"property": "owner", "op": "is", "value": "u1"}],
  "today": "2026-10-28"
}
```

All optional except `groupBy` when no `viewId` is given. With `viewId`, the view's own
settings and filters are the defaults and the fields sent override them.

Answer 200:

```json
{
  "groups": [
    {"key": "todo", "label": "To do", "value": 12, "rows": 12},
    {"key": "", "label": "", "value": 3, "rows": 3}
  ],
  "leftOut": 0,
  "total": 15
}
```

`key` `""` is "No value" (labelled by the browser). `missing: true` marks a key whose
option, person or page no longer exists. Values are numbers; an average is a float.

Refusals: 400 `invalid_chart` (a grouping type that does not group, an aggregate property
that is not a number, formula or rollup, an unknown aggregate or period, a view of another
database); 400 `too_many_periods` (more than 400 periods: choose a coarser one); 404 for a
database the caller may not read; 503/`query_timeout` past the 5-second limit.

## PUT /api/collections/{id}

Unchanged shape. A view with `type: "chart"` is checked by `checkChartView`; a refusal is
400 `invalid_chart` naming the view and the setting, and nothing is stored.
