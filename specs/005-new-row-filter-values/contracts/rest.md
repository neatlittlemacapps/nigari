# REST contract

## POST /api/pages

New optional field: `viewId` (string). It only applies with a `parentId` that is a
database.

- `viewId` names a view of that database → pins are applied under `props`; the response
  page JSON gains `"matchesView": true|false`.
- `viewId` names no view of that database → `400 {"error": "…", "code":
  "view_not_in_database"}`, nothing created.
- `viewId` without a database parent → `400`, same code.
- Gates are unchanged and run first: `403` without write access.

## POST /api/collections/{id}/from-template

New optional field: `viewId`, with the same rules. Precedence: template, then pins, then
`props`.
