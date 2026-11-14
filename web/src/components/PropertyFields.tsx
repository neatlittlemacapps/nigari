import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { api } from '../api';
import type { PropDef, PropType } from '../types';
import Portal from './Portal';
import { OPTION_HEXES, optionPalette } from '../selectOptions';
import { renameSelectOption, moveSelectOption, reorderSelectOption } from '../renameSelectOption';
import { confirm } from '../dialog';
import { Check, Trash2 } from 'lucide-react';
import { t } from '../i18n';
import { loadMembers, type Member } from './PropertyValue';
export { TYPES, PropertyTypeSelect, changePropertyType } from './propertyTypes';

// One property's fields: its options (select, multi-select) and the settings
// its type has (number display, relation, backrelation, rollup, formula,
// person). Moved out of SchemaEditor (spec 015, research R4) so the Edit
// properties dialog and a row page's Edit property panel draw the same fields
// from one implementation: two copies would drift, the way option colours
// and rollup conditions once had to be fixed twice.

const AGGS: { value: NonNullable<PropDef['rollupAgg']>; label: string }[] = [
  { value: 'sum', label: 'Sum' },
  { value: 'count', label: 'Count' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  // Percent is the share of the related rows that meet the condition. It exists
  // so a progress bar needs no formula: a formula would have to divide, and
  // 0 of 0 related rows is a division by zero — an error message in the column
  // of every newly created row.
  { value: 'percent', label: 'Percent' },
];

export const OPTION_COLORS = OPTION_HEXES;

// Fallback colour for options that have none: before W89 the import handed
// out no colour, and a chip with `background: undefined + '2e'` is invisible —
// which is exactly what made the schema editor look broken. Derived from the
// name, so the same option always gets the same shade.
export function autoOptionColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return OPTION_HEXES[h % OPTION_HEXES.length];
}

let idCounter = 0;
export const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `p${++idCounter}`;

/** Schemas of the databases a schema's relations and backrelations point at,
 *  so a rollup can list the target's properties and a backrelation the
 *  relations pointing back. Fetched lazily, cached by database id. */
export function useTargetSchemas(schema: PropDef[]): Record<string, PropDef[]> {
  const [targetSchemas, setTargetSchemas] = useState<Record<string, PropDef[]>>({});
  useEffect(() => {
    // Both directions need the other side's schema: a relation to offer its
    // properties to a rollup, a backrelation to offer the relations that point
    // back here. Without the second half its property picker stayed empty.
    const wanted = new Set(
      schema
        .flatMap((p) => [
          p.type === 'relation' ? p.relationCollection : '',
          p.type === 'backrelation' ? p.backrelationCollection : '',
        ])
        .filter(Boolean) as string[],
    );
    for (const cid of wanted) {
      if (targetSchemas[cid]) continue;
      void api
        .getCollection(cid)
        .then((c) => setTargetSchemas((prev) => ({ ...prev, [cid]: c.schema })))
        .catch(() => {});
    }
  }, [schema, targetSchemas]);
  return targetSchemas;
}

/** A property's options and type settings. `schema` is the whole schema the
 *  property belongs to (a formula lists the others, a rollup the relations);
 *  `targets` the databases a relation may point at. Every edit is a patch. */
