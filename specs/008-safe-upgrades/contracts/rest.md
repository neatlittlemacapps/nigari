# REST: the admin's view of upgrades

`GET /api/admin/info` (admin, unchanged gate) gains one field:

```json
"upgrade": {
  "step": 1,
  "newest": 1,
  "lastAt": "2026-10-29T07:12:03Z",
  "copies": [
    { "name": "salt.db.before-step-1", "size": 1843200, "takenAt": "2026-10-29T07:12:02Z" }
  ]
}
```

- `step`: the database's step number; `newest`: the newest step this binary knows. After
  a normal start they are equal.
- `lastAt`: when the newest applied step ran; empty for a database that never ran one.
- `copies`: the pre-upgrade copies in the data directory, newest first, at most 3.

No other route changes. Agents: closed (`admin.instance`).
