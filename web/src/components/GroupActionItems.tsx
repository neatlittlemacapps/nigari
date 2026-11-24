import { Fragment, type ReactNode } from 'react';
import { MenuItem, MenuSeparator } from '../ui/Menu';
import { t } from '../i18n';
import { groupMenuSections, type GroupAction, type GroupPlace } from '../actions/groupActions';

// The items of a group's menu (spec 024, T020): drawn from GROUP_ACTIONS for
// one place, in its groups, with a separator between groups. Each action is
// written out with its function as a literal, because check-menu-icons.mjs
// reads fn="…" from the source. An action whose handler is missing is left
// out at that moment (Hide group for someone who may not change the view).

export type GroupActionHandlers = {
  hideGroup?: () => void;
  collapseAll?: () => void;
  expandAll?: () => void;
};

function item(a: GroupAction, h: GroupActionHandlers): ReactNode {
  switch (a.id) {
    case 'hideGroup':
      return h.hideGroup && <MenuItem fn="hideInView" onClick={h.hideGroup}>{t('Hide group')}</MenuItem>;
    case 'collapseAll':
      return h.collapseAll && <MenuItem fn="collapseAll" onClick={h.collapseAll}>{t('Collapse all groups')}</MenuItem>;
    case 'expandAll':
      return h.expandAll && <MenuItem fn="expandAll" onClick={h.expandAll}>{t('Expand all groups')}</MenuItem>;
  }
}

export function GroupActionItems({ place, handlers }: { place: GroupPlace; handlers: GroupActionHandlers }) {
  const sections = groupMenuSections(place)
    .map((s) => s.actions.map((a) => <Fragment key={a.id}>{item(a, handlers)}</Fragment>).filter((n) => n.props.children))
    .filter((items) => items.length > 0);
  return (
    <>
      {sections.map((items, i) => (
        <Fragment key={i}>
          {i > 0 && <MenuSeparator />}
          {items}
        </Fragment>
      ))}
    </>
  );
}
