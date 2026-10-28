// What a chart draws, decided before anything is drawn (spec 004, research R4,
// R15). The server sends every group with its value (aggregate.go); this module
// turns that into the bars, slices or points on screen: the order the person
// chose, the groups they hid, the options with no rows they asked to see, and
// the tail folded into "Other" so a donut with forty slices stays readable.
//
// Pure, so check-chartlayout.mjs can pin each rule down. Nothing here is
// translated: labels the server wrote pass through, and the component names
// "Other" and "No value" in the reader's language.

export interface AggGroup {
  key: string;
  label: string;
  value: number | null;
  rows: number;
  missing?: boolean;
}

export interface AggResult {
  groups: AggGroup[];
  leftOut: number;
  total: number;
}

export type ChartKind = 'bar' | 'hbar' | 'line' | 'donut' | 'number';
export type ChartSort = 'auto' | 'label_asc' | 'label_desc' | 'value_asc' | 'value_desc';
export type ChartAgg = 'count' | 'sum' | 'avg' | 'min' | 'max';

/** The key the server gives rows without a value. */
export const NO_VALUE = '';
/** The key of the folded tail. Not a key the server can send: option ids,
 *  user ids and page ids never start with two underscores. */
export const OTHER = '__other';

/** At most this many groups are drawn (R4): twelve palette colours, and past
 *  about that many a donut's slices and a bar's labels stop being readable. */
export const MAX_DRAWN = 12;

export interface DrawnGroup extends AggGroup {
  /** For "Other", the keys folded into it; for any other group, its own key. */
  keys: string[];
}

export interface LayoutInput {
  result: AggResult;
  kind: ChartKind;
  agg: ChartAgg;
  sort?: ChartSort;
  /** Group keys the person hid (FR-022). */
  hidden?: string[];
  /** The older switch for "No value" (data-model.md): false hides it too. */
  showEmpty?: boolean;
  /** A select's or checkbox's options in their own order, for "show empty
   *  options" (FR-023): those without rows are drawn at zero. Only bars and
   *  lines take them; a donut has no slice of nothing. */
  zeroOptions?: { key: string; label: string }[];
  /** A date grouping: never folded (the server caps it at 400 periods), and
   *  its label order is time order. */
  isDate?: boolean;
}

export type LayoutState = 'ok' | 'empty' | 'all-hidden';

export interface Layout {
  state: LayoutState;
  /** What is drawn, in order. */
  drawn: DrawnGroup[];
  /** Every group with whether it is hidden: the table alternative and the
   *  settings' group list. */
  all: (AggGroup & { hidden: boolean })[];
  /** The donut's centre: the drawn values added up, for a count or a sum.
   *  null for an average, a minimum or a maximum, which do not add. */
  total: number | null;
  /** The drawn group with the largest value, for the summary sentence. */
  largest: DrawnGroup | null;
}

export function isHidden(key: string, hidden: string[] | undefined, showEmpty: boolean | undefined): boolean {
  if (key === NO_VALUE && showEmpty === false) return true;
  return (hidden ?? []).includes(key);
}

const byValue = (a: AggGroup, b: AggGroup) => (a.value ?? -Infinity) - (b.value ?? -Infinity);

