import { Fragment, type ReactNode } from 'react';
import { MenuItem, MenuSeparator } from '../ui/Menu';
import { t } from '../i18n';
import { menuSections, type PropertyAction, type PropertyPlace } from '../actions/propertyActions';

// The items of a property's menu, wherever the menu is (spec 015, R11): drawn
// from PROPERTY_ACTIONS for one place, in its groups, with a separator
// between groups. Each action is written out here with its function as a
// literal, because check-menu-icons.mjs reads fn="…" from the source; the list
// decides which of them a place shows and in what shape.
//
// An action whose handler is missing is left out at that moment (Move left on
// the first column, everything but the view's actions for someone who may
// not change the database). That is availability, not the list's decision.

export type PropertyActionHandlers = {
  rename?: () => void;
  editProperty?: () => void;
  /** The row page's visibility submenu (RowPageVisibilityMenu). */
  rowPageVisibility?: ReactNode;
  duplicate?: () => void;
  moveLeft?: () => void;
  moveRight?: () => void;
  hideInView?: () => void;
  delete?: () => void;
};

function item(a: PropertyAction, h: PropertyActionHandlers): ReactNode {
  switch (a.id) {
    case 'rename':
      return h.rename && <MenuItem fn="rename" onClick={h.rename}>{t('Rename')}</MenuItem>;
    case 'editProperty':
      return h.editProperty && <MenuItem fn="editProperty" onClick={h.editProperty}>{t('Edit property')}</MenuItem>;
    case 'rowPageVisibility':
      // A choice drawn by the one place that has it (RowPageVisibilityMenu,
      // loaded with the row's page), so the table's menus do not carry it.
      return h.rowPageVisibility;
    case 'duplicate':
      return h.duplicate && <MenuItem fn="duplicate" onClick={h.duplicate}>{t('Duplicate property')}</MenuItem>;
    case 'moveLeft':
      return h.moveLeft && <MenuItem fn="moveLeft" onClick={h.moveLeft}>{t('Move left')}</MenuItem>;
    case 'moveRight':
      return h.moveRight && <MenuItem fn="moveRight" onClick={h.moveRight}>{t('Move right')}</MenuItem>;
    case 'hideInView':
      return h.hideInView && <MenuItem fn="hideInView" onClick={h.hideInView}>{t('Hide in view')}</MenuItem>;
    case 'delete':
      return h.delete && (
        <MenuItem fn="delete" danger opensDialog onClick={h.delete}>
          {t('Delete property')}
        </MenuItem>
      );
  }
}

export function PropertyActionItems({ place, handlers }: { place: PropertyPlace; handlers: PropertyActionHandlers }) {
  // Sections with nothing to offer right now are dropped before separators
  // are placed, so a menu never starts, ends or doubles up on a separator.
  const sections = menuSections(place)
    .map((s) => s.actions.map((a) => item(a, handlers)).filter(Boolean))
    .filter((items) => items.length > 0);
  return (
    <>
      {sections.map((items, i) => (
        <Fragment key={i}>
          {i > 0 && <MenuSeparator />}
          {items.map((node, j) => (
            <Fragment key={j}>{node}</Fragment>
          ))}
        </Fragment>
      ))}
    </>
  );
}
