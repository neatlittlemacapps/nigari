// Everything a person can do to one group of a grouped table or list from its
// header's menu, listed once (spec 024, T020; the Content actions row in
// .specify/memory/surfaces.md, as rowActions.ts does for a row).
//
// The header has one place, so nothing is left out anywhere and there is no
// reasons file. Hide group is the view's: it is stored for everyone, as a
// chart's hidden groups are. Collapse all and Expand all are the person's
// own folding (foldedGroups). The Group menu in the view bar offers the same
// two as buttons beside the grouping they act on.

import type { MenuFunction } from '../menuIcons';

/** Where a group's menu is: its header's ⋯ and a right-click on it. */
export type GroupPlace = 'groupHeader';

export type GroupAction = {
  id: 'hideGroup' | 'collapseAll' | 'expandAll';
  fn: MenuFunction;
  group: 'view' | 'fold';
  places: GroupPlace[];
};

export const GROUP_ACTIONS: readonly GroupAction[] = [
  // The function is the verb (spec 010): hiding something in this view, as a
  // column's Hide in view does, so it shares that function and its icon.
  { id: 'hideGroup', fn: 'hideInView', group: 'view', places: ['groupHeader'] },
  { id: 'collapseAll', fn: 'collapseAll', group: 'fold', places: ['groupHeader'] },
  { id: 'expandAll', fn: 'expandAll', group: 'fold', places: ['groupHeader'] },
];

/** More related actions than this in one group earn a submenu of their own. */
export const SUBMENU_ABOVE = 3;

export type GroupMenuSection = { group: GroupAction['group']; submenu: boolean; actions: GroupAction[] };

/** A place's menu as sections in list order (rowMenuSections' rule). */
export function groupMenuSections(place: GroupPlace, actions: readonly GroupAction[] = GROUP_ACTIONS): GroupMenuSection[] {
  const sections: GroupMenuSection[] = [];
  for (const a of actions) {
    if (!a.places.includes(place)) continue;
    const last = sections[sections.length - 1];
    if (last && last.group === a.group) last.actions.push(a);
    else sections.push({ group: a.group, submenu: false, actions: [a] });
  }
  for (const s of sections) s.submenu = s.actions.length > SUBMENU_ABOVE;
  return sections;
}
