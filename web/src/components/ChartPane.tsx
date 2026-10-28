import { useEffect, useRef, useState } from 'react';
import { ChartSettingsButton } from './ChartSettings';
import ChartSave from './ChartSave';
import type { PictureParts } from '../savePicture';
import ChartView, { type ChartViewProps } from './ChartView';
import { chartSettingsFor } from '../chartDefaults';
import type { AggResult, ChartKind } from '../chartLayout';
import type { ViewDef } from '../types';

// A chart view's settings button and the chart under it (spec 004), one lazy
// chunk with Chart.js. It holds what the two share: the groups last drawn
// (the panel lists them to hide), whether the table is shown, and a kind the
// database cannot draw yet.
//
// That kind (FR-031): bars on a database with nothing to group by and no
// number. The server refuses a grouped chart without a grouping, and quietly
// saving a number chart instead was the bug the owner reported. So the pick
// is kept here, shown in the settings and answered by the chart with what to
// add; once the database has something to draw it with, it is saved.
//
// A viewer of the workspace gets the chart without the settings (FR-027): the
// server would refuse their save anyway, and a panel whose every change
// snaps back reads as broken.
export default function ChartPane(props: ChartViewProps & { onChange: (patch: Partial<ViewDef>) => void; canEdit: boolean }) {
  const { view, schema, onChange, canEdit } = props;
  const [wish, setWish] = useState<ChartKind | null>(null);
  const [result, setResult] = useState<AggResult | null>(null);
  const [showTable, setShowTable] = useState(false);
  const pictureRef = useRef<(() => PictureParts | null) | null>(null);

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
      <div className="chart-settings">
        <ChartSave name={view.name} pictureRef={pictureRef} />
        {canEdit && (
          <ChartSettingsButton
            view={shown}
            schema={schema}
            onChange={onChange}
            onWish={setWish}
            result={result}
            showTable={showTable}
            onShowTable={setShowTable}
          />
        )}
      </div>
      <ChartView {...props} view={shown} onResult={setResult} showTable={canEdit ? showTable : undefined} pictureRef={pictureRef} />
    </>
  );
}