export function PropertyFields({
  p,
  schema,
  targets,
  targetSchemas,
  onPatch,
}: {
  p: PropDef;
  schema: PropDef[];
  targets: { id: string; title: string }[];
  targetSchemas: Record<string, PropDef[]>;
  onPatch: (patch: Partial<PropDef>) => void;
}) {
  const [dragOption, setDragOption] = useState<{ prop: string; id: string } | null>(null);
  const [dropOption, setDropOption] = useState<{ key: string; after: boolean } | null>(null);
  const [optionName, setOptionName] = useState('');
  const [optionAnchor, setOptionAnchor] = useState<HTMLElement | null>(null);
  const [colorPick, setColorPick] = useState<string | null>(null);

  const addOption = (name: string) => {
    if (!name.trim()) return;
    const options = p.options ?? [];
    // Distinct names can slug to the same id ("In Progress" vs
    // "in-progress"); suffix collisions so no option is silently dropped.
    let oid = slug(name);
    while (options.some((o) => o.id === oid)) oid += '_';
    onPatch({
      options: [...options, { id: oid, name: name.trim(), color: OPTION_COLORS[options.length % OPTION_COLORS.length] }],
    });
  };

  const relationProps = schema.filter((x) => x.type === 'relation');

  // Config UI shown under a property row for the computed/linked types.
  const numberDisplayFields = (p: PropDef) => (
    <>
      <label>{t('Display')}</label>
      <select
        className="prop-select"
        value={p.numberDisplay ?? 'plain'}
        onChange={(e) => onPatch({ numberDisplay: e.target.value as PropDef['numberDisplay'] })}
      >
        <option value="plain">{t('Number')}</option>
        <option value="bar">{t('Progress bar')}</option>
        <option value="ring">{t('Ring')}</option>
      </select>
      {(p.numberDisplay === 'bar' || p.numberDisplay === 'ring') && (
        <>
          <label>Max (= 100%)</label>
          <input
            className="prop-input"
            type="number"
            value={p.numberMax ?? 100}
            onChange={(e) =>
              onPatch({ numberMax: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
        </>
      )}
    </>
  );

  const renderConfig = (p: PropDef) => {
    if (p.type === 'person') {
      return <PersonConfig p={p} onChange={(patch) => onPatch(patch)} />;
    }
    if (p.type === 'number') {
      return <div className="schema-config">{numberDisplayFields(p)}</div>;
    }
    if (p.type === 'relation') {
      return (
        <div className="schema-config">
          <label>{t('Links to')}</label>
          <select
            className="prop-select"
            value={p.relationCollection ?? ''}
            onChange={(e) => onPatch({ relationCollection: e.target.value })}
          >
            <option value="">{t('Select a collection…')}</option>
            {targets.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title || t('Untitled')}
              </option>
            ))}
          </select>
        </div>
      );
    }
    // A backrelation asks the other database "which of your rows point at me?".
    // It needs the database AND which of its properties does the pointing —
    // a collection can hold several relations back to us, and picking the
    // wrong one silently lists the wrong rows.
    if (p.type === 'backrelation') {
      const sourceSchema = p.backrelationCollection
        ? targetSchemas[p.backrelationCollection] ?? []
        : [];
      const pointingHere = sourceSchema.filter((s) => s.type === 'relation');
      return (
        <div className="schema-config">
          <label>{t('Rows from')}</label>
          <select
            className="prop-select"
            value={p.backrelationCollection ?? ''}
            onChange={(e) =>
              onPatch({ backrelationCollection: e.target.value, backrelationProp: '' })
            }
          >
            <option value="">{t('Select a collection…')}</option>
            {targets.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title || t('Untitled')}
              </option>
            ))}
          </select>
          <label>{t('That point here via')}</label>
          <select
            className="prop-select"
            value={p.backrelationProp ?? ''}
            onChange={(e) => onPatch({ backrelationProp: e.target.value })}
            disabled={!p.backrelationCollection}
          >
            <option value="">
              {p.backrelationCollection ? t('Select a relation…') : t('(pick collection first)')}
            </option>
            {pointingHere.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      );
    }
    if (p.type === 'rollup') {
      // A rollup may aggregate over a backrelation too — that is what turns
      // "the tasks pointing at this system" into "how many of them are done".
      const rollupSources = [...relationProps, ...schema.filter((s) => s.type === 'backrelation')];
      const rel = rollupSources.find((r) => r.id === p.rollupRelation);
      const relTarget = rel?.relationCollection || rel?.backrelationCollection || '';
      const targetSchema = relTarget ? targetSchemas[relTarget] ?? [] : [];
      return (
        <div className="schema-config">
          <label>{t('Via relation')}</label>
          <select
            className="prop-select"
            value={p.rollupRelation ?? ''}
            onChange={(e) => onPatch({ rollupRelation: e.target.value, rollupTarget: '' })}
          >
            <option value="">{t('Select a relation…')}</option>
            {rollupSources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <label>{t('Of property')}</label>
          <select
            className="prop-select"
            value={p.rollupTarget ?? ''}
            onChange={(e) => onPatch({ rollupTarget: e.target.value })}
            disabled={!rel}
          >
            <option value="">{rel ? 'Select…' : '(pick relation first)'}</option>
            {targetSchema
              .filter((t) => t.type !== 'rollup' && t.type !== 'formula' && t.type !== 'relation')
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
          <label>{t('Calculate')}</label>
          <select
            className="prop-select"
            value={p.rollupAgg ?? 'sum'}
            onChange={(e) => onPatch({ rollupAgg: e.target.value as PropDef['rollupAgg'] })}
          >
            {AGGS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          {/* The condition is what makes progress expressible: one rollup counts
              everything, a second counts only the done ones, and a formula
              divides them. Leaving it empty keeps the old behaviour. */}
          <label>{t('Only rows where')}</label>
          <select
            className="prop-select"
            value={p.rollupWhereProp ?? ''}
            onChange={(e) =>
              onPatch({
                rollupWhereProp: e.target.value,
                rollupWhereOp: p.rollupWhereOp ?? 'is',
              })
            }
            disabled={!rel}
          >
            <option value="">{t('All rows')}</option>
            {targetSchema
              .filter((t) => t.type !== 'rollup' && t.type !== 'formula')
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
          {p.rollupWhereProp && (
            <div className="schema-where">
              <select
                className="prop-select"
                value={p.rollupWhereOp ?? 'is'}
                onChange={(e) =>
                  onPatch({
                    rollupWhereOp: e.target.value as PropDef['rollupWhereOp'],
                  })
                }
              >
                <option value="is">{t('is')}</option>
                <option value="is_not">{t('is not')}</option>
                <option value="contains">{t('contains')}</option>
                <option value="is_empty">{t('is empty')}</option>
                <option value="is_not_empty">{t('is not empty')}</option>
              </select>
              {p.rollupWhereOp !== 'is_empty' && p.rollupWhereOp !== 'is_not_empty' && (
                <WhereValue
                  schema={targetSchema}
                  propId={p.rollupWhereProp}
                  op={p.rollupWhereOp ?? 'is'}
                  value={p.rollupWhereValue ?? ''}
                  values={p.rollupWhereValues}
                  onChange={(v) => onPatch({ rollupWhereValue: v })}
                  onChangeValues={(vs) =>
                    onPatch({ rollupWhereValues: vs.length ? vs : undefined })
                  }
                />
              )}
            </div>
          )}
          {numberDisplayFields(p)}
        </div>
      );
    }
    if (p.type === 'formula') {
      return (
        <div className="schema-config formula-config">
          <label>{t('Expression')}</label>
          <input
            className="prop-input formula-input"
            placeholder={t('e.g. {price} * {qty} - {discount}')}
            value={p.formula ?? ''}
            onChange={(e) => onPatch({ formula: e.target.value })}
          />
          <div className="formula-hint">
            Reference other properties with <code>{'{id}'}</code>. Available:{' '}
            {schema
              .filter((o) => o.id !== p.id)
              .map((o) => (
                <code key={o.id} className="formula-token" title={o.name}>
                  {'{' + o.id + '}'}
                </code>
              ))}
            . Supports <code>+ - * / ( )</code>.
          </div>
          {numberDisplayFields(p)}
        </div>
      );
    }
    return null;
  };

  return (
    <>
      {(p.type === 'select' || p.type === 'multiselect') && (
                <div className="schema-options">
                    {(p.options ?? []).map((o) => {
                      const hex = o.color || autoOptionColor(o.name);
                      const key = `${p.id}:${o.id}`;
                      return (
                        <span key={o.id} className="opt-chip-wrap">
                          {/* Option edits remain drafts until the Properties dialog is saved. */}
                          <button
                            type="button"
                            className={'prop-chip opt-chip draggable-option' +
                              (dragOption?.prop === p.id && dragOption.id === o.id ? ' option-dragging' : '') +
                              (dropOption?.key === key ? (dropOption.after ? ' option-drop-after' : ' option-drop-before') : '')}
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', o.id);
                              setColorPick(null);
                              setDragOption({ prop: p.id, id: o.id });
                            }}
                            onDragOver={(e) => {
                              if (dragOption?.prop !== p.id || dragOption.id === o.id) return;
                              e.preventDefault();
                              e.stopPropagation();
                              e.dataTransfer.dropEffect = 'move';
                              const rect = e.currentTarget.getBoundingClientRect();
                              setDropOption({ key, after: e.clientX > rect.left + rect.width / 2 });
                            }}
                            onDragLeave={() => setDropOption((target) => target?.key === key ? null : target)}
                            onDrop={(e) => {
                              if (dragOption?.prop !== p.id) return;
                              e.preventDefault();
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              onPatch({ options: reorderSelectOption(p.options ?? [], dragOption.id, o.id,
                                e.clientX > rect.left + rect.width / 2) });
                              setDragOption(null);
                              setDropOption(null);
                            }}
                            onDragEnd={() => { setDragOption(null); setDropOption(null); }}
                            onKeyDown={(e) => {
                              if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
                              e.preventDefault();
                              onPatch({ options: moveSelectOption(p.options ?? [], o.id, e.key === 'ArrowLeft' ? -1 : 1) });
                            }}
                            style={{ background: hex + '2e', color: hex }}
                            title={t('Click to edit; drag to reorder. Keyboard: Alt + Left/Right.')}
                            onClick={(e) => { setOptionAnchor(e.currentTarget); setOptionName(o.name); setColorPick(colorPick === key ? null : key); }}
                          >
                            {o.name}
                          </button>
                          {colorPick === key && (
                            <OptionPopover name={optionName} anchor={optionAnchor} onClose={() => setColorPick(null)}>
                                <div className="select-rename">
                                  <input autoFocus className="prop-input" aria-label={t('Option name')}
                                    value={optionName} onChange={(e) => {
                                      const draft = e.target.value;
                                      setOptionName(draft);
                                      const options = renameSelectOption(p.options ?? [], o.id, draft);
                                      if (options) onPatch({ options });
                                    }} />
                                  <button type="button" className="danger" aria-label={t('Delete option')} title={t('Delete option')} onClick={async () => {
                                    setColorPick(null);
                                    const ok = await confirm(t('Delete option “{name}”?', { name: o.name }) + '\n' + t('Existing selections are not cleared.'), { confirmText: t('Delete option'), danger: true });
                                    if (!ok) return;
                                    onPatch({ options: (p.options ?? []).filter((item) => item.id !== o.id) });
                                  }}><Trash2 size={16} /></button>
                                </div>
                                {!renameSelectOption(p.options ?? [], o.id, optionName) && <span className="form-hint" role="alert">{t('Enter a unique, non-empty name.')}</span>}
                                {optionPalette().map((c) => (
                                  <button
                                    key={c.hex}
                                    type="button"
                                    className="tag-color-opt"
                                    onClick={() => {
                                      onPatch({ options: (p.options ?? []).map((x) => (x.id === o.id ? { ...x, color: c.hex } : x)) });
                                      setColorPick(null);
                                    }}
                                  >
                                    <span className="tag-swatch" style={{ background: c.hex }} />
                                    <span className="tag-color-name">{c.name}</span>
                                    {hex === c.hex && <Check size={14} />}
                                  </button>
                                ))}
                            </OptionPopover>
                          )}
                        </span>
                      );
                    })}
                  <input
                    className="opt-input"
                    placeholder={t('+ Option')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        addOption((e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).value = '';
                      }
                    }}
                  />
                </div>
              )}
      {renderConfig(p)}
    </>
  );
}

