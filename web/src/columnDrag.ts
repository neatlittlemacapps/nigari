import { useCallback, useEffect, useRef, useState } from 'react';

// A table view's column order (spec 012, research R2 and R5).
//
// The order lives on the view as colOrder, a list of property ids, beside
// colWidths. It moves the column in that view only: the schema's order, which
// the Properties dialog sets, is what a view starts from and what every other
// view keeps. The title column is not a property and is never in the list; it
// always comes first.
//
// The pure part below decides what is drawn and where a column goes, and is
// checked by web/scripts/check-columndrag.mjs. The hook at the bottom is the
// gesture, written the way boardDrag.ts drags cards: pointer events, so mouse,
// pen and finger take one path, and a 5px threshold that tells a click (open
// the header's menu) from a drag (move the column).

/** The ids a view draws, in order: those of colOrder that still exist and are
 *  not hidden, in that order, then every other visible property in schema
 *  order. A property added after the order was set lands at the end, as it
 *  does without an order; a deleted one is skipped, not an error. */
export function orderedColumns(
  schemaIds: readonly string[],
  colOrder: readonly string[] | undefined,
  hidden: ReadonlySet<string> | readonly string[] = [],
): string[] {
  const hide = hidden instanceof Set ? hidden : new Set(hidden as readonly string[]);
  return fullOrder(schemaIds, colOrder).filter((id) => !hide.has(id));
}

/** Every property id in the view's order, hidden ones included: the stored
 *  order first (existing ids only, each once), then the rest in schema order. */
export function fullOrder(schemaIds: readonly string[], colOrder: readonly string[] | undefined): string[] {
  const exists = new Set(schemaIds);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of colOrder ?? []) {
    if (exists.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of schemaIds) if (!seen.has(id)) out.push(id);
  return out;
}

/** The colOrder to store after the visible columns were rearranged into
 *  `visible`. The visible ids fill the slots visible ids held in the full
 *  order, so a hidden property keeps its place and comes back there when it
 *  is shown again. */
export function storedOrder(
  schemaIds: readonly string[],
  colOrder: readonly string[] | undefined,
  visible: readonly string[],
): string[] {
  const shown = new Set(visible);
  const queue = [...visible];
  return fullOrder(schemaIds, colOrder).map((id) => (shown.has(id) ? queue.shift()! : id));
}

/** Which gap between the property headers is nearest to x: 0 is before the
 *  first property (just after the title), n after the last. A gap at a
 *  header's middle or beyond goes to the right of it. */
export function gapIndex(headerRects: readonly { left: number; right: number }[], x: number): number {
  let gap = 0;
  for (const r of headerRects) if (x >= (r.left + r.right) / 2) gap++;
  return gap;
}

/** The order with `id` put into gap `gap` of the order it is in now. A gap on
 *  either side of the column itself changes nothing. */
export function moveToGap(order: readonly string[], id: string, gap: number): string[] {
  const from = order.indexOf(id);
  if (from < 0) return [...order];
  const to = Math.max(0, Math.min(order.length, gap));
  const rest = order.filter((x) => x !== id);
  rest.splice(to > from ? to - 1 : to, 0, id);
  return rest;
}

/** The order with `id` moved by `delta` places, held at both ends: Move left
 *  and Move right in the header's menu. */
export function moveColumn(order: readonly string[], id: string, delta: number): string[] {
  const from = order.indexOf(id);
  if (from < 0) return [...order];
  const to = Math.max(0, Math.min(order.length - 1, from + delta));
  const rest = order.filter((x) => x !== id);
  rest.splice(to, 0, id);
  return rest;
}

// ---- The gesture ----

export interface ColumnDragState {
  id: string;
  /** The gap the marker sits on, in the order of the visible columns. */
  gap: number;
}

const START_THRESHOLD = 5; // px before a press on a header becomes a drag, as on the board
// A finger holds before it drags, as on the board: a header row is where a
// table is swiped sideways, and five pixels are crossed at once while
// scrolling.
const TOUCH_HOLD_MS = 320;
const TOUCH_HOLD_SLOP = 10;
// How near the scrolling table's side the pointer must be to scroll it along.
const EDGE = 40;
const EDGE_STEP = 12;
// How soon after a drag's release its click arrives (the same task, in
// practice a few milliseconds); a click later than this is a click of its own.
const CLICK_AFTER_DRAG_MS = 300;

