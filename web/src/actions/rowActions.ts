// Everything a person can do to a database row from its menu, listed once
// (spec 022, research R6; the Content actions row in
// .specify/memory/surfaces.md, as propertyActions.ts does for a property).
//
// Why a list: the table had no row menu at all, and the board's card menu
// was written on its own (Open, Open in new tab, Move to, Move to trash).
// Both are now drawn from this list, and a place that leaves an action out
// says why (rowActionReasons.ts, read by check-content-actions.mjs only).
//
// Groups follow spec 015's rule: related actions sit together behind a
// separator, a group of more than 3 earns a submenu, and a choice among
// values (where to open, which property, which column) is a submenu of its
// own inside its group.

import type { MenuFunction } from '../menuIcons';

/** Where a row's menu is: a table row (its handle, a right-click, mod+/) or
 *  a board card's ⋯. */
export type RowPlace = 'table' | 'boardCard';

export type RowAction = {
  id:
    | 'open'
    | 'openIn'
    | 'addRowBelow'
    | 'editProperty'
    | 'comment'
    | 'favorite'
    | 'copyLink'
    | 'duplicate'
    | 'moveToColumn'
    | 'moveToTrash';
  fn: MenuFunction;
  group: 'open' | 'add' | 'edit' | 'copy' | 'board' | 'danger';
  /** A choice among values: drawn as a submenu. */
  choice?: boolean;
  places: RowPlace[];
};

export const ROW_ACTIONS: readonly RowAction[] = [
  { id: 'open', fn: 'open', group: 'open', places: ['table', 'boardCard'] },
  // Side peek, centre peek, new tab.
  { id: 'openIn', fn: 'openIn', group: 'open', choice: true, places: ['table', 'boardCard'] },
  { id: 'addRowBelow', fn: 'addRowBelow', group: 'add', places: ['table'] },
  // The row's properties, each opening its editor.
  { id: 'editProperty', fn: 'editProperty', group: 'edit', choice: true, places: ['table', 'boardCard'] },
  { id: 'comment', fn: 'commentsPanel', group: 'edit', places: ['table', 'boardCard'] },
  { id: 'favorite', fn: 'favorite', group: 'edit', places: ['table', 'boardCard'] },
  { id: 'copyLink', fn: 'copyLink', group: 'copy', places: ['table', 'boardCard'] },
  { id: 'duplicate', fn: 'duplicate', group: 'copy', places: ['table', 'boardCard'] },
  // The board's columns, as values of the grouping property.
  { id: 'moveToColumn', fn: 'moveTo', group: 'board', choice: true, places: ['boardCard'] },
  { id: 'moveToTrash', fn: 'moveToTrash', group: 'danger', places: ['table', 'boardCard'] },
];

/** More related actions than this in one group earn a submenu of their own. */
export const SUBMENU_ABOVE = 3;

export type RowMenuSection = { group: RowAction['group']; submenu: boolean; actions: RowAction[] };

/** A place's menu as sections in list order. A section is a submenu when it
 *  holds more than SUBMENU_ABOVE actions; a choice inside it is drawn as a
 *  submenu item either way. */
export function rowMenuSections(place: RowPlace, actions: readonly RowAction[] = ROW_ACTIONS): RowMenuSection[] {
  const sections: RowMenuSection[] = [];
  for (const a of actions) {
    if (!a.places.includes(place)) continue;
    const last = sections[sections.length - 1];
    if (last && last.group === a.group) last.actions.push(a);
    else sections.push({ group: a.group, submenu: false, actions: [a] });
  }
  for (const s of sections) s.submenu = s.actions.length > SUBMENU_ABOVE;
  return sections;
}
