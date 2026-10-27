import { t } from '../i18n';
import { CENTER_PEEK_SHIPPED } from '../peek';
import type { ViewDef } from '../types';
import './ViewOpenMenu.css';

// "Open pages in" for one view (spec 007, research R8), inside the view
// options menu. A setting of the VIEW, saved with it like its filters, so
// everybody who opens the view gets the same behaviour; the server checks the
// value (server/viewopen.go), so a reader's change is refused there like any
// other view change.
//
// Native radios rather than menu buttons: one choice out of a few is exactly
// what a radio group is, the arrow keys move within it for free, and the menus
// are not in web/src/ui yet (spec 001 batch 2), so a hand-built button row
// would only add to the raw-button count that is meant to go down.

type Value = NonNullable<ViewDef['openIn']> | 'full_page';

export default function ViewOpenMenu({
  view,
  onChange,
}: {
  view: ViewDef;
  onChange: (openIn: ViewDef['openIn']) => void;
}) {
  if (view.type === 'form') return null; // a form shows no rows to open
  const current: Value = view.openIn ?? 'full_page';
  const options: { value: Value; label: string }[] = [
    { value: 'full_page', label: t('Full page') },
    { value: 'side_peek', label: t('Side peek') },
  ];
  if (CENTER_PEEK_SHIPPED) options.push({ value: 'center_peek', label: t('Center peek') });
  const name = `view-open-${view.id}`;
  return (
    <fieldset className="view-open-menu">
      <legend className="menu-label">{t('Open pages in')}</legend>
      {options.map((o) => (
        <label key={o.value} className="view-open-option">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={current === o.value}
            onChange={() => onChange(o.value === 'full_page' ? undefined : o.value)}
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}
