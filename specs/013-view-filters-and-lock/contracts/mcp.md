# Contract: MCP

## get_collection (changed)

Adds `views_locked: {by, at}` or `null`. Views carry `quickFilters` and
`subGroupBy` where set.

## set_view (changed)

- While locked: refused, "this database's views are locked; a person can
  unlock them in the interface". Through `checkViewsUnlocked`, the function
  REST calls.
- New arguments (PR 3):

| Argument | Type | Meaning |
|---|---|---|
| `quick_filters` | array of strings | property ids shown as quick filter chips; `[]` clears |
| `sub_group_by` | string | board: a second grouping drawn as lanes; `""` clears |

- Description addition: "Refused while the database's views are locked
  (get_collection's views_locked); only a person can unlock."
- Each change is logged as an agent (`view.create` / `view.update` /
  `view.rename`).

## delete_view (changed)

Refused while locked, same sentence; logged as `view.delete`.

## Not available

Locking and unlocking, and personal view state: listed in
`not_available_via_mcp`, "closed" in `capabilities.json`.
