// Where a dragged table row lands (spec 022, research R1 and R5).
//
// A row's place is its page's position, one order per database (owner, Q1).
// The browser never computes a position: next to a filter's hidden rows it
// cannot know which rows are neighbours in the database. It sends the move as
// an anchor instead, "after this row" or "before that one", and the server
// (placePage, POST /api/pages/{id}/place) finds the neighbour on the other
// side. So all this module decides is which gap the pointer is in and which
// visible row that gap names.
//
// The pure part below is checked by web/scripts/check-rowdrag.mjs.

/** A row as the table draws it: its page id, its parent (the database for a
 *  top-level row, another row for a sub-item in a tree) and its depth. */
export interface DrawnRow {
  id: string;
  parentId: string | null;
  depth?: number;
}

/** Where a row goes, as the server takes it. */
export interface RowSpot {
  anchor: string;
  side: 'after' | 'before';
}

/** Which gap between the rows is nearest to y: 0 is above the first row, n
 *  below the last. One gap per boundary, decided at each row's middle, so the
 *  line cannot flicker between two spots for the same pointer (the #809
 *  lesson). */
export function rowGap(rowRects: readonly { top: number; bottom: number }[], y: number): number {
  let gap = 0;
  for (const r of rowRects) if (y >= (r.top + r.bottom) / 2) gap++;
  return gap;
}

/** The y of the line for a gap: the top of the first row, else the bottom of
 *  the row above the gap. */
export function gapLineY(rowRects: readonly { top: number; bottom: number }[], gap: number): number | null {
  if (rowRects.length === 0) return null;
  if (gap <= 0) return rowRects[0].top;
  return rowRects[Math.min(gap, rowRects.length) - 1].bottom;
}

/** The sibling of `dragId`'s level that `row` sits under (or is), walking up
 *  the drawn tree; null when `row` is outside that parent. */
function atLevel(byId: Map<string, DrawnRow>, row: DrawnRow | undefined, parent: string | null): DrawnRow | null {
  let r = row;
  const seen = new Set<string>();
  while (r && !seen.has(r.id)) {
    if ((r.parentId ?? null) === parent) return r;
    seen.add(r.id);
    r = r.parentId ? byId.get(r.parentId) : undefined;
  }
  return null;
}

/** The spot gap `gap` names for the dragged row, or null when a drop there
 *  does nothing: the row would stay where it is, or the gap is not among its
 *  siblings. In a tree a row moves only among the rows of its own parent, at
 *  its own depth (R5); a move to another parent is "Move to", not a drag. */
export function rowSpot(rows: readonly DrawnRow[], dragId: string, gap: number): RowSpot | null {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const dragged = byId.get(dragId);
  if (!dragged) return null;
  const parent = dragged.parentId ?? null;
  const above = gap > 0 ? rows[gap - 1] : undefined;
  const below = gap < rows.length ? rows[gap] : undefined;

  let spot: RowSpot | null = null;
  if (below && (below.parentId ?? null) === parent) {
    // The row below is a sibling: just before it.
    spot = { anchor: below.id, side: 'before' };
  } else {
    // The row above, or the sibling it hangs under (the gap after a
    // sibling's last sub-item is after that sibling).
    const a = atLevel(byId, above, parent);
    // Only at the end of this parent's rows: when the row below still hangs
    // under a sibling, the gap is among that sibling's sub-items, a deeper
    // level, and offers nothing.
    if (a && !(below && atLevel(byId, below, parent))) {
      spot = { anchor: a.id, side: 'after' };
    }
  }
  if (!spot || spot.anchor === dragId) return null;

  // Where it is already: just after the sibling before it, or just before
  // the sibling after it.
  const siblings = rows.filter((r) => (r.parentId ?? null) === parent).map((r) => r.id);
  const i = siblings.indexOf(dragId);
  if (spot.side === 'before' && siblings[i + 1] === spot.anchor) return null;
  if (spot.side === 'after' && siblings[i - 1] === spot.anchor) return null;
  return spot;
}

/** The spot one place up (delta -1) or down (+1) among the row's siblings,
 *  for the keyboard (mod+shift+↑/↓, R7); null at either end. */
export function rowStep(rows: readonly DrawnRow[], id: string, delta: -1 | 1): RowSpot | null {
  const row = rows.find((r) => r.id === id);
  if (!row) return null;
  const parent = row.parentId ?? null;
  const siblings = rows.filter((r) => (r.parentId ?? null) === parent).map((r) => r.id);
  const i = siblings.indexOf(id);
  const next = siblings[i + delta];
  if (!next) return null;
  return delta < 0 ? { anchor: next, side: 'before' } : { anchor: next, side: 'after' };
}
