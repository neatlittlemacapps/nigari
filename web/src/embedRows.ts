// How many rows a database in a document draws (spec 023, FR-005).
//
// A database page draws every row: the page scrolls, and the rows are what it
// is for. In a document the database stands between paragraphs, and every row
// drawn pushes the text after it further down: a 500-row table made the rest
// of the document unreachable without scrolling past all of it. So a table,
// list or gallery there draws the first 25, and "Show more" adds 25 at a time
// (owner, 2026-11-23). In steps, not "show all": one press on a database of
// ten thousand rows would draw ten thousand rows of cells at once.

/** Rows drawn at first, and added by each press of Show more. */
export const EMBED_ROW_STEP = 25;

/**
 * The rows to draw under `limit`: the first `limit`, then any later row
 * `reveal` asks for (a row just added from the embed, which lands at the end
 * and would otherwise vanish the moment it is made). Only that row, not every
 * row up to it: a row added to a 500-row table draws 26 rows, not 501. No
 * limit draws every row.
 */
export function limitRows<T>(items: T[], limit: number | undefined, reveal: (item: T) => boolean = () => false): T[] {
  if (limit === undefined || items.length <= limit) return items;
  return [...items.slice(0, limit), ...items.slice(limit).filter(reveal)];
}

/** The limit after one press of Show more. */
export function nextLimit(limit: number): number {
  return limit + EMBED_ROW_STEP;
}
