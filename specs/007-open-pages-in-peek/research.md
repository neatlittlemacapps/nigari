# Research: A view chooses how its pages open

## R1. Where the setting lives and how it is spelled

**Decision**: A key on the view object in `collections.views` (JSON, existing column):
`"openIn": "side_peek"` or `"openIn": "center_peek"`. A missing key means full page;
`"full_page"` is accepted on the way in and stored as the missing key, so a view saved
before this feature and a view set back to full page are the same bytes. Agents pass
`open_in` with the same three values (`full_page`, `side_peek`, `center_peek`).

**Rationale**: Views are already JSON beside their filters and sort (`groupBy`,
`dateProp`, `hidden`). No schema change, no migration, and import/export
(`transfer.go`) and workspace blueprints (`from_workspace`) copy views whole, so they
carry the setting without a change. One spelling of the values on both doors, as
`sort` already does, so an agent learns one form.

**Alternatives considered**: a column on `collections` (one value per database, not per
view: wrong shape); an account preference like `openRowsNewTab` (the maintainer's
design for upstream #92, rejected by the owner on 2026-10-27); `"peek": true`
(cannot grow to the third value).

## R2. One validation for both doors

**Decision**: New `server/viewopen.go` with `checkViewOpenIn(view map[string]any) error`
and `normalizeViewsOpenIn(raw []byte) ([]byte, error)`. `applyViewSpec` (MCP
`set_view`) calls the first; `handlePutCollection` (REST `PUT /api/collections/{id}`)
calls the second on the views half before storing. Refused: an unknown value; any value
but full page on a form view (a form shows no rows); `center_peek` while
`centerPeekShipped` is false (FR-016). REST answers 400 with code `invalid_view_open_in`;
MCP returns the same sentence.

**Rationale**: REST stores the views array as sent today, with only a JSON check. A rule
on one side only is how this repository's past gaps started (`.claude/rules/mcp.md`):
one function, called by both doors.

**Alternatives considered**: validate in the browser only (an agent or a script could
store a value nothing honours); drop unknown values silently (an agent would believe a
setting took effect that did not).

## R3. Deciding what a click does: a pure module

**Decision**: New `web/src/peek.ts` with
`rowOpenAction(click, openIn, prefs, wide) → 'navigate' | 'new_tab' | 'side' | 'center'`:

| Click | View | Account "new tab" | Screen | Action |
| --- | --- | --- | --- | --- |
| ⌘/Ctrl or middle | any | any | any | new_tab |
| plain | full page | off | any | navigate |
| plain | full page | on | any | new_tab |
| plain | side peek | any | wide | side |
| plain | side peek | any | narrow | center (navigate until centre peek ships) |
| plain | center peek | any | any | center |

`openCollectionRow` in `pageOpen.ts` takes the view's `openIn` and an `onPeek` opener and
calls `rowOpenAction`. A check script `web/scripts/check-peek.mjs` asserts every row of
the table. "Wide" is the app's existing desktop breakpoint (`min-width: 901px`,
`App.tsx`).

**Rationale**: `.claude/rules/frontend.md`: decision logic lives in its own module with a
`check-*.mjs`, not inside `CollectionView.tsx` (2,947 lines). The table is the spec's
edge cases in one place.

## R4. Who owns the peek: the address

**Decision**: `App.tsx` owns `peekId` next to `currentId`. Opening a peek pushes
`/p/{pageId}?peek={rowId}` with `peek` in the history state beside `tabs`; closing it
goes back one entry if the peek pushed it, otherwise replaces the address without
`?peek`. `onPop` restores `peek` from the state, falling back to the query string. A
reload reads `?peek` (FR-008). The peek closes when the tab's page changes. Collection
views reach the opener through the existing `blockContext` / `PageOpeners` path as
`onPeek(rowId)`; embedded databases get it the same way, so the peek opens beside the
embedding page.

**Rationale**: Back closing the peek is the browser habit (spec Assumptions), and an
address that names the peek makes reload and copied links honest. Keeping the state in
`App` (the one owner of the address) avoids a second history writer.

**Alternatives considered**: peek state inside `CollectionView` (lost on reload; two
embedded views could each open one, against FR-005); a route `/p/{rowId}` with the view
drawn behind it (the view behind would need its own address).

## R5. What renders inside the peek

**Decision**: The ordinary `Editor`, mounted with `key={peekId}` inside a new
`web/src/components/PeekPanel.tsx`, with a new `container="peek"` prop. `Editor` already
supports a second instance on screen: `TemplateEditDialog` mounts one with `inDialog`.
In the peek the top bar keeps the page's own controls (favourite, comments, history,
the page menu) and replaces the sidebar button with **Close** and **Open as full page**.
`onMissing` (page deleted or no longer readable) closes the peek with a toast
(edge cases). Presence is keyed by page id (`presence.ts`), so two editors on two pages
do not collide.

