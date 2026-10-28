import { useEffect, useState } from 'react';
import ChartSettings from './ChartSettings';
import ChartView, { type ChartViewProps } from './ChartView';
import { chartSettingsFor } from '../chartDefaults';
import type { ChartKind } from '../chartLayout';
import type { ViewDef } from '../types';

// A chart view's settings row and the chart under it (spec 004), one lazy
// chunk with Chart.js.
//
// It also keeps a kind the person picked that the database cannot draw yet
// (FR-031): bars on a database with nothing to group by and no number. The
// server refuses a grouped chart without a grouping, and quietly saving a
// number chart instead was the bug the owner reported. So the pick is kept
// here, shown in the settings and answered by the chart with what to add;
// once the database has something to draw it with, it is saved.
export default function ChartPane(props: ChartViewProps & { onChange: (patch: Partial<ViewDef>) => void }) {
  const { view, schema, onChange } = props;
  const [wish, setWish] = useState<ChartKind | null>(null);

  useEffect(() => setWish(null), [view.id]);
  useEffect(() => {
    if (!wish) return;
    const next = chartSettingsFor(wish, schema, view);
    if (next.chartKind === wish) {
      onChange(next);
      setWish(null);
    }
  }, [wish, schema, view, onChange]);

  const shown = wish ? { ...view, chartKind: wish } : view;
  return (
    <>
      <ChartSettings view={shown} schema={schema} onChange={onChange} onWish={setWish} />
      <ChartView {...props} view={shown} />
    </>
  );
}
