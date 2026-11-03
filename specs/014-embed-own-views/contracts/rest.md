# Contract: REST

No new route. An embed's views travel in the document, which the browser
writes through the live editor and `PATCH /api/pages/{id}` (unchanged).

## POST /api/pages (changed)

| Field | Meaning |
|---|---|
| `viewFilters` | the filters of the embed view the row is made in, as the person sees them (research R5). With a database as parent only; not together with `viewId` |

The server pins from them (`pinsForFilters`) and answers `matchesView` from
them. Both fields → 400 `view_not_in_database` ("Send viewId or
viewFilters, not both.").

## POST /api/collections/{id}/from-template (changed)

Takes `viewFilters` the same way.

## POST /api/collections/{id}/aggregate (unchanged contract)

An embed's chart sends `groupBy`, `period`, `aggregate`, `aggregateProp`
and `filters` with no `viewId` (research R6). Explicit settings are checked
by the same rules as a chart view's; refusals stay `invalid_chart` (400).

## PUT /api/collections/{id} (unchanged)

The Properties dialog in a document saves here after its confirmation
(FR-012). No server change: the confirmation is the interface's.

## Errors

No new code.
