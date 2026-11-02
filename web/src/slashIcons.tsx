import type { ComponentType, ReactElement, ReactNode } from 'react';
import {
  BlockColorsItem,
  DragHandleMenu,
  RemoveBlockItem,
  SideMenu,
  TableColumnHeaderItem,
  TableRowHeaderItem,
  type SideMenuProps,
} from '@blocknote/react';
import { DRAG_HANDLE_FUNCTIONS, MenuIcon, SLASH_FUNCTIONS, type MenuFunction } from './menuIcons';
import { t } from './i18n';

// The editor's own menus take their icons from the same pairing as every
// other menu (spec 010, research R4). BlockNote draws its / menu with
// react-icons, a second icon set: "the same icon" means nothing across two
// sets, so its items get ours, by the key its dictionary uses. An upgrade that
// adds a block fails check-menu-icons.mjs until it has a function here.

/** The size BlockNote's suggestion menu draws its icon box at. */
const SLASH_ICON_SIZE = 18;

export function slashIcon(fn: MenuFunction): ReactElement {
  return <MenuIcon fn={fn} size={SLASH_ICON_SIZE} />;
}

/** BlockNote's default / items with the pairing's icons. An item whose key
 *  the pairing does not know keeps the library's icon; the check fails the
 *  build on it, so that only happens between an upgrade and its fix. */
export function withPairedIcons<T extends { key?: string; icon?: ReactElement }>(items: T[]): T[] {
  return items.map((item) => {
    const fn = item.key ? (SLASH_FUNCTIONS as Record<string, MenuFunction>)[item.key] : undefined;
    return fn ? { ...item, icon: slashIcon(fn) } : item;
  });
}

/** The block menu (the drag handle's) is built FROM DRAG_HANDLE_FUNCTIONS, so
 *  its items and the pairing cannot drift apart. The table below is typed by
 *  the pairing's keys: a key added there (because check-menu-icons.mjs reported
 *  a new BlockNote item) fails tsc here until it has its component and label,
 *  instead of passing the check and never showing up. */
type DragHandleKey = keyof typeof DRAG_HANDLE_FUNCTIONS;
const DRAG_HANDLE_ITEMS: Record<DragHandleKey, { Item: ComponentType<{ children: ReactNode }>; label: () => string }> = {
  delete_menuitem: { Item: RemoveBlockItem, label: () => t('Delete') },
  colors_menuitem: { Item: BlockColorsItem, label: () => t('Colour') },
  header_row_menuitem: { Item: TableRowHeaderItem, label: () => t('Header row') },
  header_column_menuitem: { Item: TableColumnHeaderItem, label: () => t('Header column') },
};

function BlockMenu() {
  return (
    <DragHandleMenu>
      {(Object.keys(DRAG_HANDLE_FUNCTIONS) as DragHandleKey[]).map((key) => {
        const { Item, label } = DRAG_HANDLE_ITEMS[key];
        return (
          <Item key={key}>
            <span className="bn-menu-label">
              <MenuIcon fn={DRAG_HANDLE_FUNCTIONS[key]} /> {label()}
            </span>
          </Item>
        );
      })}
    </DragHandleMenu>
  );
}

/** The side menu with the block menu above, for SideMenuController. */
export function SideMenuWithIcons(props: SideMenuProps) {
  return <SideMenu {...props} dragHandleMenu={BlockMenu} />;
}
