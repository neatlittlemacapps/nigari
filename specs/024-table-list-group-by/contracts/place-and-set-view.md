# Contracts: place with props, set_view on tables and lists

## POST /api/pages/{id}/place (changed)

```json
{ "after": "<row id>", "viewId": "<view id>", "props": { "status": "doing" } }
```

- `props` is optional. Without it the route behaves as today (spec 022).
- With it: the same gate (`canWrite` on the row), then the properties are set
  as `PATCH /api/pages/{id}` sets them (same validation and errors), then the
  row is placed. A refused value answers as PATCH does and nothing moves.
- One audit entry (`reorder_page`, detail names the properties set).

## set_view (changed, MCP)

On a view of type table or list:

- `group_by: "<property id>"` groups the view (sets `grouped`); `""` removes
  the grouping. Refused with a sentence for a type that cannot group.
- `period`, `show_empty`, `hidden_groups`, `status_groups` apply to the
  grouping as they do to a chart.
- `group_reverse: true|false` (new) flips the group order.
- `type: "table"` or `"list"` on a board keeps its `group_by` and turns the
  grouping on; the answer says so.

All refused while the views are locked, and for a read-only credential, as
today.
