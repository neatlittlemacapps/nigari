// A drop that makes columns waits for a short rest at the edge (#820, owner
// 2026-11-24, "a short pause, about 0.4 s").
//
// A column edge is 16px wide (dropTarget.ts, EDGE), and a block dragged up or
// down a column passes through the edges of the columns beside it. Offered at
// once, the edge turned a drag meant for the line above into a new column, or
// a new layout beside a paragraph, whenever the pointer happened to cross it.
// Now passing through shows the ordinary line, and only a pointer that stays
// at the same edge for DWELL_MS is offered the sideways drop. The browser sends
// dragover again while the pointer rests, but as seldom as every 350 ms or
// more (Firefox, by the HTML spec), so blockDrop.ts also asks again when the
// wait is over (`left`).

/** How long the pointer rests at an edge before it is offered. */
export const DWELL_MS = 400;

/**
 * Remembers which sideways spot the pointer is at, and since when. `at` is
 * that spot's key (null: not at one), `now` the time in ms; the answer is
 * whether it has rested there long enough. Any other spot, or none, starts
 * the wait again.
 */
export function sidewaysDwell(ms: number = DWELL_MS) {
  let key: string | null = null;
  let since = 0;
  const ready = (at: string | null, now: number): boolean => {
    if (at !== key) {
      key = at;
      since = now;
    }
    return at !== null && now - since >= ms;
  };
  /** How long until the spot last asked about is ready (0: it is, or none). */
  const left = (now: number): number => (key === null ? 0 : Math.max(0, ms - (now - since)));
  const reset = () => {
    key = null;
  };
  return { ready, left, reset };
}
