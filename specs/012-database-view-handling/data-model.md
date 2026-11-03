# Data model: Database views read comfortably and handle the way people expect

## View column order (new, stored)

A table view's JSON (one entry of the collection's `views` array, stored with
the collection) gains one optional key, beside `colWidths`:

| Key | Type | Meaning |
|---|---|---|
| `colOrder` | `string[]` | Property ids in the order this view shows them. Missing or empty: the schema's order (today's behaviour). |

Rules (`checkViewColOrder`, called by `normalizeViews` for REST and by
`applyViewSpec` for MCP `set_view`, R4):

- Only on a `table` view. On any other type the request is refused
  (`invalid_view_column_order`).
- Must be an array of strings; anything else is refused with the same code.
- Ids that are not properties of the schema, and repeats, are dropped
  silently (a property deleted since is not an error).
- The title is not a property and is never in the list (it is always first).

Drawing (front end, `TableView`):

1. The ids of `colOrder` that exist and are not hidden, in that order.
2. Then every other visible property, in schema order (a property added after
   the order was set lands at the end, as it does today).

A hidden property keeps its place in `colOrder`, so showing it again puts it
back where it was.

No upgrade step (R3): no stored view is rewritten.

## Menu functions (new, `web/src/menuIcons.ts`)

Each new function gets an icon no other function has; `check-menu-icons.mjs`
decides uniqueness, and the names below are proposals the build confirms.

| Function | Where | Proposed icon |
|---|---|---|
| `hideInView` | column header menu | `EyeOff` |
| `propertyVisibility` | Settings › Property visibility | `Eye` |
| `openRowsIn` | Settings › Open rows in (submenu around today's radio group) | `PanelRight` |
| `timelineDates` | Settings › Start date / End date (timeline) | `CalendarRange` |
| `subItems` | Settings › Sub-items (table) | `ListTree` is taken (`tableOfContents`): `Network` |
| `editProperties` | Settings › Edit properties | `Rows3` |

`moveLeft`, `moveRight`, `rename`, `delete` exist and are reused with their
icons (the column header menu and the Settings menu both use them, as one
function keeps one icon everywhere).

## Board drop place (not stored)

While a card is dragged over column C:

- `dropIndex(cards in C, dragged card with its group value set to C, view sort)`
  → the index the card will take. With no sort, the board's row order.
- Over its own column: the card's own index.

Nothing is stored: on release the card's group value is written as today, and
the server's sort puts it where the marker was.
