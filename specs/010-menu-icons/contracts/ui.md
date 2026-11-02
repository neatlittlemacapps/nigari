# Contract: `ui/Menu`, `menuIcons.ts`, the check

No REST route or MCP tool changes: icons and menus are presentation (spec,
"Agent parity"). The contracts below are internal. They cover what a
contributor writes to add a menu or a menu item, and what the build answers.

## `web/src/menuIcons.ts`

```ts
export const MENU_ICONS: { [fn: string]: LucideIcon | ComponentType<IconProps> };
export type MenuFunction = keyof typeof MENU_ICONS;
export const SLASH_FUNCTIONS: Record<string /* BlockNote slash_menu key or own item id */, MenuFunction>;
export const DRAG_HANDLE_FUNCTIONS: Record<string /* BlockNote drag_handle key */, MenuFunction>;
export function MenuIcon(props: { fn: MenuFunction; filled?: boolean }): JSX.Element; // aria-hidden, menu.icon-size
```

## `web/src/ui/Menu.tsx` (on `@base-ui/react/menu`)

```tsx
// A menu opened from a button.
<Menu trigger={<IconButton label={t('More')}><MoreHorizontal /></IconButton>} label={t('Page')} align="end">
  <MenuItem fn="openInNewTab" onClick={…}>{t('Open in new tab')}</MenuItem>
  <MenuItem fn="favorite" filled={isFav} onClick={…}>{isFav ? t('Remove from favorites') : t('Add to favorites')}</MenuItem>
  <MenuSubmenu fn="moveTo" label={t('Move to workspace')}>
    <MenuValues reason="Workspaces are values of one function, moveTo">
      {workspaces.map((w) => <MenuValueItem key={w.id} onClick={…}>{w.name}</MenuValueItem>)}
    </MenuValues>
  </MenuSubmenu>
  <MenuSeparator />
  <MenuItem fn="moveToTrash" danger chord={chordFor('page.trash')} onClick={…}>{t('Move to trash')}</MenuItem>
</Menu>

// The same menu on a right-click: one item list, one open state (R13).
<div className="tree-item" onContextMenu={(e) => { e.preventDefault(); setMenuFor(id); setPoint({ x: e.clientX, y: e.clientY }); }}>…</div>
<Menu open={menuFor === id} onOpenChange={(o) => setMenuFor(o ? id : null)} anchorPoint={point} trigger={…⋯ button…} label={t('Page')}>…</Menu>
```

| Part | Props | Renders |
|------|-------|---------|
| `Menu` | `trigger` (element), `label` (the popup's name), `side`/`align`, optional `open`/`onOpenChange`, optional `anchorPoint` {x, y} (a right-click), optional `narrow="sheet"` (a bottom sheet at or below `SHEET_MAX_WIDTH`) | Root, Trigger (`render` = trigger), Portal, Positioner (`collisionPadding` 8; anchored to the point when given), Popup `role="menu"` |
| `MenuItem` | `fn` (required `MenuFunction` literal, or a ternary of two), `onClick`, `opensDialog?` (runs `onClick` once the menu has finished closing, R13/R14), `danger?`, `disabled?`, `filled?`, `chord?`, `closeOnClick?` (default true) | `Menu.Item` with `MenuIcon`, label, `<kbd class="menu-chord">` |
| `MenuCheckboxItem` | `fn`, `checked`, `onCheckedChange` | `Menu.CheckboxItem`, icon + tick |
| `MenuSubmenu` | `fn`, `label`, children | `SubmenuRoot` + `SubmenuTrigger` (icon + label + chevron) + its own Popup |
| `MenuValues` | `reason` (required), children | `Menu.Group`; the check skips its items |
| `MenuValueItem` | `onClick`, `icon?` (content, e.g. a page's own icon), `checked?` | `Menu.Item` without a function icon |
| `MenuRadioGroup` / `MenuRadioItem` | `value`, `onValueChange` / `value` | `Menu.RadioGroup` / `RadioItem` |
| `MenuLabel`, `MenuSeparator` | children / none | `GroupLabel`, `Separator` |

Keyboard (from Base UI, checked by `menu-keyboard.mjs`): Enter, Space or ↓ on
the trigger opens the menu on the first item; ↑/↓, Home/End move; typing jumps;
→/← open and close a submenu; Escape or an outside click closes it, and focus
returns to the trigger.

## `check-menu-icons.mjs` messages

One line per problem, then `menu icons: N problem(s)` and exit 1. Formats:

```text
src/components/Sidebar.tsx:520: "Archive" is a menu item without an icon. Draw it with <MenuItem fn="…">, adding the function to src/menuIcons.ts if it is new.
src/components/Sidebar.tsx:510: a hand-built menu (className "menu …"). Build it with ui/Menu.
src/menuIcons.ts: archive and moveToTrash both use Trash2. One icon means one function: pick an icon no other function has.
src/components/Sidebar.tsx:540: <MenuValues> needs reason="…" saying why its entries have no function of their own.
@blocknote/core slash_menu has "callout_v2", which SLASH_FUNCTIONS does not map. Give it a function and an icon in src/menuIcons.ts.
src/components/Editor.tsx:1170: fn={…} must be a string literal (or a ternary of two) so the menu-icons check can read it.
src/components/Sidebar.tsx:12: imports @base-ui/react/menu outside web/src/ui. Use ui/Menu, so every menu gets its icons and keyboard the same way.
```

While pull request 1 is open (R12), the "hand-built menu" and "without an icon"
lines are reported with a count and do not fail. Pull request 2 makes them
fail.

Green: `menu icons: 15 menus, N items, M functions, all distinct`.

## `data-menu-exempt`

`data-menu-exempt="<why>"` marks an element that wears the menu's look but is
not a list of actions (a colour picker, the share panel, a person or row
picker). The check skips it, and fails if the reason is empty. Spec 001's
popover batch moves these to `ui/Popover`.
