import { t } from '../i18n';
import { CENTER_PEEK_SHIPPED } from '../peek';
import type { ViewDef } from '../types';
import { MenuRadioGroup, MenuRadioItem } from '../ui/Menu';

// "Open pages in" for one view (spec 007, research R8), inside the view
// options menu. A setting of the VIEW, saved with it like its filters, so
// everybody who opens the view gets the same behaviour; the server checks the
// value (server/viewopen.go), so a reader's change is refused there like any
// other view change.
//
// A radio group inside the view options menu (ui/Menu, spec 010): one choice
// out of a few is exactly what a radio group is, and the menu's arrow keys move
// through it with the rest of the items. Until spec 010 these were native
// radios, because the menus were not in web/src/ui yet.

type Value = NonNullable<ViewDef['openIn']> | 'full_page';

export default function ViewOpenMenu({
  view,
  onChange,
  bare = false,
}: {
  view: ViewDef;
  onChange: (openIn: ViewDef['openIn']) => void;
  /** Inside the Settings menu's "Open rows in" submenu, which already names
   *  the choice: no heading of its own. */
  bare?: boolean;
}) {
  if (view.type === 'form') return null; // a form shows no rows to open
  const current: Value = view.openIn ?? 'full_page';
  const options: { value: Value; label: string }[] = [
    { value: 'full_page', label: t('Full page') },
    { value: 'side_peek', label: t('Side peek') },
  ];
  if (CENTER_PEEK_SHIPPED) options.push({ value: 'center_peek', label: t('Center peek') });
  return (
    <MenuRadioGroup
      label={bare ? undefined : t('Open pages in')}
      value={current}
      onValueChange={(v) => onChange(v === 'full_page' ? undefined : (v as ViewDef['openIn']))}
    >
      {options.map((o) => (
        <MenuRadioItem key={o.value} value={o.value}>
          {o.label}
        </MenuRadioItem>
      ))}
    </MenuRadioGroup>
  );
}
