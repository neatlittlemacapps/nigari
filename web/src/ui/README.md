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
| `Button` | any action with a label | navigation (use a link) | `button` |
| `IconButton` | an action shown only as an icon | anything that needs words to be understood | `icon-button` |
| `Dialog`, `DialogClose` | a task that takes over the screen until done or cancelled | a question with two answers (`AlertDialog`) | `dialog` |
| `AlertDialog` | "Delete this?" and other yes/no questions | forms | `dialog` |
| `Field`, `Input` | a labelled text field | a choice from a list (`Select`) | `field` |
| `Checkbox` | a choice that is saved later, alone or in a group | a setting that applies at once (`Switch`) | `checkbox` |
| `Select` | one value from a short, fixed list | a long or searchable list (Combobox, later batch) | `select` |
| `Switch` | an on/off setting that applies at once | a choice saved with a form (`Checkbox`) | `switch` |

## Button

`variant`: `primary` (the ink pill, at most one per screen), `secondary` (the default, a
hairline), `ghost` (no frame, for toolbars), `danger` (removes something).
`size`: `md` (34px, today's `.btn`) or `sm` (today's `.btn-sm`). `shortcut`: an id from
`keys.ts`; its live chord follows the label and disappears when unbound. Everything else
is a `<button>` prop; `type` defaults to `button`.
States: `data-disabled`, `:hover`, `:focus-visible`, `:active` (the pill drops back).

## IconButton

`label` (required, translated): the accessible name, and the tooltip on hover and
keyboard focus. `icon`: the icon node (lucide). `variant`: `ghost` (default),
`secondary`, `danger`. `size`: `md` or `sm`.

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
