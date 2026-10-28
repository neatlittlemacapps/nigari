// The rows behind a group (spec 004, FR-006, research R9): one more filter on
// the ordinary rows query, so the list under a bar holds exactly as many rows
// as the bar says, and there is no second way of reading rows to drift.
//
// Pure, checked by check-chartlayout.mjs.

import type { Filter } from './types';
import { NO_VALUE } from './chartLayout';

export type GroupingType = string;

/** The conditions that select one drawn group's rows, or null when the group
 *  cannot be expressed as a filter (the number chart's one group is every
 *  row: the view's own filters already say which). */
export function groupFilter(
  property: string,
  type: GroupingType,
  period: string | undefined,
  keys: string[],
): Filter[] | null {
  if (keys.length === 0 || keys.includes('*')) return null;
  if (keys.length === 1 && keys[0] === NO_VALUE) {
    return [{ property, op: 'is_empty', value: '' }];
  }
  if (type === 'checkbox') {
    // A box nobody touched counts as unticked, on screen and in the server's
    // "is false" (typedIs), so the two lists agree.
    return [{ property, op: 'is', value: keys[0] === 'true' ? 'true' : 'false' }];
  }
  if (type === 'date') {
    const [from, to] = periodRange(keys[0], period ?? 'month');
    return [{ property, op: 'between', value: from, value2: to }];
  }
  // "is" matches a single value or one element of a list (multi-select,
  // relation, several people), as the server's GROUP BY counted them. Several
  // keys are the folded "Other": any of them.
  if (keys.length === 1) return [{ property, op: 'is', value: keys[0] }];
  return [{ property, op: 'is', value: '', values: keys.filter((k) => k !== NO_VALUE) }];
}

/** The first and last day of a period key, as the server writes them:
 *  2026-03-14, 2026-W11, 2026-03, 2026. */
export function periodRange(key: string, period: string): [string, string] {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  switch (period) {
    case 'day':
      return [key, key];
    case 'week': {
      const [y, w] = key.split('-W').map(Number);
      // 4 January is always in ISO week 1; its Monday starts week 1.
      const jan4 = new Date(Date.UTC(y, 0, 4)); // i18n-ok: UTC arithmetic on numbers, no text is parsed
      const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000 + (w - 1) * 7 * 86400000);
      return [day(monday), day(new Date(monday.getTime() + 6 * 86400000))];
    }
    case 'year':
      return [`${key}-01-01`, `${key}-12-31`];
    default: {
      const [y, m] = key.split('-').map(Number);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // i18n-ok: UTC arithmetic on numbers, no text is parsed
      return [`${key}-01`, `${key}-${pad(last)}`];
    }
  }
}
