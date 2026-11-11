// A board's lanes (spec 013, US4, research R9): a second grouping drawn as
// horizontal lanes across the board's columns. Pure: no React, no requests,
// so check-boardlanes.mjs can hold it to its rules.
//
// Each card sits in one cell, the meeting of its column and its lane. A drop
// on another cell writes both values in one change (one request, one history
// entry), so a card is never half-moved.

export const NO_VALUE = '__unset__';

// The separator inside a cell's key. A unit separator, not a colon: option,
// person and page ids are free to contain colons, and a key that split in
// the wrong place would move a card into a lane that does not exist.
const SEP = '\u001f';

export function cellKey(lane: string, col: string): string {
  return lane + SEP + col;
}

export function parseCellKey(key: string): { lane: string; col: string } | null {
  const i = key.indexOf(SEP);
  if (i < 0) return null;
  return { lane: key.slice(0, i), col: key.slice(i + SEP.length) };
}

export interface LaneProp {
  type: string;
  options?: { id: string; name: string }[];
  personMultiple?: boolean;
}

export interface Lane {
  id: string;
  /** For an option the option's name; for anything else the value itself,
   *  which the caller turns into a person's or a page's name. */
  name: string;
}

/** The values one row holds for the lane property, as lane ids. A list
 *  (multi-select, relation, several people) puts the card in each of its
 *  lanes, as a multi-select puts it in each of its columns. Nothing, or only
 *  values that are not lanes, is the No value lane. */
export function laneIdsOf(value: unknown, lanes: Lane[]): string[] {
  const known = new Set(lanes.map((l) => l.id));
  const list = Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value];
  const ids = list.map((v) => (typeof v === 'number' || typeof v === 'boolean' ? String(v) : typeof v === 'string' ? v : '')).filter((v) => v && known.has(v));
  return ids.length ? [...new Set(ids)] : [NO_VALUE];
}

/** The lanes of a board: an option's lanes in the order of its options; for
 *  everything else the values the rows hold, in the order first met. Always
 *  a No value lane last, as a board always has its No value column. */
export function lanesFor(prop: LaneProp, values: unknown[]): Lane[] {
  if (prop.type === 'select' || prop.type === 'multiselect') {
    return [...(prop.options ?? []).map((o) => ({ id: o.id, name: o.name })), { id: NO_VALUE, name: '' }];
  }
  const seen = new Map<string, Lane>();
  for (const value of values) {
    const list = Array.isArray(value) ? value : [value];
    for (const v of list) {
      const id = typeof v === 'number' || typeof v === 'boolean' ? String(v) : typeof v === 'string' ? v : '';
      if (id && !seen.has(id)) seen.set(id, { id, name: id });
    }
  }
  return [...seen.values(), { id: NO_VALUE, name: '' }];
}

/** The value a lane stands for, in the shape the property stores: an id for
 *  a select or one person, a list for a multi-select, a relation or several
 *  people; empty for the No value lane. Null for a property no drag can
 *  write (a formula, a rollup). */
export function laneValue(prop: LaneProp, lane: string): unknown {
  if (prop.type === 'formula' || prop.type === 'rollup') return null;
  const list = prop.type === 'multiselect' || prop.type === 'relation' || (prop.type === 'person' && !!prop.personMultiple);
  if (lane === NO_VALUE) return list ? [] : '';
  return list ? [lane] : lane;
}

/** What a drop from one cell to another writes: both values when both
 *  changed, one when one did, nothing for the cell it came from or for a
 *  lane change on a property no drag can write (FR-018). `columnValue` is
 *  the board's own, unchanged rule for its column (groupValueFor). */
export function dropPatch(
  from: string,
  to: string,
  groupBy: string,
  laneBy: string,
  laneProp: LaneProp,
  columnValue: (col: string) => unknown,
): Record<string, unknown> | null {
  const a = parseCellKey(from);
  const b = parseCellKey(to);
  if (!a || !b) return null;
  const patch: Record<string, unknown> = {};
  if (a.lane !== b.lane) {
    const v = laneValue(laneProp, b.lane);
    if (v === null) return null;
    patch[laneBy] = v;
  }
  if (a.col !== b.col) patch[groupBy] = columnValue(b.col);
  return Object.keys(patch).length ? patch : null;
}