// The comparison value for a rollup condition. A select property is offered as
// its options rather than a free-text field: the server compares against the
// stored option ID, which is not what the reader sees on screen — typing
// "Erledigt" where "erledigt" is stored yields a silent zero.
function WhereValue({
  schema,
  propId,
  op,
  value,
  values,
  onChange,
  onChangeValues,
}: {
  schema: PropDef[];
  propId: string;
  op: string;
  value: string;
  values?: string[];
  onChange: (v: string) => void;
  onChangeValues: (vs: string[]) => void;
}) {
  const def = schema.find((p) => p.id === propId);
  // is / is_not may name SEVERAL options — "open" is neither done nor
  // discarded. Ticking more than one writes the list; ticking exactly one keeps
  // writing the single value, so a condition made here still reads the same to
  // an older server.
  if (def && (def.type === 'select' || def.type === 'multiselect') && (op === 'is' || op === 'is_not')) {
    const picked = values?.length ? values : value ? [value] : [];
    const toggle = (id: string) => {
      const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
      if (next.length === 1) {
        onChangeValues([]);
        onChange(next[0]);
      } else {
        onChange('');
        onChangeValues(next);
      }
    };
    return (
      <div className="form-chips where-values">
        {(def.options ?? []).map((o) => (
          <button
            type="button"
            key={o.id}
            className={'form-chip' + (picked.includes(o.id) ? ' on' : '')}
            onClick={() => toggle(o.id)}
          >
            {o.name}
          </button>
        ))}
      </div>
    );
  }
  if (def && (def.type === 'select' || def.type === 'multiselect')) {
    return (
      <select className="prop-select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('Select a value…')}</option>
        {(def.options ?? []).map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    );
  }
  if (def && def.type === 'checkbox') {
    return (
      <select className="prop-select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="true">{t('Checked')}</option>
        <option value="false">{t('Unchecked')}</option>
      </select>
    );
  }
  return (
    <input
      className="prop-input"
      value={value}
      placeholder={t('Value')}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// Escape the scrolling Properties dialog without changing its layout.
function OptionPopover({ anchor, name, onClose, children }: {
  name: string;
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const place = () => {
      const panel = ref.current;
      if (!panel) return;
      const rect = anchor.getBoundingClientRect();
      const margin = 8;
      const input = panel.querySelector('input');
      const context = document.createElement('canvas').getContext('2d');
      if (context && input) context.font = getComputedStyle(input).font;
      const textWidth = context?.measureText(name).width ?? name.length * 8;
      const width = Math.min(Math.max(150, Math.ceil(textWidth) + 58), window.innerWidth - margin * 2);
      const height = panel.scrollHeight + 2;
      const below = Math.max(0, window.innerHeight - rect.bottom - margin - 5);
      const above = Math.max(0, rect.top - margin - 5);
      const openBelow = below >= height || below >= above;
      const maxHeight = Math.max(0, Math.min(window.innerHeight - margin * 2, openBelow ? below : above));
      const top = openBelow ? rect.bottom + 5 : rect.top - 5 - Math.min(height, maxHeight);
      setPosition({
        width, maxHeight,
        left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)),
        top: Math.max(margin, Math.min(top, window.innerHeight - maxHeight - margin)),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, name]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => ref.current?.querySelector('input')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [anchor]);
  return <Portal>
    <div className="schema-option-backdrop" onClick={onClose} />
    <div ref={ref} className="opt-color-pop schema-option-editor" style={position} onKeyDown={(e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    }}>{children}</div>
  </Portal>;
}

/** A person property's two settings (#11): one person or several, and who can
 *  be picked. Nobody ticked means everybody, which is how the property has
 *  always behaved; the list is the members of every workspace this browser can
 *  see, the same one the cell offers. */
function PersonConfig({ p, onChange }: { p: PropDef; onChange: (patch: Partial<PropDef>) => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    let alive = true;
    void loadMembers().then((m) => alive && setMembers(m));
    return () => {
      alive = false;
    };
  }, []);
  const pool = new Set(p.personPool ?? []);
  const toggle = (id: string) => {
    const next = pool.has(id) ? [...pool].filter((x) => x !== id) : [...pool, id];
    onChange({ personPool: next.length ? next : undefined });
  };
  return (
    <div className="schema-config schema-person">
      <label className="schema-person-check">
        <input
          type="checkbox"
          checked={!!p.personMultiple}
          onChange={(e) => onChange({ personMultiple: e.target.checked || undefined })}
        />
        {t('Several people')}
      </label>
      <div className="schema-person-pool">
        <span className="schema-person-hint">
          {pool.size ? t('Only these can be picked:') : t('Everybody can be picked. Tick people to narrow it down:')}
        </span>
        {members.map((m) => (
          <label key={m.userId} className="schema-person-check">
            <input type="checkbox" checked={pool.has(m.userId)} onChange={() => toggle(m.userId)} />
            {m.name}
          </label>
        ))}
      </div>
    </div>
  );
}

