import type { RefObject } from 'react';
import { useShortcut } from '../keys';
import { t } from '../i18n';
import type { DrawnRow } from '../rowDrag';

// The table's row shortcuts (spec 022, US5, research R7), for the row that
// holds the focus in this table: mod+/ opens its menu, mod+shift+↑/↓ moves it
// one place. A row "holds the focus" when anything in it is focused: its
// title, a cell, its handle. Typing in a cell keeps the keys for the field.

/** The row of `body` that holds the focus, if any. */
function focusedRowIn(body: HTMLElement | null): HTMLTableRowElement | null {
  const el = document.activeElement;
  if (!body || !el || !body.contains(el)) return null;
  return el.closest<HTMLTableRowElement>('tr[data-row-id]');
}

export function useRowKeys({
  body,
  rows,
  onMenu,
  onMove,
}: {
  body: RefObject<HTMLElement | null>;
  rows: readonly DrawnRow[];
  /** Opens the row's menu; `from` gets the focus back when it closes. */
  onMenu: (id: string, tr: HTMLTableRowElement, from: HTMLElement | null) => void;
  /** One place up (-1) or down (1); false when it cannot go further.
   *  Absent: rows do not move here (a reader). */
  onMove?: (id: string, dir: -1 | 1) => boolean | void;
}) {
  const focused = () => focusedRowIn(body.current);
  // This table answers when the focus is in one of its rows, or in no table
  // at all (the shortcut sheet, which has the focus while it lists them).
  // With focus in another table's row, that table answers: two tables on
  // one page each register these keys (code review).
  const mine = () => {
    if (!body.current) return false;
    const el = document.activeElement;
    return body.current.contains(el) || !el?.closest('.db-table tbody');
  };
  useShortcut({
    id: 'row.menu',
    keys: ['mod+/'],
    scope: 'view',
    when: mine,
    label: () => t('Open the row’s menu'),
    group: () => t('Table'),
    run: () => {
      const tr = focused();
      const id = tr?.dataset.rowId;
      if (!tr || !id) return false;
      onMenu(id, tr, document.activeElement as HTMLElement | null);
    },
  });
  // Only a top-level row moves, as with the handle: a sub-item's place is
  // the order of its parent's relation.
  const step = (dir: -1 | 1) => {
    const id = focused()?.dataset.rowId;
    const row = id ? rows.find((r) => r.id === id) : undefined;
    if (!onMove || !row || (row.depth ?? 0) > 0) return false;
    if (onMove(row.id, dir) === false) return false;
  };
  const movable = () => !!onMove && mine();
  useShortcut({
    id: 'row.moveUp',
    keys: ['mod+shift+arrowup'],
    scope: 'view',
    when: movable,
    label: () => t('Move the row up'),
    group: () => t('Table'),
    run: () => step(-1),
  });
  useShortcut({
    id: 'row.moveDown',
    keys: ['mod+shift+arrowdown'],
    scope: 'view',
    when: movable,
    label: () => t('Move the row down'),
    group: () => t('Table'),
    run: () => step(1),
  });
}
