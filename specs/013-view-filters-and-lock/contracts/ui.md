# Contract: interface

## Lock (PR 1)

- Settings › Database settings: **Lock views** (`lockViews`) or **Unlock
  views** (`unlockViews`), for people who can edit.
- Locked: a lock marker beside the view tabs ("Views locked", with who and
  when in its tooltip). Not offered while locked: Settings' view items,
  add view, the view tab's menu, the header menu's Move and Hide, column
  drag and resize, a board's grouping. Filter and sort stay (personal).
- A `views_locked` refusal (another person locked meanwhile) shows its
  translated sentence as a toast and reloads the views.

## Personal changes (PR 2)

- A filter or sort edit is personal. The bar, above the view, in light and
  dark: "Only you see these changes" · **Reset** (`resetView`) · **Save for
  everyone** (`saveViewForEveryone`, only for someone who can edit and while
  not locked). Buttons in tab order.
- Embeds: the same bar inside the embed.

## Quick filters (PR 3)

- Settings › **Quick filters** (`quickFilters`): a submenu of
  `MenuCheckboxItem`s per filterable property.
- Chips above the view, one per quick filter: the property name, or "Name:
  value" when picked; a tap opens a `ui/Menu` of values; a picked chip has a
  clear button. Keyboard: chips are buttons; Escape closes the menu.

## Lanes (PR 3)

- Settings › **Sub-group** (`subGroup`) for boards: a `MenuRadioGroup` of
  groupable properties and "None".
- One lane per value, header with name and count and a fold button
  (`foldLane`); a "No value" lane last. Drag between cells sets both values;
  spec 012's marker inside the cell.

## New strings (English source, de/es/nl)

Lock views · Unlock views · Views locked · Locked by {name} on {date} ·
This database's views are locked · Only you see these changes · Reset ·
Save for everyone · Quick filters · Clear {name} · {name}: {value} ·
Sub-group · None · No value · Fold lane · Unfold lane · View created · View
deleted · View renamed · View changed · Views locked by {name} · Views
unlocked by {name} · and the three error sentences.
