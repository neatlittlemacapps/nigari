import { SquareCheck } from 'lucide-react';
import { t } from '../i18n';
import type { PropDef } from '../types';
import { Checkbox } from '../ui/Checkbox';
import { ColHead, type ColumnMoves, type PropertyChanges } from './TableColumnHead';

// The table's leading checkbox column (tableLead.ts, owner 2026-11-22): as
// wide as its box, before Name, so rows are ticked off down the side of the
// table. Its heading keeps the column's menu (rename, edit, hide in view…)
// with the box's icon in place of the name, which stays its tooltip.

export function LeadCheckHead({ prop, onHide, changes }: { prop: PropDef; onHide?: () => void; changes?: PropertyChanges }) {
  // It does not move among the other columns (it is drawn first whatever its
  // stored place), so of the column moves only Hide in view is offered.
  const moves: ColumnMoves | undefined = onHide ? { onStartDrag: () => {}, consumeClick: () => false, onHide } : undefined;
  return (
    <th className="db-check-col">
      <ColHead label={prop.name} icon={<SquareCheck size={14} />} onReset={() => {}} moves={moves} changes={changes} />
    </th>
  );
}

/** A box someone ticks. Its name says which row, for a screen reader. */
export function LeadCheckBox({
  prop,
  title,
  value,
  onChange,
  className,
}: {
  prop: PropDef;
  title: string;
  value: unknown;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <Checkbox
      className={'lead-check' + (className ? ' ' + className : '')}
      label={`${prop.name}: ${title || t('Untitled')}`}
      checked={value === true}
      onCheckedChange={onChange}
    />
  );
}

/** The foot: how many rows are ticked. */
export function LeadCheckFoot({ prop, rows }: { prop: PropDef; rows: { props: Record<string, unknown> }[] }) {
  return (
    <td className="db-check-col db-calc-cell" title={prop.name}>
      {rows.filter((r) => r.props[prop.id] === true).length}
    </td>
  );
}
