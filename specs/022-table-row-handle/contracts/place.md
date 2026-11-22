# Contract: putting a page before or after a sibling

Both doors call `placePage` (research R1).

## REST

`POST /api/pages/{id}/place` (auth)

```json
{ "after": "<sibling id>" }      // or
{ "before": "<sibling id>" }
// optional, both doors: "viewId": "<view id>", "viewScope": "<scope>"
```

- `200 {"id": "...", "position": 12.5}`; a page placed next to itself, or
  already there: `200` with its position, nothing written.
- `400 invalid JSON`; `400 anchor_not_sibling` (not the same parent, trashed,
  missing or not readable); exactly one of `after` / `before`, else `400`.
- `404 page not found` without write access or through a credential that may
  not enter the workspace (as `PATCH`).

`POST /api/pages` and `POST /api/pages/{id}/duplicate`: optional `after` /
`before` in the body, same rules, applied after the insert. A duplicated
database row without them goes right after its source.

## MCP

`update_page`: new optional `after`, `before` (a sibling page's id) and
`view_id`. With `parent_id` in the same call, the page moves under the new
parent first, then is placed among its new siblings.

`create_page`: new optional `after`, `before`.

Description text: they set the page's place among its siblings (for a
database, its rows' order, which every view without a sort shows); they
change no view's sort; read-scoped keys are refused.

Activity log: `reorder_page`, actor `agent` or `human`, `detail` = the
anchor's id and side.
