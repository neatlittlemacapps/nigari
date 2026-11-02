import type { ReactElement } from 'react';
import {
  BlockColorsItem,
  DragHandleMenu,
  RemoveBlockItem,
  SideMenu,
  TableColumnHeaderItem,
  TableRowHeaderItem,
  type SideMenuProps,
} from '@blocknote/react';
import { MenuIcon, SLASH_FUNCTIONS, type MenuFunction } from './menuIcons';
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

/** The block menu (the drag handle's): BlockNote's four default items, each
 *  with its function's icon before the label. */
function BlockMenu() {
  return (
    <DragHandleMenu>
      <RemoveBlockItem>
        <span className="bn-menu-label">
          <MenuIcon fn="delete" /> {t('Delete')}
        </span>
      </RemoveBlockItem>
      <BlockColorsItem>
        <span className="bn-menu-label">
          <MenuIcon fn="colors" /> {t('Colour')}
        </span>
      </BlockColorsItem>
      <TableRowHeaderItem>
        <span className="bn-menu-label">
          <MenuIcon fn="headerRow" /> {t('Header row')}
        </span>
      </TableRowHeaderItem>
      <TableColumnHeaderItem>
        <span className="bn-menu-label">
          <MenuIcon fn="headerColumn" /> {t('Header column')}
        </span>
      </TableColumnHeaderItem>
    </DragHandleMenu>
  );
}

/** The side menu with the block menu above, for SideMenuController. */
export function SideMenuWithIcons(props: SideMenuProps) {
  return <SideMenu {...props} dragHandleMenu={BlockMenu} />;
}
