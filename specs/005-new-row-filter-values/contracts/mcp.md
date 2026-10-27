# MCP contract

## create_page

New argument `view_id` (string, optional). Only with `parent_id` set to a database (or a
database template in `template_id`). Description text:

> view_id: the view the row is created "in". The row gets every value that view's
> filters pin to a single answer (Status is To do → Status = To do); `properties` you
> pass win over them. The answer says whether the row matches the view; if not, it will
> not show there.

The answer adds `matches_view: true|false`. When false, it adds one sentence: "The row
does not match the filters of view <name>, so it will not show there."

Refusals: a view that is not one of this database's views ("view %q is not a view of
database %q"); a read-only token (existing gate).

## create_rows

New argument `view_id`, with the same meaning, applied to every row. The view is loaded
once. The answer adds `matches_view` per row id (`{"created": n, "ids": [...],
"not_matching": [...]}`).
