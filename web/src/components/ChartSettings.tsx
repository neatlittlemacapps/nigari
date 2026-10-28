import { t } from '../i18n';
import { Select } from '../ui/Select';
import type { PropDef, ViewDef } from '../types';
import { chartSettingsFor, groupable, NUMBER_TYPES } from '../chartDefaults';
import type { ChartKind } from '../chartLayout';
import './ChartSettings.css';

// What a chart shows (spec 004, US2): its kind, what it groups by (and a
// date's period), and the value of each group. Every change applies at once,
// through the same view save as a board's grouping, and the server checks it
// (checkChartView) as it checks an agent's set_view.
//
// Lives in the chart's lazy chunk, so the main bundle does not carry it.

export default function ChartSettings({
  view,
  schema,
  onChange,
}: {
  view: ViewDef;
  schema: PropDef[];
  onChange: (patch: Partial<ViewDef>) => void;
}) {
  const kind: ChartKind = view.chartKind ?? 'bar';
  const groups = groupable(schema);
  const numbers = schema.filter((p) => NUMBER_TYPES.includes(p.type));
  const groupProp = schema.find((p) => p.id === view.groupBy);
  const agg = view.agg ?? 'count';

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
        onValueChange={(v) => onChange(chartSettingsFor(v as ChartKind, schema, view))}
      />
      {kind !== 'number' && groups.length > 0 && (
        <Select
          label={t('What to show')}
          options={groups.map((p) => ({ value: p.id, label: p.name }))}
          value={groupProp ? groupProp.id : ''}
          onValueChange={(v) => {
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
      {agg !== 'count' && numbers.length > 0 && (
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
