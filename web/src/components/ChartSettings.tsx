import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChartBar, ChartColumn, ChartLine, ChartPie, Hash, SlidersHorizontal } from 'lucide-react';
import { t } from '../i18n';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Field';
import { Popover } from '../ui/Popover';
import { Select } from '../ui/Select';
import { Switch } from '../ui/Switch';
import type { ChartStyle, PropDef, ViewDef } from '../types';
import { chartSettingsFor, eachRowValue, groupable, numberProps, ROW_GROUP } from '../chartDefaults';
import { isHidden, type AggResult, type ChartKind } from '../chartLayout';
import { groupLabel } from './ChartFigure';
import { takeOpenSettings } from '../chartInsert';
import './ChartSettings.css';

// A chart's settings (spec 004, FR-020 to FR-024, research R13): one panel,
// in the order a person builds a chart, after Notion's. Kind; Data (what to
// show, period, value, sort, groups); Style; then Show as table. It opens in
// a Popover from the button above the chart, so the chart redraws beside it
// while a setting changes.
//
// Every change applies at once through the same view save as a board's
// grouping, and the server checks it (checkChartView) as it checks an agent's
// set_view; a refused save puts the stored view back (CollectionView's
// saveConfig). Typed text (caption, centre label, title) is saved after a
// pause, not on every key.
//
// "What to show" is always there for a grouped kind (FR-031), with Each row
// first when the database has a number (FR-030); with Each row, "Value" is
// simply which number each bar shows.
//
// Lives in the chart's lazy chunk, so the main bundle does not carry it.

const TEXT_PAUSE_MS = 400;

