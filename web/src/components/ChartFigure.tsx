import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ActiveElement,
  type TooltipItem,
} from 'chart.js';
import { plural, t } from '../i18n';
import { compare, formatDay, formatMonth, formatNumber } from '../format';
import { neighbour } from '../nav';
import { useShortcut } from '../keys';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Switch';
import type { ReactNode } from 'react';
import type { PropDef, ViewDef } from '../types';
import {
  layoutChart,
  NO_VALUE,
  OTHER,
  type AggResult,
  type ChartAgg,
  type ChartKind,
  type DrawnGroup,
} from '../chartLayout';
import { groupColourTokens, onThemeChange, readInk } from '../chartTheme';
import './ChartView.css';

// A chart, drawn from the numbers it is given (spec 004). ChartView fetches
// those numbers from the server and owns the rows behind a group; this file
// only draws: the layout from chartLayout.ts, the colours from chartTheme.ts.
// Kept apart so the component catalogue can show every kind with sample data
// and no server. It comes with Chart.js, so it is only ever loaded lazily.
//
// A canvas offers a keyboard and a screen reader nothing to hold, so the chart
// carries a DOM of its own beside it (research R8, R11): the figure's caption
// and summary, one button per group (label and value, arrow keys move between
// them, Enter shows the rows), and a table of every group.

// Only what the four drawn kinds use: Chart.js tree-shakes the rest.
Chart.register(BarController, BarElement, LineController, LineElement, PointElement, DoughnutController, ArcElement, CategoryScale, LinearScale, Tooltip);

const LIST_TYPES = ['multiselect', 'relation'];

export interface ChartFigureProps {
  view: ViewDef;
  schema: PropDef[];
  /** The server's answer; null while the first one is on its way. */
  result: AggResult | null;
  /** A failed read. The last chart stays drawn under it. */
  error?: string;
  /** The group whose rows are listed, by key. */
  selectedKey?: string | null;
  onSelect?: (g: DrawnGroup | null) => void;
  /** Hidden groups can be shown again from the chart itself. */
  onUpdateView?: (patch: Partial<ViewDef>) => void;
  /** The rows behind the selected group, drawn inside the figure. */
  children?: ReactNode;
}

