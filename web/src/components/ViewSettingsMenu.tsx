import { useRef } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { t } from '../i18n';
import { CENTER_PEEK_SHIPPED } from '../peek';
import { MAX_QUICK_FILTERS, quickFilterProps, subGroupProps } from '../quickFilters';
import type { PropDef, ViewDef } from '../types';
import { IconButton } from '../ui/IconButton';
import { Menu, MenuCheckboxItem, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuSubmenu } from '../ui/Menu';
import { ViewActionItems } from './CollectionMenus';
import ViewOpenMenu from './ViewOpenMenu';

// A view's one Settings button (spec 012, US4, research R8, #270).
//
// Configuring a view used to be spread over four places: a Properties button
// wearing the sliders icon people read as "settings", an unlabelled ⋯ (rename,
// move, remove, how rows open), a Columns popover, and loose <select>s for a
// timeline's dates and a table's sub-items. One place now, built from ui/Menu
// only, so it keeps that component's keyboard, focus return, Tab containment
// and phone sheet (spec 010) without a second panel component:
//
//   View settings      rename, property visibility, how rows open, and the
//                      view type's own options (timeline dates, sub-items)
//   ─────              move left, move right, remove view (danger, last)
//   Database settings  edit properties (the schema dialog), lock or unlock
//                      the views (spec 013)
//
// While the views are locked, the View settings part and the view actions are
// not drawn at all: the server refuses each of them (views_locked), and an
// item that is offered only to be refused is a promise the interface breaks.
// Database settings stay: the schema is not covered by the lock, and Unlock
// views is how the lock comes off.
//
// Each item that holds a value shows it on the right (MenuSubmenu value). There
// is no Layout item: a view's type cannot be changed today (research R9). Not
// drawn in a database embedded in a document (research R10, spec 014).

export function openInLabel(view: ViewDef): string {
  if (view.openIn === 'side_peek') return t('Side peek');
  if (view.openIn === 'center_peek' && CENTER_PEEK_SHIPPED) return t('Center peek');
  return t('Full page');
}

