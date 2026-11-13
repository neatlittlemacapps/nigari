# Research: A row's page manages its database's properties

Decisions for spec 015, with the options turned down. What the code does
today is in the plan's CodeGraph section.

## R1. Where a property's visibility lives

**Decision**: an optional key on the property in the database's schema,
`pageVisibility`, one of `"hide_empty"` or `"hide"`. Absent means *Always
show*; *Always show* is written by removing the key, never as a third value.

**Why**: the owner chose one setting for the database (Clarifications, Q2),
and the schema is the database's description of its properties. Absent =
shown keeps every existing property as it is with no upgrade step, the same
reasoning as `colOrder` (spec 012 R3) and `quickFilters` (spec 013). The
server keeps a property's unknown keys already (it stores the schema as
sent, and `update_schema` merges maps), so blueprints, exports and copies
carry it without code.

**Turned down**: a list of hidden ids on the database (a second place to
keep in step when a property is removed, the problem view `hidden` lists
already have); a column on `collections` (an upgrade step for one flag per
property); per person (owner, Q2).

## R2. One rule for the value, on both doors

**Decision**: `checkPropertyVisibility(schema)` in `server/propvisibility.go`,
called by `handlePutCollection` when a schema is sent and by
`mcpUpdateSchema` on the merged schema. Anything but the two values (or
absent) is refused: REST `400 invalid_property_visibility`, MCP an error
naming the property and the allowed values.

**Why**: the REST route stores the schema without looking inside it today,
so without this a script could store a value the page cannot honour (the
same reason `normalizeViews` checks views, spec 007/012). One function,
both doors (constitution III).

**Turned down**: checking in the browser only (agents and scripts skip it);
folding it into `normalizeSchema` (only the MCP path calls that).

## R3. The menu and its functions (spec 010)

**Decision**: the property's name on the row's page becomes a `ui/Menu`
trigger, opened like a table heading's (`ColHead`): click, right-click, and
the keyboard. Items and functions:

| Item | Function | Icon |
| --- | --- | --- |
| Rename | `rename` (exists) | TextCursorInput |
| Edit property | `editProperty` (new) | SlidersHorizontal |
| Property visibility ▸ Always show / Hide when empty / Always hide | `rowPageVisibility` (new); the three are `MenuValues` | EyeDashed |
| Duplicate property | `duplicate` (exists: make a copy) | CopyPlus |
| Delete property | `delete` (exists: gone from here, not to the trash) | CircleMinus |

The submenu is called **Property visibility** as in Notion, but it is not
the view Settings' `propertyVisibility` (columns shown in one view): a
different function, so a different icon (rule 14). The label on the row's
page reads "Property visibility"; the view Settings item keeps its own.

**Turned down**: reusing `propertyVisibility` (two functions on one icon:
`check-menu-icons.mjs` refuses it, rightly); `editProperties` (Rows3) for
Edit property (that is the whole-schema dialog).

## R4. Edit property: one panel, the dialog's parts

**Decision**: a `ui/Popover` beside the name holds that one property: name,
type, and the type's settings. The fields come from `SchemaEditor` by moving
them into `web/src/components/PropertyFields.tsx` (name + type row,
`renderConfig`, the options editor, `PersonConfig`, `WhereValue`), which
`SchemaEditor` then renders per row as before. Saving is the panel's own:
changes are saved when the panel closes (Escape or a click outside), as
Notion does; a type change is saved at once. Delete property at the panel's
foot runs R6's confirmation.

**Why**: owner Q1 (A). Moving the fields keeps one implementation of each
type's settings; the dialog and the panel cannot drift.

**Turned down**: a second copy of the fields (they would drift: options
colours, rollup conditions); opening the dialog at the property (owner Q1).

## R5. Every change starts from the stored schema

**Decision**: each action on the row's page (rename, edit, visibility,
duplicate, delete, add) fetches the database's config, applies its one change
to that schema by property id, and saves the **schema alone**
(`PUT /api/collections/{id}` with `schema` only), except delete, which also
sends the views tidied by R6. Pure functions in `web/src/rowProperties.ts`:
`applyPropertyChange(schema, change)`, `duplicateProperty(schema, id, name)`,
`addProperty(schema, type, name)`, `visibleOnRowPage(schema, props, sticky)`.

**Why**: the row's page holds a copy of the schema from when it opened. Saving
that copy with one change would undo whatever was changed elsewhere since
(the bug `handlePutCollection`'s comment describes for views). Fetching first
narrows the window to one round trip; the spec accepts last-save-wins for
two people editing the same property at the same moment.

**Turned down**: saving the page's copy (loses others' changes); a server
route per action (four new routes and MCP doors for what `PUT` and
`update_schema` already do).

## R6. Deleting from the row's page is the dialog's delete

**Decision**: move two things out of `SchemaEditor` into
`web/src/propertyDelete.ts`: the confirmation text (#524, with the relation
sentence) and the view tidying `save()` does (a removed property leaves the
views' filters, sort, hidden lists; a board or calendar regroups). Both the
dialog and the row's page call them. While the views are locked, the schema
is sent alone and a property a locked view uses is refused by the server as
today (`property_in_locked_view`), shown with its sentence.

**Why**: FR-005: the same confirmation and the same consequences wherever a
property is deleted.

## R7. Visibility on the page

**Decision**: `visibleOnRowPage` decides each property's place: shown, or in
the fold. *Hide when empty* uses the same emptiness rule the cells use for
"Empty" (#269). The set of properties hidden by *Hide when empty* is taken
when the page opens and kept while it stays open (spec US3.4: a field does
not vanish under the cursor); a property filled in while open stays shown.
The fold ("N more properties" / "Hide N properties") is component state:
not stored, closed on every page change. Shown hidden properties carry a
muted eye-dashed mark beside their name.

**Turned down**: re-evaluating on every keystroke (fields jump); remembering
the fold per page in browser storage (the owner: "does not carry over").

## R8. Who sees the menu

**Decision**: the menu and **+ Add a property** appear when the row's page
is editable (`canEdit`, which already follows the database: rows are its
children). The server's `canWriteReq` on the database is the gate; a refusal
shows its toast and the page reloads the config.

**Known gap, filed, not fixed here**: a peek does not pass
`canWriteWorkspace` (handoff #21, section 12). That matters for spec 014's
Edit properties in an embed, not here: the row's own `canEdit` is right in a
peek.

## R9. Agents

**Decision**: no new tool. `update_schema` documents `pageVisibility` in its
description and its property shape; duplicating is adding a property with
the same keys; renaming and editing already work. A parity pair in
`parity_property_test.go`: "set a property's row-page visibility" by
`PUT /api/collections/{id}` and by `update_schema`, both read back with
`get_collection`. `update_schema` appends a new property at the end, so an
agent's duplicate lands last; the interface puts it after the original. The
order is not a capability, so this is not a gap.

## R10. One pull request

**Decision**: one PR: the server check and agent docs are small, and the
interface needs them. Build order: R2 (server, tests), R4/R6 moves (no
visible change, existing tests keep passing), then the row's page.
