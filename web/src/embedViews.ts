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

// ---- What the interface does with an embed until it draws its own views ----
//
// Spec 014 PR 3 draws an embed's own views. Until then the interface still
// shows the database's views with the embed's filter and sort laid over the
// open one, as before, but a block may already hold the new shape (an agent's
// embed_database and set_view with embed_id write it). Such a block must not
// be damaged: the list stays a list, and a filter set here is laid back onto
// the view it belongs to. Without this, the old-shape write below would turn
// the list into an object and the embed would lose every view.

type Filters = ViewDef['filters'];
type SortDef = ViewDef['sort'];

export interface EmbedBlockLocal {
  viewId: string;
  /** Per view id: the filters and sort the interface lays over it. */
  views: Record<string, { filters?: Filters; sort?: SortDef }>;
  /** Set when the block holds the new shape: its own list of views. */
  v2?: ViewDef[];
}

export function parseEmbedBlockLocal(raw: string): EmbedBlockLocal {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (isObject(v)) {
      if (v.v === 2) {
        const own = readEmbedLocal(raw, []);
        const views: EmbedBlockLocal['views'] = {};
        for (const view of own.views) views[view.id] = { filters: view.filters, sort: view.sort };
        return { viewId: own.viewId, views, v2: own.views };
      }
      return {
        viewId: typeof v.viewId === 'string' ? v.viewId : '',
        views: isObject(v.views) ? (v.views as EmbedBlockLocal['views']) : {},
      };
    }
  } catch {
    /* fall through */
  }
  return { viewId: '', views: {} };
}

export function serializeEmbedBlockLocal(next: EmbedBlockLocal): string {
  if (!next.v2) return JSON.stringify({ viewId: next.viewId, views: next.views });
  const views = next.v2.map((view) => {
    const own = next.views[view.id];
    if (!own) return view;
    const merged: ViewDef = { ...view };
    if (own.filters !== undefined) merged.filters = own.filters;
    if (own.sort !== undefined) merged.sort = own.sort;
    return merged;
  });
  return encodeEmbedLocal(next.viewId, views);
}
