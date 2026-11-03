# Contract: REST

## Lock (PR 1)

`PUT /api/collections/{id}/lock` → `{"viewsLocked":{"by","byName","at"}}`
`DELETE /api/collections/{id}/lock` → `{"viewsLocked":null}`

`auth` + `sessionOnly` + `canWriteReq`. A token gets the session-only refusal.
Audited as `views.lock` / `views.unlock`.

`GET /api/collections/{id}` gains `"viewsLocked": {…} | null`.

## Views save while locked

`PUT /api/collections/{id}` with a `views` half that differs from the stored
one, while locked:

```json
{ "error": "this database's views are locked; unlock them to change a view", "code": "views_locked" }
```

HTTP 409. A schema-only save, or a views half identical to the stored one,
passes.

## Personal state (PR 2)

`GET /api/collections/{id}/personal` → `{"states": {"<scope>": {…}}}`
`PUT /api/collections/{id}/personal/{scope}` body: the state → the stored state
`DELETE /api/collections/{id}/personal/{scope}` → `{"ok":true}`

`auth` + `sessionOnly` + `canReadReq`. Only the caller's own rows. A scope
naming a view that is not in the database (or an embed in a page the caller
cannot read) → 404.

## New errors

`views_locked` 409; `invalid_view_quick_filters` 400;
`invalid_view_sub_group` 400. Each has an entry in `web/src/serverErrors.ts`.
