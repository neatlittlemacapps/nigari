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
 * `reveal` asks for (a row just added or duplicated from the embed, which
 * lands past the limit and would otherwise vanish the moment it is made).
 * Only that row, not every row up to it: a row added to a 500-row table draws
 * 26 rows, not 501. No limit draws every row.
 *
 * In a table with sub-items the rows come as trees, flattened: `startsGroup`
 * is true for a top-level row. The cut never falls inside a tree (a parent
 * drawn open with its children missing), and a revealed sub-item brings its
 * whole tree, so it is never drawn under somebody else's parent (code review).
 */
export function limitRows<T>(
  items: T[],
  limit: number | undefined,
  reveal: (item: T) => boolean = () => false,
  startsGroup: (item: T) => boolean = () => true,
): T[] {
  if (limit === undefined || items.length <= limit) return items;
  let cut = limit;
  while (cut < items.length && !startsGroup(items[cut])) cut++;
  const out = items.slice(0, cut);
  for (let i = cut; i < items.length; ) {
    let end = i + 1;
    while (end < items.length && !startsGroup(items[end])) end++;
    const group = items.slice(i, end);
    if (group.some(reveal)) out.push(...group);
    i = end;
  }
  return out;
}

/** The limit after one press of Show more. */
export function nextLimit(limit: number): number {
  return limit + EMBED_ROW_STEP;
}
