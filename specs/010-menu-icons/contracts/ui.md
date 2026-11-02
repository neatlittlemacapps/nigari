# Contract: `MenuItem`, `MenuValues`, `menuIcons.ts`, the check

No REST route or MCP tool changes (icons are presentation, spec "Agent parity").
The contracts here are internal: what a contributor writes to add a menu item,
and what the build answers.

## `web/src/menuIcons.ts`

```ts
export const MENU_ICONS: { [fn: string]: LucideIcon | ComponentType<IconProps> };
export type MenuFunction = keyof typeof MENU_ICONS;
export const SLASH_FUNCTIONS: Record<string /* BlockNote slash_menu key or own item id */, MenuFunction>;
export const DRAG_HANDLE_FUNCTIONS: Record<string /* BlockNote drag_handle key */, MenuFunction>;
export function MenuIcon(props: { fn: MenuFunction; filled?: boolean }): JSX.Element; // aria-hidden, menu.icon-size
```

## `web/src/ui/MenuItem.tsx`

```tsx
<MenuItem
  fn="duplicate"            // required, a MenuFunction literal (or cond ? 'a' : 'b')
  onClick={…}
  danger?                   // red label and icon
  disabled?                 // keeps its icon (spec, Edge Cases)
  checked?: boolean         // makes it role="menuitemcheckbox" with aria-checked and a tick
  filled?: boolean          // the favourite star's on state
  chord?: string            // shortcut hint at the right edge; never replaces the icon
  className?                // e.g. "narrow-only"
>
  {t('Duplicate')}          // the label, the only thing a screen reader reads
</MenuItem>
```

Renders `<button type="button" role="menuitem" class="menu-item …">` +
`<MenuIcon>` + label + optional `<kbd class="menu-chord">`.

## `web/src/ui/MenuValues.tsx`

```tsx
<MenuValues reason="Workspaces are values: one function, moveTo, applied to the one you pick">
  {workspaces.map((w) => <button …><MenuIcon fn="moveTo" /> {w.name}</button>)}
</MenuValues>
```

Renders its children unchanged (a fragment). `reason` is required and exists
for the reader and the check, not the screen.

## `check-menu-icons.mjs` messages

One line per problem, then `menu icons: N problem(s)` and exit 1. Formats:

```text
src/components/Sidebar.tsx:520: "Archive" is a menu item without an icon. Draw it with <MenuItem fn="…">, adding the function to src/menuIcons.ts if it is new.
src/menuIcons.ts: archive and moveToTrash both use Trash2. One icon means one function: pick an icon no other function has.
src/components/Sidebar.tsx:540: a list of values inside a menu needs <MenuValues reason="…"> saying why its entries have no function of their own.
@blocknote/core slash_menu has "callout_v2", which SLASH_FUNCTIONS does not map. Give it a function and an icon in src/menuIcons.ts.
src/components/Editor.tsx:1170: fn={…} must be a string literal (or a ternary of two) so the menu-icons check can read it.
```

Green: `menu icons: 15 menus, N items, M functions, all distinct`.
