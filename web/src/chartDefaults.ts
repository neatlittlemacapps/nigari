// The first chart of a database (spec 004, FR-019, research R14). A chart
// that opens empty, waiting for a person to find the right setting, reads as
// broken; Notion's donut appears drawn the moment it is inserted, and so does
// ours. The same rule fills in a grouping when a number chart becomes a bar,
// so a chart never lands in a state the server would refuse.
//
// Pure, checked by check-chartdefaults.mjs.

import type { PropDef, ViewDef } from './types';
import type { ChartKind } from './chartLayout';

/** The property types a chart groups by, as server/aggregate.go's
 *  groupableTypes. "status" is listed for when that type exists (#18). */
export const GROUPABLE_TYPES = ['select', 'status', 'multiselect', 'person', 'checkbox', 'date', 'relation'];

/** The property types a sum, average, minimum or maximum reads. */
export const NUMBER_TYPES = ['number', 'formula', 'rollup'];

export function groupable(schema: PropDef[]): PropDef[] {
  return schema.filter((p) => GROUPABLE_TYPES.includes(p.type));
}

/** The grouping a new chart starts with: the first select (or status), else
 *  the first property that groups at all, else none. */
export function defaultGrouping(schema: PropDef[]): PropDef | undefined {
  return schema.find((p) => p.type === 'select' || (p.type as string) === 'status') ?? groupable(schema)[0];
}

/** The grouping "Each row" (FR-030, server/aggregate.go's rowGroupKey): one
 *  bar per row, its height that row's number. Not a property id: those never
 *  start with two underscores. */
export const ROW_GROUP = '__row';

export function numberProps(schema: PropDef[]): PropDef[] {
  return schema.filter((p) => NUMBER_TYPES.includes(p.type));
}

/** Each row's value: a row's own number, never a count (every bar would be 1,
 *  and the server refuses it). Keeps an aggregate and a number property that
 *  still work. */
export function eachRowValue(schema: PropDef[], current: Partial<ViewDef> = {}): Partial<ViewDef> {
  const numbers = numberProps(schema);
  const agg = current.agg && current.agg !== 'count' ? current.agg : 'sum';
  const aggProp = numbers.some((p) => p.id === current.aggProp) ? current.aggProp : numbers[0]?.id;
  return { agg, aggProp };
}

/** The settings a chart needs to be drawable with this kind: a grouping for
 *  every kind but number (and the date period when the grouping is a date).
 *  With nothing to group by, Each row when the database has a number (the
 *  owner's case: a collection with only a name and a number). With neither,
 *  a number chart: the caller compares the kind it gets back with the one
 *  asked for, and says what to add (FR-031) instead of switching silently. */
export function chartSettingsFor(kind: ChartKind, schema: PropDef[], current: Partial<ViewDef> = {}): Partial<ViewDef> {
  if (kind === 'number') return { chartKind: 'number' };
  const hasNumber = numberProps(schema).length > 0;
  if (current.groupBy === ROW_GROUP && hasNumber) {
    return { chartKind: kind, groupBy: ROW_GROUP, ...eachRowValue(schema, current) };
  }
  const keep = current.groupBy && groupable(schema).some((p) => p.id === current.groupBy) ? current.groupBy : undefined;
  const g = keep ? schema.find((p) => p.id === keep) : defaultGrouping(schema);
  if (!g) {
    if (hasNumber) return { chartKind: kind, groupBy: ROW_GROUP, ...eachRowValue(schema, current) };
    return { chartKind: 'number' };
  }
  const out: Partial<ViewDef> = { chartKind: kind, groupBy: g.id };
  if (g.type === 'date') out.groupPeriod = current.groupPeriod ?? 'month';
  return out;
}

/** A new chart view of this kind on a database: drawable from the start. */
export function defaultChartView(kind: ChartKind, schema: PropDef[], id: string, name: string): ViewDef {
  return { id, name, type: 'chart', ...chartSettingsFor(kind, schema) } as ViewDef;
}
