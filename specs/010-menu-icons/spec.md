# Feature Specification: Every menu item has an icon, and an icon means one thing

**Feature Branch**: `claude/serene-planck-ie0e6w`

**Created**: 2026-10-29

**Status**: Draft

**Issues**: to be filed

**Input**: Owner, 2026-10-29: "add new rule -> menu-items should have an icon.
Ensure that no 2 functions have the same icon". Answered while asked: the same
function in two menus keeps the same icon ("1. yes"); the editor's own menus
(the `/` menu and the block menu) count too ("2. count too"); specified now,
built after spec 008 ("3. spec now, build after 008").

## Context

Today every menu is hand-built in the component that opens it (the page menu
in the sidebar, the row and view menus of a database, the editor's menus, the
account menu, property value menus). There is no shared menu component, so
nothing can say whether an item has an icon or which icon it uses. Most items
have one; some do not, and some icons already stand for several different
things: a scan of icon + label pairs in the interface (2026-10-29) finds the
same bin icon on "Delete", "Move to trash", "Remove view" and "Delete
workspace", the same document icon on "Page", "Export as Markdown" and
"Files", and the same copy icon on "Copy" and "Duplicate". A person scanning a
menu by its icons cannot tell those apart, and an agent describing the
interface cannot rely on them.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find an action by its icon (Priority: P1)

A person opens a menu they have used before and looks for "Duplicate". They do
not read every label: they look for the picture they remember. Every item in
the menu has an icon, so the picture is there, and it is not also the picture
of something else in the menu, so the first one they see is the right one.

**Why this priority**: It is the rule itself.

**Independent Test**: Open every menu of the interface; every item shows an
icon before its label, and within each menu no two items with different
functions show the same icon.

**Acceptance Scenarios**:

