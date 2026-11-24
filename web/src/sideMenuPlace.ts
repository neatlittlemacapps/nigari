// Whether a block's handle steps past the resize grip of a columns layout
// (#820, owner 2026-11-24: the gap between two columns is the grip's).
//
// BlockNote puts the side menu of every block in a column at that column's
// left edge, however deeply the block is nested in it. In the second, third
// or fourth column that edge is the gap, where the grip is, so every block
// there, at any depth, has its handle moved one gap left (styles.css,
// [data-past-grip]). A column is a child of the columns block; what the column
// holds below its first line are that child's children.

export interface BlockRef {
  id: string;
  type: string;
  children: readonly { id: string }[];
}

/** A block sits in a column other than its layout's first. `parentOf`
 *  answers the block's parent, or nothing at the top of the page. */
export function inLaterColumn(id: string, parentOf: (id: string) => BlockRef | undefined): boolean {
  let at = id;
  // Bounded, so a cycle in a broken document cannot hang the page.
  for (let depth = 0; depth < 1000; depth++) {
    const parent = parentOf(at);
    if (!parent) return false;
    if (parent.type === 'columns') return parent.children.findIndex((c) => c.id === at) > 0;
    at = parent.id;
  }
  return false;
}
