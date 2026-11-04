import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { t } from '../i18n';
import { Button } from '../ui/Button';
import { Menu, MenuItem, MenuSeparator, type MenuPoint } from '../ui/Menu';

// A table column's heading (spec 012, US2): the label, the grip on its right
// edge that resizes the column, and, for a property column someone may edit,
// a menu and a drag that move it within this view.
//
// The grip hangs off an inner BLOCK, not off the <th> itself. In a table with
// border-collapse: collapse the cell does not act as a containing block a
// browser will hit-test against: the handle painted in exactly the right place,
// the pointer went to the <th> underneath, and dragging did nothing at all
// while looking entirely correct.
//
// The menu is opened by the label's click and by a right-click, never by a
// press: Base UI's own menu trigger opens on mousedown, which would open the
// menu at the start of every drag. So the menu is controlled, anchored under
// the label, and the label says it has one (aria-haspopup).

export interface ColumnMoves {
  /** Pointerdown on the label: may become a drag (useColumnDrag). */
  onStartDrag: (e: ReactPointerEvent) => void;
  /** True for the click that ends a drag; that click opens nothing. */
  consumeClick: () => boolean;
  onMoveLeft?: () => void; // left out for the first column
  onMoveRight?: () => void; // left out for the last column
  onHide: () => void;
}

export function ColHead({
  label,
  onResize,
  onReset,
  moves,
}: {
  label: string;
  /** Absent: no grip, the width cannot be changed (a reader, or the views
   *  are locked, spec 013). */
  onResize?: (e: ReactPointerEvent<HTMLSpanElement>) => void;
  onReset: () => void;
  /** Absent for the title column and for a reader who cannot edit: then the
   *  heading is a label and a grip, as before. */
  moves?: ColumnMoves;
}) {
  const labelRef = useRef<HTMLButtonElement>(null);
  const [menuAt, setMenuAt] = useState<MenuPoint | null>(null);

  const grip = onResize && (
    <span
      className="col-resize"
      title={t('Drag to resize, double-click to fit the content')}
      onPointerDown={onResize}
      onDoubleClick={onReset}
    />
  );
  if (!moves) {
    return (
      <span className="th-inner">
        {label}
        {grip}
      </span>
    );
  }

  const openUnderLabel = () => {
    const r = labelRef.current?.getBoundingClientRect();
    if (r) setMenuAt({ x: r.left, y: r.bottom });
  };

  return (
    <span className="th-inner">
      <Button
        ref={labelRef}
        variant="ghost"
        size="sm"
        className="th-label"
        aria-haspopup="menu"
        aria-expanded={menuAt ? true : undefined}
        onPointerDown={moves.onStartDrag}
        onClick={() => {
          if (moves.consumeClick()) return;
          openUnderLabel();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          // A long press on a phone fires contextmenu too, while the same
          // press is arming a drag: the two fought. A tap opens the menu there.
          if ((e.nativeEvent as PointerEvent).pointerType === 'touch') return;
          moves.consumeClick();
          setMenuAt({ x: e.clientX, y: e.clientY });
        }}
      >
        {label}
      </Button>
      {grip}
      <Menu
        label={t('{name} column', { name: label })}
        open={!!menuAt}
        onOpenChange={(o) => !o && setMenuAt(null)}
        anchorPoint={menuAt}
        returnFocus={labelRef}
      >
        {moves.onMoveLeft && (
          <MenuItem fn="moveLeft" onClick={moves.onMoveLeft}>
            {t('Move left')}
          </MenuItem>
        )}
        {moves.onMoveRight && (
          <MenuItem fn="moveRight" onClick={moves.onMoveRight}>
            {t('Move right')}
          </MenuItem>
        )}
        {(moves.onMoveLeft || moves.onMoveRight) && <MenuSeparator />}
        <MenuItem fn="hideInView" onClick={moves.onHide}>
          {t('Hide in view')}
        </MenuItem>
      </Menu>
    </span>
  );
}
