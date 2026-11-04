# Data model: A database in a document has views of its own

Nothing new in SQLite. The change is the JSON a `database` block keeps in
its `local` prop, inside `pages.content` (and the document's Yjs state).

## The database block (`web/src/blocks.tsx`, `databaseSpec`)

| Prop | Type | Meaning |
|---|---|---|
| `collectionId` | string | the database shown (unchanged) |
| `local` | string (JSON) | the embed's views and the open view, below |
| `chartKind` | string | the / menu's chart kind until a database is picked (unchanged) |

The block's `id` (BlockNote's, already stored) is the **embed id** agents
use (`embed_id`) and spec 013's personal scope uses
(`embed:<pageId>:<blockId>:<viewId>`).

## `local`, new shape (written from this spec on)

```json
{
  "v": 2,
  "viewId": "v8k2m1q",
  "views": [
    { "id": "v8k2m1q", "name": "Open work", "type": "table",
      "filters": [{ "property": "status", "op": "is", "value": "todo" }],
      "colOrder": ["owner", "status"] },
    { "id": "vb3x9a0", "name": "By status", "type": "board", "groupBy": "status" }
  ]
}
```

- `v`: always `2`. Marks the shape; the old shape has no `v`.
- `viewId`: the open view. Not one of `views` → the first view opens.
- `views`: one or more views, each with exactly the keys and rules of a
  database view (`ViewDef` in `web/src/types.ts`; checked for agents by
  `applyViewSpec` and `normalizeViews`). Types: every type except `form`.
- View ids: unique within the embed. A copy of a database view gets a new
  id; a view read from the old shape keeps its database view's id (R2).

## `local`, old shape (read, never written)

```json
{ "viewId": "<database view id>", "views": { "<database view id>": { "filters": [], "sort": null } } }
```

or the empty string. Read as (research R2):

1. take the database's views, in order, leaving out forms;
2. for each, lay the old entry's `filters` and `sort` over it, when present;
3. open `viewId` if it is one of them, else the first;
4. no views left (a database with only a form) → one table view, below.

## Tolerant reading (both shapes)

| Input | Read as |
|---|---|
| not JSON, not an object | the old shape's empty value (step 1 above) |
| `v: 2`, `views` not an array or empty | one table view, every property shown |
| a view that is not an object, has no string `id`, or an unknown or `form` type | left out |
| two views with one id | the first kept |
| a filter, sort, grouping, date, hidden or ordered column naming a property the database no longer has | ignored where it is used (as today) |

The **default view** is `{id: "<new>", name: "Table", type: "table"}`, its
name the interface's translated "Table" at the moment it is written.

## Changes and who may make them

| Change | Where | Gate |
|---|---|---|
| add, rename, move, remove, change a view; open another | the block, through the live document | may edit the document (`editor.isEditable`; server: `canWrite` on the document for agents) |
| a reader's filter and sort | in the browser only (`unsaved`), or spec 013's personal state | may read the document |
| the database's properties | `PUT /api/collections/{id}` / `update_schema`, as today | may write the database |
| the database's views | unchanged by anything in a document | — |

Removing the last view is refused: the menu item is not offered, and an
agent's `delete_view` with `embed_id` answers "an embed keeps at least one
view".

## Spec 013 state attached to embed views

Spec 013's `view_prefs.scope` is `embed:<pageId>:<blockId>:<viewId>`; with
this spec `<viewId>` names the embed's own view. A personal state whose
view was removed from the embed is ignored when read, and removed with the
database (spec 013's cleanup). No change to spec 013's table.
