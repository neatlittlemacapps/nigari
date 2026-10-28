import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { plural, t } from '../i18n';
import { Button } from '../ui/Button';
import ListView from './ListView';
import ChartFigure, { groupLabel } from './ChartFigure';
import type { Filter, PropDef, PropOption, ViewDef } from '../types';
import type { AggResult, DrawnGroup } from '../chartLayout';
import { groupFilter } from '../chartGroups';
import { ROW_GROUP } from '../chartDefaults';
import { OTHER } from '../chartLayout';

// A database drawn as a chart (spec 004). Loaded lazily with Chart.js, so the
// main bundle does not carry the library (SC-006): CollectionView imports this
// file through React.lazy.
//
// This part talks to the server. The numbers come from POST …/aggregate,
// computed over exactly the rows the same filters list; ChartFigure draws
// them. The rows behind a selected group are the ordinary rows query with one
// more filter (chartGroups.ts), so the list holds as many rows as the bar says.

type Row = { id: string; title: string; icon: string; props: Record<string, unknown>; tags?: string[] };

const DRILL_LIMIT = 200;

export interface ChartViewProps {
  collectionId: string;
  /** The view as shown: an embed's own filters already merged in (#26). */
  view: ViewDef;
  schema: PropDef[];
  /** The view's finished filters, as the rows query takes them. */
  filters: Filter[];
  today: string;
  /** Moves when the database's rows or views changed elsewhere: redraw. */
  reloadKey: number;
  onUpdateView?: (patch: Partial<ViewDef>) => void;
  tagColors: Record<string, string>;
  onNavigate: (id: string) => void;
  /** Opens a row the way the view opens rows (Open pages in); Each row's bars
   *  use it. */
  onOpenRow?: (id: string) => void;
  /** Hears every answer the chart draws, for the settings' list of groups. */
  onResult?: (r: AggResult | null) => void;
  /** The table alternative, when the settings panel switches it. */
  showTable?: boolean;
  onOpenInNewTab?: (id: string) => void;
  onSetProp: (rowId: string, propId: string, value: unknown) => void;
  onSetOptions: (propId: string, options: PropOption[]) => void;
}

export default function ChartView(props: ChartViewProps) {
  const { collectionId, view, schema, filters, today, reloadKey } = props;
  const kind = view.chartKind ?? 'bar';
  const agg = view.agg ?? 'count';
  const groupProp = kind === 'number' ? undefined : schema.find((p) => p.id === view.groupBy);
  const period = groupProp?.type === 'date' ? view.groupPeriod ?? 'month' : undefined;

  const [result, setResult] = useState<AggResult | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<DrawnGroup | null>(null);

  // What to ask the server. Everything is sent explicitly rather than by view
  // id, so a setting changed in the panel redraws before it is saved, and an
  // embed's own filters replace the view's.
  const eachRow = kind !== 'number' && view.groupBy === ROW_GROUP;
  const missingGrouping = kind !== 'number' && !groupProp && !eachRow;
  const request = useMemo(
    () => ({
      groupBy: kind === 'number' ? '' : view.groupBy ?? '',
      period,
      aggregate: agg,
      aggregateProp: agg === 'count' ? undefined : view.aggProp,
      filters: filters.map((f) => ({ property: f.property, op: f.op, value: f.value, values: f.values, value2: f.value2 })),
      today,
    }),
    [kind, view.groupBy, period, agg, view.aggProp, filters, today],
  );
  const requestKey = JSON.stringify(request);

  useEffect(() => {
    if (missingGrouping) return;
    let live = true;
    api
      .aggregate(collectionId, request)
      .then((r) => {
        if (!live) return;
        setResult(r);
        props.onResult?.(r);
        setError('');
      })
      .catch((e: Error) => {
        // The last chart stays: a time-limit sentence over an empty frame
        // tells less than the same sentence under the numbers it had.
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId, requestKey, reloadKey, missingGrouping]);

  // A changed grouping or filter makes the selected group a different one.
  useEffect(() => setSelected(null), [requestKey]);

  // ---- the rows behind a group (FR-006) ----
  const [drill, setDrill] = useState<{ rows: Row[]; total: number } | null>(null);
  useEffect(() => {
    setDrill(null);
    if (!selected || !groupProp) return;
    const extra = groupFilter(groupProp.id, groupProp.type, period, selected.keys);
    if (!extra) return;
    let live = true;
    void api
      .collectionRows(collectionId, { filters: [...request.filters, ...extra], limit: DRILL_LIMIT, today })
      .then((res) => {
        if (live) setDrill({ rows: res.rows.map((r) => ({ id: r.id, title: r.title, icon: r.icon, props: r.props || {}, tags: r.tags ?? [] })), total: res.total });
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, requestKey]);

  const name = selected ? groupLabel(selected, groupProp, period) : '';
  return (
    <ChartFigure
      view={view}
      schema={schema}
      result={missingGrouping ? null : result}
      error={error}
      selectedKey={selected?.key ?? null}
      // Each row: a bar is one row, and selecting it opens that row the way a
      // row opens anywhere (Open pages in) instead of listing a list of one
      // (FR-030). "Other" has no single row to open.
      onSelect={eachRow ? (g) => g && g.key !== OTHER && (props.onOpenRow ?? props.onNavigate)(g.key) : setSelected}
      onUpdateView={props.onUpdateView}
      showTable={props.showTable}
    >
      {selected && (
        <section className="chart-rows" aria-label={t('Rows in {group}', { group: name })}>
          <div className="chart-rows-head">
            <span>
              {name} · {plural(drill?.total ?? selected.rows, '{n} row', '{n} rows')}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
              {t('Close')}
            </Button>
          </div>
          {drill && drill.total > drill.rows.length && (
            <p className="chart-note">{t('Showing the first {n} of {total}.', { n: drill.rows.length, total: drill.total })}</p>
          )}
          {drill ? (
            <ListView
              rows={drill.rows}
              schema={schema}
              emptyLabel={t('No rows.')}
              tagColors={props.tagColors}
              onNavigate={props.onNavigate}
              onOpenInNewTab={props.onOpenInNewTab}
              onSetProp={props.onSetProp}
              onSetOptions={props.onSetOptions}
            />
          ) : (
            <p className="chart-state">{t('Loading…')}</p>
          )}
        </section>
      )}
    </ChartFigure>
  );
}
