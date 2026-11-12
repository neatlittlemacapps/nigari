// A person's own changes to a view, and what they see with them (spec 013,
// US1, research R5). Pure: no React, no requests, so check-viewstate.mjs can
// hold it to the same fixture as the server's mergeViewState
// (server/viewprefs.go, server/testdata/viewstate.json). The two must agree:
// the browser draws the rows with this merge, and the server fills in a new
// row from its own, so a difference would make a row in "only mine" not mine.
import type { Filter, Sort } from './types';

/** What the server keeps per person, database and scope. A key that is
 *  present means something even when empty: `filters: []` is a person who
 *  removed the view's filters for themselves, `sort: null` one who removed
 *  its sort. Only an absent key falls back to the shared view. */
export interface PersonalViewState {
  filters?: Filter[];
  sort?: Sort | null;
  quickPicks?: Record<string, string>;
  foldedLanes?: string[];
}

interface SharedView {
  filters?: Filter[];
  sort?: Sort | null;
  quickFilters?: string[];
}

/** The filters and sort a person sees: their own where they set them, the
 *  view's otherwise; quick filter picks are added for the properties the
 *  view offers, in the view's order. */
export function mergeViewState(
  view: SharedView,
  personal: PersonalViewState | null | undefined,
): { filters: Filter[]; sort: Sort | null } {
  let filters = view.filters ?? [];
  let sort = view.sort ?? null;
  if (personal && 'filters' in personal && Array.isArray(personal.filters)) filters = personal.filters;
  if (personal && 'sort' in personal) sort = personal.sort ?? null;
  const picks = personal?.quickPicks;
  if (picks) {
    const added: Filter[] = [];
    for (const prop of view.quickFilters ?? []) {
      const value = picks[prop];
      if (value) added.push({ property: prop, op: 'is', value });
    }
    if (added.length) filters = [...filters, ...added];
  }
  return { filters, sort };
}

// Order-insensitive on keys: the server stores a condition with its keys in
// another order than the editor writes them, and that is not a change.
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) if (!same(ao[k], bo[k])) return false;
  return true;
}

// A condition as it counts: without the defaults that mean nothing. The
// server writes `value: ""` on every condition and the editor leaves `op`
// off for "is"; neither is a difference a person made.
function plain(f: Filter): Record<string, unknown> {
  const out: Record<string, unknown> = { property: f.property, op: f.op ?? 'is' };
  if (f.value) out.value = f.value;
  if (f.values?.length) out.values = f.values;
  if (f.value2) out.value2 = f.value2;
  return out;
}

/** Whether what the person sees differs from the shared view: their filter
 *  or sort, or a quick filter they picked (a pick narrows the view for them
 *  alone, so it is said the same way). What the "Only you see these changes"
 *  bar hangs on. A state that says the same as the view (they changed a
 *  filter and changed it back) is no change; folded lanes are not one. */
export function hasPersonalChange(view: SharedView, personal: PersonalViewState | null | undefined): boolean {
  if (!personal) return false;
  if ((view.quickFilters ?? []).some((prop) => personal.quickPicks?.[prop])) return true;
  if ('filters' in personal && !same((personal.filters ?? []).map(plain), (view.filters ?? []).map(plain))) return true;
  if ('sort' in personal && !same(personal.sort ?? null, view.sort ?? null)) return true;
  return false;
}

/** The state after a filter or sort edit: the edited key is set, the others
 *  stay. Editing back to exactly the shared view drops the key again, so the
 *  person follows the shared view from then on (someone else's later change
 *  to it reaches them). Null when nothing personal is left: the row goes. */
export function withPersonalEdit(
  view: SharedView,
  personal: PersonalViewState | null | undefined,
  patch: { filters?: Filter[]; sort?: Sort | null },
): PersonalViewState | null {
  const next: PersonalViewState = { ...(personal ?? {}) };
  if ('filters' in patch) {
    next.filters = patch.filters ?? [];
    if (same(next.filters.map(plain), (view.filters ?? []).map(plain))) delete next.filters;
  }
  if ('sort' in patch) {
    next.sort = patch.sort ?? null;
    if (same(next.sort, view.sort ?? null)) delete next.sort;
  }
  return Object.keys(next).length ? next : null;
}

/** The state after Reset or Save for everyone: the filter, the sort and the
 *  quick filter picks go (Reset shows the view as everyone sees it; Save
 *  made them the view's). Folded lanes stay: they are how the person reads
 *  the board, not what it shows. */
export function withoutViewChanges(personal: PersonalViewState | null | undefined): PersonalViewState | null {
  if (!personal) return null;
  const { filters: _f, sort: _s, quickPicks: _q, ...rest } = personal;
  return Object.keys(rest).length ? rest : null;
}

/** The state with one quick filter picked, or with an empty value cleared. */
export function withQuickPick(
  personal: PersonalViewState | null | undefined,
  prop: string,
  value: string,
): PersonalViewState | null {
  const picks = { ...(personal?.quickPicks ?? {}) };
  if (value) picks[prop] = value;
  else delete picks[prop];
  const next: PersonalViewState = { ...(personal ?? {}) };
  if (Object.keys(picks).length) next.quickPicks = picks;
  else delete next.quickPicks;
  return Object.keys(next).length ? next : null;
}

/** The state with a board lane folded or unfolded. */
export function withFoldedLane(
  personal: PersonalViewState | null | undefined,
  lane: string,
  folded: boolean,
): PersonalViewState | null {
  const lanes = new Set(personal?.foldedLanes ?? []);
  if (folded) lanes.add(lane);
  else lanes.delete(lane);
  const next: PersonalViewState = { ...(personal ?? {}) };
  if (lanes.size) next.foldedLanes = [...lanes];
  else delete next.foldedLanes;
  return Object.keys(next).length ? next : null;
}

/** The scope of a view on its database's page, or inside one embed. */
export function viewScope(viewId: string, embed?: { pageId: string; blockId: string } | null): string {
  return embed ? `embed:${embed.pageId}:${embed.blockId}:${viewId}` : viewId;
}
