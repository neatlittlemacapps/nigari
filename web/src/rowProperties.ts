// A row's page changing its database's properties (spec 015, research R5, R7).
// Pure: no React, no network, so check-rowproperties.mjs can hold every rule.
//
// Every change made from a row's page is applied to the schema as stored a
// moment ago (the caller fetches it first), by property id, and only the
// schema is saved. Saving the copy the page loaded when it opened would undo
// whatever was changed elsewhere since: the bug handlePutCollection's comment
// describes for views.

import type { PropDef, PropType } from './types';

/** The one rule for "this field has no value": the row page's muted "Empty"
 *  (#269) and *Hide when empty* both use it. */
export function isUnset(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

let idCounter = 0;
/** A readable property or option id from its name (the Edit properties
 *  dialog's rule, kept here so the dialog and the row's page make the same). */
export const slug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `p${++idCounter}`;

/** An id no property in the schema has: the slug, with underscores added on a
 *  clash, as the dialog has always done. */
export function freeId(schema: readonly PropDef[], name: string): string {
  let id = slug(name);
  while (schema.some((p) => p.id === id)) id += '_';
  return id;
}

/** The schema with one property changed. A key patched to undefined is
 *  removed (pageVisibility back to shown is no key at all, R1). A property
 *  that is not there any more (deleted elsewhere meanwhile) changes nothing. */
export function applyPropertyChange(schema: readonly PropDef[], id: string, patch: Partial<PropDef>): PropDef[] {
  return schema.map((p) => {
    if (p.id !== id) return p;
    const next: Record<string, unknown> = { ...p, ...patch };
    for (const k of Object.keys(patch)) if (next[k] === undefined) delete next[k];
    return next as unknown as PropDef;
  });
}

/** A copy of a property right after it: same type and settings, its own id,
 *  no values (rows keep values by property id, and the new id has none). The
 *  copy keeps the original's row-page visibility. */
export function duplicateProperty(schema: readonly PropDef[], id: string, copyName: string): PropDef[] {
  const i = schema.findIndex((p) => p.id === id);
  if (i < 0) return [...schema];
  const copy: PropDef = { ...schema[i], id: freeId(schema, copyName), name: copyName };
  if (copy.options) copy.options = copy.options.map((o) => ({ ...o }));
  return [...schema.slice(0, i + 1), copy, ...schema.slice(i + 1)];
}

/** A new property at the end, as the dialog's Add makes it. The name is kept
 *  as typed (an empty one becomes "Property"); only the id is made unique. */
export function addProperty(schema: readonly PropDef[], type: PropType, name: string): PropDef[] {
  const n = name.trim() || 'Property';
  const def: PropDef = { id: freeId(schema, n), name: n, type };
  if (type === 'select' || type === 'multiselect') def.options = [];
  if (type === 'rollup') def.rollupAgg = 'sum';
  return [...schema, def];
}

/** The *Hide when empty* properties that are empty when the page opens. Taken
 *  once and kept while the page stays open (R7): a field filled in, or cleared,
 *  while someone works on the page does not jump in or out of the fold. */
export function emptyAtOpen(schema: readonly PropDef[], props: Record<string, unknown>): Set<string> {
  return new Set(schema.filter((p) => p.pageVisibility === 'hide_empty' && isUnset(props[p.id])).map((p) => p.id));
}

/** Which properties a row's page shows and which fold under "N more
 *  properties". `emptyAtStart` is emptyAtOpen's answer for this visit; a
 *  *Hide when empty* property not in it (filled at the start, or set to Hide
 *  when empty while the page is open) stays shown. Order is the schema's. */
export function visibleOnRowPage(
  schema: readonly PropDef[],
  emptyAtStart: ReadonlySet<string>,
): { shown: PropDef[]; folded: PropDef[] } {
  const shown: PropDef[] = [];
  const folded: PropDef[] = [];
  for (const p of schema) {
    const fold = p.pageVisibility === 'hide' || (p.pageVisibility === 'hide_empty' && emptyAtStart.has(p.id));
    (fold ? folded : shown).push(p);
  }
  return { shown, folded };
}