**Rationale**: FR-004 asks for the full page. Reusing `Editor` keeps every page feature
in the peek without a second copy that drifts. `inDialog` becomes
`container: 'page' | 'dialog' | 'peek'`, one prop for one question.

## R6. The panel itself: a design-system component

**Decision**: New `web/src/ui/SidePanel.tsx` (+ `.css`): a non-modal panel fixed to the
right edge, `role="complementary"` with an `aria-label`, full height under the app bar,
width `min(50vw, var(--side-panel-width))`, a resize handle out of scope. It overlays the
view without dimming it and does not shift the view's layout, so the scroll position is
untouched (SC-002). On open, focus moves to the panel's heading; on close it returns to
the element that opened it (`nav.ts`). Escape closes it when no menu or dialog inside it
is open (`escapeTarget` from `modalKeys.ts`); it does not trap Tab, because the view
behind stays usable (FR-003).

New tokens (component tier, the way `dialog.*` is built): `side-panel.width` = 720px and
`side-panel.layer` = 90, above `layer.sticky` (50) and below `dialog.layer` (100) and
`layer.dropdown` (200), so dialogs and menus opened from inside the peek draw over it. A
primitive `layer.panel` was planned and dropped in implementation: `dialog.layer` is a
component value too, and one layer used by one component belongs in its tier. Shadow
`--shadow-overlay`. New catalogue section and README entry (`web/tests/catalog.mjs`).

**Implementation notes**: Escape ignores popups that are mounted but hidden (a closed
Select keeps its listbox in the DOM). The peek's Close and Open as full page buttons are
`ui/IconButton`s passed into `Editor` by `PeekPanel`, which `App` loads lazily: the
IconButton's tooltip would otherwise add about 13 KB gzip to the main chunk every page
pays for.

**Rationale**: The design-system surface: no hand-built panel inside `App.tsx`, no new
literals. The layer had to be new: `overlay` (300) would hide the peek's own menus.

**Alternatives considered**: shrinking the view to make room (moves every column and
loses the scroll position); `ui/Dialog` for the side peek (modal: the view behind would
be inert, against FR-003).

## R7. Center peek (follow-up pull request)

**Decision (changed 2026-10-27, owner chose option A)**: a design-system component of
its own, `ui/CenterPanel`: centred over the dimmed view, modal (`role="dialog"`,
`aria-modal`, Tab kept inside, a click on the dimmed view closes it), sharing focus and
Escape with `SidePanel` through `ui/panelBehaviour.ts`. Shipping it flipped
`centerPeekShipped` and `CENTER_PEEK_SHIPPED`, added the menu option, and turned a side
peek on a narrow screen into a centre peek. The address adds `&as=center`.

**Rationale**: the plan said `ui/Dialog`. Dialog joins the modal coordinator
(`useExclusiveModal`), which closes every other modal when one opens, and the page inside
a peek opens its own (version history, share): each would have closed the peek that
opened it. `side-peek.mjs` opens Version history from a centre peek and fails with
Dialog's behaviour.

**Alternatives considered**: B, `ui/Dialog` plus letting coordinated modals stack
(changes the one-modal rule of #134 for the whole app); C, no centre peek.

## R8. The setting in the interface

**Decision**: The view options menu (`⋯` in the toolbar, `CollectionView.tsx`) gains an
**Open pages in** group of native radios (Full page, Side peek), hidden for form views.
Built in a new module `web/src/components/ViewOpenMenu.tsx` that the big file imports.
Choosing closes the menu and saves through the existing view save (`PUT
/api/collections/{id}`, views half).

**Rationale**: That menu is already "settings for the current view"; the setting sits
beside rename and move. Radios rather than menu buttons: one choice out of a few is a
radio group, the arrow keys come for free, and menus are not in `web/src/ui/` yet, so
buttons would raise the raw-button count that may only go down.

**Changed in implementation**: the plan said "hidden for readers". The collection view
has no notion of the reader's role today (rename, move and remove are offered to
everyone, and the server refuses a reader's save). The setting follows the same rule
rather than inventing a role check for one entry.

## R9. Performance

No query, no route, no extra request: the setting arrives with the views that the
collection load already returns. Opening a peek costs what opening the page costs
today (one page load and one Yjs connection), and closing it unmounts the editor
without reloading the view's rows (SC-005). Bundle: two small modules and a CSS file;
measured against the `bundleGzip` cap 590,146 B in the PR.
