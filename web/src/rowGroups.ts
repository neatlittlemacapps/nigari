// A table or list grouped by a property (spec 024, research R3). Pure: no
// React, no requests, so check-rowgroups.mjs can hold it to its rules.
//
// The rows are the ones the view already loaded and filtered; grouping is one
// pass over them, so every group's count is the rows drawn under it (SC-003).
//
// A group's key is what hiddenGroups and a person's foldedGroups store, the
// same keys a chart's groups have, so a grouping hidden on a chart is hidden
// on the table made from it: an option, page or person id; "true" / "false"
// for a checkbox; the chart's period key for a date (2026-03-14, 2026-W11,
// 2026-03, 2026); a status group id with statusGroups; "" for No value.

import { laneIdsOf, laneValue, lanesFor, NO_VALUE as LANE_NO_VALUE } from './boardLanes';
import type { LaneProp } from './boardLanes';
import { isOptionType } from './types';
import type { StatusGroup } from './types';

/** The key of the No value group, as a chart's (chartLayout.NO_VALUE). */
export const NO_VALUE = '';

export const STATUS_GROUP_ORDER: StatusGroup[] = ['todo', 'in_progress', 'complete'];

export interface GroupProp extends LaneProp {
  options?: { id: string; name: string; group?: StatusGroup }[];
}

export interface GroupSettings {
  /** For a date: day, week, month or year. Month when absent. */
  period?: string;
  /** A status grouped by its groups instead of its options. */
  statusGroups?: boolean;
  /** Groups in reverse order; No value stays last. */
  reverse?: boolean;
  /** Draw groups that have no rows (only groups known without rows: a
   *  select's options, a status's groups, a checkbox's two). */
  showEmpty?: boolean;
  /** Keys of groups not drawn. */
  hidden?: string[];
}

