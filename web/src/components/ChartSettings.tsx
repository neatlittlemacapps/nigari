import { t } from '../i18n';
import { Select } from '../ui/Select';
import type { PropDef, ViewDef } from '../types';
import { chartSettingsFor, eachRowValue, groupable, numberProps, ROW_GROUP } from '../chartDefaults';
import type { ChartKind } from '../chartLayout';
import './ChartSettings.css';

// What a chart shows (spec 004, US2): its kind, what it groups by (and a
// date's period), and the value of each group. Every change applies at once,
// through the same view save as a board's grouping, and the server checks it
// (checkChartView) as it checks an agent's set_view.
//
// "What to show" is always there for a grouped kind (FR-031), with Each row
// first when the database has a number (FR-030); with Each row, "Value" is
// simply which number each bar shows.
//
// Lives in the chart's lazy chunk, so the main bundle does not carry it.

export default function ChartSettings({
  view,
  schema,
  onChange,
  onWish,
}: {
  view: ViewDef;
  schema: PropDef[];
  onChange: (patch: Partial<ViewDef>) => void;
  /** A kind the database cannot draw yet (FR-031), kept by ChartPane. */
  onWish?: (kind: ChartKind | null) => void;
}) {
  const kind: ChartKind = view.chartKind ?? 'bar';
  const groups = groupable(schema);
  const numbers = numberProps(schema);
  const groupProp = schema.find((p) => p.id === view.groupBy);
  const eachRow = kind !== 'number' && view.groupBy === ROW_GROUP;
  const agg = view.agg ?? 'count';
  const whats = [
    ...(numbers.length ? [{ value: ROW_GROUP, label: t('Each row') }] : []),
    ...groups.map((p) => ({ value: p.id, label: p.name })),
  ];

  const kinds: { value: ChartKind; label: string }[] = [
    { value: 'bar', label: t('Vertical bars') },
    { value: 'hbar', label: t('Horizontal bars') },
    { value: 'line', label: t('Line') },
    { value: 'donut', label: t('Donut') },
    { value: 'number', label: t('Number') },
  ];
  const aggs = [
    { value: 'count', label: t('Count of rows') },
    ...(numbers.length
      ? [
          { value: 'sum', label: t('Sum') },
          { value: 'avg', label: t('Average') },
          { value: 'min', label: t('Minimum') },
          { value: 'max', label: t('Maximum') },
        ]
      : []),
  ];

  return (
    <div className="chart-settings">
      <Select
        label={t('Chart')}
        options={kinds}
        value={kind}
        // A number chart turning into bars needs a grouping, and gets the
        // same one a new chart would (chartDefaults.ts), never none.
        // A kind the database cannot draw yet is kept and answered (FR-031),
        // never saved as a number chart behind the person's back.
        onValueChange={(v) => {
          const next = chartSettingsFor(v as ChartKind, schema, view);
          if (next.chartKind !== v) {
            onWish?.(v as ChartKind);
            return;
          }
          onWish?.(null);
          onChange(next);
        }}
      />
      {kind !== 'number' && (
        <Select
          label={t('What to show')}
          options={whats.length ? whats : [{ value: '', label: t('Nothing to group by') }]}
          value={eachRow ? ROW_GROUP : groupProp ? groupProp.id : ''}
          disabled={!whats.length}
          onValueChange={(v) => {
            if (v === ROW_GROUP) {
              onChange({ groupBy: ROW_GROUP, groupPeriod: undefined, hiddenGroups: [], ...eachRowValue(schema, view) });
              return;
            }
            const p = schema.find((x) => x.id === v);
            onChange({ groupBy: v, groupPeriod: p?.type === 'date' ? view.groupPeriod ?? 'month' : undefined, hiddenGroups: [] });
          }}
        />
      )}
      {kind !== 'number' && groupProp?.type === 'date' && (
        <Select
          label={t('Period')}
          options={[
            { value: 'day', label: t('Day') },
            { value: 'week', label: t('Week') },
            { value: 'month', label: t('Month') },
            { value: 'year', label: t('Year') },
          ]}
          value={view.groupPeriod ?? 'month'}
          onValueChange={(v) => onChange({ groupPeriod: v as ViewDef['groupPeriod'] })}
        />
      )}
      {eachRow ? (
        <Select
          label={t('Value')}
          options={numbers.map((p) => ({ value: p.id, label: p.name }))}
          value={view.aggProp ?? numbers[0]?.id ?? ''}
          onValueChange={(v) => onChange({ ...eachRowValue(schema, view), aggProp: v })}
        />
      ) : (
        <Select
          label={t('Value')}
          options={aggs}
          value={agg}
          onValueChange={(v) =>
            onChange(
              v === 'count'
                ? { agg: 'count', aggProp: undefined }
                : { agg: v as ViewDef['agg'], aggProp: numbers.some((p) => p.id === view.aggProp) ? view.aggProp : numbers[0]?.id },
            )
          }
        />
      )}
      {!eachRow && agg !== 'count' && numbers.length > 0 && (
        <Select
          label={t('Of')}
          options={numbers.map((p) => ({ value: p.id, label: p.name }))}
          value={view.aggProp ?? numbers[0].id}
          onValueChange={(v) => onChange({ aggProp: v })}
        />
      )}
    </div>
  );
}