export default function ChartSettings({
  view,
  schema,
  onChange,
  onWish,
  result,
  showTable,
  onShowTable,
}: {
  view: ViewDef;
  schema: PropDef[];
  onChange: (patch: Partial<ViewDef>) => void;
  /** A kind the database cannot draw yet (FR-031), kept by ChartPane. */
  onWish?: (kind: ChartKind | null) => void;
  /** The chart's groups as last drawn, for the list of groups to hide. */
  result: AggResult | null;
  showTable: boolean;
  onShowTable: (on: boolean) => void;
}) {
  const kind: ChartKind = view.chartKind ?? 'bar';
  const groups = groupable(schema);
  const numbers = numberProps(schema);
  const groupProp = schema.find((p) => p.id === view.groupBy);
  const eachRow = kind !== 'number' && view.groupBy === ROW_GROUP;
  const agg = view.agg ?? 'count';
  const style = view.chartStyle ?? {};
  const setStyle = (patch: Partial<ChartStyle>) => onChange({ chartStyle: { ...style, ...patch } });

  const kinds: { value: ChartKind; label: string; icon: ReactNode }[] = [
    { value: 'bar', label: t('Vertical bars'), icon: <ChartColumn size={18} /> },
    { value: 'hbar', label: t('Horizontal bars'), icon: <ChartBar size={18} /> },
    { value: 'line', label: t('Line'), icon: <ChartLine size={18} /> },
    { value: 'donut', label: t('Donut'), icon: <ChartPie size={18} /> },
    { value: 'number', label: t('Number'), icon: <Hash size={18} /> },
  ];
  const whats = [
    ...(numbers.length ? [{ value: ROW_GROUP, label: t('Each row') }] : []),
    ...groups.map((p) => ({ value: p.id, label: p.name })),
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

  const pickKind = (v: ChartKind) => {
    // A kind the database cannot draw yet is kept and answered (FR-031),
    // never saved as a number chart behind the person's back.
    const next = chartSettingsFor(v, schema, view);
    if (next.chartKind !== v) {
      onWish?.(v);
      return;
    }
    onWish?.(null);
    onChange(next);
  };

  // The groups the chart drew last, with whether each is hidden (FR-022).
  const period = groupProp?.type === 'date' ? view.groupPeriod ?? 'month' : undefined;
  const listed = kind === 'number' || !result ? [] : eachRow ? [] : result.groups;
  const hidden = view.hiddenGroups ?? [];
  const setHidden = (keys: string[]) => onChange({ hiddenGroups: keys, ...(keys.includes('') ? {} : { showEmpty: undefined }) });
  const zeroable = !!groupProp && ['select', 'status', 'checkbox'].includes(groupProp.type) && kind !== 'donut';

  return (
    <div className="chart-panel">
      <fieldset className="chart-kinds">
        <legend className="chart-panel-label">{t('Chart')}</legend>
        {/* Native radios, as "Open pages in" (ViewOpenMenu): one choice of a
            few, the arrows move between them, and no hand-built buttons. */}
        {kinds.map((k) => (
          <label key={k.value} className="chart-kind" title={k.label}>
            <input
              type="radio"
              name={`chart-kind-${view.id}`}
              value={k.value}
              checked={kind === k.value}
              aria-label={k.label}
              onChange={() => pickKind(k.value)}
            />
            <span aria-hidden="true">{k.icon}</span>
          </label>
        ))}
      </fieldset>

      {kind !== 'number' && (
        <section className="chart-panel-section" aria-label={t('Data')}>
          <h3 className="chart-panel-heading">{t('Data')}</h3>
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
          {groupProp?.type === 'date' && (
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
        </section>
      )}

      <section className="chart-panel-section" aria-label={t('Value')}>
        {kind === 'number' && <h3 className="chart-panel-heading">{t('Data')}</h3>}
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
        {kind !== 'number' && (
          <Select
            label={t('Sort')}
            options={[
              { value: 'auto', label: t('Automatic') },
              { value: 'label_asc', label: t('Name, A to Z') },
              { value: 'label_desc', label: t('Name, Z to A') },
              { value: 'value_desc', label: t('Value, high to low') },
              { value: 'value_asc', label: t('Value, low to high') },
            ]}
            value={view.chartSort ?? 'auto'}
            onValueChange={(v) => onChange({ chartSort: v === 'auto' ? undefined : (v as ViewDef['chartSort']) })}
          />
        )}
        {zeroable && <Switch label={t('Show options with no rows')} checked={!!view.showZero} onCheckedChange={(on) => onChange({ showZero: on || undefined })} />}
      </section>

      {listed.length > 0 && (
        <section className="chart-panel-section" aria-label={t('Groups')}>
          <div className="chart-panel-row">
            <h3 className="chart-panel-heading">{t('Groups')}</h3>
            <Button size="sm" variant="ghost" onClick={() => setHidden(listed.map((g) => g.key))}>
              {t('Hide all')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onChange({ hiddenGroups: [], showEmpty: undefined })}>
              {t('Show all')}
            </Button>
          </div>
          <div className="chart-panel-groups">
            {listed.map((g) => {
              const shown = !isHidden(g.key, hidden, view.showEmpty);
              return (
                <Switch
                  key={g.key}
                  label={groupLabel(g, groupProp, period)}
                  checked={shown}
                  onCheckedChange={(on) => setHidden(on ? hidden.filter((k) => k !== g.key) : [...hidden.filter((k) => k !== g.key), g.key])}
                />
              );
            })}
          </div>
        </section>
      )}

      <section className="chart-panel-section" aria-label={t('Style')}>
        <h3 className="chart-panel-heading">{t('Style')}</h3>
        <Select
          label={t('Colours')}
          options={[
            { value: 'auto', label: t('Automatic') },
            { value: 'colorful', label: t('Colourful') },
            { value: 'colorless', label: t('Colourless') },
            { value: 'blue', label: t('Blue') },
            { value: 'yellow', label: t('Yellow') },
            { value: 'green', label: t('Green') },
            { value: 'purple', label: t('Purple') },
            { value: 'teal', label: t('Teal') },
            { value: 'orange', label: t('Orange') },
            { value: 'pink', label: t('Pink') },
            { value: 'red', label: t('Red') },
          ]}
          value={style.palette ?? 'auto'}
          onValueChange={(v) => setStyle({ palette: v === 'auto' ? undefined : (v as ChartStyle['palette']) })}
        />
        <Select
          label={t('Height')}
          options={[
            { value: 'small', label: t('Small') },
            { value: 'medium', label: t('Medium') },
            { value: 'large', label: t('Large') },
            { value: 'xlarge', label: t('Extra large') },
          ]}
          value={style.height ?? 'medium'}
          onValueChange={(v) => setStyle({ height: v === 'medium' ? undefined : (v as ChartStyle['height']) })}
        />
        {kind === 'number' ? (
          <TextSetting label={t('Title')} value={style.title ?? ''} max={120} onSave={(v) => setStyle({ title: v || undefined })} />
        ) : (
          <>
            {(kind === 'donut' || kind === 'line') && (
              <Select
                label={t('Legend')}
                options={[
                  { value: 'bottom', label: t('Bottom') },
                  { value: 'right', label: t('Right') },
                  { value: 'none', label: t('Hidden') },
                ]}
                value={style.legend ?? 'bottom'}
                onValueChange={(v) => setStyle({ legend: v === 'bottom' ? undefined : (v as ChartStyle['legend']) })}
              />
            )}
            <Switch label={t('Value labels')} checked={!!style.labels} onCheckedChange={(on) => setStyle({ labels: on || undefined })} />
            {kind === 'donut' && (
              <>
                <Switch label={t('Total in the centre')} checked={style.center !== false} onCheckedChange={(on) => setStyle({ center: on ? undefined : false })} />
                {style.center !== false && (
                  <TextSetting label={t('Total label')} value={style.centerLabel ?? ''} placeholder={t('Total')} max={60} onSave={(v) => setStyle({ centerLabel: v || undefined })} />
                )}
              </>
            )}
          </>
        )}
        <TextSetting label={t('Caption')} value={style.caption ?? ''} max={280} onSave={(v) => setStyle({ caption: v || undefined })} />
      </section>

      {kind !== 'number' && <Switch label={t('Show as table')} checked={showTable} onCheckedChange={onShowTable} />}
    </div>
  );
}

/** A text setting saved after a pause in typing, when the field is left, and
 *  when the panel closes with a pause still running, so a caption is not a
 *  write per key and the last keys are never lost. The stored value wins again
 *  when it changes from elsewhere (an agent, another tab) while the field is
 *  idle. */
function TextSetting({ label, value, placeholder, max, onSave }: { label: string; value: string; placeholder?: string; max: number; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ draft, value, onSave });
  latest.current = { draft, value, onSave };
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const { draft: d, value: v, onSave: save } = latest.current;
    if (d.trim() !== v) save(d.trim());
  };
  useEffect(() => {
    if (!timer.current) setDraft(value);
  }, [value]);
  useEffect(
    () => () => {
      if (timer.current) flush();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return (
    <Field label={label}>
      <Input
        value={draft}
        placeholder={placeholder}
        maxLength={max}
        onChange={(e) => {
          const v = e.currentTarget.value;
          setDraft(v);
          latest.current.draft = v;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(flush, TEXT_PAUSE_MS);
        }}
        onBlur={flush}
      />
    </Field>
  );
}

/** The button above the chart that opens the panel. */
export function ChartSettingsButton(props: Parameters<typeof ChartSettings>[0]) {
  // Open from the start when the chart was just inserted from the / menu.
  const [open, setOpen] = useState(() => takeOpenSettings(props.view.id));
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label={t('Chart settings')}
      closeLabel={t('Close')}
      trigger={
        <Button size="sm" variant="ghost">
          <SlidersHorizontal size={14} aria-hidden="true" />
          {t('Chart settings')}
        </Button>
      }
    >
      <ChartSettings {...props} />
    </Popover>
  );
}
