# Research: A new row takes the values its view's filters pin down

## R1. Which filters pin a value, and to what

**Decision**: A filter pins a value when it is armed and its operator is `is` with
exactly one value (`value`, or `values` of length one), on a property that can be
written. The stored form follows the property type:

| Property type | Filter value | Pinned as |
| --- | --- | --- |
| select, status | option id | the id, if the option still exists |
| multiselect | option id | `[id]` |
| checkbox | `"true"` / `"false"` | `true` / `false` |
| number | `"5"` | `5` (a JSON number); not pinned if it does not parse |
| date | ISO date or a relative day | the resolved ISO date (`resolveSmartDate`, the rule the server filters with) |
| text, url, email, phone | the text | the text |
| person | user id | the id, or `[id]` when the property takes several |
| relation | page id | `[id]` |
| formula, rollup, created/edited time and by, unique id, files | — | never |

A property named by two filters is pinned only if both pin the same value. `is_empty`
pins nothing (a new row is empty already). Everything else (`is_not`, `contains`, `gt`,
`lt`, `between`, `is_not_empty`, `is` with several values) pins nothing and may leave the
row outside the view. US2 covers that case.

**Rationale**: A single answer is the only case where a value is unambiguous. Writing it
in the property's stored form is what #95 taught: the comparison is typed, so `"5"` as
text never matches `5`.

**Alternatives considered**: pick the lower bound of a range, or any value of a set. Both
would guess at what the person meant, and a guess stored as data stays.

## R2. Where the rule lives

**Decision**: Server, `server/viewpins.go`. REST and MCP send a view id; the server reads
the stored view.

**Rationale**: Constitution III (one function, every door) and FR-009. The browser
already has a filter matcher (`matchesFilter` in `CollectionView.tsx`), but a second
implementation of the pin rule there would drift from the agent path, the way the
number and checkbox filters once did (#95).

**Alternatives considered**: the client computes pins and sends them as `props`. It is
simpler, but agents would need the same logic in every client, and it breaks parity.

## R3. How "does the new row match" is decided

**Decision**: After the insert, run `SELECT 1 FROM pages WHERE id = ?` plus each of the
view's filters through `rowFilter.where()`, after `resolveSmartDates` and `typeFilters`,
on the writer.

**Rationale**: It is the exact rule `collectionRowsQuery` uses to fill the view, so the
answer cannot disagree with what the person then sees. It runs on the writer because
the read pool may not see the row yet.

**Alternatives considered**: a Go matcher over the props map. That would be a third
copy of the filter semantics, after the SQL and the browser matcher.

## R4. The notice

**Decision**: `toast(message, { label, run })`. The action is a `ui/Button` inside the
existing toast host, reachable by Tab, and the toast stays up a little longer when it
carries an action.

**Rationale**: The spec's assumption (no new component). Toasts are scheduled to join
`web/src/ui/` in spec 001 batch 2; building the action from `ui/Button` now means no new
raw `<button>` (the `rawButtons` budget only goes down).

**Alternatives considered**: a dialog. It is too heavy for an outcome the person caused
on purpose.

## R5. Templates

**Decision**: Order of precedence: template values, then pins, then explicit values.
`rowFromTemplate` copies the template, then applies pins merged under the caller's
props in one `mcpSetProperties` call.

**Rationale**: Spec FR-002/FR-003. One write keeps the activity log to a single entry,
as today.
