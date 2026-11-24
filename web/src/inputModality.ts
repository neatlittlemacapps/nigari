// Whether the last thing the person did was a key or a pointer, on the page's
// root as data-input="keys" | "pointer" (#943, owner 2026-11-24: "a thin ring
// is acceptable").
//
// A block chosen as a whole is marked by a faint tint (#818), which is enough
// next to the mouse: the open menu or the drag shows what is chosen. A block
// reached with the arrow keys (an image, a database, a divider) had only the
// tint, 1.16:1 against the page, under the 3:1 WCAG asks of a state that must
// be seen (SC 1.4.11). So a thin ring in the focus colour joins the tint, only
// when keys made the choice: what :focus-visible does for focus, which a
// ProseMirror node selection does not get. styles.css reads it.
//
// On the root, not on the editor: an attribute written into the editor's DOM
// makes ProseMirror redraw it (see ColumnsBlock in blocks.tsx).

export type Input = 'keys' | 'pointer';

/** The keys that move the caret or choose a block. Other keys (typing, ⌘C,
 *  AltGr held for a click) leave the last answer as it is: they choose no
 *  block, and a block the mouse chose must not start ringing when one is
 *  pressed (review). */
const MOVES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End', 'PageUp', 'PageDown']);

/** What a key press says about how the next block choice is made, or null
 *  when it says nothing. Not a key pressed inside a menu (moving through a
 *  block menu the mouse opened) and not a chord with ⌘ or Ctrl. */
export function inputOfKey(key: string | undefined, o: { chord?: boolean; inMenu?: boolean } = {}): Input | null {
  if (o.chord || o.inMenu || !key) return null;
  return MOVES.has(key) ? 'keys' : null;
}

const installed = new WeakSet<Document>();

/** Follows the last input on `doc`, once per document. */
export function followInput(doc: Document = document): void {
  if (installed.has(doc)) return;
  installed.add(doc);
  const root = doc.documentElement;
  const set = (input: Input) => {
    if (root.dataset.input !== input) root.dataset.input = input;
  };
  doc.addEventListener(
    'keydown',
    (e) => {
      const inMenu = e.target instanceof Element && !!e.target.closest('[role="menu"], .bn-menu-dropdown');
      const input = inputOfKey(e.key, { chord: e.metaKey || e.ctrlKey, inMenu });
      if (input) set(input);
    },
    true,
  );
  doc.addEventListener('pointerdown', () => set('pointer'), true);
}
