# REST: POST /api/pages/{id}/edits

Behind `auth` (sessions and tokens). Read-scoped tokens refused like every write.

Request:

```json
{ "edits": [ { "old": "Launch is on 3 March", "new": "Launch is on 10 March" } ],
  "allowRemovals": false }
```

`200` → `{ "ok": true, "applied": [1] }`

Refusals (body from `httpErrorCode`: `{ "error": "<sentence>", "code": "<code>", … }`):

| Status | Code | When |
|---|---|---|
| 404 | — | no page, or no write access (same as `PATCH`) |
| 409 | — | page in the trash (same answer as `PATCH`) |
| 409 | `edit_stale` | page changed between read and write |
| 422 | `edit_no_match` / `edit_ambiguous` | with `edit`, `matches` |
| 422 | `edit_removes_link` | with `edit`, `removed` |
| 422 | `edit_unsupported_block` | with `edit`, `blockType` |
| 400 | `edit_empty_quote` / `edit_too_many` | request shape |