/** Dragging a property column's header. `onDrop(id, gap)` is called on a
 *  release inside the header row; Escape, or a release anywhere else,
 *  cancels. Headers are found by `data-col-id` inside the row the drag
 *  started in, so the caller only marks them. */
export function useColumnDrag(onDrop: (id: string, gap: number) => void) {
  const [drag, setDrag] = useState<ColumnDragState | null>(null);
  // The latest callback, read on release: the table re-renders on every
  // pointer move, and rebinding the window listeners each time is waste.
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  const live = useRef<{
    id: string;
    startX: number;
    startY: number;
    started: boolean;
    touch: boolean;
    armed: boolean;
    holdTimer: number | null;
    row: HTMLElement;
    scroller: HTMLElement | null;
    gap: number;
  } | null>(null);
  // A drag ends in a click on the label; this tells that click not to open
  // the menu. A time, not a flag: a drag released elsewhere, or cancelled with
  // Escape, is followed by no click, and a flag left set swallowed the next
  // Enter on the header, which then opened nothing.
  const draggedAt = useRef({ id: '', at: 0 });

  const cancel = useCallback(() => {
    const l = live.current;
    if (l?.holdTimer) clearTimeout(l.holdTimer);
    live.current = null;
    document.body.classList.remove('is-col-moving');
    setDrag(null);
  }, []);

  useEffect(() => {
    const headerRects = (row: HTMLElement) =>
      [...row.querySelectorAll<HTMLElement>('[data-col-id]')].map((el) => el.getBoundingClientRect());

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
        document.body.classList.add('is-col-moving');
        // What the pixels before the threshold selected would otherwise make
        // the next press start the browser's own drag (boardDrag.ts).
        window.getSelection()?.removeAllRanges();
      }
      // Scroll along at the table's sides, so a column can be taken past the
      // part of a wide table that is on screen.
      if (l.scroller) {
        const r = l.scroller.getBoundingClientRect();
        if (e.clientX - r.left < EDGE) l.scroller.scrollLeft -= EDGE_STEP;
        else if (r.right - e.clientX < EDGE) l.scroller.scrollLeft += EDGE_STEP;
      }
      l.gap = gapIndex(headerRects(l.row), e.clientX);
      setDrag({ id: l.id, gap: l.gap });
    };

    const onPointerUp = (e: PointerEvent) => {
      const l = live.current;
      if (!l) return;
      cancel();
      if (!l.started) return;
      draggedAt.current = { id: l.id, at: Date.now() };
      const r = l.row.getBoundingClientRect();
      const inRow = e.clientY >= r.top && e.clientY <= r.bottom && e.clientX >= r.left && e.clientX <= r.right;
      if (e.type === 'pointerup' && inRow) dropRef.current(l.id, l.gap);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && live.current) {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    };

    // Once a drag runs, a finger must not scroll the page along with it; only
    // a non-passive touchmove may prevent that (boardDrag.ts explains why).
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
    const row = (e.currentTarget as HTMLElement).closest('tr');
    if (!row) return;
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    const l = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      started: false,
      touch,
      armed: !touch,
      holdTimer: null as number | null,
      row,
      scroller: row.closest<HTMLElement>('.table-wrap'),
      gap: 0,
    };
    live.current = l;
    if (touch) {
      l.holdTimer = window.setTimeout(() => {
        if (live.current === l) l.armed = true;
      }, TOUCH_HOLD_MS);
    }
  }, []);

  /** True once for the click on column `id` that ends its drag, so it does
   *  not open the menu. */
  const consumeClick = useCallback((id: string) => {
    const d = draggedAt.current;
    draggedAt.current = { id: '', at: 0 };
    return d.id === id && Date.now() - d.at < CLICK_AFTER_DRAG_MS;
  }, []);

  return { drag, startDrag, consumeClick };
}
