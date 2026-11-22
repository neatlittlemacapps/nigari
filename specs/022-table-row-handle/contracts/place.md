# Contract: putting a page before or after a sibling

Both doors call `placePage` (research R1).

## REST

`POST /api/pages/{id}/place` (auth)

```json
{ "after": "<sibling id>" }      // or
{ "before": "<sibling id>" }
// optional: "viewId": "<view id>" (must be a view of the database; kept for #870)
```

- `200 {"id": "...", "position": 12.5}`; a page placed next to itself, or
  already there: `200` with its position, nothing written.
- `400 invalid JSON`; `400 anchor_not_sibling` (not the same parent, trashed,
  missing or not readable); exactly one of `after` / `before`, else `400`.
- `404 page not found` without write access or through a credential that may
  not enter the workspace (as `PATCH`).

`POST /api/pages`: optional `after` / `before` in the body, same rules. The
anchor is checked before the insert, so a refused anchor creates nothing.

`POST /api/pages/{id}/duplicate`: no new body. A duplicated database row goes
right after its source on its own (a copy of anything else keeps its place at
the end).

## MCP

`update_page`: new optional `after`, `before` (a sibling page's id) and
`view_id`. With `parent_id` in the same call, the page moves under the new
parent first, then is placed among its new siblings.

`create_page`: new optional `after`, `before` (the view is `view_id` when given).

`duplicate_page`: a database row's copy goes right after its source, as on REST.

Description text: they set the page's place among its siblings (for a
database, its rows' order, which every view without a sort shows); they
change no view's sort; read-scoped keys are refused.

Activity log: the REST door writes `reorder_page` (actor `human`, `detail` =
side, anchor id, and the view when given). An agent's call is logged once, as
the tool call, by `mcpCall`; a page placed as it is created or duplicated is
part of that act and gets no second entry.
