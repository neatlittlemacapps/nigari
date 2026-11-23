import { GripVertical, Plus } from 'lucide-react';
import { Button } from '../ui/Button';
import { t } from '../i18n';

// The leading cell of a table row (spec 022, research R8): a + that adds a
// row below this one, and the handle that drags the row and, on a click, opens
// its menu. Its own narrow cell ahead of every column, so it does not move
// when another column is put first. Shown on hover and on keyboard focus; on a
// phone, once the row is tapped (owner, 2026-11-23). A reader gets an empty
// cell: nothing here is theirs to do.

export function RowGutterHead() {
  return <th className="db-row-gutter" aria-hidden="true" />;
}

export function RowGutter({
  rowId,
  title,
  onAddBelow,
  onHandleDown,
  onHandleClick,
}: {
  rowId: string;
  title: string;
  /** Absent: rows cannot be added here (a reader). */
  onAddBelow?: (rowId: string, above: boolean) => void;
  /** Absent: the row cannot be dragged (a reader, a sub-item in a tree). The
   *  handle still opens the row's menu then. */
  onHandleDown?: (e: React.PointerEvent, rowId: string) => void;
  onHandleClick?: (e: React.MouseEvent, rowId: string) => void;
}) {
  if (!onAddBelow && !onHandleDown && !onHandleClick) return <td className="db-row-gutter" />;
  const name = title || t('Untitled');
  return (
    <td className="db-row-gutter">
      <span className="db-row-gutter-btns">
        {onAddBelow && (
          <Button
            size="sm"
            emphasis="low"
            className="db-row-add"
            icon={<Plus size={14} />}
            label={t('Add a row below (Alt: above)')}
            // Alt or Option adds above instead, as Notion's + does.
            onClick={(e) => onAddBelow(rowId, e.altKey)}
          />
        )}
        {(onHandleDown || onHandleClick) && (
          <Button
            size="sm"
            emphasis="low"
            className={'db-row-handle' + (onHandleDown ? '' : ' is-menu-only')}
            icon={<GripVertical size={14} />}
            label={
              onHandleDown
                ? t('Drag to move {title}, click for its menu', { title: name })
                : t('Menu of {title}', { title: name })
            }
            onPointerDown={onHandleDown ? (e) => onHandleDown(e, rowId) : undefined}
            onClick={(e) => onHandleClick?.(e, rowId)}
          />
        )}
      </span>
    </td>
  );
}
