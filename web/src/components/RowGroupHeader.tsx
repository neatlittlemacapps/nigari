import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react';
import { NO_VALUE } from '../rowGroups';
import { statusGroupLabel, STATUS_GROUPS } from '../statusGroups';
import { formatDay, formatMonth } from '../format';
import { t, plural } from '../i18n';
import type { PropDef, StatusGroup } from '../types';
import type { GroupSettings } from '../rowGroups';
import { Button } from '../ui/Button';
import { Menu } from '../ui/Menu';
import { chip } from './PropertyValue';
import { useLaneNames } from './BoardLaneHead';
import { GroupActionItems, type GroupActionHandlers } from './GroupActionItems';

// A group's header in a grouped table (spec 024, US1): a fold button, the
// group's value as the cell shows it (an option as its chip, a person or a
// page by name), how many rows it holds, and its menu (the ⋯ and a
// right-click), drawn from the group action list. One <tr> heading its own
// <tbody>, so a screen reader hears the rows as belonging to it. In a module
// of its own: CollectionView.tsx is over 1,400 lines (frontend rules).

/** A table or list grouped by a property (spec 024): the groups are worked
 *  out in the view, from the rows as drawn. */
export type RowGrouping = {
  prop: PropDef;
  settings: GroupSettings;
  /** The keys this person folded. */
  folded: ReadonlySet<string>;
  /** Absent where folding cannot be kept (an embed without a place). */
  onFold?: (keys: readonly string[], folded: boolean) => void;
  onFoldAll?: (folded: boolean) => void;
  /** Hide a group for everyone. Absent for someone who may not change the view. */
  onHide?: (key: string) => void;
};

/** How a group's key reads in its header: the option's chip, a person's or
 *  page's name, Checked / Unchecked, a status group, a period of a date, or
 *  "No {property}". */
export function useGroupLabel(prop: PropDef | undefined, period: string | undefined): (key: string) => ReactNode {
  const named = useLaneNames(prop);
  return (key) => {
    if (!prop) return key;
    if (key === NO_VALUE) return t('No {name}', { name: prop.name });
    if (prop.type === 'checkbox') return key === 'true' ? t('Checked') : t('Unchecked');
    if (STATUS_GROUPS.includes(key as StatusGroup) && prop.type === 'status' && !prop.options?.some((o) => o.id === key)) {
      return statusGroupLabel(key as StatusGroup);
    }
    const option = prop.options?.find((o) => o.id === key);
    if (option) return chip(option, option.name);
    if (prop.type === 'date') return periodLabel(key, period);
    return named({ id: key, name: key });
  };
}

/** A date group's key as words: a day, the week by its Monday, a month, a
 *  year (the keys rowGroups.periodKey writes). */
function periodLabel(key: string, period: string | undefined): string {
  if (period === 'year') return key;
  if (period === 'day') return formatDay(key);
  const week = /^(\d{4})-W(\d{2})$/.exec(key);
  if (week) {
    // The Monday of ISO week N: the week holding 4 January, then N-1 more.
    const y = Number(week[1]);
    const jan4 = Date.UTC(y, 0, 4); // i18n-ok: UTC arithmetic on numbers, no text is parsed
    const monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * 86400000 + (Number(week[2]) - 1) * 7 * 86400000; // i18n-ok: a number of milliseconds, no text is parsed
    return t('Week of {day}', { day: formatDay(new Date(monday).toISOString().slice(0, 10)) }); // i18n-ok: a number of milliseconds, no text is parsed
  }
  const month = /^(\d{4})-(\d{2})$/.exec(key);
  if (month) return formatMonth(Number(month[1]), Number(month[2]) - 1, 'long');
  return key;
}

export default function RowGroupHeader({
  colSpan,
  list,
  label,
  count,
  folded,
  onFold,
  actions,
}: {
  colSpan?: number;
  /** In a list (T027): a row of the list's grid across its width, not a
   *  table row; the rows it heads follow it, not inside it, so a phone's
   *  grid still lines up their cells. */
  list?: boolean;
  label: ReactNode;
  count: number;
  folded: boolean;
  /** Absent where folding cannot be kept (an embed without a place). */
  onFold?: (folded: boolean) => void;
  actions: GroupActionHandlers;
}) {
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);
  const hasActions = !!(actions.hideGroup || actions.collapseAll || actions.expandAll);
  const onContextMenu = (e: React.MouseEvent) => {
    if (!hasActions) return;
    e.preventDefault();
    setMenuAt({ x: e.clientX, y: e.clientY });
    setOpen(true);
  };
  const inner = (
        <div className="db-group-head-inner">
          {onFold && (
            <Button
              emphasis="low"
              size="sm"
              label={folded ? t('Expand group') : t('Collapse group')}
              icon={folded ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              aria-expanded={!folded}
              onClick={() => onFold(!folded)}
            />
          )}
          <span className="db-group-name">{label}</span>
          <span className="db-group-count" aria-label={plural(count, '{n} row', '{n} rows')}>
            {count}
          </span>
          {hasActions && (
            <Menu
              label={t('Group actions')}
              open={open}
              onOpenChange={(o) => {
                setOpen(o);
                if (!o) setMenuAt(null);
              }}
              anchorPoint={menuAt}
              narrow="sheet"
              trigger={<Button emphasis="low" size="sm" className="db-group-more" label={t('Group actions')} icon={<MoreHorizontal size={14} />} />}
            >
              <GroupActionItems place="groupHeader" handlers={actions} />
            </Menu>
          )}
        </div>
  );
  if (list) {
    return (
      <div className="db-group-head list-group-head" onContextMenu={onContextMenu}>
        {inner}
      </div>
    );
  }
  return (
    <tr className="db-group-head" onContextMenu={onContextMenu}>
      <th colSpan={colSpan} scope="rowgroup">
        {inner}
      </th>
    </tr>
  );
}
