# Data model: A view chooses how its pages open

No table or column changes.

- **View** (`collections.views`, JSON, existing): gains an optional key `openIn`:
  `"side_peek"` or `"center_peek"` (the latter refused until the follow-up ships).
  Missing means full page; `"full_page"` sent by a client is stored as missing. Not
  allowed on a `form` view. Copied whole by import/export and workspace blueprints.
- **Peek** (browser only, not stored): the row id shown beside the view. Lives in the
  address (`/p/{pageId}?peek={rowId}`) and in the history entry's state beside `tabs`
  and `active`.
- **Click decision** (browser only, computed): `rowOpenAction(click, openIn, prefs,
  wide)` → `navigate | new_tab | side | center` (research R3).

State transitions of a peek: closed → open (plain click on a row in a peek view, or a
load of an address with `?peek`) → another row (click another row: replace) → closed
(Escape, close button, Back, **Open as full page**, page change, page deleted or no
longer readable).