1. **Given** any menu in the interface (page, row, view, database, workspace,
   account, property value, the editor's `/` menu and block menu), **When** it
   opens, **Then** every item shows an icon before its label.
2. **Given** a menu with "Copy link" and "Duplicate", **When** it opens,
   **Then** the two items show different icons.
3. **Given** a menu item that switches something on and off (e.g. "Add to
   favorites" / "Remove from favorites"), **When** its state changes, **Then**
   it keeps the same icon; the label (and where the interface does so today,
   the icon's fill) says the state.
4. **Given** a menu in dark mode, **When** it opens, **Then** the icons are as
   legible as in light mode.

---

### User Story 2 - The same action looks the same everywhere (Priority: P1)

"Duplicate" exists in the page menu, the row menu and the view menu. A person
who learned its icon in one menu finds the same icon in the others. And an icon
learned for one action never turns up on a different action in another menu.

**Why this priority**: Owner's answer to "same function in two menus": yes.
Without it the icons have to be learned per menu.

**Independent Test**: List every menu item in the interface with its function
and icon; each function has exactly one icon and each icon exactly one
function.

**Acceptance Scenarios**:

1. **Given** the same function in several menus, **When** each menu opens,
   **Then** it shows the same icon in each.
2. **Given** two different functions anywhere in the interface's menus,
   **Then** their icons differ.
3. **Given** the editor's `/` menu, which shows items of the editor library's
   own alongside salt.md's (charts, callout, bookmark, database, table of
   contents, sub-pages), **When** it opens, **Then** the same rules hold for
   all of them, the library's items included.

---

### User Story 3 - A new menu item cannot break the rule unnoticed (Priority: P1)

A contributor (person or agent) adds "Archive" to the page menu and forgets
the icon, or gives it the bin icon that "Move to trash" already has. The build
fails and the message says which item, in which file, and what to do: add an
icon, or pick one that is not taken (naming the function that has it).

**Why this priority**: The project's principle "derive, do not remember": a
rule that matters has a check. A rule kept by attention erodes with the next
feature, as the shared bin icon shows.

**Independent Test**: Add a menu item without an icon; the check fails naming
it. Give it an icon already used by another function; the check fails naming
both. Fix it; the check passes.

**Acceptance Scenarios**:

1. **Given** a menu item without an icon, **When** the checks run, **Then**
   they fail with a sentence naming the item, its file and "add an icon".
2. **Given** a new function that reuses another function's icon, **When** the
   checks run, **Then** they fail naming both functions and the icon.
3. **Given** an existing function placed in a new menu with its own icon,
   **When** the checks run, **Then** they pass.
4. **Given** an existing function placed in a new menu with a different icon,
   **When** the checks run, **Then** they fail: one function, one icon.
5. **Given** an upgrade of the editor library that changes one of its own
   menu icons into one salt.md uses for another function, **When** the checks
   run, **Then** they fail.

### Edge Cases

- **Labels, separators and headings inside a menu** ("Move to workspace" above
  a list of workspaces) are not items and carry no icon.
- **Lists of values, not actions**: the workspaces under "Move to workspace",
  the options of a select property, a colour picker, an emoji picker and the
  choices of a `Select` field are values to pick, not functions. Each is one
  function ("move to this workspace", "set this value"); the rule asks for no
  icon per value, and colour swatches and emoji stay as they are.
- **Items whose icon is content**: a page in a "link to page" list shows the
  page's own icon. It is a value (User Story 3 does not apply).
- **Disabled items** keep their icon.
- **A keyboard shortcut hint** shown on an item (`⌘⌫`) is not the icon and
  does not replace it.
- **The same verb on different things** ("Delete option", "Delete
  workspace", "Move to trash", "Remove view"): whether these are one function
  or several is the definition of "function" this spec has to settle;
  [NEEDS CLARIFICATION: Is a function the verb alone ("delete", one icon for
  every delete) or the verb with its object ("delete a page" and "delete a
  view" get different icons)?]
- **Icons outside menus** (toolbar buttons, property type icons, side panel
  headers) are not covered by this rule; a toolbar may show the bin icon for
  the same "delete" function, but nothing outside menus is checked.
- **Not enough distinct icons**: if the icon set has no fitting distinct icon
  for a new function, the plan picks one and records the pairing; it never
  falls back to a duplicate.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every item of every menu in the interface MUST show an icon
  before its label. Menus include the editor's `/` menu and block menu.
- **FR-002**: Each function MUST have exactly one icon, the same in every menu
  where it appears.
- **FR-003**: No two different functions MAY share an icon in any menu.
- **FR-004**: An item whose label changes with state (on/off) MUST keep its
  function's icon.
- **FR-005**: The pairing of functions and icons MUST be kept in one place
  that every menu takes its icons from, so a menu cannot invent its own.
- **FR-006**: The build MUST fail when a menu item has no icon, when a function
  has two icons, or when two functions share one, with a sentence naming the
  item(s), the file(s) and what to change.
- **FR-007**: The check MUST cover the editor library's own menu items, so a
  library upgrade that collides with salt.md's pairing fails the build.
- **FR-008**: Every existing menu MUST meet FR-001–FR-004 when this feature
  ships; where today's icons collide, the function that keeps the icon and the
  new icon for the other are recorded in the plan.
- **FR-009**: Icons MUST follow the design system: the existing icon set, the
  size and colour tokens of menu items today, legible in light and dark mode.
- **FR-010**: A screen reader MUST read the item's label, not the icon: the
  icon is decoration and is hidden from assistive technology.
- **FR-011**: The rule MUST be written into the project's instructions for
  contributors and agents (the design system's README and the registry of
  surfaces), so a later feature that adds a menu answers for it in its plan.

### Key Entities

- **Menu item**: one action in a menu, with a label and the function it
  performs.
- **Function**: what an item does, independent of the menu it is in (the
  definition is the open question above).
- **Icon pairing**: the one list of functions and their icons, which every
  menu reads.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of menu items in the interface show an icon, counted by the
  check over every menu, the editor's included.
- **SC-002**: 0 icons stand for more than one function, and 0 functions show
  more than one icon, in every menu.
- **SC-003**: A menu item added without an icon, or with a taken icon, fails
  the build on the first run, with a message that names it.
- **SC-004**: A person asked to find a named action in a menu they know picks
  the right item by its icon alone (checked by hand on the page, row and view
  menus before the pull request).

## Agent parity and other surfaces

- **MCP**: not affected. Icons are presentation; no agent action changes,
  and no tool describes menu icons.
- **Translations**: labels are unchanged; a new label (if one is added for a
  missing item) goes through `t()` with its German entry.
- **Wiki**: screenshots that show a menu whose icons change are retaken; the
  design-system documentation names the rule.
- **Registry**: a new concept, "Menu icons", goes into
  `.specify/memory/surfaces.md` in this feature's pull request.

## Assumptions

- "Menu" means a list of actions that opens from a button, a right-click or a
  typed `/`; pickers of values are not menus (Edge Cases).
- The existing icon set (the one the interface uses today) is kept; no second
  icon library comes in.
- The rule covers menus only, as asked; icons on toolbar buttons and elsewhere
  are free to repeat a menu icon for the same function, unchecked.
- Built after spec 008 (owner's order); nothing in this spec depends on 008.
