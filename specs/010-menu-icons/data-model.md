# Data model: menu icons

Nothing is stored. The only "data" is the pairing in `web/src/menuIcons.ts`,
which every menu reads. This file is the pairing as planned. When
`menuIcons.ts` exists, that file is the truth and this table is a record
of the plan.

## Entities

- **Function** (`MenuFunction`): a key of `MENU_ICONS`. Camel case, the verb
  with only as much object as needed to tell two verbs apart (`newPage`,
  `newCollection`; `delete`, not `deleteView`).
- **Icon**: a Lucide React component, or one of the composites in
  `menuIcons.ts` (R6). Unique across `MENU_ICONS` (the check, rule 2).
- **Menu item**: a `<MenuItem fn label …>` in a component. Many items can
  share one function; each function has exactly one icon.
- **Value list**: a `<MenuValues reason>` inside a menu. Its buttons are
  values, not functions, and carry no icon from the pairing.
- **Library key**: a key of BlockNote's `slash_menu` or `drag_handle`
  dictionary, mapped to a function in `SLASH_FUNCTIONS` /
  `DRAG_HANDLE_FUNCTIONS`.

## The pairing

Menus are numbered as in [research.md](research.md) R1. ✱ = icon changes
from today.

### Pages and rows

| Function | Icon | Labels (menus) |
|----------|------|----------------|
| `newPage` | `FilePlus` ✱ | Page (1), Empty row (9) |
| `newCollection` | `Table2` | Collection (1), New collection inside (2) |
| `open` | `Maximize2` ✱ | Open (11) |
| `openInNewTab` | `ExternalLink` ✱ (2) | Open in new tab (2, 11) |
| `favorite` | `Star` (filled when on) | Add to / Remove from favorites (2) |
| `duplicate` | `CopyPlus` ✱ | Duplicate (2, 10) |
| `moveToTopLevel` | `CornerLeftUp` | Move to top level (2) |
| `moveTo` | `CornerUpRight` | each workspace (2), each column (11): one function over a value list |
| `showFiles` | `Paperclip` | Files in this subtree (2) |
| `saveAsTemplate` | `LayoutTemplate` | Save as template, Save as a template of this database (2) |
| `removeTemplateFlag` | `SquareDashed` ✱ | Remove template flag (3) |
| `edit` | `Pencil` | Edit the template itself (3), Edit (10) |
| `exportMarkdown` | `FileDown` ✱ | Export Markdown (2), Markdown (.md) (5) |
| `exportHtml` | `FileCode` | Web page (.html) (5) |
| `print` | `Printer` | Print / as PDF (5) |
| `import` | `Upload` | Import (.md / .zip) (5) |
| `moveToTrash` | `Trash2` | Move to trash (2, 3, 5, 10, 11) |

### Page "…" (menu 5)

| Function | Icon | Labels |
|----------|------|--------|
| `description` | `AlignLeft` | Add a description / Remove description (one toggle) |
| `toComments` | `MessagesSquare` ✱ | To the comments |
| `commentsPanel` | `MessageSquare` | Show / Hide comments |
| `versionHistory` | `History` | Version history |
| `visibility` | `Lock` ✱ (one icon both ways) | Make it private / Make it visible to the workspace |
| `shareToWeb` | `Globe` | Share to web (read-only link) |
| `fullWidth` | `MoveHorizontal` | Full width (checkbox) |

### Views (menus 7, 8)

| Function | Icon | Labels |
|----------|------|--------|
| `rename` | `TextCursorInput` ✱ | Rename view |
| `moveLeft` | `ArrowLeft` | Move left |
| `moveRight` | `ArrowRight` | Move right |
| `delete` | `CircleMinus` ✱ | Remove view; also the block menu's Delete (14) |
| `copyLink` | `Link` ✱ (none today) | Copy link (15) |

### Workspaces and account (menus 4, 6)

