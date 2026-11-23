import type { PropDef, PropOption } from '../types';
import PropertyValue from './PropertyValue';
import { LeadCheckBox } from './TableCheckColumn';
import { tagColorClass } from '../tags';
import { PageIcon } from '../pageIcon';
import { t } from '../i18n';
import { openPageAux, useOpenRow } from '../pageOpen';

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
}: {
  rows: Row[];
  schema: PropDef[];
  emptyLabel: string;
  tagColors: Record<string, string>;
  onNavigate: (id: string) => void;
  onOpenInNewTab?: (id: string) => void;
  onSetProp: (rowId: string, propId: string, value: unknown) => void;
  onSetOptions: (propId: string, options: PropOption[]) => void;
}) {
  // What a click on a row does follows the view (spec 007, pageOpen.ts).
  const openRow = useOpenRow({ onNavigate, onOpenInNewTab });
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

  return (
    <div
      className="list-view"
      data-check={check ? '' : undefined}
      data-tags={anyTags ? '' : undefined}
      data-props={inline.length}
    >
      {rows.map((r) => (
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
              <LeadCheckBox prop={check} title={r.title} value={r.props?.[check.id]} onChange={(v) => onSetProp(r.id, check.id, v)} />
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
                    onChange={(v) => onSetProp(r.id, p.id, v)}
                    onOptionsChange={(opts) => onSetOptions(p.id, opts)}
                  />
                </span>
              ))}
            </span>
          )}
          </span>
        </div>
      ))}
    </div>
  );
}
