import { MenuRadioGroup, MenuRadioItem, MenuSubmenu } from '../ui/Menu';
import { t } from '../i18n';
import type { PropDef } from '../types';

// A property's visibility on row pages (spec 015): Always show, Hide when
// empty, Always hide. A choice among values, so a submenu (the Content
// actions rule); drawn by the row's page only, which is the one place that
// has it (actions/propertyActions.ts), and kept out of the shared renderer
// so the table's menus do not load it.

const VISIBILITY = ['show', 'hide_empty', 'hide'] as const;

function visibilityLabel(v: (typeof VISIBILITY)[number]): string {
  return v === 'hide_empty' ? t('Hide when empty') : v === 'hide' ? t('Always hide') : t('Always show');
}

export function RowPageVisibilityMenu({
  value,
  onChange,
}: {
  value: PropDef['pageVisibility'];
  onChange: (v: PropDef['pageVisibility']) => void;
}) {
  const current = value ?? 'show';
  return (
    <MenuSubmenu fn="rowPageVisibility" label={t('Property visibility')} value={visibilityLabel(current)}>
      <MenuRadioGroup
        label={t('Property visibility')}
        value={current}
        onValueChange={(next) => onChange(next === 'show' ? undefined : (next as PropDef['pageVisibility']))}
      >
        {VISIBILITY.map((x) => (
          <MenuRadioItem key={x} value={x}>
            {visibilityLabel(x)}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </MenuSubmenu>
  );
}
