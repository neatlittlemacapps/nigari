// An embedded database's own views (spec 014, data-model.md).
//
// A `database` block keeps its views in its `local` prop, inside the
// document, so changing them never changes the database's views. Two shapes
// exist and both are read for good (research R2):
//
//   old (every embed before spec 014):
//     {viewId: <database view id>, views: {<database view id>: {filters, sort}}}, or ''.
//     Read as a copy of every database view an embed can show (forms left
//     out), keeping their ids, with the embed's own filters and sort on top.
//   new: {v: 2, viewId, views: [<view>, …]}.
//
// Nothing rewrites an old embed when it is read: opening a document must not
// write to it. It is written in the new shape on its first change.
//
// The server has the same reader (server/embedviews.go). Both run the cases
// in server/testdata/embedviews (check-embedviews.mjs here,
// embedviews_test.go there), so the two cannot drift apart unnoticed.
import type { ViewDef } from './types';

export interface EmbedViews {
  viewId: string;
  views: ViewDef[];
}

const EMBED_TYPES = new Set(['table', 'board', 'list', 'gallery', 'calendar', 'timeline', 'chart']);

/** Whether an embed can show a view of this type: every type but a form,
 *  which collects rows and stays on the database. */
export function embedViewType(t: unknown): boolean {
  return typeof t === 'string' && EMBED_TYPES.has(t);
}

/** A view id in the spelling CollectionView's addView uses, not in taken. */
export function newEmbedViewId(taken: Set<string> = new Set()): string {
  for (;;) {
    const id = 'v' + Math.random().toString(36).slice(2, 9).padEnd(7, '0');
    if (!taken.has(id)) return id;
  }
}

/** What an embed with nothing to show shows: one table. name is the
 *  interface's translated "Table" at the moment it is written. */
export function defaultEmbedView(name: string, taken?: Set<string>): ViewDef {
  return { id: newEmbedViewId(taken), name, type: 'table' };
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A deep copy: the embed's copy of a database view must never share an
 *  object with the database's own (FR-014). */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Reads a block's `local` in either shape, tolerantly: the prop is free
 *  text anybody (or any agent) can write, and a malformed value must cost
 *  the embed its views, not the document its rendering. The result always
 *  has a view, and viewId is always one of them. */
export function readEmbedLocal(raw: string, dbViews: ViewDef[], defaultName = 'Table' /* i18n-ok: the caller passes t('Table'); this is the server's spelling */): EmbedViews {
  let obj: unknown = null;
  try {
    obj = raw ? JSON.parse(raw) : null;
  } catch {
    obj = null;
  }
  const o = isObject(obj) ? obj : {};
  let openId = typeof o.viewId === 'string' ? o.viewId : '';
  const views: ViewDef[] = [];
  const seen = new Set<string>();
  const keep = (v: Record<string, unknown>) => {
    const id = v.id;
    if (typeof id !== 'string' || id === '' || seen.has(id) || !embedViewType(v.type)) return;
    seen.add(id);
    views.push(v as unknown as ViewDef);
  };
  if (o.v === 2) {
    if (Array.isArray(o.views)) for (const item of o.views) if (isObject(item)) keep(item);
  } else {
    const own = isObject(o.views) ? o.views : {};
    for (const dv of dbViews) {
      const v = clone(dv) as unknown as Record<string, unknown>;
      const entry = own[v.id as string];
      // Present keys only, as the embed laid them over the view before
      // ({...view, ...own}): a missing one kept the view's.
      if (isObject(entry)) {
        if ('filters' in entry) v.filters = entry.filters;
        if ('sort' in entry) v.sort = entry.sort;
      }
      keep(v);
    }
  }
  if (views.length === 0) views.push(defaultEmbedView(defaultName));
  if (!seen.has(openId)) openId = views[0].id;
  return { viewId: openId, views };
}

/** Writes an embed's views in the new shape. */
export function encodeEmbedLocal(viewId: string, views: ViewDef[]): string {
  return JSON.stringify({ v: 2, viewId, views });
}

// ---- Changing an embed -----------------------------------------------------
//
// The interface keeps a block's `local` as the string it is stored as and
// asks these functions for the next one, so there is one place that knows
// what an old embed becomes (spec 014, research R2): until a view of it
// changes it stays in the shape it was written in, and opening another tab
// writes the open view only. Changing a view writes the new shape.

/** Whether `raw` is the new shape. */
export function isEmbedV2(raw: string): boolean {
  try {
    const v = raw ? JSON.parse(raw) : null;
    return isObject(v) && v.v === 2;
  } catch {
    return false;
  }
}

/** The block's `local` after another view is opened. An old-shape embed
 *  stays old-shape (its viewId changes, nothing else), so looking at another
 *  tab does not turn it into a snapshot of the database's views. */
export function withOpenView(raw: string, dbViews: ViewDef[], viewId: string, defaultName?: string): string {
  if (isEmbedV2(raw)) return encodeEmbedLocal(viewId, readEmbedLocal(raw, dbViews, defaultName).views);
  let old: Record<string, unknown> = {};
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (isObject(v)) old = v;
  } catch {
    /* an unreadable value starts again */
  }
  return JSON.stringify({ ...old, viewId, views: isObject(old.views) ? old.views : {} });
}

/** The views an embed starts with when a database is picked in a document:
 *  one table, or the given view (a chart from the / menu). */
export function newEmbedLocal(view: ViewDef): string {
  return encodeEmbedLocal(view.id, [view]);
}

/** A copy of one of the database's views, for the embed: a new id, nothing
 *  shared with the database's view (FR-007). `name` is the copy's, so two tabs
 *  of one embed are not both called "Table" (the caller passes the translated
 *  "Copy of {name}"); without it the copy keeps the name it was copied from. */
export function copyDatabaseView(dbView: ViewDef, taken: Set<string>, name?: string): ViewDef {
  return { ...clone(dbView), id: newEmbedViewId(taken), ...(name ? { name } : {}) };
}

/** The views of the database an embed can copy from: every one but a form. */
export function copyableViews(dbViews: ViewDef[]): ViewDef[] {
  return dbViews.filter((v) => embedViewType(v.type));
}

/** Moves a view one place along the tabs; the list as it was if it cannot. */
export function moveView(views: ViewDef[], id: string, delta: -1 | 1): ViewDef[] {
  const at = views.findIndex((v) => v.id === id);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= views.length) return views;
  const next = [...views];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

/** The embed's views without one; an embed keeps at least one, so the list as
 *  it was when this is the last. The view that opens is the first left. */
export function removeView(views: ViewDef[], viewId: string, id: string): { views: ViewDef[]; viewId: string } {
  if (views.length <= 1) return { views, viewId };
  const rest = views.filter((v) => v.id !== id);
  return { views: rest, viewId: rest.some((v) => v.id === viewId) ? viewId : rest[0].id };
}
