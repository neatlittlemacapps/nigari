# Contract: views over REST and MCP

## REST `PUT /api/collections/{id}` (unchanged route)

The `views` half may carry `colOrder` on a table view. `normalizeViews` applies
`checkViewColOrder`, the rules in [data-model.md](../data-model.md). New refusal:

```json
{ "error": "column order is only for a table view, as a list of property ids", "code": "invalid_view_column_order" }
```

HTTP 400. `web/src/serverErrors.ts` gets an entry for the code.

## MCP `set_view` (changed)

New argument, merged like the others:

| Argument | Type | Meaning |
|---|---|---|
| `column_order` | array of strings | table: property ids in the order this view shows them; ones you leave out follow in the schema's order. `[]` clears it (the schema's order again). |

Description addition: "table: column_order sets this view's column order
without changing other views or the schema; get_collection returns it on the
view as colOrder." Refusals: the same rule and message as REST, through the
same function, `checkViewColOrder`, which `applyViewSpec` calls for both a
new view and an update. Read scope still may not call `set_view` (unchanged gate).

## MCP `get_collection` (unchanged)

Returns each view's JSON, so `colOrder` appears on a table view that has one.

## Manifest

`capabilities.json`: no new route or tool, so no new entry. `set_view`'s
existing capability covers it; no gap; `gapBudget` unchanged.
`parity_property_test.go`: a pair of acts for "set a view's column order"
(REST PUT with `colOrder`, MCP `set_view` with `column_order`) that must agree
on who gets in.
