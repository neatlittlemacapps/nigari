# REST contract

## PUT /api/collections/{id}

Unchanged shape. Each object in `views` may carry `openIn`:

| Value | Meaning |
| --- | --- |
| missing, or `"full_page"` | a click navigates (today's behaviour); stored as missing |
| `"side_peek"` | a click opens the row beside the view |
| `"center_peek"` | refused until the follow-up ships (400) |

Refusal: 400 `{"error": "…", "code": "invalid_view_open_in"}` for an unknown value, for
any value but full page on a `form` view, and for `center_peek` while unshipped.
Nothing is stored (neither half of the request).

## GET /api/collections/{id}

Unchanged: views are returned as stored, so `openIn` appears where set.
