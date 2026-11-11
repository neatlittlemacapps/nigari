import { Fragment, useEffect, useRef, useState } from 'react';
import { dropIndex, useBoardDrag } from '../boardDrag';
import { tagColorClass } from '../tags';
import { t } from '../i18n';
import type { PropDef, PropOption, Sort } from '../types';
import PropertyValue, { PersonStack, loadRelationOptions, type RelOption } from './PropertyValue';
import { openPageAux, useOpenRow } from '../pageOpen';
import { CardMenu } from './CollectionMenus';
import { MenuItem, MenuSeparator, MenuValueItem, MenuValues, type MenuPoint } from '../ui/Menu';
import { AgentDot } from './AgentBadge';
import { planCard, isBlank, zoneOf, contactKind, needsLabel } from '../cardLayout';
import { PageIcon } from '../pageIcon';
import { UNSET, groupValueFor, type Row } from '../collectionRow';
import { cellKey, dropPatch, laneIdsOf, lanesFor, laneValue, parseCellKey, type Lane } from '../boardLanes';
import BoardLaneHead, { useLaneNames } from './BoardLaneHead';
import { Plus, Link2, MessageSquare, Mail, Phone, MapPin } from 'lucide-react';

// ---- Board (Kanban) ----

// What a board card shows, in fixed zones (W126, see cardLayout.ts). The old
// version rendered every property in schema order, so the card grew with the
// schema instead of with what matters — two unlabelled dates, a bare number,
// the same colleague once per person field, and four lines of address and
// phone that nobody reads on a card.
//
// Nothing here hides a field by cleverness: the order is fixed and the tail
// is counted, not dropped — "+3" opens in place and names what it holds.
function BoardCardProps({
  schema,
  row,
  groupBy,
  expanded,
  onToggleExpand,
  onSetProp,
  onSetOptions,
}: {
  schema: PropDef[];
  row: Row;
  groupBy: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onSetProp: (rowId: string, propId: string, value: unknown) => void;
  onSetOptions: (propId: string, options: PropOption[]) => void;
}) {
  const defs = schema.filter((p) => p.id !== groupBy);
  const filled = defs.filter((p) => !isBlank(row.props[p.id]));
  const plan = planCard(filled, (p) => ({ def: p, value: row.props[p.id] }));

  // Empty select fields stay reachable: they are invisible until the card is
  // hovered, so a status can be set without opening the card — but they never
  // put "— — —" under every title.
  const emptySelects = defs.filter(
    (p) => (p.type === 'select' || p.type === 'multiselect') && isBlank(row.props[p.id]),
  );

  const factRow = (p: PropDef) => {
    // A checkbox or a checklist is something you tick, not something you read:
    // it stays live in the compact row, where every other fact is display only
    // — a disabled checkbox on a card reads as a broken one.
    const tickable = p.type === 'checkbox' || p.type === 'checklist';
    return (
      <span
        key={p.id}
        className="card-fact"
        /* A tick is a tick. The card's own click opens the row, so without
           this the tick and the open happen together. Only the tickable facts
           claim the click — pressing any other one still opens the card. */
        onClick={tickable ? (e) => e.stopPropagation() : undefined}
      >
        {needsLabel(p, plan.facts.length) && <span className="card-fact-label">{p.name}</span>}
        <PropertyValue
          def={p}
          value={row.props[p.id]}
          readOnly={!tickable}
          compact
          onChange={(nv) => onSetProp(row.id, p.id, nv)}
        />
      </span>
    );
  };

  const contactIcon = (p: PropDef) => {
    const kind = contactKind(p, row.props[p.id]);
    const value = String(row.props[p.id] ?? '');
    const Icon = kind === 'mail' ? Mail : kind === 'phone' ? Phone : kind === 'address' ? MapPin : Link2;
    return (
      <span key={p.id} className="card-contact" title={`${p.name}: ${value}`}>
        <Icon size={13} />
      </span>
    );
  };

  return (
    <div className="board-card-props">
      {(plan.chips.length > 0 || emptySelects.length > 0) && (
        <div className="card-chips">
          {[...plan.chips, ...emptySelects].map((p) => (
            <div
              key={p.id}
              className={'card-prop-edit' + (isBlank(row.props[p.id]) ? ' is-empty' : '')}
              onClick={(e) => e.stopPropagation()}
            >
              <PropertyValue
                def={p}
                value={row.props[p.id]}
                onChange={(nv) => onSetProp(row.id, p.id, nv)}
                onOptionsChange={(opts) => onSetOptions(p.id, opts)}
              />
            </div>
          ))}
        </div>
      )}
      {plan.facts.length > 0 && <div className="card-facts">{plan.facts.map(factRow)}</div>}
      {plan.notes.map((p) => (
        <p key={p.id} className="card-note">
          {String(row.props[p.id])}
        </p>
      ))}
      {(plan.contacts.length > 0 || plan.overflow.length > 0) && (
        <div className="card-footline">
          {plan.contacts.map(contactIcon)}
          {plan.overflow.length > 0 && (
            <button
              className="card-more"
              title={plan.overflow.map((p) => p.name).join(', ')}
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
            >
              {expanded ? t('less') : t('+{n} more', { n: String(plan.overflow.length) })}
            </button>
          )}
        </div>
      )}
      {expanded && plan.overflow.length > 0 && (
        <div className="card-facts card-overflow">
          {plan.overflow.map((p) =>
            zoneOf(p, row.props[p.id]) === 'fact' ? (
              factRow(p)
            ) : (
              <span key={p.id} className="card-fact">
                <span className="card-fact-label">{p.name}</span>
                <span className="card-fact-text">{String(row.props[p.id])}</span>
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export default function BoardView({
  rows,
  sort,
  rowOrder,
  schema,
  groupBy,
  tagColors,
  commentCounts,
  onNavigate,
  onOpenInNewTab,
  onSetProp,
  onSetOptions,
  onDrop,
  onTrashRow,
  onAddInColumn,
  lanes,
}: {
  rows: Row[];
  sort?: Sort | null;
  rowOrder: Map<string, number>;
  schema: PropDef[];
  groupBy: string;
  tagColors: Record<string, string>;
  commentCounts: Record<string, number>;
  onNavigate: (id: string) => void;
  onOpenInNewTab?: (id: string) => void;
  onSetProp: (rowId: string, propId: string, value: unknown) => void;
  onSetOptions: (propId: string, options: PropOption[]) => void;
  onDrop: (rowId: string, groupBy: string, optId: string) => void;
  onTrashRow: (id: string, title: string) => Promise<void>;
  /** extra: on a board with lanes, the lane's value too (spec 013). */
  onAddInColumn: (groupBy: string, optId: string, extra?: Record<string, unknown>) => void;
  /** A board's lanes (spec 013, US4): the sub-group property, its lanes,
   *  which ones this person folded, and how a drop between cells is written
   *  (both values in one change, boardLanes.ts). */
  lanes?: {
    by: string;
    prop: PropDef;
    folded: Set<string>;
    onFold?: (lane: string, folded: boolean) => void;
    /** A formula or rollup: lanes are drawn, no drop changes one (FR-018). */
    readOnly: boolean;
    onDropPatch: (rowId: string, patch: Record<string, unknown>) => void;
  };
}) {
  // What a click on a row does follows the view (spec 007, pageOpen.ts).
  const openRow = useOpenRow({ onNavigate, onOpenInNewTab });
  // Keyed by "columnId:rowId" so a card that appears in multiple columns
  // (multiselect grouping) opens only the tapped copy's menu.
  const [moveMenu, setMoveMenu] = useState<string | null>(null);
  // A right-click on a card opens its ⋯ menu at the pointer; focus then
  // returns to the card, not to the ⋯ (shown only on hover).
  const [movePoint, setMovePoint] = useState<{ key: string; point: MenuPoint } | null>(null);
  const moveReturn = useRef<HTMLElement | null>(null);
  // Cards whose overflow ("+3") the reader opened. Kept here rather than per
  // card so it survives a re-render, and forgotten on leaving the view — an
  // opened card is a glance, not a setting.
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  // Pointer-based dragging instead of the jerky native drag (see boardDrag).
  // The lanes, from the property's options or from the values the rows hold,
  // and their names (people and related rows by name).
  const laneName = useLaneNames(lanes?.prop);
  const laneList: Lane[] = lanes ? lanesFor(lanes.prop, rows.map((r) => r.props[lanes.by])) : [];
  // Each row's lanes, worked out once per render: the cells and the lane
  // counts read this instead of each scanning every row again, which on a
  // large board ran on every pointer move of a drag (code review).
  const laneKnown = new Set(laneList.map((l) => l.id));
  const rowLanes = new Map(lanes ? rows.map((r) => [r.id, laneIdsOf(r.props[lanes.by], laneKnown)]) : []);
  const { drag, armedRow, startDrag, consumeClick } = useBoardDrag((rowId, toCol, fromCol) => {
    if (!lanes) return onDrop(rowId, groupBy, toCol);
    // Between cells: only what changed is written, in one change; a lane of
    // a formula or rollup is not changed by any drop (dropPatch says null).
    const row = rows.find((r) => r.id === rowId);
    const patch = dropPatch(fromCol, toCol, groupBy, lanes.by, lanes.prop, (col) => columnValue(col), row?.props[lanes.by]);
    if (patch) lanes.onDropPatch(rowId, patch);
  });
  // When grouping by a relation, the columns are the rows of the target
  // collection. Loaded through the same cache the relation cells use, so the
  // column heading and the cell always say the same thing.
  const [relColumns, setRelColumns] = useState<RelOption[]>([]);
  const groupTarget =
    schema.find((p) => p.id === groupBy)?.type === 'relation'
      ? (schema.find((p) => p.id === groupBy)?.relationCollection ?? '')
      : '';
  useEffect(() => {
    if (!groupTarget) {
      setRelColumns([]);
      return;
    }
    let alive = true;
    void loadRelationOptions(groupTarget).then((o) => alive && setRelColumns(o));
    return () => {
      alive = false;
    };
  }, [groupTarget]);
  const prop = schema.find((p) => p.id === groupBy);
  if (!prop || (prop.type !== 'select' && prop.type !== 'multiselect' && prop.type !== 'relation')) {
    return (
      <div className="board-empty">
        {t('This board needs a {type} property to group by. Open Settings, then Edit properties, to add one.', { type: t('Select') })}
      </div>
    );
  }
  // Grouping by a relation turns the related rows into the columns: one column
  // per system, per customer, per whatever the rows point at. The rest of the
  // board does not need to know the difference — the ids are ids, and a
  // relation value is an array exactly like a multiselect's.
  const options: PropOption[] =
    prop.type === 'relation'
      ? relColumns.map((o) => ({ id: o.id, name: o.title || t('Untitled'), color: '#999' }))
      : (prop.options ?? []);
  const optionIds = new Set(options.map((o) => o.id));
  // The catch-all column was built by gluing "No " onto the property name, so
  // it stayed English in every language. It shows on every board.
  const columns = [...options, { id: UNSET, name: t('No {name}', { name: prop.name }), color: '#999' }];

  // A row whose value references a removed option would otherwise vanish from
  // every column; the UNSET column catches those so no card is lost.
  const isUngrouped = (v: unknown) => {
    if (v === undefined || v === '' || v === null) return true;
    if (Array.isArray(v)) return v.length === 0 || !v.some((x) => optionIds.has(x as string));
    return !optionIds.has(v as string);
  };

  const rowsFor = (optId: string) =>
    rows.filter((r) => {
      const v = r.props[groupBy];
      if (optId === UNSET) return isUngrouped(v);
      if (Array.isArray(v)) return v.includes(optId);
      return v === optId;
    });

  // Where the dragged card will land in the column under the pointer (spec
  // 012, US3): the place the view's sort gives it there, not the pointer's.
  // Over its own column nothing is added: the card's own dimmed place is it.
  const dragged = drag ? rows.find((r) => r.id === drag.rowId) : undefined;
  // The value a column stands for, in the shape the property stores.
  const columnValue = (col: string): unknown =>
    col === UNSET ? (prop.type === 'select' ? '' : []) : groupValueFor(schema, groupBy, col);
  // Whether a drag may land on a cell: on a board whose lanes are a formula
  // or a rollup, only within the card's own lane (FR-018).
  const mayDropOn = (key: string): boolean => {
    if (!lanes?.readOnly || !drag) return true;
    return parseCellKey(key)?.lane === parseCellKey(drag.fromCol)?.lane;
  };
  const dropAt = (key: string, cards: Row[]): number => {
    if (!drag || !dragged || drag.over !== key || drag.fromCol === key || !mayDropOn(key)) return -1;
    const col = lanes ? (parseCellKey(key)?.col ?? key) : key;
    // On a multi-select or relation board the card can already be in this
    // column too; then it is its own place there, as in its own column.
    if (cards.some((c) => c.id === dragged.id)) return -1;
    const moved = { ...dragged, props: { ...dragged.props, [groupBy]: columnValue(col) } };
    return dropIndex(cards, moved, sort, (id) => rowOrder.get(id) ?? 0);
  };
  // On a board with lanes the marker is a line, not a card-sized gap: a gap
  // made the lane under the pointer taller and pushed every lane below it
  // down, so the cell being aimed at moved away from the pointer
  // (board-lanes.mjs found it). A line says where the card lands without
  // moving anything.
  const placeholder = drag ? (
    lanes ? (
      <div className="board-drop-place is-line" aria-hidden="true" />
    ) : (
      <div className="board-drop-place" style={{ height: drag.height }} aria-hidden="true" />
    )
  ) : null;

  // The columns, for the whole board or for one lane of it (spec 013).
  const renderColumns = (laneId: string | null) => (
    <>
      {columns.map((col) => {
        // On a board with lanes a cell is the meeting of a column and a lane,
        // keyed by both (boardLanes.ts); without lanes the key is the column.
        const key = laneId === null ? col.id : cellKey(laneId, col.id);
        const cards = laneId === null ? rowsFor(col.id) : rowsFor(col.id).filter((r) => (rowLanes.get(r.id) ?? []).includes(laneId));
        const at = dropAt(key, cards);
        return (
        <div
          key={key}
          data-col={key}
          className={
            'board-col' +
            // Highlight the target column but not the source column — putting it
            // back there is not a change.
            (drag && drag.over === key && drag.fromCol !== key && mayDropOn(key) ? ' drag-over' : '')
          }
          // The column carries the colour of ITS option (choosable in the
          // properties dialog since W94) — the tint used to come from a
          // position-based rainbow nobody could influence.
          style={col.id !== UNSET ? ({ '--col-c': col.color } as React.CSSProperties) : undefined}
        >
          <div className="board-col-head">
            <span className="board-col-head-left">
              <span className="board-chip" style={{ background: col.color + '33', color: col.color }}>
                {col.name}
              </span>
              <span className="board-count">{cards.length}</span>
            </span>
            <button className="board-add" title={t('New')} onClick={() => onAddInColumn(groupBy, col.id, laneId === null || lanes?.readOnly ? undefined : lanes ? { [lanes.by]: laneValue(lanes.prop, laneId) } : undefined)}>
              <Plus size={14} />
            </button>
          </div>
          <div className="board-cards">
            {cards.map((r, i) => (
              <Fragment key={r.id}>
              {i === at && placeholder}
              <div
                className={
                  'board-card' +
                  (drag?.rowId === r.id && drag.fromCol === key ? ' is-dragging' : '') +
                  (armedRow === r.id ? ' is-armed' : '')
                }
                // Focusable by script only (not a Tab stop): a menu opened by a
                // right-click on the card gives focus back to the card.
                tabIndex={-1}
                onPointerDown={(e) => startDrag(e, r.id, key, r.title || t('Untitled'))}
                onClick={(e) => {
                  // Do NOT open after a drag — otherwise every move jumps
                  // straight into the card.
                  if (consumeClick()) return;
                  openRow(e, r.id);
                }}
                onAuxClick={(e) => openPageAux(e, r.id, { onNavigate, onOpenInNewTab })}
                // Right-click opens the card's own menu, the same one behind
                // the ⋯. On a board the card IS the object in front of you, and
                // aiming at a small mark in its corner to reach "open" or
                // "trash" is the slow way round.
                onContextMenu={(e) => {
                  e.preventDefault();
                  moveReturn.current = e.currentTarget;
                  const box = e.currentTarget.getBoundingClientRect();
                  setMovePoint({ key: `${key}:${r.id}`, point: e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : { x: box.right, y: box.top } });
                  setMoveMenu(`${key}:${r.id}`);
                }}
              >
                <div className="board-card-top">
                  <div className="board-card-title">
                    {r.icon && <span className="inline-icon"><PageIcon icon={r.icon} size={14} /> </span>}
                    {r.title || t('Untitled')}
                  </div>
                  {/* OUTSIDE the title: it clamps to four lines, and anything
                      inside a clamped box is part of the text flow — the mark
                      landed between the words, wherever they happened to end.
                      One stack in the corner instead, agent at the FRONT: the
                      people are who it belongs to, the agent is who is touching
                      it right now, and right-now belongs on top. */}
                  <div className="card-marks">
                    <AgentDot pageId={r.id} />
                    {/* Who is on this card — one stack of faces, deduped
                        across all person fields (W126). */}
                    <PersonStack
                      values={schema
                        .filter((p) => p.type === 'person' && p.id !== groupBy)
                        .flatMap((p) => {
                          const v = r.props[p.id];
                          return Array.isArray(v) ? v.map(String) : [String(v ?? '')];
                        })}
                    />
                  </div>
                  {/* On a board the CARD is the object you have in front of
                      you, and for a long time the only thing this could do was
                      send it to another column — you could not open it from
                      here and you certainly could not throw it away. Touch
                      devices also cannot HTML5-drag, so the column list has to
                      stay whatever else joins it. */}
                  <CardMenu
                    open={moveMenu === `${key}:${r.id}`}
                    point={movePoint?.key === `${key}:${r.id}` ? movePoint.point : null}
                    returnFocus={movePoint?.key === `${key}:${r.id}` ? moveReturn : undefined}
                    onOpenChange={(o) => {
                      if (o) setMovePoint(null);
                      setMoveMenu(o ? `${key}:${r.id}` : null);
                    }}
                  >
                    <MenuItem fn="open" onClick={() => openRow({}, r.id)}>
                      {t('Open')}
                    </MenuItem>
                    {/* The visible way to a second tab, as in the sidebar's
                        row menu: ⌘-click and middle-click work too, but a
                        menu that stays silent about them leaves most people
                        without a way to ask. */}
                    <MenuItem fn="openInNewTab" onClick={() => (onOpenInNewTab ?? onNavigate)(r.id)}>
                      {t('Open in new tab')}
                    </MenuItem>
                    {columns.some((c) => !rowsFor(c.id).some((x) => x.id === r.id)) && (
                      <MenuValues label={t('Move to')} reason="Columns are values of one function, moveTo: the card moves to the one picked">
                        {columns
                          .filter((c) => !rowsFor(c.id).some((x) => x.id === r.id))
                          .map((c) => (
                            <MenuValueItem key={c.id} onClick={() => onDrop(r.id, groupBy, c.id)}>
                              {c.name}
                            </MenuValueItem>
                          ))}
                      </MenuValues>
                    )}
                    <MenuSeparator />
                    <MenuItem fn="moveToTrash" danger onClick={() => void onTrashRow(r.id, r.title)}>
                      {t('Move to trash')}
                    </MenuItem>
                  </CardMenu>
                </div>
                {!!r.tags?.length && (
                  <div className="db-row-tags card-tags">
                    {r.tags.map((t) => (
                      <span key={t} className={'row-tag ' + tagColorClass(t, tagColors)}>#{t}</span>
                    ))}
                  </div>
                )}
                {!!commentCounts[r.id] && (
                  <div className="card-comments" title={commentCounts[r.id] + t(' open comments')}>
                    <MessageSquare size={11} /> {commentCounts[r.id]}
                  </div>
                )}
                <BoardCardProps
                  schema={schema}
                  row={r}
                  groupBy={groupBy}
                  expanded={openCards.has(r.id)}
                  onToggleExpand={() =>
                    setOpenCards((prev) => {
                      const next = new Set(prev);
                      if (next.has(r.id)) next.delete(r.id);
                      else next.add(r.id);
                      return next;
                    })
                  }
                  onSetProp={onSetProp}
                  onSetOptions={onSetOptions}
                />
              </div>
              </Fragment>
            ))}
            {at === cards.length && placeholder}
          </div>
        </div>
        );
      })}
    </>
  );

  return (
    <div className={'board' + (drag ? ' is-dragging' : '') + (lanes ? ' has-lanes' : '')}>
      {lanes
        ? laneList.map((lane) => {
            const inLane = rows.filter((r) => (rowLanes.get(r.id) ?? []).includes(lane.id));
            const folded = lanes.folded.has(lane.id);
            return (
              <section key={lane.id} className="board-lane" data-lane={lane.id} aria-label={laneName(lane)}>
                <BoardLaneHead
                  name={laneName(lane)}
                  count={inLane.length}
                  folded={folded}
                  onFold={lanes.onFold ? (f) => lanes.onFold!(lane.id, f) : undefined}
                />
                {!folded && <div className="board-lane-cells">{renderColumns(lane.id)}</div>}
              </section>
            );
          })
        : renderColumns(null)}

      {/* The floating card follows the pointer. The last child, with
          position:fixed so it sits above everything; pointer-events:none so it
          does not disturb hit testing underneath. */}
      {drag && drag.title && (
        <div
          className="board-drag-ghost"
          style={{ width: drag.width, left: drag.x - drag.dx, top: drag.y - drag.dy }}
        >
          {drag.title}
        </div>
      )}
    </div>
  );
}
