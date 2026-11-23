import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { api, ApiError } from '../api';
import type { Filter } from '../types';
import type { Row } from '../collectionRow';
import { t } from '../i18n';
import { toast } from '../toast';
import { serverMessage } from '../serverErrors';
import { applySpot, type RowSpot } from '../rowDrag';

// What a table row's handle, + and menu do to the database (spec 022), kept
// out of CollectionView.tsx, which is already too large to grow inline.

export function useTableRowActions({
  collectionId,
  setRows,
  loadRows,
  onPagesChanged,
  rowViewId,
  rowViewFilters,
  announceIfHidden,
  dropSort,
}: {
  collectionId: string;
  setRows: Dispatch<SetStateAction<Row[]>>;
  loadRows: () => Promise<void>;
  onPagesChanged: () => void;
  rowViewId: () => string | undefined;
  rowViewFilters: () => Filter[] | undefined;
  announceIfHidden: (row: { id: string; matchesView?: boolean }) => void;
  /** Takes the view's sort away as the person's own change. */
  dropSort: () => void;
}) {
  const fail = (e: unknown) => toast(e instanceof ApiError ? serverMessage(e.code, e.message) : t('Change not saved'));

  // The row the + just added, its title being typed (US4).
  const [editTitleId, setEditTitleId] = useState<string | null>(null);

  // The + beside a row: the new row goes right below it, or above with Alt or
  // Option, in one request, in the view the person is looking at, as New
  // makes it.
  const addRowNextTo = async (anchor: string, above: boolean) => {
    try {
      const row = await api.createPage(collectionId, '', 'doc', undefined, undefined, rowViewId(), undefined, rowViewFilters(), {
        anchor,
        side: above ? 'before' : 'after',
      });
      onPagesChanged();
      announceIfHidden(row);
      setEditTitleId(row.id);
    } catch (e) {
      fail(e);
    }
  };

  const finishTitle = async (id: string, title: string | null) => {
    setEditTitleId(null);
    if (title === null) return;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, title } : r)));
    try {
      await api.updatePage(id, { title });
      onPagesChanged();
    } catch (e) {
      fail(e);
      void loadRows();
    }
  };

  // Set while a sort just given up is reloading the rows: that load may
  // answer with the order from before the move, so the move reads the rows
  // again once it is saved (code review: the row jumped back on screen).
  const sortDropped = useRef(false);

  // A row moved next to another: shown in its new place at once, then saved;
  // the server names the neighbours, so a filter's hidden rows keep their
  // places. On a refusal the rows are read again.
  const placeRow = async (id: string, spot: RowSpot) => {
    setRows((prev) => applySpot(prev, id, spot));
    const reload = sortDropped.current;
    sortDropped.current = false;
    try {
      await api.placePage(id, spot, rowViewId());
      if (reload) void loadRows();
    } catch (e) {
      fail(e);
      void loadRows();
    }
  };

  // Duplicate in a row's menu: the copy lands right below its row (the
  // server places it, research R3), and the rows are read again.
  const duplicateRow = async (id: string) => {
    try {
      await api.duplicatePage(id);
      onPagesChanged();
    } catch (e) {
      fail(e);
    }
  };

  // The first move of a drag in a sorted view: the rows are drawn in their
  // own order at once, so the line shows where the row will really go, and
  // the sort goes as the person's own change, which the bar can undo.
  const dropSortForDrag = () => {
    sortDropped.current = true;
    setRows((prev) => [...prev].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
    dropSort();
  };

  return { editTitleId, addRowNextTo, finishTitle, placeRow, duplicateRow, dropSortForDrag };
}
