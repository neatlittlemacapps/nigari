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
// The pure part below is checked by web/scripts/check-rowdrag.mjs. The hook
// at the bottom is the gesture, written as columnDrag.ts drags a column:
// pointer events, so mouse, pen and finger take one path, a 5px threshold
// that tells a click on the handle (its menu) from a drag, and a hold before
// a finger drags, so a tap on the handle stays a tap (its menu). The handle
// itself does not scroll the page (touch-action: none, or the browser would
// take the finger before the hold is up); a swipe anywhere else on the row
// does. The grip is 28px wide and shows only on the row tapped last.

import { useCallback, useEffect, useRef, useState } from 'react';
import { scrollParent } from './dragScroll';

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

/** One group of a grouped table (spec 024) as the drag reads it: its key and
 *  its rows as drawn under its header, in order (none while folded). */
export interface DrawnGroup {
  key: string;
  rows: readonly DrawnRow[];
}

/** Which group's box y falls in: the first whose bottom is below y, the last
 *  past them all; -1 without groups. The boxes touch (one tbody after the
 *  other), so every y names exactly one group. */
export function groupAt(boxes: readonly { top: number; bottom: number }[], y: number): number {
  for (let i = 0; i < boxes.length; i++) if (y < boxes[i].bottom) return i;
  return boxes.length - 1;
}

/** The spot gap `gap` names in another group's rows for a top-level row
 *  dragged in from elsewhere. The dragged row may be drawn there too (a row
 *  with several values is in each of its groups): it and its sub-items are
 *  passed over, as the gap after a sibling's sub-items is after the sibling.
 *  Null when the gap is inside another row's sub-items (as rowSpot: the line
 *  there would name a place the row cannot take, code review), or when the
 *  group has no other row. */
export function spotAmong(rows: readonly DrawnRow[], dragId: string, gap: number): RowSpot | null {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const top = (r: DrawnRow) => atLevel(byId, r, null);
  for (let i = Math.max(0, gap); i < rows.length; i++) {
    const t = top(rows[i]);
    if (!t || t.id === dragId) continue;
    // A top-level row below: just before it. A sub-item of another row:
    // the gap is inside that row's tree, no place for this row.
    return t === rows[i] ? { anchor: t.id, side: 'before' } : null;
  }
  for (let i = Math.min(gap, rows.length) - 1; i >= 0; i--) {
    const t = top(rows[i]);
    if (t && t.id !== dragId) return { anchor: t.id, side: 'after' };
  }
  return null;
}

/** Where a drop in a grouped table goes: within the row's own group, a move
 *  as in a flat table (null where it would not move); into another group,
 *  that group and the spot among its rows (spot null: an empty or folded
 *  group, the value alone). Null where nothing would happen. */
export function groupDrop(
  groups: readonly DrawnGroup[],
  dragId: string,
  from: string,
  to: number,
  gap: number,
): { spot: RowSpot | null; group: string } | null {
  const g = groups[to];
  if (!g) return null;
  if (g.key === from) {
    const spot = rowSpot(g.rows, dragId, gap);
    return spot ? { spot, group: g.key } : null;
  }
  const spot = spotAmong(g.rows, dragId, gap);
  // No spot in a group with rows of its own: the gap offers nothing. In a
  // group without (empty, folded, or only the dragged row's copy) the drop
  // writes the value alone.
  const others = g.rows.some((r) => r.id !== dragId && (r.parentId ?? null) === null);
  if (!spot && others) return null;
  return { spot, group: g.key };
}

/** The list with row `id` moved to `spot`, as the table shows it at once
 *  while the server saves the move. An unknown id or anchor changes nothing. */
