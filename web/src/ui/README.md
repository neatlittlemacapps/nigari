# web/src/ui — the component layer

Spec 001 (`specs/001-design-system/`). Behaviour comes from
[Base UI](https://base-ui.com) 1.9.0: focus, keyboard, ARIA, dismissal and
positioning. The look comes only from the design tokens (`web/tokens/` →
`web/src/tokens.css`).

**Rules for every component**
- **No English text of its own.** Every string arrives through props, already
  `t()`-translated by the caller (FR-008).
- **State is a `data-*` attribute** (`data-disabled`, `data-checked`,
  `data-highlighted`, `data-open`), styled in CSS. No class names computed in
  JavaScript (FR-009).
- **Styles read only `var(--…)` from `tokens.css`.** `check-tokens.mjs` counts
  literals against budgets that only go down.
- **Import the component's own module** (`../ui/Button`), not a barrel file,
  so a screen ships only the components and CSS it uses.

**The catalogue**
- **What it shows:** every component in every state, in light and dark,
  rendered on `tokens.css` alone.
- **How to open it:** `npx vite --config vite.catalog.config.ts`, then
  `/catalog.html`. Source in `web/catalog/`.
- **Its test:** `web/tests/catalog.mjs` runs axe and checks the keyboard (both
  fail the test), and compares each section with reference shots drawn on the
  same machine (a difference is reported, not failed). Locally:
  `UPDATE_BASELINES=1 node web/tests/catalog.mjs` before a change, then
  `node web/tests/catalog.mjs` after it. In CI the reference is the base
  branch, drawn on the same runner.

| Component | Use it for | Not for | Catalogue |
| --- | --- | --- | --- |
| `Button` | any action: with a label, or only an icon (then it must have a `label`, shown as a tooltip) | navigation (use a link) | `button` |
| `Dialog`, `DialogClose` | a task that takes over the screen until done or cancelled | a question with two answers (`AlertDialog`) | `dialog` |
| `AlertDialog` | "Delete this?" and other yes/no questions | forms | `dialog` |
| `Field`, `Input` | a labelled text field | a choice from a list (`Select`) | `field` |
| `Checkbox` | a choice that is saved later, alone or in a group | a setting that applies at once (`Switch`) | `checkbox` |
| `Select` | one value from a short, fixed list | a long or searchable list (Combobox, later batch) | `select` |
| `Switch` | an on/off setting that applies at once | a choice saved with a form (`Checkbox`) | `switch` |
| `Tabs` | one of several views of the same place (a dialog's sections, a library's modes) | a choice that changes a value (`ToggleGroup`); going somewhere else (a link) | `tabs` |
| `ToggleGroup` | a short row of choices, one or several, that applies at once (theme, role, chips) | a long list (`Select`); one on/off setting (`Switch`) | `toggle-group` |
| `SidePanel` | content beside a screen that must stay usable (a row's peek) | a task that takes over the screen (`Dialog`) | `side-panel` |
| `CenterPanel` | content over a dimmed screen that may open dialogs of its own (a row's centre peek) | a task with a footer of actions (`Dialog`) | `center-panel` |
| `Popover` | settings that apply at once, anchored to the button that opened them, with the screen still in view (a chart's settings) | a task that takes over the screen (`Dialog`); a list of commands (`Menu`) | `popover` |
| `Menu` and its parts | every list of actions, opened from a button or a right-click | settings that apply at once (`Popover`); one value from a fixed list in a form (`Select`) | `menu` |
| `CellAction` | a small action at a table cell's end, over its text, shown on hover or focus (a row's Open) | an action that is always the main one on a screen (`Button`); a list of actions (`Menu`) | `cell-action` |
| `FileList` | the files of one value: `compact` in a cell or a card, `full` on a row's page or in an editor, with open, remove and reorder | files in a document (the editor's file blocks); a list of actions (`Menu`) | `file-list` |
| `FileDrop` | adding files: a button that opens the picker, a drop target, each upload's progress or refusal | one file as a page (Import); an image for an icon or a cover (their own pickers) | `file-drop` |

## Button

One button, set by properties (spec 020). Never style a button with a class of its own:
a look that is missing is a new property value with its tokens.

**Props**
- `emphasis`: how much it stands out.
  - `high`: filled. The main action, at most one per screen.
  - `medium` (default): an outline.
  - `low`: a background on hover only, for toolbars and rows.
  - `link`: text only, no height.
- `tone`: what it does.
  - `neutral` (default).
  - `primary`: the accent.
  - `destructive`: deletes or removes something; a red outline at medium (owner, Q1).
- `size`: `md` (default, `--button-height-md`, lines up with inputs), `sm` (toolbars,
  dense rows) or `xs` (24px, an action inside a table cell, through `CellAction`; 30px on a
  touch screen that cannot hover).
- `icon?`: shown before the label. Without children the button is a square holding only
  the icon, and `label` (translated) is required: its accessible name and its tooltip.
- `pressed?`: a toggle that stays on. It sets `aria-pressed` and shows the faint primary
  tint, whatever the tone (owner, Q2). Leave it undefined for a plain button.
- `shortcut?`: an id from `keys.ts`. Its live chord follows the label and disappears when
  unbound.
- Everything else is a `<button>` prop; `type` defaults to `button`.

**Which to use**
- **The screen's main action** (Save, Create): `high`.
- **Its other actions** (Cancel, Export): the default.
- **Toolbars and row actions**: `low`, usually `sm`, often icon-only.
- **Delete**: `tone="destructive"`; in a confirm dialog the confirm button is that.
- **Never a raw `<button>`**, except a control BlockNote renders inside its own blocks: it
  carries `{/* button-ok: <reason> */}` on its line or the one above, and `check-tokens.mjs`
  counts it apart (`markedButtons`). A raw button inside a card, a row or a picker waits
  for that component (#763).

**Look**
- Every value is a token (`--button-*` in `component.tokens.json`) or a colour role of
  spec 019; one radius for every button.
- The label is centred by a fixed height and `text-box: trim-both cap alphabetic`.
- States: `data-disabled`, `:hover`, `:focus-visible`, `:active`, `data-pressed`.

**From the old props**

| Old | New |
|---|---|
| `variant="primary"` (the ink pill) | `emphasis="high"` |
| `variant="secondary"` | the default |
| `variant="ghost"` | `emphasis="low"` |
| `variant="danger"` | `tone="destructive"` |
| `IconButton` | `Button` with `icon` and `label`, `emphasis="low"` |

## Dialog

**Props**
- `title`: the dialog's accessible name.
- `description?`
- `onClose`
- `size`: `sm` 400px, `md` 520px, `lg` 680px.
- `footer?`
- `returnFocus?`: where focus goes on close, when the element that opened the dialog
  goes away with the opening (a menu item).
- `className?`

**Behaviour**
- Mounted means open: render it while it should show, and drop it in `onClose`.
- It takes part in `useExclusiveModal`, so opening it closes any other modal.
- Focus is trapped. Escape and a click outside close it. Focus returns on close.

**Closing**
- There is no close button of its own; today's dialogs close through their footer.
- Wrap the footer's dismiss action in `<DialogClose>` (`<DialogClose><Button>Cancel</Button></DialogClose>`).
  Base UI needs one inside the popup so a touch screen reader can always leave.

**States:** `data-open`, `data-starting-style`, `data-ending-style`.

## AlertDialog

**Props:** `title`, `description`, `confirmLabel`, `cancelLabel`, `danger?`, `onConfirm`,
`onClose`.

**Behaviour**
- It does not close on a click outside.
- With `danger`, focus starts on Cancel.
- It layers over an open `Dialog`: it does not take part in `useExclusiveModal`.

## Field and Input

`Field`: `label`, `hint?`, `error?`, `disabled?`, `children` (the control). The label is
linked to the control; hint and error are announced through `aria-describedby`.
`Input`: Base UI's input (`value` + `onValueChange`, or `defaultValue`).
States: `data-invalid`, `data-disabled`, `data-focused`, `data-filled`.
`variant`: `default`, or `cell` for a value typed in place in a table cell (spec 026): it
fills the cell flat, a lighter fill (`--color-surface-raised`) and a thin rounded outline,
no lift or shadow, in the cell's own text size, so the row keeps its height. The cell gives
up its padding to it. The table's row name uses it.

## CellAction

A small button at the end of a table cell, over the cell's text (spec 026): the table's
Open, and Close for the row open in the peek.

**Props**
- `children`: the word, translated ("Open").
- `label`: the accessible name, translated, naming the item ("Open Roadmap review").
- `pinned?`: always shown.
- `onClick`, `onAuxClick?` (the middle button).

**Behaviour**
- Its host is the nearest ancestor with `data-cell-action-host` (a table row). It shows while
  the host is hovered or holds the focus, always on a touch screen that cannot hover
  (`(hover: none)`, with a 44px tap area), and always when `pinned`. `data-editing` on the
  host hides it.
- Hidden is `opacity: 0`, not removed: it stays in the tab order, so Tab from the cell
  reaches it and the focus then shows it.
- Shown or hidden is CSS, never state: a table of thousands of rows adds no listener per row.
- It is placed in the nearest positioned ancestor (the cell, `position: relative`), on the
  raised surface, so a long text is cut off under it and the row's height does not change.
- It is a `Button` of `size="xs"`, medium emphasis.

## FileList

The files of one Files & media value (spec 028).

**Props**
- `label`: the list's accessible name, translated (the property's name).
- `items: { url, name, image }[]`: `image` draws the file as its own thumbnail; the caller
  decides it (`filesValue.ts`), so the component reads no stored value.
- `variant="compact"`: `max?` (3), `moreLabel(count)` ("+2", translated).
- `variant="full"`: `openLabel(name)`, `removeLabel?(name)` with `onRemove?(index)`,
  `onMove?(from, to)`.

**Behaviour**
- Compact is one line: thumbnails, file chips cut off at `--file-list-chip-max`, then "+N".
  It is not a control itself; the cell or card around it is.
- Full is one row per file. The name is a link that opens the file in a new tab. With
  `onRemove`, a Remove button (`delete` icon, gone from the value, not into the trash). With
  `onMove`, rows are dragged into place, or moved with ⌘/Ctrl+↑/↓ on the name, which keeps
  the focus.
- An image in the compact list has no visible name; a screen reader reads it, and the title
  shows it on hover.

## FileDrop

Adding files (spec 028).

**Props**
- `label` ("Add files"), `dropLabel` ("Drop files here"), `progressLabel(name)` ("Uploading
  {name}"), all translated.
- `onFiles(files)`: the files chosen or dropped. Uploading them is the caller's.
- `uploads?: { key, name, progress?, error? }[]`: a bar while `progress` runs (0–1), the
  translated refusal in its place once `error` is set (`role="alert"`).
- `multiple?` (true), `accept?`, `disabled?`.

**Behaviour**
- The button opens the file picker (the `addFiles` icon); the input itself is hidden and out
  of the tab order. Choosing the same file twice in a row still arrives.
- The whole control is a drop target: files dragged over it light it (`data-over`) and show
  `dropLabel`. A drop does not reach the cell, card or editor under it.

## Checkbox

`label`, `checked`, `onCheckedChange`, `description?` (a quieter trailing chip, such as an
event name), `disabled?`. The whole row is the click target; Space toggles.
States: `data-checked`, `data-unchecked`, `data-disabled`.

## Select

`label`, `options: { value, label }[]`, `value`, `onValueChange`, `disabled?`.
Arrow keys move, a typed letter jumps, Enter picks, Escape closes and returns focus.
States: `data-popup-open` (trigger), `data-highlighted` and `data-selected` (items).

## Switch

`label`, `checked`, `onCheckedChange`, `disabled?`. Space toggles.
States: `data-checked`, `data-disabled`.

## Tabs

`label` (the row's name), `value`, `onValueChange`, `items: { value, label, icon?, disabled? }[]`,
`children?` (the selected tab's content; leave it out when the content lives elsewhere).
Each tab is a Button in look (low, neutral, small); the selected one has the pressed
tint (spec 020, R6). Base UI gives `role="tab"` and `aria-selected`; the arrow keys
move and select, Home and End jump. States: `data-active`, `data-disabled`.

## ToggleGroup

`label` (the group's name), `items: { value, label, icon?, iconOnly?, disabled?, title?, rank? }[]`,
`size?` (`sm` default), `disabled?`, and either `value` + `onValueChange` (choose one) or
`multiple`, `value[]` + `onValueChange` (choose several). Choose one keeps a choice:
pressing the chosen item again does nothing. The items are Buttons in look (low,
neutral) inside a hairline frame, inset by `--button-group-inset`; a chosen item has
the pressed tint and is announced as pressed. An `iconOnly` item takes `label` as
its name and tooltip. A `rank` item (`none`, `viewer`, `member`, `admin`: a workspace role) is
filled in its level's colour when chosen (`--color-rank-*`, white text), not the tint: the
role choice shows how far the chosen role reaches (owner, spec 020). Arrow keys move
between items, Space or Enter presses.
States: `data-pressed`, `data-disabled`.

## SidePanel

**Props**
- `label`: the panel's accessible name, already translated.
- `onClose`
- `className?`
- `children`: the panel draws no bar or close button of its own; the content brings them.

**Behaviour**
- Mounted means open. Fixed to the right edge, `min(--side-panel-width, 38vw)` wide, full
  width below 901px. 38% so a table's Open and Close button stays beside it (owner,
  2026-11-26, `docs/decisions.md`; half the window before). Layer `--side-panel-layer`: over the page's sticky headers, under
  dialogs and menus, which open from inside it.
- Not modal: no backdrop, no focus trap, and the page beside it stays usable. It
  overlays rather than squeezes, so the page's layout and scroll position do not move.
- Focus moves into it on open and back to the opener on close.
- Escape closes it unless a menu, dialog or confirmation is open on top. In a text field
  the first Escape leaves the field and the second closes the panel.

**Used by:** the side peek (spec 007, `components/PeekPanel.tsx`).

## CenterPanel

**Props:** `label` (translated accessible name), `onClose`, `className?`, `children` (the
content brings its own bar and close button).

**Behaviour**
- Mounted means open. Centred over the dimmed page, `min(--center-panel-width, 100%)`
  wide and as tall as the window allows; full screen below 901px.
- Modal (`role="dialog"`, `aria-modal`): Tab stays inside it, and a click on the dimmed
  page closes it. The app's focus-moving shortcuts stand down while it is open.
- Not `Dialog`: it does not join `useExclusiveModal`, so dialogs the content opens
  (history, share) draw over it instead of closing it. Its layer
  (`--center-panel-layer`, the side panel's) is under dialogs and menus for that reason.
- Focus and Escape as `SidePanel` (shared in `panelBehaviour.ts`).

**Used by:** the centre peek (spec 007, `components/PeekPanel.tsx`).

## Popover

**Props**
- `trigger?`: the element that opens it (usually a `Button`).
- `anchor?`, `returnFocus?`: for a panel another control opens (a menu item): what it is
  placed against and where focus goes on close. Use with `open`/`onOpenChange` and no
  `trigger` (spec 015: a property's Edit property panel beside its name).
- `label`: the panel's accessible name.
- `closeLabel`: the name of its hidden close button.
- `open?`, `onOpenChange?`: controlled use; omit both and the trigger opens and closes it.
  `onOpenChange` gets Base UI's details: `details.cancel()` keeps it open (a press in an
  editor the panel portals out).
- `trapFocus?` (`true`): `false` for a panel whose own editors open outside it.
- `side?` (`bottom`), `align?` (`end`).
- `className?`

**Behaviour**
- Anchored to the trigger and kept on screen. Width: `--popover-width`, capped at the window.
- Layer `--popover-layer` (150): over dialogs and peeks, under the lists of a `Select` inside it.
- Focus moves in and is trapped; the page behind is not made inert and keeps updating.
- Escape and a click outside close it; focus returns to the trigger. A `Select` inside opens
  and picks without closing it, and Escape on an open list closes only the list.
- A visually hidden close button is rendered for touch screen readers (Base UI's requirement).

## Menu

Spec 010. Every menu in the app is built from these parts; `check-menu-icons.mjs`
fails on a menu built by hand.

**The icon rule.** An item names its **function** (`fn="duplicate"`), never an
icon. The icon comes from `web/src/menuIcons.ts`, so one function looks the same in
every menu and two functions never share a picture. A new function gets a new key
there with an icon no other key has; the check refuses a shared one. The icon is
decoration (`aria-hidden`); the label is what a screen reader reads.

**Parts**
- `Menu`: `trigger` (the button), `label` (the popup's accessible name, translated),
  `side?`/`align?` (`bottom`/`end`), `open?`/`onOpenChange?` (controlled use),
  `anchorPoint?` (`{x, y}`: opens at a right-click; the same menu as the button's,
  one list of items), `narrow?="sheet"` (a full-width sheet along the bottom at phone
  width, `SHEET_MAX_WIDTH` in `anchoredMenu.ts`; the database toolbar menus use it).
- `MenuItem`: `fn`, `onClick`, `danger?`, `disabled?` (keeps its icon), `filled?`
  (the favourite star's on state), `chord?` (a shortcut hint; never replaces the
  icon), `opensDialog?` (closes the menu, then opens the dialog on the next frame, so
  focus comes back to the trigger when the dialog closes).
- `MenuCheckboxItem`: `fn`, `checked`, `onCheckedChange`. Same icon on and off, a
  tick when on.
- `MenuSubmenu`: `fn`, `label`, `value?` (the setting's current value, muted on the
  right before `›`: the Settings menu's "Open rows in  Side peek ›"). Opens with →
  or a hover.
- `MenuValues` (`reason`, required) with `MenuValueItem`s: a list of values (the
  workspaces under "Move to", a database's templates). Values carry no function
  icon; `icon?` on a value is content, such as a page's own icon.
- `MenuRadioGroup` / `MenuRadioItem`: one choice among a few, inside a menu. An item may carry an `icon` (content, such as a view type's icon in Layout).
- `MenuLabel`, `MenuSeparator`.

**Behaviour** (Base UI): Enter, Space or ↓ on the trigger opens it on the first item;
↑/↓ and Home/End move; typing jumps to an item; →/← open and close a submenu; Escape
or a click outside closes it and focus returns to the trigger. Layer
`--layer-dropdown` (200): over dialogs and peeks. Icons at `--menu-icon-size`.

**Not a menu:** a colour picker, a share panel, a person or row picker. They may wear
the menu's look until spec 001's popover batch, marked
`data-menu-exempt="<why>"` so the check knows.

