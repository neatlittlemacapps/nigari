import { Fragment } from 'react';
import type { PropDef, PropOption } from '../types';
import PropertyValue from './PropertyValue';
import { LeadCheckBox } from './TableCheckColumn';
import { tagColorClass } from '../tags';
import { PageIcon } from '../pageIcon';
import { t } from '../i18n';
import { openPageAux, useOpenRow } from '../pageOpen';
import { groupRows, type GroupProp } from '../rowGroups';
import RowGroupHeader, { useGroupLabel, type RowGrouping } from './RowGroupHeader';

interface Row {
  id: string;
  title: string;
  icon: string;
  props: Record<string, unknown>;
  tags?: string[];
}

// A list view is deliberately NOT a narrow table: no header row, and on a
// wide screen no column grid. The title leads and the properties trail
// quietly behind it. This is the calm view for notes — anyone who wants to
// compare values or read down a column takes the table instead.
//
// On a phone a row stays one line and the whole list scrolls sideways
// together, like the table (owner, 2026-11-23, #906): until then the
// properties wrapped onto a second line under the title. The rows share one
// grid there (styles.css, "List view"), so every row must put the same cells
// in the same order — hence the empty tags cell and one wrapper per property.
export default function ListView({
  rows,
  schema,
  emptyLabel,
  tagColors,
  onNavigate,
  onOpenInNewTab,
  onSetProp,
  onSetOptions,
  grouping,
}: {
  rows: Row[];
  schema: PropDef[];
  emptyLabel: string;
  tagColors: Record<string, string>;
  onNavigate: (id: string) => void;
  onOpenInNewTab?: (id: string) => void;
  /** Absent for someone who may only read the rows: every cell then draws
   *  its read-only face (#1118). */
  onSetProp?: (rowId: string, propId: string, value: unknown) => void;
  onSetOptions: (propId: string, options: PropOption[]) => void;
  /** Grouped by a property (spec 024, T027): a header before each group's
   *  rows, as in a table, without totals. A chart's list of its rows stays
   *  flat (it passes none). */
  grouping?: RowGrouping;
}) {
  // What a click on a row does follows the view (spec 007, pageOpen.ts).
  const openRow = useOpenRow({ onNavigate, onOpenInNewTab });
  const labelOf = useGroupLabel(grouping?.prop, grouping?.settings.period);
  if (rows.length === 0) {
    return <div className="db-empty">{emptyLabel}</div>;
  }
  // A checkbox is something you tick, not something you read (as on a board
  // card, #74): the first one the view shows leads each row, big enough for
  // a thumb, instead of trailing among the properties (owner, 2026-11-22).
  const check = schema.find((p) => p.type === 'checkbox');
  // A list lives on restraint: only the first few properties accompany the
  // title, or the row turns back into a table.
  const inline = schema.filter((p) => p !== check).slice(0, 3);
  // Some rows have tags: every row keeps a (possibly empty) tags cell, so the
  // properties after it line up in the phone grid.
  const anyTags = rows.some((r) => (r.tags?.length ?? 0) > 0);

  const renderRow = (r: Row) => (
        <div
          key={r.id}
          className="list-row"
          onClick={(e) => openRow(e, r.id)}
          onAuxClick={(e) => openPageAux(e, r.id, { onNavigate, onOpenInNewTab })}
        >
          {check && (
            // The cell around the box takes the tap, so a near miss ticks
            // instead of opening the row.
            <span className="list-row-check" onClick={(e) => e.stopPropagation()} onAuxClick={(e) => e.stopPropagation()}>
              <LeadCheckBox prop={check} title={r.title} value={r.props?.[check.id]} onChange={onSetProp ? (v) => onSetProp(r.id, check.id, v) : undefined} />
            </span>
          )}
          <span className="list-row-body">
          <span className="list-row-icon">
            <PageIcon icon={r.icon} size={17} fallback="📄" />
          </span>
          <span className="list-row-title">{r.title || t('Untitled')}</span>
          {anyTags && (
            <span className="list-row-tags">
              {(r.tags ?? []).map((t) => (
                <span key={t} className={'tag-chip ' + tagColorClass(t, tagColors)}>
                  #{t}
                </span>
              ))}
            </span>
          )}
          {inline.length > 0 && (
            // The cells stay editable (same select popover as everywhere else),
            // so the click must not fall through to the row.
            <span className="list-row-props" onClick={(e) => e.stopPropagation()}>
              {inline.map((p) => (
                // A compact empty value renders nothing; the wrapper keeps
                // its cell in the phone grid anyway.
                <span key={p.id} className="list-row-prop">
                  <PropertyValue
                    def={p}
                    value={r.props?.[p.id]}
                    compact
                    onChange={onSetProp ? (v) => onSetProp(r.id, p.id, v) : undefined}
                    onOptionsChange={(opts) => onSetOptions(p.id, opts)}
                  />
                </span>
              ))}
            </span>
          )}
          </span>
        </div>
  );

  // The headers sit among the rows, each before its group's, never around
  // them: on a phone the rows are subgrids of the list's one grid, and a
  // wrapper would cut them off from it.
  const groups = grouping ? groupRows(rows, (r) => r.props?.[grouping.prop.id], grouping.prop as GroupProp, grouping.settings) : [];

  return (
    <div
      className="list-view"
      data-check={check ? '' : undefined}
      data-tags={anyTags ? '' : undefined}
      data-props={inline.length}
      data-grouped={grouping ? '' : undefined}
    >
      {grouping
        ? groups.map((g) => {
            const folded = grouping.folded.has(g.key);
            return (
              <Fragment key={g.key}>
                <RowGroupHeader
                  list
                  leadCheck={!!check}
                  label={labelOf(g.key)}
                  count={g.rows.length}
                  folded={folded}
                  onFold={grouping.onFold && ((f) => grouping.onFold!([g.key], f))}
                  actions={{
                    hideGroup: grouping.onHide && (() => grouping.onHide!(g.key)),
                    collapseAll: grouping.onFoldAll && (() => grouping.onFoldAll!(true)),
                    expandAll: grouping.onFoldAll && (() => grouping.onFoldAll!(false)),
                  }}
                />
                {/* A row with several values is in each of its groups: the
                    key keeps the copies apart. */}
                {!folded && g.rows.map((r) => <Fragment key={r.id}>{renderRow(r)}</Fragment>)}
              </Fragment>
            );
          })
        : rows.map(renderRow)}
      {/* Rows, but every group they fall in is hidden: say so, rather than
          draw an empty list (as the table does). */}
      {grouping && groups.length === 0 && <div className="db-empty">{t('Every group is hidden. Show one from the Group menu.')}</div>}
    </div>
  );
}
