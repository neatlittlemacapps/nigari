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
  type TooltipModel,
} from 'chart.js';
import { plural, t } from '../i18n';
import { compare, formatDay, formatMonth, formatNumber } from '../format';
import { neighbour } from '../nav';
import { useShortcut } from '../keys';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Switch';
import type { MutableRefObject, ReactNode } from 'react';
import type { PictureParts } from '../savePicture';
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
import { groupColourTokens, onThemeChange, readInk, valueLabels, type ChartInk } from '../chartTheme';
import { groupable, numberProps, ROW_GROUP } from '../chartDefaults';
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
  /** The table alternative, switched from the settings panel. Left out, the
   *  figure has its own switch (a viewer, the catalogue). */
  showTable?: boolean;
  /** Filled with a function that hands the chart over for "Save chart as". */
  pictureRef?: MutableRefObject<(() => PictureParts | null) | null>;
  /** The rows behind the selected group, drawn inside the figure. */
  children?: ReactNode;
}

/** Pixels a tooltip needs above or beside its point before it moves. */
const TIP_ROOM = 72;

export default function ChartFigure(props: ChartFigureProps) {
  const { view, schema, result, error = '', selectedKey = null, onSelect } = props;
  const kind: ChartKind = view.chartKind ?? 'bar';
  const agg: ChartAgg = view.agg ?? 'count';
  const groupProp = kind === 'number' ? undefined : schema.find((p) => p.id === view.groupBy);
  const eachRow = kind !== 'number' && view.groupBy === ROW_GROUP;
  const aggProp = agg === 'count' ? undefined : schema.find((p) => p.id === view.aggProp);
  const period = groupProp?.type === 'date' ? view.groupPeriod ?? 'month' : undefined;
  const style = view.chartStyle ?? {};

  const [ownTable, setOwnTable] = useState(false);
  // The tooltip (research R17): where Chart.js would draw its own, ours, as
  // text in the page, styled by the tokens, and the same for the mouse and
  // for a focused group button (highlight() makes Chart.js report it).
  const [tip, setTip] = useState<{ x: number; y: number; index: number } | null>(null);
  const showTable = props.showTable ?? ownTable;
  const [focusIndex, setFocusIndex] = useState(0);
  const [themeTick, setThemeTick] = useState(0);

  const missingGrouping = kind !== 'number' && !groupProp && !eachRow;
  // FR-031: a grouped kind on a database with nothing to group by and no
  // number for Each row. Said in so many words, with what to add, rather than
  // drawn as a number chart the person did not choose.
  const nothingToGroup = missingGrouping && groupable(schema).length === 0 && numberProps(schema).length === 0;

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
              eachRow,
            },
            compare,
          )
        : null,
    [result, kind, agg, view.chartSort, view.hiddenGroups, view.showEmpty, zeroOptions, groupProp, eachRow],
  );

  const label = (g: { key: string; label: string; missing?: boolean }) => groupLabel(g, groupProp, period);
  const value = (v: number | null) => (v === null ? '—' /* i18n-ok: a dash for "no number", not a word */ : formatNumber(v, { maximumFractionDigits: 2 }));
  const drawn = layout?.state === 'ok' ? layout.drawn : [];
  const caption = eachRow ? t('{prop} of each row', { prop: aggProp?.name ?? '' }) : captionFor(agg, aggProp, groupProp, kind);

  // ---- the canvas ----
  const figureRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const drawnRef = useRef<DrawnGroup[]>([]);
  drawnRef.current = drawn;
  const selectRef = useRef(select);
  selectRef.current = select;
  const oneColour = eachRow && kind !== 'donut';
  const tokens = useMemo(() => groupColourTokens(drawn, style.palette ?? 'auto', groupProp, oneColour), [drawn, style.palette, groupProp, oneColour]);
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;

  // What the chart shows, as Chart.js takes it. Kept apart from the chart
  // itself so new numbers update the chart that is there (#368, #319): this
  // effect used to destroy the chart and build a new one for every new answer,
  // and every new chart plays its grow-in animation from zero. Creating a view
  // saves its settings and reloads a few times, so the animation replayed again
  // and again, and a changed setting drew the chart twice (once as changed,
  // once more when the save came back).
  const plotData = (ink: ChartInk) => ({
    labels: drawn.map(label),
    values: drawn.map((g) => g.value),
    background: kind === 'line' ? ink.colours[0] : ink.colours,
    border: kind === 'donut' ? ink.surface : kind === 'line' ? ink.colours[0] : ink.colours,
    points: ink.colours,
  });
  const plotDataRef = useRef(plotData);
  plotDataRef.current = plotData;
  // The last data handed to the chart, as JSON: an answer that draws the same
  // as the one before (a reload after a save) changes nothing.
  const shownRef = useRef('');
  const plotShown = !nothingToGroup && !missingGrouping && layout?.state === 'ok' && kind !== 'number' && drawn.length > 0;

  // Built once per kind, theme and label setting: the things Chart.js cannot
  // change on a chart that exists.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const fig = figureRef.current;
    if (!canvas || !fig || !plotShown) return;
    const ink = readInk(fig, tokensRef.current);
    const d = plotDataRef.current(ink);
    shownRef.current = JSON.stringify(d);
    Chart.defaults.font.family = ink.font;
    Chart.defaults.font.size = ink.fontSize;
    Chart.defaults.color = ink.muted;
    const axis = { grid: { color: ink.grid }, border: { color: ink.grid }, ticks: { color: ink.muted } };
    const chart = new Chart(canvas, {
      type: kind === 'donut' ? 'doughnut' : kind === 'line' ? 'line' : 'bar',
      data: {
        labels: d.labels,
        datasets: [
          {
            data: d.values,
            backgroundColor: d.background,
            borderColor: d.border,
            pointBackgroundColor: d.points,
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
            enabled: false,
            external: ({ tooltip: tm }: { tooltip: TooltipModel<'bar'> }) => {
              const index = tm.dataPoints?.[0]?.dataIndex;
              if (tm.opacity === 0 || index === undefined) {
                setTip(null);
                return;
              }
              // Called on every mouse move: a new object only when it moved.
              setTip((t0) => (t0 && t0.index === index && t0.x === tm.caretX && t0.y === tm.caretY ? t0 : { x: tm.caretX, y: tm.caretY, index }));
            },
          },
        },
        scales:
          kind === 'donut'
            ? {}
            : {
                x: { ...axis, beginAtZero: true },
                y: { ...axis, beginAtZero: true },
              },
        // Room above the bars (and beside horizontal ones) for their numbers.
        layout: style.labels ? { padding: kind === 'hbar' ? { right: ink.fontSize * 4 } : { top: ink.fontSize * 2 } } : undefined,
        onClick: (_e: unknown, els: ActiveElement[]) => {
          const g = els[0] ? drawnRef.current[els[0].index] : undefined;
          if (g) selectRef.current(g);
        },
      } as never,
      plugins: style.labels ? [valueLabels(ink, kind as 'bar' | 'hbar' | 'line' | 'donut', (v) => value(v))] : [],
    });
    chartRef.current = chart;
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, plotShown, themeTick, style.labels]);

  // New numbers, order or colours: the chart there moves to them, animating
  // from the old values rather than from zero.
  useLayoutEffect(() => {
    const chart = chartRef.current;
    const fig = figureRef.current;
    if (!chart || !fig) return;
    const ink = readInk(fig, tokens);
    const d = plotData(ink);
    const json = JSON.stringify(d);
    if (json === shownRef.current) return;
    shownRef.current = json;
    chart.data.labels = d.labels;
    const ds = chart.data.datasets[0];
    ds.data = d.values;
    ds.backgroundColor = d.background;
    ds.borderColor = d.border;
    (ds as { pointBackgroundColor?: string[] }).pointBackgroundColor = d.points;
    // The groups may have moved: a lit bar and an open tooltip would now point
    // at whatever sits at their old place. The focused group's button moved
    // with its group, so it lights its bar again where that is now.
    chart.setActiveElements([]);
    chart.tooltip?.setActiveElements([], { x: 0, y: 0 });
    setTip(null);
    // The chart lives across answers now, so reduced motion is read on each
    // update too, not only when it was built.
    chart.update(ink.reducedMotion ? 'none' : undefined);
    const buttons = [...(groupsRef.current?.querySelectorAll('.chart-group') ?? [])];
    const focused = buttons.indexOf(document.activeElement as Element);
    if (focused >= 0) highlight(focused);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, tokens]);

  // "Save chart as" (research R17): the plot redrawn at twice its pixels
  // (Chart.js' devicePixelRatio, put back after), and the words around it.
  if (props.pictureRef) {
    props.pictureRef.current = () => {
      const fig = figureRef.current;
      if (!fig || !layout || layout.state !== 'ok') return null;
      const ink = readInk(fig, tokens);
      const parts: PictureParts = {
        plot: null,
        width: fig.clientWidth,
        height: 0,
        title: kind === 'number' ? style.title || numberTitle(agg, aggProp) : caption,
        legend: [],
        caption: style.caption,
        ink: { text: ink.text, muted: ink.muted, font: ink.font, fontSize: ink.fontSize },
        token: (name) => getComputedStyle(fig).getPropertyValue(name).trim(),
      };
      if (kind === 'number') {
        parts.number = value(drawn[0]?.value ?? null);
        return parts;
      }
      const c = chartRef.current;
      if (!c) return null;
      const before = c.options.devicePixelRatio;
      c.options.devicePixelRatio = 2;
      c.resize();
      c.update('none');
      const plot = document.createElement('canvas');
      plot.width = c.canvas.width;
      plot.height = c.canvas.height;
      plot.getContext('2d')?.drawImage(c.canvas, 0, 0);
      c.options.devicePixelRatio = before;
      c.resize();
      c.update('none');
      parts.plot = plot;
      parts.width = c.canvas.clientWidth;
      parts.height = c.canvas.clientHeight;
      if (kind === 'donut' && style.center !== false && layout.total !== null) {
        parts.centre = { value: value(layout.total), label: style.centerLabel || t('Total') };
      }
      if (style.legend !== 'none' || (kind !== 'donut' && kind !== 'line')) {
        parts.legend = drawn.map((g, i) => ({ label: label(g), value: value(g.value), colour: ink.colours[i] }));
      }
      return parts;
    };
  }

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
  if (nothingToGroup) {
    body = (
      <p className="chart-state">
        {t('This database has nothing to group by. Add a select, multi-select, person, checkbox, date or relation property, or a number property to show each row.')}
      </p>
    );
  } else if (missingGrouping) {
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
    // The legend's place (FR-024) is a donut's and a line's setting; a bar
    // names its groups on its axis, and its buttons stay under it.
    const legend = kind === 'donut' || kind === 'line' ? style.legend ?? 'bottom' : 'bottom';
    body = (
      <div className="chart-plot" data-legend={legend}>
        <div className="chart-canvas" style={{ height }}>
          <canvas ref={canvasRef} aria-hidden="true" />
          {tip && drawn[tip.index] && (
            <div
              className="chart-tooltip"
              role="tooltip"
              style={{ left: tip.x, top: tip.y }}
              // Near the top it goes under the point, near a side it leans
              // inward, so it never leaves the chart (a tall bar's top is the
              // chart's top edge).
              data-below={tip.y < TIP_ROOM ? '' : undefined}
              data-align={tip.x < TIP_ROOM ? 'start' : tip.x > (canvasRef.current?.clientWidth ?? Infinity) - TIP_ROOM ? 'end' : undefined}
            >
              <span className="chart-tooltip-label">{label(drawn[tip.index])}</span>
              <span className="chart-tooltip-value">{value(drawn[tip.index].value)}</span>
              {onSelect && !(eachRow && drawn[tip.index].key === OTHER) && (
                <span className="chart-tooltip-hint">{eachRow ? t('Click to open') : t('Click to view data')}</span>
              )}
            </div>
          )}
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
      </div>
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
          {eachRow ? plural(drawn.length, '{n} bar', '{n} bars') : plural(drawn.length, '{n} group', '{n} groups')}
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
      {props.showTable === undefined && layout && layout.state !== 'empty' && kind !== 'number' && (
        <Switch label={t('Show as table')} checked={ownTable} onCheckedChange={setOwnTable} className="chart-table-switch" />
      )}
      {showTable && layout && (
        <table className="chart-table">
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">{eachRow ? t('Row') : groupProp?.name ?? ''}</th>
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
