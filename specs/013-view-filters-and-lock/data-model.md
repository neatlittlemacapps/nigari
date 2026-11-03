# Data model: A view's filters can be changed for oneself, offered as quick filters, sub-grouped, locked, and logged

## view_prefs (new table, upgrade step 2)

| Column | Type | Meaning |
|---|---|---|
| `user_id` | TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE | the person |
| `collection_id` | TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE | the database page |
| `scope` | TEXT NOT NULL | a view id, or `embed:<pageId>:<blockId>:<viewId>` |
| `state` | TEXT NOT NULL | JSON, below |
| `updated_at` | TEXT NOT NULL | `now()` |

Primary key `(user_id, collection_id, scope)`; index `view_prefs_collection`
on `(collection_id)`.

`state`: `{ "filters"?: Filter[], "sort"?: {property, dir} | null,
"quickPicks"?: {propId: string}, "foldedLanes"?: string[] }`. At most 32 KB;
filters checked like a view's (`checkViewFilter`), unknown properties
dropped. An empty state deletes the row.

Removed: rows of a view id no longer in the database's views (on every views
save, in Go); every row of a database when its page is deleted for good, and
every row of a person when the account is deleted, by the foreign keys
(`foreign_keys(1)` is on, as `collections` already relies on; found at
`/speckit-tasks`, so no cleanup code in the delete paths). Never returned to anyone but its
owner.

## collections (two new columns, upgrade step 2)

| Column | Type | Meaning |
|---|---|---|
| `views_locked_by` | TEXT NOT NULL DEFAULT '' | user id who locked; '' = unlocked |
| `views_locked_at` | TEXT NOT NULL DEFAULT '' | when |

## View keys (optional, no step)

| Key | On | Rule (`server/viewopen.go`, both doors) |
|---|---|---|
| `quickFilters` | any view but form and chart | array of property ids of a filterable type; repeats dropped; at most 8; `invalid_view_quick_filters` otherwise |
| `subGroupBy` | board | a groupable property id, not `groupBy`; `invalid_view_sub_group` otherwise |

## Audit actions (new)

| Action | When | detail / changes |
|---|---|---|
| `view.create` | a view id appears | view name |
| `view.delete` | a view id disappears | view name |
| `view.rename` | name differs | before/after name |
| `view.update` | any of filters, sort, groupBy, subGroupBy, quickFilters, dateProp, endDateProp, chart grouping/aggregate differs | changed keys, before/after |
| `views.lock` / `views.unlock` | lock routes | — |

Not logged: `colWidths`, `colOrder`, `hidden`, `openIn`, `chartStyle`,
form texts, personal state.

## Error codes (new)

`views_locked` (409), `invalid_view_quick_filters` (400),
`invalid_view_sub_group` (400).
