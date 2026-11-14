// Everything a person can do to a property, listed once (spec 015, research
// R11, R12; the Content actions row in .specify/memory/surfaces.md).
//
// Why a list: the same content offered different actions in different
// places, because each menu was written on its own. A page's ⋯ and its
// sidebar row share 2 of their 12 and 11 functions; a property had a column
// heading menu (move, hide) and the Edit properties dialog (rename, type,
// delete), and the row's page was about to grow a third set. Every menu that
// acts on a property is now drawn by PropertyActionItems from this list, and
// a place that leaves an action out says why (propertyActionReasons.ts, read
// by the check only, so the app does not carry the sentences). check-content-actions.mjs
// holds the list, the renderer and the menus to it.
//
// Groups: related actions sit together, set apart by a separator. A group of
// more than 3 related actions earns its own submenu; a choice among values (a
// setting) is always a submenu (owner, 2026-11-13).

import type { MenuFunction } from '../menuIcons';

/** Where a property's menu is: a row opened as a page, or a view's column
 *  heading (a table today). */
export type PropertyPlace = 'rowPage' | 'view';

export type PropertyAction = {
  id: 'rename' | 'editProperty' | 'rowPageVisibility' | 'duplicate' | 'moveLeft' | 'moveRight' | 'hideInView' | 'delete';
  fn: MenuFunction;
  /** Related actions share a group; groups are drawn in list order. */
  group: 'name' | 'rowPage' | 'copy' | 'view' | 'danger';
  /** A choice among values: drawn as a submenu whatever its group's size. */
  choice?: boolean;
  places: PropertyPlace[];
};

export const PROPERTY_ACTIONS: readonly PropertyAction[] = [
  { id: 'rename', fn: 'rename', group: 'name', places: ['rowPage', 'view'] },
  { id: 'editProperty', fn: 'editProperty', group: 'name', places: ['rowPage', 'view'] },
  { id: 'rowPageVisibility', fn: 'rowPageVisibility', group: 'rowPage', choice: true, places: ['rowPage'] },
  { id: 'duplicate', fn: 'duplicate', group: 'copy', places: ['rowPage', 'view'] },
  { id: 'moveLeft', fn: 'moveLeft', group: 'view', places: ['view'] },
  { id: 'moveRight', fn: 'moveRight', group: 'view', places: ['view'] },
  { id: 'hideInView', fn: 'hideInView', group: 'view', places: ['view'] },
  { id: 'delete', fn: 'delete', group: 'danger', places: ['rowPage', 'view'] },
];

/** More related actions than this in one group earn a submenu of their own. */
export const SUBMENU_ABOVE = 3;

export type MenuSection = { group: PropertyAction['group']; submenu: boolean; actions: PropertyAction[] };

/** A place's menu as sections: its actions grouped in list order, each
 *  section a submenu when it is a choice or holds more than SUBMENU_ABOVE. */
export function menuSections(place: PropertyPlace, actions: readonly PropertyAction[] = PROPERTY_ACTIONS): MenuSection[] {
  const sections: MenuSection[] = [];
  for (const a of actions) {
    if (!a.places.includes(place)) continue;
    const last = sections[sections.length - 1];
    if (last && last.group === a.group) last.actions.push(a);
    else sections.push({ group: a.group, submenu: false, actions: [a] });
  }
  for (const s of sections) s.submenu = s.actions.some((a) => a.choice) || s.actions.length > SUBMENU_ABOVE;
  return sections;
}
