// A chart put into a document from the / menu (spec 004, FR-018, research
// R14). There is no chart block: a chart in a document is the database block
// with a chart view of its own (spec 014), and an agent builds it with
// embed_database and set_view. The / entry inserts a database block that
// remembers which kind was asked for (chartKind) until a database is picked.

import { api } from './api';
import { defaultChartView } from './chartDefaults';
import type { ChartKind } from './chartLayout';
import { newEmbedLocal, newEmbedViewId } from './embedViews';

/** The five / entries, in Notion's order. */
export const CHART_SLASH_KINDS: ChartKind[] = ['bar', 'hbar', 'line', 'donut', 'number'];

/** The embed a chart from the / menu makes: one chart view of this kind,
 *  drawable from the start (FR-019), kept in the document and nowhere else
 *  (spec 014, research R12). It adds nothing to the database, so it works for
 *  a database this person may only read. Returns the view's id, to open its
 *  settings, and the block's `local`. */
export async function chartEmbed(collectionId: string, kind: ChartKind, name: string): Promise<{ viewId: string; local: string }> {
  const config = await api.getCollection(collectionId);
  const view = defaultChartView(kind, config.schema, newEmbedViewId(new Set(config.views.map((v) => v.id))), name);
  return { viewId: view.id, local: newEmbedLocal(view) };
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
