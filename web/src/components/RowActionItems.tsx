import { Fragment, type ReactNode } from 'react';
import { MenuItem, MenuLabel, MenuSeparator, MenuSubmenu, MenuValueItem, MenuValues } from '../ui/Menu';
import { t } from '../i18n';
import { rowMenuSections, type RowAction, type RowPlace } from '../actions/rowActions';

// The items of a database row's menu, wherever it is (spec 022, research R6):
// drawn from ROW_ACTIONS for one place, in its groups, with a separator
// between groups. Each action is written out here with its function as a
// literal, because check-menu-icons.mjs reads fn="…" from the source; the
// list decides which of them a place shows and in what shape.
//
// An action whose handler is missing is left out at that moment (Add row
// below for a reader, Open in side peek where the page has no peek). That is
// availability, not the list's decision.

export type RowActionHandlers = {
  open?: () => void;
  openInSidePeek?: () => void;
  openInCenterPeek?: () => void;
  openInNewTab?: () => void;
  addRowBelow?: () => void;
  /** The row's properties, each opening its editor. */
  editProperty?: { properties: { id: string; name: string }[]; onPick: (propId: string) => void };
  comment?: () => void;
  /** Whether the row is a favourite now, and the toggle. */
  favorite?: { on: boolean; toggle: () => void };
  copyLink?: () => void;
  duplicate?: () => void;
  /** The board's columns (drawn by the board, which knows them). */
  moveToColumn?: ReactNode;
  moveToTrash?: () => void;
};

function item(a: RowAction, h: RowActionHandlers): ReactNode {
  switch (a.id) {
    case 'open':
      return h.open && <MenuItem fn="open" onClick={h.open}>{t('Open')}</MenuItem>;
    case 'openIn':
      if (!h.openInSidePeek && !h.openInCenterPeek && !h.openInNewTab) return null;
      return (
        <MenuSubmenu fn="openIn" label={t('Open in')}>
          {h.openInSidePeek && <MenuItem fn="openInSidePeek" onClick={h.openInSidePeek}>{t('Side peek')}</MenuItem>}
          {h.openInCenterPeek && <MenuItem fn="openInCenterPeek" onClick={h.openInCenterPeek}>{t('Centre peek')}</MenuItem>}
          {h.openInNewTab && <MenuItem fn="openInNewTab" onClick={h.openInNewTab}>{t('New tab')}</MenuItem>}
        </MenuSubmenu>
      );
    case 'addRowBelow':
      return h.addRowBelow && <MenuItem fn="addRowBelow" onClick={h.addRowBelow}>{t('Add row below')}</MenuItem>;
    case 'editProperty': {
      const e = h.editProperty;
      if (!e || e.properties.length === 0) return null;
      return (
        <MenuSubmenu fn="editProperty" label={t('Edit property')}>
          <MenuValues reason="The row's properties are values of one function, editProperty: the one picked opens its editor">
            {e.properties.map((p) => (
              <MenuValueItem key={p.id} onClick={() => e.onPick(p.id)}>
                {p.name}
              </MenuValueItem>
            ))}
          </MenuValues>
        </MenuSubmenu>
      );
    }
    case 'comment':
      return h.comment && <MenuItem fn="commentsPanel" onClick={h.comment}>{t('Comment')}</MenuItem>;
    case 'favorite':
      return (
        h.favorite && (
          <MenuItem fn="favorite" onClick={h.favorite.toggle}>
            {h.favorite.on ? t('Remove from favourites') : t('Add to favourites')}
          </MenuItem>
        )
      );
    case 'copyLink':
      return h.copyLink && <MenuItem fn="copyLink" onClick={h.copyLink}>{t('Copy link')}</MenuItem>;
    case 'duplicate':
      return h.duplicate && <MenuItem fn="duplicate" onClick={h.duplicate}>{t('Duplicate')}</MenuItem>;
    case 'moveToColumn':
      // Drawn by the board (its columns are values of moveTo); its MenuValues
      // names fn="moveTo" for the check.
      return h.moveToColumn;
    case 'moveToTrash':
      return (
        h.moveToTrash && (
          <MenuItem fn="moveToTrash" danger onClick={h.moveToTrash}>
            {t('Move to trash')}
          </MenuItem>
        )
      );
  }
}

/** A row's menu items for one place. `edited` is the "Edited {time} by
 *  {name}" line under them, once it is known. */
export function RowActionItems({ place, handlers, edited }: { place: RowPlace; handlers: RowActionHandlers; edited?: string | null }) {
  // Sections with nothing to offer right now are dropped before separators
  // are placed, so a menu never starts, ends or doubles up on a separator.
  const sections = rowMenuSections(place)
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
      {edited && (
        <>
          <MenuSeparator />
          <MenuLabel>{edited}</MenuLabel>
        </>
      )}
    </>
  );
}
