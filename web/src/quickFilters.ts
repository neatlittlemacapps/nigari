// Which properties a view may offer as quick filters, and which a board may
// draw lanes by (spec 013). The server's rules are checkViewQuickFilters and
// checkViewSubGroup (server/viewopen.go); these lists are the same, so the
// Settings menu never offers what the server would refuse.
import type { PropDef } from './types';

const QUICK_FILTER_TYPES = new Set(['select', 'multiselect', 'person', 'checkbox', 'relation']);
const SUB_GROUP_TYPES = new Set(['select', 'multiselect', 'relation', 'person', 'formula', 'rollup']);
/** Lanes of these are drawn, but a card cannot be dragged between them: no
 *  drag can change a computed value (FR-018). */
const READ_ONLY_LANE_TYPES = new Set(['formula', 'rollup']);

export const MAX_QUICK_FILTERS = 8;

export function quickFilterProps(schema: PropDef[]): PropDef[] {
  return schema.filter((p) => QUICK_FILTER_TYPES.has(p.type));
}

export function subGroupProps(schema: PropDef[], groupBy: string | undefined): PropDef[] {
  return schema.filter((p) => SUB_GROUP_TYPES.has(p.type) && p.id !== groupBy);
}

export function laneIsReadOnly(prop: PropDef | undefined): boolean {
  return !prop || READ_ONLY_LANE_TYPES.has(prop.type);
}
