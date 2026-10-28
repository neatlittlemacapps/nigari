// A chart put into a document from the / menu (spec 004, FR-018, research
// R14). There is no chart block: a chart in a document is the database block
// showing a chart view (local.viewId, #26), so the same chart can be embedded
// in two places and looks the same in both, and an agent builds it with
// set_view and embed_database. The / entry inserts a database block that
// remembers which kind was asked for (chartKind) until a database is picked.

import { api } from './api';
import { defaultChartView } from './chartDefaults';
import type { ChartKind } from './chartLayout';

/** The five / entries, in Notion's order. */
export const CHART_SLASH_KINDS: ChartKind[] = ['bar', 'hbar', 'line', 'donut', 'number'];

/** Adds a chart view of this kind to a database, drawable from the start
 *  (FR-019), saved through the same check as any view (checkChartView).
 *  Returns its id; throws the server's refusal (a reader of that database). */
export async function addChartView(collectionId: string, kind: ChartKind, name: string): Promise<string> {
  const config = await api.getCollection(collectionId);
  const id = 'v' + Math.random().toString(36).slice(2, 9);
  await api.putCollection(collectionId, { views: [...config.views, defaultChartView(kind, config.schema, id, name)] });
  return id;
}

// A chart inserted from the / menu opens its settings once, so it is finished
// where it was inserted (R14). The block and the chart's settings button are
// far apart in the tree (the block renders CollectionView, which lazily loads
// the chart), so the request waits here for the button to take it.
const openOnce = new Set<string>();

export function openSettingsOnce(viewId: string): void {
  openOnce.add(viewId);
}

/** True once for a view whose settings should open as it appears. */
export function takeOpenSettings(viewId: string): boolean {
  return openOnce.delete(viewId);
}
