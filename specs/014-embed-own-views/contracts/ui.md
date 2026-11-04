# Contract: interface

## Embed toolbar and tabs

- Tabs are the embed's own views. The ＋ after them, the tab ⋯ and the
  right-click menu act on the embed's views (Rename, Move, Remove).
- Shown to someone who may edit the document. A reader sees the tabs and can
  switch, filter and sort for themselves only (unsaved, or spec 013's
  personal state), as today.
- Remove is not offered on an embed's only view.

## New view (＋) in an embed

```text
Add view
  Table · Board · List · Gallery · Calendar · Timeline · Chart
  ── Views on Tasks ──
  ▦ All tasks
  ▥ Sprint board
  ◔ Done per week
```

- First group: view types, form left out.
- Second group, only when the database has views to copy: label
  "Views on {name}", the database's views (forms left out), each with its
  type's icon. Picking one adds a copy, opens it.
- Both groups are `MenuValues` of the one function "add a view" (no new
  menu function, `check-menu-icons.mjs`).

## Settings in an embed (spec 012's menu)

- **View settings**: every item the database page has (Rename view, property
  visibility, Open pages in, the timeline's dates, the table's sub-items,
  chart settings, Move, Remove), acting on the embed's view, no
  confirmation.
- **Database settings**: Edit properties, only when the person may write
  the database (research R9). Opens the Properties dialog.

## Properties dialog opened from a document

- **Save** asks first (`confirm`, not danger):
  - title: "Change the properties of {database}?"
  - text: "This changes the database and every view of it, everywhere."
  - buttons: "Change properties" / "Cancel"
  - Cancel: back to the dialog, edits kept.

## Delete a property (everywhere, #524)

- The ✕ on a property asks (`confirm`, danger):
  - "Delete “{property}” from “{database}”? It will be removed from all views."
  - relation, added: "Its links to rows of “{database}” go with it." (the
    other side is computed, so there is no column to remove; #524)
  - buttons: "Delete property" / "Cancel"
- The deletion is still a draft until the dialog is saved, as today; the
  confirmation is at the ✕, where the person decides.

## A chart from the / menu

Picking a database writes the embed with one chart view of the asked kind,
settings open; nothing is added to the database (research R12). Works for a
database the person may only read.

## Strings (new; de, es, nl in the same PR)

| English (key) |
|---|
| `Views on {name}` |
| `Change the properties of {database}?` |
| `This changes the database and every view of it, everywhere.` |
| `Change properties` |
| `Delete “{property}” from “{database}”? It will be removed from all views.` |
| `Its links to rows of “{database}” go with it.` |
| `An embed keeps at least one view.` |

`Delete property`, `Cancel`, `Table`, `Add view`, `Settings`, `Edit
properties` exist already. Final wording is checked against the locales in
the build; a string that already exists is reused, not duplicated.

## Keyboard

Nothing new: the ＋ menu, Settings and the dialogs are `ui/Menu` and
`dialog.tsx`, with their keyboard paths (spec 010, `menu-keyboard.mjs`).
