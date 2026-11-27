import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { api } from '../api';
import { isOptionType, type PropDef, type PropOption, type PropType, type StatusGroup } from '../types';
import { STATUS_GROUPS, orderByGroup, statusGroupLabel } from '../statusGroups';
import { toastError } from '../toast';
import { Button } from '../ui/Button';
import { Menu, MenuValueItem, MenuValues } from '../ui/Menu';
import Portal from './Portal';
import StatusGroupFilter from './StatusGroupFilter';
import { isGroupOp } from '../statusFilter';
import { OPTION_HEXES, optionPalette } from '../selectOptions';
import { renameSelectOption, moveSelectOption, reorderSelectOption } from '../renameSelectOption';
import { confirm } from '../dialog';
import { Check, Trash2 } from 'lucide-react';
import { t } from '../i18n';
import { ToggleGroup } from '../ui/ToggleGroup';
import { loadMembers, type Member } from './PropertyValue';
export { propertyTypes, PropertyTypeSelect, changePropertyType } from './propertyTypes';

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


  const isStatus = p.type === 'status';
  const EACH_GROUP = t('Each group needs at least one option. Add another to this group first.');
  const lastOfGroup = (id: string, g: StatusGroup) => (p.options ?? []).filter((x) => x.group === g).length === 1 && (p.options ?? []).some((x) => x.id === id && x.group === g);
  // Moving the only option out of a group would leave it empty (FR-002): refused
  // here, as the server refuses the save, so nobody learns it from an error.
  const leavesGroupEmpty = (id: string, to: StatusGroup) => {
    const from = (p.options ?? []).find((x) => x.id === id)?.group;
    if (!from || from === to || !lastOfGroup(id, from)) return false;
    toastError(EACH_GROUP);
    return true;
  };
  /** An option to the end of a group (the Move to menu, a drop on a heading). */
  const moveToGroup = (id: string, g: StatusGroup) => {
    const options = p.options ?? [];
    const o = options.find((x) => x.id === id);
    if (!o || o.group === g || leavesGroupEmpty(id, g)) return;
    onPatch({ options: orderByGroup([...options.filter((x) => x.id !== id), { ...o, group: g }]) });
  };
  const addStatusOption = (name: string, g: StatusGroup) => {
    const options = p.options ?? [];
    if (!name.trim()) return;
    // A status's option names are unique (the server refuses two alike, and
    // the whole dialog's save with them): said here, before anything is lost.
    if (options.some((o) => o.name.trim().toLowerCase() === name.trim().toLowerCase())) {
      toastError(t('Enter a unique, non-empty name.'));
      return;
    }
    let oid = slug(name);
    while (options.some((o) => o.id === oid)) oid += '_';
    onPatch({ options: orderByGroup([...options, { id: oid, name: name.trim(), color: OPTION_COLORS[options.length % OPTION_COLORS.length], group: g }]) });
  };
  const [dropGroup, setDropGroup] = useState<StatusGroup | null>(null);

    const renderOption = (o: PropOption) => {
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
                              const reordered = reorderSelectOption(p.options ?? [], dragOption.id, o.id,
                                e.clientX > rect.left + rect.width / 2);
                              // Dropped among another group's options, it joins that group (FR-004).
                              if (isStatus) {
                                if (o.group && !leavesGroupEmpty(dragOption.id, o.group)) {
                                  onPatch({ options: orderByGroup(reordered.map((x) => (x.id === dragOption.id ? { ...x, group: o.group } : x))) });
                                }
                              } else onPatch({ options: reordered });
                              setDragOption(null);
                              setDropOption(null);
                              setDropGroup(null);
                            }}
                            onDragEnd={() => { setDragOption(null); setDropOption(null); setDropGroup(null); }}
                            onKeyDown={(e) => {
                              if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
                              e.preventDefault();
                              const dir = e.key === 'ArrowLeft' ? -1 : 1;
                              const all = p.options ?? [];
                              // A status option stays in its group: the neighbour across a heading is another group's.
                              if (isStatus && all[all.findIndex((x) => x.id === o.id) + dir]?.group !== o.group) return;
                              onPatch({ options: moveSelectOption(all, o.id, dir) });
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
                                  <Button emphasis="low" tone="destructive" size="sm" icon={<Trash2 size={16} />} label={t('Delete option')} onClick={async () => {
                                    setColorPick(null);
                                    if (isStatus && o.group && lastOfGroup(o.id, o.group)) { toastError(EACH_GROUP); return; }
                                    const ok = await confirm(t('Delete option “{name}”?', { name: o.name }) + '\n' + t('Existing selections are not cleared.'), { confirmText: t('Delete option'), danger: true });
                                    if (!ok) return;
                                    onPatch({ options: (p.options ?? []).filter((item) => item.id !== o.id) });
                                  }} />
                                </div>
                                {!renameSelectOption(p.options ?? [], o.id, optionName) && <span className="form-hint" role="alert">{t('Enter a unique, non-empty name.')}</span>}
                                {isStatus && (
                                  <Menu
                                    label={t('Move to')}
                                    trigger={<Button emphasis="low" size="sm" className="schema-option-move">{t('Move to')}</Button>}
                                    align="start"
                                    className="schema-option-move-menu"
                                  >
                                    <MenuValues label={t('Move to')} reason="The three groups are values of one function, moveTo: the option goes to the one picked">
                                      {STATUS_GROUPS.map((g) => (
                                        <MenuValueItem key={g} checked={o.group === g} onClick={() => { moveToGroup(o.id, g); setColorPick(null); }}>
                                          {statusGroupLabel(g)}
                                        </MenuValueItem>
                                      ))}
                                    </MenuValues>
                                  </Menu>
                                )}
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
              // A group condition only means something on a status: another
              // property starts over with "is" and no value.
              onPatch(
                isGroupOp(p.rollupWhereOp) && targetSchema.find((x) => x.id === e.target.value)?.type !== 'status'
                  ? { rollupWhereProp: e.target.value, rollupWhereOp: 'is', rollupWhereValue: '', rollupWhereValues: undefined }
                  : { rollupWhereProp: e.target.value, rollupWhereOp: p.rollupWhereOp ?? 'is' },
              )
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
                    // Option ids and group ids are different vocabularies.
                    ...(isGroupOp(e.target.value) !== isGroupOp(p.rollupWhereOp)
                      ? { rollupWhereValue: '', rollupWhereValues: undefined }
                      : {}),
                  })
                }
              >
                <option value="is">{t('is')}</option>
                <option value="is_not">{t('is not')}</option>
                <option value="contains">{t('contains')}</option>
                {targetSchema.find((x) => x.id === p.rollupWhereProp)?.type === 'status' && (
                  <>
                    <option value="group_is">{t('Group is')}</option>
                    <option value="group_is_not">{t('Group is not')}</option>
                  </>
                )}
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
      {isOptionType(p.type) && (
                <div className={'schema-options' + (isStatus ? ' schema-options-status' : '')}>
                  {isStatus ? (
                    STATUS_GROUPS.map((g) => (
                      <div
                        key={g}
                        className={'schema-status-group' + (dropGroup === g ? ' drop-target' : '')}
                        onDragOver={(e) => {
                          if (dragOption?.prop !== p.id) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setDropGroup(g);
                        }}
                        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropGroup(null); }}
                        onDrop={(e) => {
                          if (dragOption?.prop !== p.id) return;
                          e.preventDefault();
                          moveToGroup(dragOption.id, g);
                          setDragOption(null);
                          setDropOption(null);
                          setDropGroup(null);
                        }}
                      >
                        {/* Not a stop for the keyboard: the heading names the chips below it. */}
                        <div className="schema-status-label" role="presentation">{statusGroupLabel(g)}</div>
                        <div className="schema-status-options">
                          {(p.options ?? []).filter((o) => o.group === g).map(renderOption)}
                          <input
                            className="opt-input"
                            placeholder={t('+ Option')}
                            aria-label={t('+ Option') + ' · ' + statusGroupLabel(g)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                addStatusOption((e.target as HTMLInputElement).value, g);
                                (e.target as HTMLInputElement).value = '';
                              }
                            }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <>
                      {(p.options ?? []).map(renderOption)}
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
                    </>
                  )}
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
  // A group condition names groups, not options (spec 016): several may be
  // ticked, and they are always stored as a list.
  if (isGroupOp(op)) {
    return (
      <StatusGroupFilter
        picked={values?.length ? values : value ? [value] : []}
        onChange={(gs) => {
          onChange('');
          onChangeValues(gs);
        }}
      />
    );
  }
  // is / is_not may name SEVERAL options — "open" is neither done nor
  // discarded. Ticking more than one writes the list; ticking exactly one keeps
  // writing the single value, so a condition made here still reads the same to
  // an older server.
  if (def && isOptionType(def.type) && (op === 'is' || op === 'is_not')) {
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
      // The rollup condition's value picker. Several options may be ticked
      // ("open" is neither done nor discarded), so it is chips rather than a
      // dropdown, small enough to sit on the condition row.
      <ToggleGroup
        className="form-chips where-values"
        label={def.name}
        multiple
        value={picked}
        onValueChange={(next) => {
          // One click is one item: hand the toggled id to the rule above.
          const id = next.find((x) => !picked.includes(x)) ?? picked.find((x) => !next.includes(x));
          if (id) toggle(id);
        }}
        items={(def.options ?? []).map((o) => ({ value: o.id, label: o.name }))}
      />
    );
  }
  if (def && isOptionType(def.type)) {
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
      // Tab stays inside the popover. It is drawn in a Portal, outside the
      // dialog's panel, so the dialog's focus trap (modal.ts) did not know it
      // and sent Tab from the name field back to the dialog's first field:
      // Delete, Move to and the colours could not be reached by keyboard.
      // Handled here, so the trap (which skips a handled key) leaves it alone.
      if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey && ref.current) {
        const items = Array.from(ref.current.querySelectorAll<HTMLElement>('input, button, [tabindex]:not([tabindex="-1"])'))
          .filter((el) => !el.hasAttribute('disabled'));
        if (!items.length) return;
        const at = items.indexOf(document.activeElement as HTMLElement);
        const next = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : (at + 1) % items.length;
        e.preventDefault();
        items[next].focus();
      }
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