export function applySpot<T extends { id: string }>(list: readonly T[], id: string, spot: RowSpot): T[] {
  const moving = list.find((r) => r.id === id);
  if (!moving || id === spot.anchor) return [...list];
  const rest = list.filter((r) => r.id !== id);
  const at = rest.findIndex((r) => r.id === spot.anchor);
  if (at < 0) return [...list];
  rest.splice(spot.side === 'after' ? at + 1 : at, 0, moving);
  return rest;
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

// ---- The gesture ----

/** The row being dragged. Where it would land is drawn straight onto the
 *  rows (the `row-drop-before` / `row-drop-after` classes), not kept in React
 *  state: a state change per gap drew the whole table again, 37 ms a step on
 *  300 rows (T021). React hears only the start and the end. */
export interface RowDragState {
  id: string;
}

const DROP_CLASSES = ['row-drop-before', 'row-drop-after', 'row-drop-into'];

/** Puts the drop line on the gap: above row `gap`, or below the last row. A
 *  group with no row drawn (empty, or folded) marks its header instead: the
 *  row goes into it. */
function paintGap(body: HTMLElement, painted: HTMLElement | null, gap: number, show: boolean): HTMLElement | null {
  painted?.classList.remove(...DROP_CLASSES);
  if (!show) return null;
  const trs = body.querySelectorAll<HTMLElement>(':scope > tr[data-row-id]');
  if (trs.length === 0) {
    const head = body.querySelector<HTMLElement>(':scope > tr:not([data-row-id])');
    head?.classList.add('row-drop-into');
    return head;
  }
  const tr = gap < trs.length ? trs[gap] : trs[trs.length - 1];
  tr.classList.add(gap < trs.length ? 'row-drop-before' : 'row-drop-after');
  return tr;
}

const START_THRESHOLD = 5; // px, as the board and the columns
const TOUCH_HOLD_MS = 300; // research R5
const TOUCH_HOLD_SLOP = 10;
// How near the scrolling page's top or bottom the pointer must be to scroll
// it along, so a row can be taken past what is on screen.
const EDGE = 48;
const EDGE_STEP = 14;
const CLICK_AFTER_DRAG_MS = 300;

function rowBoxes(body: HTMLElement) {
  return [...body.querySelectorAll<HTMLElement>(':scope > tr[data-row-id]')].map((tr) => {
    const b = tr.getBoundingClientRect();
    return { top: b.top, bottom: b.bottom };
  });
}

function box(el: HTMLElement) {
  const b = el.getBoundingClientRect();
  return { top: b.top, bottom: b.bottom };
}

/** A grouped table's groups for the drag: what is drawn in each, and
 *  whether a row may go from one group into another (a formula grouping,
 *  or a value no drop can write, refuses: no line is drawn). */
export interface RowDragGroups {
  groups: readonly DrawnGroup[];
  accepts: (id: string, from: string, to: string) => boolean;
}

/** Where a drop lands: the spot (null: into an empty or folded group, the
 *  value alone), and in a grouped table the group it came from and the one
 *  it goes to. */
export interface RowDrop {
  spot: RowSpot | null;
  from?: string;
  to?: string;
}

/** The group bodies of a grouped table, in the order of `groups`, each with
 *  its box and its rows' boxes. A tbody whose key is not a group is left out. */
function readGroups(table: HTMLElement, groups: readonly DrawnGroup[]) {
  const byKey = new Map<string, HTMLElement>();
  for (const b of table.querySelectorAll<HTMLElement>(':scope > tbody[data-group-key]')) byKey.set(b.dataset.groupKey ?? '', b);
  const bodies: HTMLElement[] = [];
  const boxes: { top: number; bottom: number }[] = [];
  const rects: { top: number; bottom: number }[][] = [];
  const at: number[] = [];
  groups.forEach((g, i) => {
    const b = byKey.get(g.key);
    if (!b) return;
    bodies.push(b);
    boxes.push(box(b));
    rects.push(rowBoxes(b));
    at.push(i);
  });
  return { bodies, boxes, rects, at };
}

/** Dragging a table row by its handle. `rows` is the table as drawn, in
 *  order; rows are found by `data-row-id` in the tbody the drag started in.
 *  `onDrop(id, drop)` is called on a release over the table when the spot
 *  moves the row; Escape, or a release anywhere else, cancels. In a grouped
 *  table (`grouped`, spec 024) each group is its own tbody: the drag reads
 *  them all, the pointer picks the group, and a drop into another group says
 *  so (`drop.from`, `drop.to`). `onStart` is
 *  called once the press has become a drag: a sorted view draws its rows in
 *  their own order then (spec 022, US2), and the boxes are read again as soon
 *  as the rows change. */
export function useRowDrag(
  rows: readonly DrawnRow[],
  onDrop: (id: string, drop: RowDrop) => void,
  onStart?: () => void,
  grouped?: RowDragGroups,
) {
  const [drag, setDrag] = useState<RowDragState | null>(null);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const startRef = useRef(onStart);
  startRef.current = onStart;
  const groupedRef = useRef(grouped);
  groupedRef.current = grouped;
  const live = useRef<{
    id: string;
    startX: number;
    startY: number;
    started: boolean;
    touch: boolean;
    armed: boolean;
    holdTimer: number | null;
    body: HTMLElement;
    /** In a grouped table: the group the row was taken from, the table, and
     *  each group's body, box and row boxes, read with `rects`. */
    from: string | null;
    table: HTMLElement | null;
    groups: ReturnType<typeof readGroups> | null;
    // Row boxes are read once, when the drag starts, and moved by the scroll
    // since: reading every row's box on each pointer move is layout work per
    // pixel (the #810 lesson).
    rects: { top: number; bottom: number }[];
    scroller: HTMLElement | null;
    scrollTop0: number;
    drop: RowDrop | null;
    /** The rows the boxes were read for. */
    rowsAt: readonly DrawnRow[];
    /** The gap the line is on ("group:gap" in a grouped table), and the row
     *  carrying it. */
    gap: string;
    painted: HTMLElement | null;
    /** Started, and waiting for the rows to be drawn again (onStart). */
    waiting: boolean;
  } | null>(null);
  const draggedAt = useRef({ id: '', at: 0 });

  const cancel = useCallback(() => {
    const l = live.current;
    if (l?.holdTimer) clearTimeout(l.holdTimer);
    l?.painted?.classList.remove(...DROP_CLASSES);
    live.current = null;
    document.body.classList.remove('is-row-moving');
    setDrag(null);
  }, []);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const l = live.current;
      if (!l) return;
      const moved = Math.hypot(e.clientX - l.startX, e.clientY - l.startY);
      if (!l.started) {
        if (l.touch && !l.armed) {
          if (moved > TOUCH_HOLD_SLOP) cancel();
          return;
        }
        if (moved < START_THRESHOLD) return;
        l.started = true;
        document.body.classList.add('is-row-moving');
        window.getSelection()?.removeAllRanges();
        setDrag({ id: l.id });
        if (startRef.current) {
          // The rows are about to be drawn in another order: no spot until
          // they are, or a quick flick would drop the row by its neighbour
          // in the old order (code review).
          startRef.current();
          l.waiting = true;
          return;
        }
      }
      if (l.waiting && rowsRef.current === l.rowsAt) return;
      l.waiting = false;
      if (rowsRef.current !== l.rowsAt) {
        // The rows were drawn again (a sorted view gave way to its own
        // order, a row arrived): their boxes moved with them, and the line
        // may sit on a row that moved.
        l.rowsAt = rowsRef.current;
        l.rects = rowBoxes(l.body);
        if (l.table && groupedRef.current) l.groups = readGroups(l.table, groupedRef.current.groups);
        l.scrollTop0 = l.scroller?.scrollTop ?? 0;
        l.gap = '';
      }
      if (l.scroller) {
        const r = l.scroller.getBoundingClientRect();
        if (e.clientY - r.top < EDGE) l.scroller.scrollTop -= EDGE_STEP;
        else if (r.bottom - e.clientY < EDGE) l.scroller.scrollTop += EDGE_STEP;
      }
      const shift = l.scroller ? l.scroller.scrollTop - l.scrollTop0 : 0;
      const y = e.clientY + shift;
      const g = groupedRef.current;
      if (l.groups && g && l.from !== null) {
        const gi = groupAt(l.groups.boxes, y);
        if (gi < 0) return;
        const gap = rowGap(l.groups.rects[gi], y);
        const key = gi + ':' + gap;
        if (key === l.gap) return;
        const d = groupDrop(g.groups, l.id, l.from, l.groups.at[gi], gap);
        const ok = !!d && (d.group === l.from || g.accepts(l.id, l.from, d.group));
        l.drop = ok && d ? { spot: d.spot, from: l.from, to: d.group } : null;
        l.gap = key;
        l.painted = paintGap(l.groups.bodies[gi], l.painted, gap, ok);
        return;
      }
      const gap = rowGap(l.rects, y);
      if (String(gap) === l.gap) return;
      const spot = rowSpot(rowsRef.current, l.id, gap);
      l.drop = spot ? { spot } : null;
      l.gap = String(gap);
      l.painted = paintGap(l.body, l.painted, gap, !!spot);
    };

    const onPointerUp = (e: PointerEvent) => {
      const l = live.current;
      if (!l) return;
      cancel();
      if (!l.started) return;
      draggedAt.current = { id: l.id, at: Date.now() };
      const r = (l.table ?? l.body).getBoundingClientRect();
      const over = e.clientY >= r.top - EDGE && e.clientY <= r.bottom + EDGE && e.clientX >= r.left && e.clientX <= r.right;
      if (e.type === 'pointerup' && over && l.drop) dropRef.current(l.id, l.drop);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && live.current) {
        e.preventDefault();
        e.stopPropagation();
        if (live.current.started) draggedAt.current = { id: live.current.id, at: Date.now() };
        cancel();
      }
    };

    // Once a drag runs, a finger must not scroll the page along with it
    // (boardDrag.ts explains why this needs a non-passive listener).
    const onTouchMove = (e: TouchEvent) => {
      if (live.current?.started) e.preventDefault();
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [cancel]);

  const startDrag = useCallback((e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    const body = (e.currentTarget as HTMLElement).closest('tbody');
    if (!body) return;
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    const scroller = scrollParent(body);
    const g = groupedRef.current;
    const from = g && body.dataset.groupKey !== undefined ? body.dataset.groupKey : null;
    const table = from !== null ? body.closest('table') : null;
    const l = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      started: false,
      touch,
      armed: !touch,
      holdTimer: null as number | null,
      body,
      from,
      table,
      groups: table && g ? readGroups(table, g.groups) : null,
      rects: rowBoxes(body),
      scroller,
      scrollTop0: scroller?.scrollTop ?? 0,
      drop: null as RowDrop | null,
      rowsAt: rowsRef.current,
      gap: '',
      painted: null as HTMLElement | null,
      waiting: false,
    };
    live.current = l;
    if (touch) {
      l.holdTimer = window.setTimeout(() => {
        if (live.current === l) l.armed = true;
      }, TOUCH_HOLD_MS);
    }
  }, []);

  /** True once for the click on row `id`'s handle that ends its drag, so it
   *  does not open the menu. */
  const consumeClick = useCallback((id: string) => {
    const d = draggedAt.current;
    draggedAt.current = { id: '', at: 0 };
    return d.id === id && Date.now() - d.at < CLICK_AFTER_DRAG_MS;
  }, []);

  return { drag, startDrag, consumeClick };
}
