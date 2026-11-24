// ⌘/ (Ctrl+/ elsewhere) opens the block menu of the line the caret is on
// (#818, owner 2026-11-24). The block menu sat behind the handle only, and the
// handle shows under a pointer: from the keyboard there was no way to it. The
// same chord opens a table row's menu (useRowKeys.ts, spec 022), so one key
// means "this thing's menu" in both places.
//
// BlockNote has no call to show its side menu for a given block: it follows
// the mouse. So the side menu's plugin view is asked what it asks itself on a
// mouse move, with a point on the caret's line, and the handle it then draws
// is clicked, which opens the menu as a click by hand does. The same plugin
// view blockNoteGuards.ts finds; the same warning if an upgrade renames it.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Editor = any;

/** Set while a menu the keyboard opened is open: its close hands the caret
 *  back to the text (BlockMenu reads it), where a click by hand leaves the
 *  focus on the handle as before. */
let byKey = false;
export const openedByKey = () => byKey;
export const forgetKeyOpen = () => {
  byKey = false;
};

/** Opens the block menu for the caret's block. False when there is none to
 *  open (no caret block, or BlockNote changed), so the key goes through. */
export function openBlockMenu(editor: Editor): boolean {
  const view = editor.prosemirrorView;
  const menu = (view?.pluginViews as any[] | undefined)?.find((p) => typeof p?.updateStateFromMousePos === 'function');
  if (!menu) {
    if (import.meta.env?.DEV) console.warn("blockMenuKey: BlockNote's side menu was not found");
    return false;
  }
  // The caret as the page shows it first: ProseMirror takes in a selection
  // the browser made (a click, End) a moment later, and a key pressed right
  // after a click found the line the caret was on before it (measured).
  const anchor = window.getSelection()?.anchorNode;
  const shown = (anchor instanceof Element ? anchor : anchor?.parentElement)?.closest('.bn-block-outer[data-id]');
  let id: string | null = shown && view.dom.contains(shown) ? shown.getAttribute('data-id') : null;
  if (!id) {
    try {
      id = editor.getTextCursorPosition().block.id as string;
    } catch {
      return false;
    }
  }
  const el = view.dom.querySelector(`[data-id="${CSS.escape(id)}"] .bn-block-content`) as HTMLElement | null;
  if (!el) return false;
  // BlockNote finds the block from what is on screen at the point: a line
  // scrolled away has nothing there (review).
  el.scrollIntoView({ block: 'nearest' });
  const box = el.getBoundingClientRect();
  // A point just inside the line's left edge: what a pointer moving onto the
  // line from its handle would pass.
  menu.menuFrozen = false;
  menu.mousePos = { x: box.left + 2, y: box.top + Math.min(box.height / 2, 12) };
  menu.updateStateFromMousePos();
  if (menu.state?.block?.id !== id) return false;
  byKey = true;
  // The handle is drawn on the next frame; then it is clicked like by hand.
  requestAnimationFrame(() => {
    const root = view.dom.closest('.bn-container') ?? document;
    const handle = root.querySelector('.bn-side-menu [draggable="true"]') as HTMLElement | null;
    if (!handle) {
      byKey = false;
      return;
    }
    handle.click();
  });
  return true;
}