export default function ViewSettingsMenu({
  view,
  views,
  schema,
  selfRelProps,
  dateProps,
  open,
  onOpenChange,
  onChange,
  onRename,
  onMove,
  onRemove,
  onEditProperties,
  locked,
  onLock,
  onUnlock,
}: {
  view: ViewDef;
  views: ViewDef[];
  schema: PropDef[];
  /** Relation properties pointing back at this database: a table's sub-items. */
  selfRelProps: PropDef[];
  /** Date properties: a timeline's start and end. */
  dateProps: PropDef[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (patch: Partial<ViewDef>) => void;
  onRename: (v: ViewDef) => void;
  onMove: (v: ViewDef, delta: -1 | 1) => void;
  onRemove: (v: ViewDef) => void;
  onEditProperties: () => void;
  /** The database's views are locked (spec 013). */
  locked: boolean;
  onLock: () => void;
  onUnlock: () => void;
}) {
  // Where focus goes when the menu closes, and so where a dialog it opened
  // (Rename view, Edit properties) gives it back. Without it, focus fell to
  // <body> after the rename dialog: the button is a tooltip trigger as well,
  // and Base UI's own return did not reach it (view-settings.mjs).
  const button = useRef<HTMLButtonElement>(null);
  const hidden = new Set(view.hidden ?? []);
  const shown = schema.filter((p) => !hidden.has(p.id)).length;
  const toggle = (id: string, show: boolean) => {
    const next = new Set(hidden);
    if (show) next.delete(id);
    else next.add(id);
    onChange({ hidden: [...next] });
  };
  const nameOf = (id: string | undefined, among: PropDef[]) => among.find((p) => p.id === id)?.name;
  // Quick filters (spec 013): the properties a chip can offer, in the
  // schema's order; what the view offers keeps the order it was added in.
  const quickCandidates = quickFilterProps(schema);
  const offered = (view.quickFilters ?? []).filter((id) => quickCandidates.some((p) => p.id === id));
  const toggleQuick = (id: string, on: boolean) =>
    onChange({ quickFilters: on ? [...offered, id] : offered.filter((x) => x !== id) });
  const laneCandidates = subGroupProps(schema, view.groupBy);
  // A timeline with no start property draws its bars from the first date
  // property (CollectionView's TimelineView call), so None would be a value
  // the view is not using: the item says which property that is.
  const timelineStart = view.dateProp || dateProps[0]?.id;
  // A radio group over properties, with "none" first: the timeline's end date
  // and the table's sub-items are optional, and the old <select>s offered
  // "(none)" for the start date too. Its label is passed in rather than one
  // shared "None", which no language can decline for every noun it follows
  // (es: Ninguna for a date, Ninguno for Sub-items).
  const propRadio = (value: string | undefined, among: PropDef[], set: (id: string | undefined) => void, none: string) => (
    <MenuRadioGroup value={value ?? ''} onValueChange={(v) => set(v || undefined)}>
      <MenuRadioItem value="">{none}</MenuRadioItem>
      {among.map((p) => (
        <MenuRadioItem key={p.id} value={p.id}>
          {p.name}
        </MenuRadioItem>
      ))}
    </MenuRadioGroup>
  );

  return (
    <Menu
      label={t('{name} view settings', { name: view.name })}
      narrow="sheet"
      open={open}
      onOpenChange={onOpenChange}
      className="view-settings-menu"
      returnFocus={button}
      trigger={<IconButton ref={button} label={t('Settings')} icon={<SlidersHorizontal size={16} />} size="sm" className="view-settings-btn" />}
    >
      {!locked && (
        <>
          <MenuLabel>{t('View settings')}</MenuLabel>
          <MenuItem fn="rename" opensDialog onClick={() => onRename(view)}>
            {t('Rename view')}
          </MenuItem>
          {/* On a form too: hiding a property there takes its field off the form,
              as the Columns popover did. */}
          {schema.length > 0 && (
            <MenuSubmenu
              fn="propertyVisibility"
              label={t('Property visibility')}
              value={t('{n} of {total}', { n: shown, total: schema.length })}
            >
              {schema.map((p) => (
                <MenuCheckboxItem
                  key={p.id}
                  fn="propertyVisibility"
                  checked={!hidden.has(p.id)}
                  onCheckedChange={(c) => toggle(p.id, c)}
                  closeOnClick={false}
                >
                  {p.name}
                </MenuCheckboxItem>
              ))}
              <MenuSeparator />
              {/* The old Columns popover's two bulk actions, so nothing is lost. */}
              <MenuItem fn="showAllProperties" disabled={hidden.size === 0} closeOnClick={false} onClick={() => onChange({ hidden: [] })}>
                {t('Show all')}
              </MenuItem>
              <MenuItem
                fn="hideAllProperties"
                disabled={shown === 0}
                closeOnClick={false}
                onClick={() => onChange({ hidden: schema.map((p) => p.id) })}
              >
                {t('Hide all')}
              </MenuItem>
            </MenuSubmenu>
          )}
          {view.type !== 'form' && (
            <MenuSubmenu fn="openRowsIn" label={t('Open rows in')} value={openInLabel(view)}>
              <ViewOpenMenu view={view} onChange={(openIn) => onChange({ openIn })} bare />
            </MenuSubmenu>
          )}
          {view.type === 'timeline' && (
            <>
              <MenuSubmenu fn="timelineDates" label={t('Start date')} value={nameOf(timelineStart, dateProps) ?? t('No start date')}>
                {propRadio(timelineStart, dateProps, (id) => onChange({ dateProp: id }), t('No start date'))}
              </MenuSubmenu>
              <MenuSubmenu fn="timelineDates" label={t('End date')} value={nameOf(view.endDateProp, dateProps) ?? t('No end date')}>
                {propRadio(view.endDateProp, dateProps, (id) => onChange({ endDateProp: id }), t('No end date'))}
              </MenuSubmenu>
            </>
          )}
          {view.type !== 'form' && view.type !== 'chart' && quickCandidates.length > 0 && (
            <MenuSubmenu
              fn="quickFilters"
              label={t('Quick filters')}
              value={offered.length ? String(offered.length) : t('None')}
            >
              {quickCandidates.map((p) => (
                <MenuCheckboxItem
                  key={p.id}
                  fn="quickFilters"
                  checked={offered.includes(p.id)}
                  // At most 8 (the server's rule): the rest wait until one goes.
                  disabled={!offered.includes(p.id) && offered.length >= MAX_QUICK_FILTERS}
                  onCheckedChange={(c) => toggleQuick(p.id, c)}
                  closeOnClick={false}
                >
                  {p.name}
                </MenuCheckboxItem>
              ))}
            </MenuSubmenu>
          )}
          {view.type === 'board' && laneCandidates.length > 0 && (
            <MenuSubmenu fn="subGroup" label={t('Sub-group')} value={nameOf(view.subGroupBy, laneCandidates) ?? t('No sub-group')}>
              {propRadio(view.subGroupBy, laneCandidates, (id) => onChange({ subGroupBy: id ?? '' }), t('No sub-group'))}
            </MenuSubmenu>
          )}
          {view.type === 'table' && selfRelProps.length > 0 && (
            <MenuSubmenu fn="subItems" label={t('Sub-items')} value={nameOf(view.subItemProp, selfRelProps) ?? t('No sub-items')}>
              {propRadio(view.subItemProp, selfRelProps, (id) => onChange({ subItemProp: id }), t('No sub-items'))}
            </MenuSubmenu>
          )}
          {views.length > 1 && <MenuSeparator />}
          <ViewActionItems view={view} views={views} onRename={onRename} onMove={onMove} onRemove={onRemove} rename={false} />
          <MenuSeparator />
        </>
      )}
      <MenuLabel>{t('Database settings')}</MenuLabel>
      <MenuItem fn="editProperties" opensDialog onClick={onEditProperties}>
        {t('Edit properties')}
      </MenuItem>
      {locked ? (
        <MenuItem fn="unlockViews" onClick={onUnlock}>
          {t('Unlock views')}
        </MenuItem>
      ) : (
        <MenuItem fn="lockViews" onClick={onLock}>
          {t('Lock views')}
        </MenuItem>
      )}
    </Menu>
  );
}
