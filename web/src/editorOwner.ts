// Which editor on the page a pointer belongs to (#826).
//
// BlockNote's side menu (the + and the drag handle) shows only in the editor
// it thinks is closest to the pointer: the editor whose blocks are nearest,
// by distance, and the first one in the page on a tie. A side peek lays a
// second editor OVER the page's own, so at a point in the peek both are at
// distance 0, the page's editor comes first, and it won: the peek never
// showed a handle, and the page's handle stayed up beside its last hovered
// block instead.
//
// What decides it here is what the person sees: an editor in the part of the
// page that lies on top under the pointer (the peek panel, a dialog) wins over
// one hidden behind it. Only when no editor is on top there (the pointer is
// beside every editor, in a margin) does distance alone decide, as before.

export interface EditorBox {
  /** The editor's blocks: the box BlockNote measures distance to. */
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** The editor sits in the part of the page on top at the pointer. */
  onTop: boolean;
}

const distance = (e: EditorBox, x: number, y: number) => {
  const dx = x < e.left ? e.left - x : x > e.right ? x - e.right : 0;
  const dy = y < e.top ? e.top - y : y > e.bottom ? y - e.bottom : 0;
  return Math.sqrt(dx * dx + dy * dy);
};

/** The index of the editor the pointer belongs to, and how far it is. */
export function closestEditor(editors: readonly EditorBox[], x: number, y: number): { index: number; distance: number } | null {
  if (editors.length === 0) return null;
  const pool = editors.some((e) => e.onTop) ? editors.filter((e) => e.onTop) : editors;
  let best = -1;
  let min = Infinity;
  for (const e of pool) {
    const d = distance(e, x, y);
    // Strictly less: on a tie the first in the page wins, as in BlockNote.
    if (d < min) {
      min = d;
      best = editors.indexOf(e);
    }
  }
  return { index: best, distance: min };
}
