import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { api, ApiError } from '../api';
import type { Filter } from '../types';
import type { Row } from '../collectionRow';
import { t } from '../i18n';
import { toastError } from '../toast';
import { serverMessage } from '../serverErrors';
import { applySpot, type RowSpot } from '../rowDrag';

/** A row title being typed, and in a grouped table the group of the copy
 *  that edits (absent: the row's first copy). */
export type EditTitle = { id: string; group?: string };

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
  onMade,
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
  /** A row the + or Duplicate just made: a document's table draws it even
   *  past its first rows (spec 023). */
  onMade?: (id: string) => void;
}) {
  const fail = (e: unknown) => toastError(e instanceof ApiError ? serverMessage(e.code, e.message) : t('Change not saved'));

  // The row whose title is being typed: the one the + just added (spec 022,
  // US4), or the one whose name was clicked (spec 026). A grouped table draws
  // a row once per group it falls in, so a click names its group and only
  // that copy turns into a field: two autofocused fields would fight (plan
  // D3). The + names none, and the row's first copy edits.
  const [editTitle, setEditTitle] = useState<EditTitle | null>(null);

  // The + beside a row: the new row goes right below it, or above with Alt or
  // Option, in one request, in the view the person is looking at, as New
  // makes it.
  const addRowNextTo = async (anchor: string, above: boolean) => {
    try {
      const row = await api.createPage(collectionId, '', 'doc', undefined, undefined, rowViewId(), undefined, rowViewFilters(), {
        anchor,
        side: above ? 'before' : 'after',
      });
      onMade?.(row.id);
      onPagesChanged();
      announceIfHidden(row);
      setEditTitle({ id: row.id });
    } catch (e) {
      fail(e);
    }
  };

  const startEditTitle = (id: string, group?: string) => setEditTitle({ id, group });

  const finishTitle = async (id: string, title: string | null) => {
    setEditTitle(null);
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
  // propsPatch: a row dropped into another group of a grouped table takes
  // that group's values in the same request (spec 024, research R4).
  const placeRow = async (id: string, spot: RowSpot, propsPatch?: Record<string, unknown>) => {
    setRows((prev) => {
      const moved = applySpot(prev, id, spot);
      return propsPatch ? moved.map((r) => (r.id === id ? { ...r, props: { ...r.props, ...propsPatch } } : r)) : moved;
    });
    const reload = sortDropped.current;
    sortDropped.current = false;
    try {
      await api.placePage(id, spot, rowViewId(), propsPatch);
      if (reload) void loadRows();
    } catch (e) {
      fail(e);
      void loadRows();
    }
  };

  // A row dropped into an empty or folded group (spec 024): no row to place
  // it by, so the value alone. A refusal reads the rows again, as a refused
  // move does (code review: the row stayed drawn in the group it never
  // joined).
  const patchRow = async (id: string, propsPatch: Record<string, unknown>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, props: { ...r.props, ...propsPatch } } : r)));
    const reload = sortDropped.current;
    sortDropped.current = false;
    try {
      await api.updatePage(id, { propsPatch });
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
      const copy = await api.duplicatePage(id);
      onMade?.(copy.id);
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

  return { editTitle, startEditTitle, addRowNextTo, finishTitle, placeRow, patchRow, duplicateRow, dropSortForDrag };
}
