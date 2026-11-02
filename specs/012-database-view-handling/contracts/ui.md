# Contract: interface

## Table

- `.db-table td`: `font-size: var(--font-size-md)`; `.db-table th`:
  `var(--font-size-sm)`.
- A property column header: click on its label opens its menu (Move left,
  Move right, Hide in view); a drag from its label (5px) moves it, with a
  marker on the nearest gap; the resize handle on its edge keeps resizing; the
  title column neither moves nor has these.

## Board

- The column under a dragged card: target style from tokens. A placeholder
  the card's height at `dropIndex(...)`. No transition under reduced motion.

## Toolbar (database page)

`[view tabs] … [Filter] [Sort] [Search] [Settings ⚙] [New ▾]`

- **Settings**: icon-only `IconButton`, sliders icon, tooltip and accessible
  name "Settings", `aria-haspopup="menu"`. Opens one `ui/Menu`
  (`narrow="sheet"`): see research R8 for its items.
- `ui/Menu`'s `MenuSubmenu` gains `value?: ReactNode`, drawn muted on the
  right before `›`.
- Gone from the toolbar: **Properties**, **⋯ View options**, the timeline's two
  `<select>`s, the table's sub-items `<select>`, **Columns**.

## Toolbar (database in a document)

- No Settings button (R10), as there is no Properties or ⋯ today.
- Its control group: `opacity: 0` at rest, shown on `:hover`,
  `:focus-within` and while one of its menus is open; always shown under
  `@media (hover: none)`. The view tabs and a "Filtered"/"Sorted" marker stay.

## New strings (English source, `de`/`es`/`nl`)

Settings · View settings · Database settings · Property visibility · {n} of
{total} · Open rows in · Start date · End date · Sub-items · Edit properties ·
Hide in view · Filtered · Sorted · "Open Settings, then Edit properties, to
add one" (board empty state, replacing the "⚙ Properties" sentence) ·
"{name} view settings" (the menu's accessible name).