export function layoutChart(input: LayoutInput, compare: (a: string, b: string) => number = defaultCompare): Layout {
  const { result, kind, agg } = input;
  let groups = result.groups.slice();

  if (input.zeroOptions && (kind === 'bar' || kind === 'hbar' || kind === 'line')) {
    const have = new Map(groups.map((g) => [g.key, g]));
    const zero = agg === 'count' || agg === 'sum' ? 0 : null;
    const listed = new Set(input.zeroOptions.map((o) => o.key));
    groups = [
      ...input.zeroOptions.map((o) => have.get(o.key) ?? { key: o.key, label: o.label, value: zero, rows: 0 }),
      ...groups.filter((g) => !listed.has(g.key)),
    ];
  }

  const all = groups.map((g) => ({ ...g, hidden: isHidden(g.key, input.hidden, input.showEmpty) }));
  const visible = all.filter((g) => !g.hidden);
  const counted = result.groups.reduce((n, g) => n + g.rows, 0);
  if (result.groups.length === 0 || counted === 0) {
    return { state: 'empty', drawn: [], all, total: null, largest: null };
  }
  if (visible.length === 0) {
    return { state: 'all-hidden', drawn: [], all, total: null, largest: null };
  }

  // "No value" stays last unless the order is by value: it is not a label
  // to put between B and D.
  let empty = visible.filter((g) => g.key === NO_VALUE);
  let rest = visible.filter((g) => g.key !== NO_VALUE);
  switch (input.sort ?? 'auto') {
    case 'label_asc':
      rest.sort((a, b) => (input.isDate ? cmpPlain(a.key, b.key) : compare(a.label, b.label)));
      break;
    case 'label_desc':
      rest.sort((a, b) => (input.isDate ? cmpPlain(b.key, a.key) : compare(b.label, a.label)));
      break;
    case 'value_asc':
      rest = [...rest, ...empty].sort(byValue);
      empty = [];
      break;
    case 'value_desc':
      rest = [...rest, ...empty].sort((a, b) => byValue(b, a));
      empty = [];
      break;
  }
  const ordered = [...rest, ...empty];

  let drawn: DrawnGroup[] = ordered.map((g) => ({ key: g.key, label: g.label, value: g.value, rows: g.rows, missing: g.missing, keys: [g.key] }));
  if (!input.isDate && drawn.length > MAX_DRAWN) {
    // "No value" is never folded: "Other" then always means "the other
    // options", and the rows behind it are one filter away (chartGroups.ts).
    const tailEmpty = drawn.filter((g) => g.key === NO_VALUE);
    const named = drawn.filter((g) => g.key !== NO_VALUE);
    const keep = MAX_DRAWN - 1 - tailEmpty.length;
    const folded = named.slice(keep);
    drawn = [...named.slice(0, keep), foldOther(folded, agg), ...tailEmpty];
    if (input.sort === 'value_asc' || input.sort === 'value_desc') {
      // Re-place the folded group and No value by their values.
      drawn.sort(input.sort === 'value_asc' ? byValue : (a, b) => byValue(b, a));
    }
  }

  const adds = agg === 'count' || agg === 'sum';
  const total = adds ? drawn.reduce((n, g) => n + (g.value ?? 0), 0) : null;
  const largest = drawn.reduce<DrawnGroup | null>((best, g) => (best === null || (g.value ?? -Infinity) > (best.value ?? -Infinity) ? g : best), null);
  return { state: 'ok', drawn, all, total, largest };
}

/** The folded tail as one group. Counts and sums add up; a minimum and a
 *  maximum stay what they are; an average becomes the rows-weighted average
 *  of the averages, which is exact when every row holds a number and close
 *  otherwise (the table alternative lists every group's own value). */
function foldOther(folded: DrawnGroup[], agg: ChartAgg): DrawnGroup {
  const nums = folded.filter((g) => g.value !== null);
  const rows = folded.reduce((n, g) => n + g.rows, 0);
  let value: number | null = null;
  if (nums.length) {
    switch (agg) {
      case 'min':
        value = Math.min(...nums.map((g) => g.value as number));
        break;
      case 'max':
        value = Math.max(...nums.map((g) => g.value as number));
        break;
      case 'avg': {
        const w = nums.reduce((n, g) => n + g.rows, 0);
        value = w ? nums.reduce((n, g) => n + (g.value as number) * g.rows, 0) / w : null;
        break;
      }
      default:
        value = nums.reduce((n, g) => n + (g.value as number), 0);
    }
  }
  return { key: OTHER, label: '', value, rows, keys: folded.flatMap((g) => g.keys) };
}

function cmpPlain(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0; // i18n-ok: date keys are ISO text, compared as text on purpose
}

function defaultCompare(a: string, b: string): number {
  return cmpPlain(a.toLowerCase(), b.toLowerCase());
}
