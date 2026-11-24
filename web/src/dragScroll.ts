// The page scrolls while a dragged block is held near its top or bottom edge
// (#810, owner 2026-11-24: dragging a database up into a column higher on the
// page, "ideally the page would need to scroll upwards as well to see my
// target").
//
// The browser's own drag scrolling did nothing in nigari's page: the page
// scrolls inside .page-body, not the window, and over the header above it the
// pointer is not over anything that scrolls (measured: 2 s held at the top,
// scrollTop unchanged). So the drag scrolls the page itself, faster the
// nearer the pointer is to the edge and fastest past it, as table rows
// (rowDrag.ts) and board cards do, but with a ramp: a block moves a long way
// down a page, a row a short way.

/** How far from the edge (px) the scrolling starts. */
export const SCROLL_EDGE = 72;
/** The most it scrolls per frame (px), at or past the edge: about 1,400 px a
 *  second at 60 frames. */
export const SCROLL_MAX = 24;

/**
 * How far to scroll this frame for a pointer at `y`, in a scroller whose
 * visible part runs from `top` to `bottom`: negative up, positive down, 0
 * away from both edges. The speed grows with the square of the depth into
 * the edge zone, so the first pixels creep (a block can still be put on the
 * first visible line) and the edge itself runs.
 */
export function scrollSpeed(y: number, top: number, bottom: number, edge: number = SCROLL_EDGE, max: number = SCROLL_MAX): number {
  if (!(bottom > top)) return 0;
  // A short scroller gets narrower zones, so its middle still holds still.
  const zone = Math.min(edge, (bottom - top) / 4);
  const ramp = (depth: number) => Math.max(1, Math.round(max * Math.min(1, depth / zone) ** 2));
  if (y < top + zone) return -ramp(top + zone - y);
  if (y > bottom - zone) return ramp(y - (bottom - zone));
  return 0;
}
