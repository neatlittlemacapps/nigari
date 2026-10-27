# MCP contract

## set_view

New argument `open_in` (string, optional): `full_page`, `side_peek` (and `center_peek`
once shipped). Description text:

> open_in: how a click on one of this view's rows opens it for people: full_page
> (navigate, the default), side_peek (a panel beside the view, which stays usable).
> Not for form views, which show no rows.

Merges like every other field: omitted keeps the stored value, `full_page` clears it.

Refusals (same sentences as REST): an unknown value ("open_in must be full_page or
side_peek"); a form view ("a form view shows no rows, so it has no open_in");
`center_peek` before the follow-up ("center_peek is not available yet"). A read-scoped
token is refused by the existing gate.

## get_collection

Unchanged answer shape: views are returned whole, so `openIn` appears where set. The
description gains one clause naming the key.