export default function ChartFigure(props: ChartFigureProps) {
  const { view, schema, result, error = '', selectedKey = null, onSelect } = props;
  const kind: ChartKind = view.chartKind ?? 'bar';
  const agg: ChartAgg = view.agg ?? 'count';
  const groupProp = kind === 'number' ? undefined : schema.find((p) => p.id === view.groupBy);
  const aggProp = agg === 'count' ? undefined : schema.find((p) => p.id === view.aggProp);
  const period = groupProp?.type === 'date' ? view.groupPeriod ?? 'month' : undefined;
  const style = view.chartStyle ?? {};

  const [showTable, setShowTable] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const [themeTick, setThemeTick] = useState(0);

  const missingGrouping = kind !== 'number' && !groupProp;

  useEffect(() => onThemeChange(() => setThemeTick((n) => n + 1)), []);
  const select = (g: DrawnGroup) => onSelect?.(selectedKey === g.key ? null : g);

  const zeroOptions = useMemo(() => {
    if (!view.showZero || !groupProp) return undefined;
    if (groupProp.type === 'checkbox') {
      return [
        { key: 'true', label: 'true' },
        { key: 'false', label: 'false' },
      ];
    }
    return groupProp.options?.map((o) => ({ key: o.id, label: o.name }));
  }, [view.showZero, groupProp]);

  const layout = useMemo(
    () =>
      result
        ? layoutChart(
            {
              result,
              kind,
              agg,
              sort: view.chartSort,
              hidden: view.hiddenGroups,
              showEmpty: view.showEmpty,
              zeroOptions,
              isDate: groupProp?.type === 'date',
            },
            compare,
          )
        : null,
    [result, kind, agg, view.chartSort, view.hiddenGroups, view.showEmpty, zeroOptions, groupProp],
  );

  const label = (g: { key: string; label: string; missing?: boolean }) => groupLabel(g, groupProp, period);
  const value = (v: number | null) => (v === null ? '—' /* i18n-ok: a dash for "no number", not a word */ : formatNumber(v, { maximumFractionDigits: 2 }));
  const drawn = layout?.state === 'ok' ? layout.drawn : [];
  const caption = captionFor(agg, aggProp, groupProp, kind);

  // ---- the canvas ----
  const figureRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const drawnRef = useRef<DrawnGroup[]>([]);
  drawnRef.current = drawn;
  const selectRef = useRef(select);
  selectRef.current = select;
  const tokens = useMemo(() => groupColourTokens(drawn, style.palette ?? 'auto', groupProp), [drawn, style.palette, groupProp]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const fig = figureRef.current;
    if (!canvas || !fig || kind === 'number' || drawn.length === 0) return;
    const ink = readInk(fig, tokens);
    Chart.defaults.font.family = ink.font;
    Chart.defaults.font.size = ink.fontSize;
    Chart.defaults.color = ink.muted;
    const axis = { grid: { color: ink.grid }, border: { color: ink.grid }, ticks: { color: ink.muted } };
    const chart = new Chart(canvas, {
      type: kind === 'donut' ? 'doughnut' : kind === 'line' ? 'line' : 'bar',
      data: {
        labels: drawn.map(label),
        datasets: [
          {
            data: drawn.map((g) => g.value),
            backgroundColor: kind === 'line' ? ink.colours[0] : ink.colours,
            borderColor: kind === 'donut' ? ink.surface : kind === 'line' ? ink.colours[0] : ink.colours,
            pointBackgroundColor: ink.colours,
            pointRadius: 4,
            borderWidth: kind === 'donut' ? 2 : kind === 'line' ? 2 : 0,
            borderRadius: kind === 'donut' ? 0 : 3,
            maxBarThickness: 48,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: kind === 'hbar' ? 'y' : 'x',
        animation: ink.reducedMotion ? false : { duration: 200 },
        cutout: kind === 'donut' ? '64%' : undefined,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: ink.text,
            titleColor: ink.surface,
            bodyColor: ink.surface,
            displayColors: true,
            callbacks: { label: (c: TooltipItem<'bar'>) => ` ${value(c.raw as number | null)}` },
          },
        },
        scales:
          kind === 'donut'
            ? {}
            : {
                x: { ...axis, beginAtZero: true },
                y: { ...axis, beginAtZero: true },
              },
        onClick: (_e: unknown, els: ActiveElement[]) => {
          const g = els[0] ? drawnRef.current[els[0].index] : undefined;
          if (g) selectRef.current(g);
        },
      } as never,
    });
    chartRef.current = chart;
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, layout, tokens, themeTick]);

  // A focused group lights up its bar or slice, so a sighted keyboard user
  // sees where they are.
  const highlight = (i: number | null) => {
    const c = chartRef.current;
    if (!c) return;
    c.setActiveElements(i === null ? [] : [{ datasetIndex: 0, index: i }]);
    c.tooltip?.setActiveElements(i === null ? [] : [{ datasetIndex: 0, index: i }], { x: 0, y: 0 });
    c.update();
  };

  const groupsRef = useRef<HTMLDivElement>(null);
  // The arrows move between groups while one has the focus. Registered in
  // keys.ts above the view's own region keys (which hand ←/→ to the next
  // region), and only while the focus is on this chart's groups, so the arrows
  // keep their meaning everywhere else.
  useShortcut({
    id: 'chart.groups',
    keys: ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'],
    scope: 'editor',
    when: () => !!groupsRef.current?.contains(document.activeElement),
    label: () => t('Move between the groups of a chart'),
    group: () => t('Navigation'),
    run: (e) => {
      const buttons = [...(groupsRef.current?.querySelectorAll<HTMLButtonElement>('.chart-group') ?? [])];
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      // No wrapping at the edges: nav.ts' rule for every list in the app.
      const next = neighbour(buttons.length, i, d);
      if (next < 0) return;
      setFocusIndex(next);
      buttons[next]?.focus();
    },
  });

  // ---- render ----
  const height = `var(--chart-height-${style.height ?? 'medium'})`;
  let body: React.ReactNode;
  if (missingGrouping) {
    body = <p className="chart-state">{t('The property this chart groups by no longer exists. Choose another in the chart settings.')}</p>;
  } else if (!layout) {
    body = error ? <p className="chart-state" role="alert">{error}</p> : <p className="chart-state">{t('Loading…')}</p>;
  } else if (layout.state === 'empty') {
    body = <p className="chart-state">{t('There is nothing to chart: no rows match.')}</p>;
  } else if (layout.state === 'all-hidden') {
    body = (
      <div className="chart-state">
        <p>{t('Every group of this chart is hidden.')}</p>
        {props.onUpdateView && (
          <Button size="sm" onClick={() => props.onUpdateView?.({ hiddenGroups: [], showEmpty: true })}>
            {t('Show all')}
          </Button>
        )}
      </div>
    );
  } else if (kind === 'number') {
    const g = drawn[0];
    body = (
      <div className="chart-number" style={{ minHeight: height }}>
        <div className="chart-number-title">{style.title || numberTitle(agg, aggProp)}</div>
        <div className="chart-number-value">{value(g?.value ?? null)}</div>
      </div>
    );
  } else {
    const centre = kind === 'donut' && style.center !== false && layout.total !== null;
    body = (
      <>
        <div className="chart-canvas" style={{ height }}>
          <canvas ref={canvasRef} aria-hidden="true" />
          {centre && (
            <div className="chart-centre" aria-hidden="true">
              <span className="chart-centre-value">{value(layout.total)}</span>
              <span className="chart-centre-label">{style.centerLabel || t('Total')}</span>
            </div>
          )}
        </div>
        <div ref={groupsRef} className="chart-groups" role="group" aria-label={t('Groups in this chart')}>
          {drawn.map((g, i) => (
            <Button
              key={g.key}
              variant="ghost"
              size="sm"
              className="chart-group"
              tabIndex={i === Math.min(focusIndex, drawn.length - 1) ? 0 : -1}
              aria-pressed={selectedKey === g.key}
              onFocus={() => {
                setFocusIndex(i);
                highlight(i);
              }}
              onBlur={() => highlight(null)}
              onClick={() => select(g)}
            >
              <span className="chart-swatch" style={{ background: `var(${tokens[i]})` }} aria-hidden="true" />
              <span className="chart-group-label">{label(g)}</span>
              <span className="chart-group-value">{value(g.value)}</span>
            </Button>
          ))}
        </div>
      </>
    );
  }

  const listGrouping = !!groupProp && (LIST_TYPES.includes(groupProp.type) || (groupProp.type === 'person' && groupProp.personMultiple));
  return (
    <figure ref={figureRef} className="chart" data-kind={kind} aria-labelledby={`chart-cap-${view.id}`}>
      <figcaption id={`chart-cap-${view.id}`} className="chart-caption">
        {caption}
      </figcaption>
      {body}
      {layout?.state === 'ok' && kind !== 'number' && (
        <p className="chart-summary">
          {plural(drawn.length, '{n} group', '{n} groups')}
          {layout.largest ? ' · ' + t('largest: {label}, {value}', { label: label(layout.largest), value: value(layout.largest.value) }) : ''}
        </p>
      )}
      {style.caption && <p className="chart-note">{style.caption}</p>}
      {error && layout && <p className="chart-note chart-error" role="alert">{error}</p>}
      {result && result.leftOut > 0 && aggProp && (
        <p className="chart-note">
          {plural(result.leftOut, '{n} row has no number in {prop} and is left out.', '{n} rows have no number in {prop} and are left out.', { prop: aggProp.name })}
        </p>
      )}
      {listGrouping && <p className="chart-note">{t('A row with several values is counted under each of them.')}</p>}
      {layout && layout.state !== 'empty' && kind !== 'number' && (
        <Switch label={t('Show as table')} checked={showTable} onCheckedChange={setShowTable} className="chart-table-switch" />
      )}
      {showTable && layout && (
        <table className="chart-table">
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">{groupProp?.name ?? ''}</th>
              <th scope="col">{numberTitle(agg, aggProp)}</th>
              <th scope="col">{t('Rows')}</th>
            </tr>
          </thead>
          <tbody>
            {layout.all.map((g) => (
              <tr key={g.key} data-hidden={g.hidden || undefined}>
                <th scope="row">
                  {label(g)}
                  {g.hidden ? ' ' + t('(hidden)') : ''}
                </th>
                <td>{value(g.value)}</td>
                <td>{formatNumber(g.rows)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {props.children}
    </figure>
  );
}

/** A group's name in the reader's language. The server labels options,
 *  people and pages; the words it cannot know are the app's. */
export function groupLabel(g: { key: string; label: string; missing?: boolean }, prop: PropDef | undefined, period?: string): string {
  if (g.key === OTHER) return t('Other');
  if (g.key === NO_VALUE) return t('No value');
  if (prop?.type === 'checkbox') return g.key === 'true' ? t('Checked') : t('Unchecked');
  if (prop?.type === 'date') return periodLabel(g.key, period ?? 'month');
  if (g.missing) return t('{name} (deleted)', { name: g.label || g.key });
  return g.label || t('Untitled');
}

function periodLabel(key: string, period: string): string {
  switch (period) {
    case 'day':
      return formatDay(key, 'date');
    case 'week': {
      const [y, w] = key.split('-W');
      return t('Week {week}, {year}', { week: Number(w), year: y });
    }
    case 'year':
      return key;
    default: {
      const [y, m] = key.split('-').map(Number);
      return formatMonth(y, m - 1, 'short');
    }
  }
}

function numberTitle(agg: ChartAgg, aggProp: PropDef | undefined): string {
  const name = aggProp?.name ?? '';
  switch (agg) {
    case 'sum':
      return t('Sum of {prop}', { prop: name });
    case 'avg':
      return t('Average of {prop}', { prop: name });
    case 'min':
      return t('Minimum of {prop}', { prop: name });
    case 'max':
      return t('Maximum of {prop}', { prop: name });
    default:
      return t('Count all');
  }
}

function captionFor(agg: ChartAgg, aggProp: PropDef | undefined, groupProp: PropDef | undefined, kind: ChartKind): string {
  if (kind === 'number' || !groupProp) return numberTitle(agg, aggProp);
  const name = aggProp?.name ?? '';
  const by = groupProp.name;
  switch (agg) {
    case 'sum':
      return t('Sum of {prop} by {group}', { prop: name, group: by });
    case 'avg':
      return t('Average of {prop} by {group}', { prop: name, group: by });
    case 'min':
      return t('Minimum of {prop} by {group}', { prop: name, group: by });
    case 'max':
      return t('Maximum of {prop} by {group}', { prop: name, group: by });
    default:
      return t('Count of rows by {group}', { group: by });
  }
}