| Function | Icon | Labels |
|----------|------|--------|
| `workspaceSettings` | `Settings2` | Workspace settings |
| `newWorkspace` | `Plus` | New workspace |
| `unattendedWorkspaces` | `ShieldAlert` | With nobody in charge… |
| `connectAgent` | `Bot` | (the agents entry at the top of the account menu) |
| `profile` | `User` | Profile |
| `apiTokens` | `Key` | API tokens |
| `activityLog` | `ScrollText` ✱ | Activity log |
| `subscribeCalendar` | `CalendarDays` | Subscribe to calendar |
| `twoFactor` | `ShieldCheck` | Two-factor (2FA) |
| `languageAndTime` | `Languages` | Language and time |
| `shortcuts` | `Keyboard` | Keyboard shortcuts |
| `notesMode` | `NotebookText` ✱ | Notes mode |
| `fonts` | `Type` | nigari fonts |
| `manageUsers` | `Users` | Manage users |
| `instanceSettings` | `Server` ✱ | Instance settings |
| `openRowsInNewTab` | `AppWindow` ✱ | Open rows in new tab (setting) |
| `signOut` | `LogOut` | Sign out |

### Editor `/` menu (13): the library's keys

| Key | Function | Icon |
|-----|----------|------|
| `heading`, `heading_2` … `heading_6` | `heading1` … `heading6` | `Heading1` … `Heading6` |
| `toggle_heading`, `_2`, `_3` | `toggleHeading1` … `3` | composite: `ChevronRight` + `Heading1` … `3` (R6) |
| `quote` | `quote` | `Quote` |
| `toggle_list` | `toggleList` | `ListCollapse` |
| `numbered_list` | `numberedList` | `ListOrdered` |
| `bullet_list` | `bulletList` | `List` |
| `check_list` | `checkList` | `ListChecks` |
| `paragraph` | `paragraph` | `Pilcrow` |
| `code_block` | `codeBlock` | `CodeXml` |
| `page_break` | `pageBreak` | `ScissorsLineDashed` |
| `table` | `table` | `Grid3x3` |
| `image` | `image` | `Image` |
| `video` | `video` | `Video` |
| `audio` | `audio` | `AudioLines` |
| `file` | `file` | `File` |
| `emoji` | `emoji` | `Smile` |
| `divider` | `divider` | `SeparatorHorizontal` |

### Editor `/` menu (13): nigari's own items

| Item | Function | Icon |
|------|----------|------|
| Diagram | `diagram` | `Workflow` |
| Columns | `columns` | `Columns2` |
| Callout | `callout` | `Lightbulb` ✱ (was 💡) |
| Bookmark / Embed | `bookmark` | `Bookmark` ✱ (was 🔖) |
| Embed a collection | `embedCollection` | `TableProperties` ✱ (was ▦) |
| Table of contents | `tableOfContents` | `ListTree` ✱ (was 📑) |
| Sub-pages | `subPages` | `FolderTree` ✱ (was 📄) |
| Bar chart | `barChart` | `ChartColumn` |
| Horizontal bar chart | `horizontalBarChart` | `ChartBar` |
| Line chart | `lineChart` | `ChartLine` |
| Donut chart | `donutChart` | `ChartPie` |
| Number chart | `numberChart` | `Hash` |

### Editor block menu (14): the library's keys

| Key | Function | Icon |
|-----|----------|------|
| `delete_menuitem` | `delete` | `CircleMinus` ✱ (none today) |
| `colors_menuitem` | `colors` | `Palette` ✱ |
| `header_row_menuitem` | `headerRow` | `PanelTop` ✱ |
| `header_column_menuitem` | `headerColumn` | `PanelLeft` ✱ |

## Validation rules

- Every value of `MENU_ICONS` is unique (check rule 2).
- Every library key maps to a function (check rule 4).
- Every `<button>` inside a menu is a `MenuItem`, or sits in a
  `MenuValues` with a reason (check rules 1, 3).
- `fn` is a literal the check can read (check rule 5); `tsc` checks it is a
  real function.

## State

A toggle item keeps its function and icon in both states (FR-004). Only the
label changes, plus the fill for `favorite`, as today. `fullWidth` stays a
`menuitemcheckbox` with its tick.
