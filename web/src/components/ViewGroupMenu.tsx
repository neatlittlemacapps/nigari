import type { ReactNode } from 'react';
import { t } from '../i18n';
import { isOptionType, type PropDef, type ViewDef } from '../types';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Switch';

// The Group popover of the view bar (spec 024, T017), moved out of
// CollectionView.tsx (over 1,400 lines, frontend rules). A board picks the
// property its columns are made from, as before. A table or list picks the
// property its rows are grouped by, or none, and then how the groups are
// shown: a date's period, the order, empty groups, hidden groups, and every
// group folded or open.
//
// Everything but folding is the view's and is saved for everyone (onChange,
// the same updateView the other controls use, so the views lock applies).
// Folding is the person's own (onFoldAll).

/** The property types a table or list groups by: the server's
 *  rowGroupTypes (server/viewgroup.go). */
const ROW_GROUP_TYPES = new Set(['select', 'multiselect', 'status', 'relation', 'person', 'checkbox', 'date', 'formula', 'rollup']);

export function canGroupRowsBy(p: PropDef): boolean {
  return ROW_GROUP_TYPES.has(p.type);
}

export default function ViewGroupMenu({
  schema,
  view,
  onChange,
  labelOf,
  onFoldAll,
}: {
  schema: PropDef[];
  view: ViewDef;
  /** Absent while the views are locked: only folding is offered, which is
   *  the person's own (spec 024, T022). */
  onChange?: (patch: Partial<ViewDef>) => void;
  /** How a hidden group's key reads (its option, person, period…). */
  labelOf?: (key: string) => ReactNode;
  /** Fold or open every group, for this person. Absent where folding
   *  cannot be kept, or when nothing is grouped. */
  onFoldAll?: (folded: boolean) => void;
}) {
  if (!onChange) {
    return (
      <div className="view-group-menu">
        {onFoldAll && (
          <div className="view-group-actions">
            <Button size="sm" emphasis="low" onClick={() => onFoldAll(false)}>
              {t('Expand all groups')}
            </Button>
            <Button size="sm" emphasis="low" onClick={() => onFoldAll(true)}>
              {t('Collapse all groups')}
            </Button>
          </div>
        )}
      </div>
    );
  }
  if (view.type === 'board') {
    return (
      <div className="fs-row">
        <select className="prop-select" aria-label={t('Group by')} value={view.groupBy ?? ''} onChange={(e) => onChange({ groupBy: e.target.value })}>
          {/* A relation belongs here as much as a select does: "one column
              per system" is the same question as "one column per status",
              just answered by another database. */}
          {schema
            .filter((p) => isOptionType(p.type) || p.type === 'relation')
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </div>
    );
  }
  const grouped = !!view.grouped && !!view.groupBy && schema.some((p) => p.id === view.groupBy);
  const groupProp = grouped ? schema.find((p) => p.id === view.groupBy) : undefined;
  const hidden = view.hiddenGroups ?? [];
  return (
    <div className="view-group-menu">
      <div className="fs-row">
        <select
          className="prop-select"
          aria-label={t('Group by')}
          value={grouped ? view.groupBy : ''}
          onChange={(e) => {
            const id = e.target.value;
            // A new property's groups are not the old one's: what was hidden,
            // the period and status groups mean nothing here, as set_view's
            // applyGroupSpec drops them (code review: status groups left on a
            // date were refused, so the grouping could not be changed).
            if (id) onChange({ grouped: true, groupBy: id, ...(id !== view.groupBy ? { hiddenGroups: undefined, groupPeriod: undefined, statusGroups: undefined } : {}) });
            else onChange({ grouped: false });
          }}
        >
          <option value="">{t('No grouping')}</option>
          {schema.filter(canGroupRowsBy).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {grouped && (
        <>
          {groupProp?.type === 'date' && (
            // The chart's choice and words (ChartSettings): a date groups by
            // day, week, month or year, month unless chosen. Another period
            // makes other groups: what was hidden by the old one goes. A
            // native select, as Group by above: ui/Select's list opened
            // under this popover.
            <div className="fs-row">
              <select
                className="prop-select"
                aria-label={t('Period')}
                value={view.groupPeriod ?? 'month'}
                onChange={(e) => onChange({ groupPeriod: e.target.value as ViewDef['groupPeriod'], hiddenGroups: undefined })}
              >
                <option value="day">{t('Day')}</option>
                <option value="week">{t('Week')}</option>
                <option value="month">{t('Month')}</option>
                <option value="year">{t('Year')}</option>
              </select>
            </div>
          )}
          <Switch label={t('Reverse order')} checked={!!view.groupReverse} onCheckedChange={(on) => onChange({ groupReverse: on || undefined })} />
          <Switch label={t('Show empty groups')} checked={!!view.showEmptyGroups} onCheckedChange={(on) => onChange({ showEmptyGroups: on || undefined })} />
          {hidden.length > 0 && (
            <div className="view-group-hidden">
              <div className="view-group-hidden-title">{t('Hidden groups')}</div>
              {hidden.map((key) => (
                <div key={key} className="view-group-hidden-row">
                  <span className="view-group-hidden-name">{labelOf ? labelOf(key) : key}</span>
                  <Button
                    size="sm"
                    emphasis="low"
                    onClick={() => {
                      const rest = hidden.filter((k) => k !== key);
                      onChange({ hiddenGroups: rest.length ? rest : undefined });
                    }}
                  >
                    {t('Show')}
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="view-group-actions">
            {onFoldAll && (
              <>
                <Button size="sm" emphasis="low" onClick={() => onFoldAll(false)}>
                  {t('Expand all groups')}
                </Button>
                <Button size="sm" emphasis="low" onClick={() => onFoldAll(true)}>
                  {t('Collapse all groups')}
                </Button>
              </>
            )}
            <Button size="sm" emphasis="low" onClick={() => onChange({ grouped: false })}>
              {t('Remove grouping')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