export interface RowGroup<R> {
  key: string;
  rows: R[];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The day part of a stored date: "2026-03-14", "2026-03-14T09:30", or a
 *  range {start, end} (its start). Null when there is no day. */
function dayOf(value: unknown): string | null {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? (value as { start?: unknown }).start : value;
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** A day's key for a period, as the server's chart grouping writes it
 *  (aggregate.go): the ISO week, so a week is the same on a chart. */
export function periodKey(day: string, period: string | undefined): string {
  const [y, m, d] = day.split('-').map(Number);
  switch (period) {
    case 'day':
      return day;
    case 'year':
      return String(y);
    case 'week': {
      const date = new Date(Date.UTC(y, m - 1, d)); // i18n-ok: UTC arithmetic on numbers, no text is parsed
      const weekday = (date.getUTCDay() + 6) % 7; // Monday = 0
      // The Thursday of this week decides the ISO year and week.
      const thursday = new Date(date.getTime() + (3 - weekday) * 86400000);
      const isoYear = thursday.getUTCFullYear();
      const jan1 = Date.UTC(isoYear, 0, 1); // i18n-ok: UTC arithmetic on numbers, no text is parsed
      const week = Math.floor((thursday.getTime() - jan1) / 86400000 / 7) + 1;
      return `${isoYear}-W${pad(week)}`;
    }
    default:
      return `${y}-${pad(m)}`;
  }
}

/** The group keys one row's value falls in. A list (multi-select, relation,
 *  several people) puts the row in each of its groups, as a board puts a
 *  card in each of its columns. */
export function groupKeysOf(prop: GroupProp, value: unknown, settings: GroupSettings = {}): string[] {
  if (prop.type === 'checkbox') return [value === true || value === 'true' ? 'true' : 'false'];
  if (prop.type === 'date') {
    const day = dayOf(value);
    return [day ? periodKey(day, settings.period) : NO_VALUE];
  }
  if (prop.type === 'status' && settings.statusGroups) {
    const option = (prop.options ?? []).find((o) => o.id === value);
    return [option?.group ?? NO_VALUE];
  }
  const known = isOptionType(prop.type)
    ? new Set((prop.options ?? []).map((o) => o.id))
    : null;
  const ids = known
    ? laneIdsOf(value, known)
    : laneIdsOf(value, new Set(lanesFor(prop, [value]).map((l) => l.id)));
  return ids.map((id) => (id === LANE_NO_VALUE ? NO_VALUE : id));
}

/** The groups known before any row is read, in their order: a select's or
 *  status's options, a status's groups, a checkbox's Checked then Unchecked.
 *  Empty for the rest, whose groups are the values the rows hold. */
function knownKeys(prop: GroupProp, settings: GroupSettings): string[] {
  if (prop.type === 'checkbox') return ['true', 'false'];
  if (prop.type === 'status' && settings.statusGroups) return [...STATUS_GROUP_ORDER];
  if (isOptionType(prop.type)) {
    return (prop.options ?? []).map((o) => o.id);
  }
  return [];
}

/** The groups of a table or list, in the order they are drawn. Option-like
 *  properties keep their options' order; dates run from the earliest period;
 *  people, relations, formulas and rollups the order first met. No value is
 *  always last, also reversed. Hidden groups are left out, and groups with no
 *  rows unless showEmpty. */
export function groupRows<R>(
  rows: R[],
  valueOf: (row: R) => unknown,
  prop: GroupProp,
  settings: GroupSettings = {},
): RowGroup<R>[] {
  const byKey = new Map<string, R[]>();
  for (const key of knownKeys(prop, settings)) byKey.set(key, []);
  for (const row of rows) {
    for (const key of groupKeysOf(prop, valueOf(row), settings)) {
      let list = byKey.get(key);
      if (!list) {
        list = [];
        byKey.set(key, list);
      }
      list.push(row);
    }
  }
  let keys = [...byKey.keys()].filter((k) => k !== NO_VALUE);
  if (prop.type === 'date') keys.sort();
  if (settings.reverse) keys.reverse();
  if (byKey.has(NO_VALUE) || settings.showEmpty) keys.push(NO_VALUE);
  if (prop.type === 'checkbox') keys = keys.filter((k) => k !== NO_VALUE);
  const hidden = new Set(settings.hidden ?? []);
  return keys
    .filter((k) => !hidden.has(k))
    .map((key) => ({ key, rows: byKey.get(key) ?? [] }))
    .filter((g) => g.rows.length > 0 || settings.showEmpty);
}

/** What a row dropped from one group into another writes, as a props patch
 *  for the place route (research R4), or null when the drop cannot change the
 *  value: the same group, a formula or rollup (nothing to write), a date
 *  grouped by a period or a status by its groups (a group is many values).
 *  A row with several values keeps the others: tags A and C dragged from A
 *  to B end as B and C. */
export function groupDropPatch(
  propId: string,
  prop: GroupProp,
  from: string,
  to: string,
  current: unknown,
  settings: GroupSettings = {},
): Record<string, unknown> | null {
  if (from === to) return null;
  if (prop.type === 'date') return null;
  if (prop.type === 'status' && settings.statusGroups) return null;
  if (prop.type === 'checkbox') return { [propId]: to === 'true' };
  const lane = (k: string) => (k === NO_VALUE ? LANE_NO_VALUE : k);
  const v = laneValue(prop, lane(to));
  if (v === null) return null;
  // The row's present value decides the shape too: several people on a
  // property not marked multiple are still a list, and must stay one.
  if (Array.isArray(current)) {
    const kept = current.filter((x) => String(x) !== from && String(x) !== to);
    return { [propId]: to === NO_VALUE ? kept : [...kept, to] };
  }
  return { [propId]: v };
}

/** Whether a drop into any group of this grouping can write a value: the
 *  interface shows no drop target for one that cannot (FR-011). */
export function groupAcceptsDrops(prop: GroupProp, settings: GroupSettings = {}): boolean {
  if (prop.type === 'formula' || prop.type === 'rollup' || prop.type === 'date') return false;
  return !(prop.type === 'status' && settings.statusGroups);
}
