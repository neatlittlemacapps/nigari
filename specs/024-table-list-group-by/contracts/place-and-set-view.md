# Contracts: place with props, set_view on tables and lists

## POST /api/pages/{id}/place (changed)

```json
{ "after": "<row id>", "viewId": "<view id>", "propsPatch": { "status": "doing" } }
```

- `propsPatch` is optional and has the shape PATCH `/api/pages/{id}` takes
  (a key set to `null` is removed). Without it the route behaves as today
  (spec 022). Not an object: 400.
- With it: the same gate (`canWrite` on the row), then the row is placed, then
  the properties are written by `mergePropsPatch`, the function PATCH uses. The
  move goes first because it is the part that refuses (an anchor that is not a
  sibling, a trashed page): a refused move leaves the row's values unchanged.
- Two audit entries, `reorder_page` and `set_properties`, as an agent doing the
  same with `update_page` and `set_properties` gets; one webhook per change.

## set_view (changed, MCP)

On a view of type table or list:

- `group_by: "<property id>"` groups the view (sets `grouped`); `""` removes
  the grouping. Refused with a sentence for a type that cannot group.
- `period`, `hidden_groups`, `status_groups` apply to the grouping as they do
  to a chart; `show_empty_groups: true|false` (new) draws groups with no rows.
  A new `group_by` drops the old property's period, status groups and hidden
  groups. On a table or list that is not grouped these arguments are refused.
- `group_reverse: true|false` (new) flips the group order; No value stays last.
- `type: "table"` or `"list"` on a board keeps its `group_by` and turns the
  grouping on; the answer says so.

All refused while the views are locked, and for a read-only credential, as
today.
