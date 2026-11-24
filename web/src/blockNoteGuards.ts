// Three corrections to BlockNote's own pointer handling, each made by swapping
// one method on the editor's plugin view (#825, #826, #820).
//
// Both of BlockNote's views call these methods through `this.<name>`, and
// remove their listeners through the same property when the editor goes, so
// a method swapped here is used on every call and cleaned up with the editor.
// The views are not exported, so they are found among ProseMirror's plugin
// views by the method they carry. A BlockNote upgrade that renames either
// would bring its bug back without an error: the development build warns, and
// block-guards.mjs fails.
//
// Turned down: stopping the events before BlockNote sees them. sideMenuHold.ts
// records why (other code listens to the same mousemove; Playwright no longer
// saw a drag start).
import { closestEditor, type EditorBox } from './editorOwner';

/* eslint-disable @typescript-eslint/no-explicit-any */
type View = any;

/** The plugin view that carries `method`, if this editor has one. */
const pluginView = (view: View, method: string): any =>
  (view?.pluginViews as any[] | undefined)?.find((p) => typeof p?.[method] === 'function');

const warn = (what: string) => {
  if (import.meta.env?.DEV) console.warn(`blockNoteGuards: BlockNote's ${what} was not found`);
};

/**
 * #825: BlockNote's table handles answer the pointer over ANY table cell
 * inside the editor, and a database block draws its rows as a table inside
 * the editor. BlockNote took it for one of its own tables, read `content.rows`
 * from the database block, which has none, and threw on every pointer move
 * and click there. A database block's table is not BlockNote's: the handles
 * leave it alone.
 */
function skipDatabaseTables(view: View) {
  const handles = pluginView(view, 'mouseMoveHandler');
  if (!handles) return warn('table handles');
  if (handles.nigariGuarded) return;
  const original = handles.mouseMoveHandler;
  const guarded = (event: MouseEvent) => {
    if (!(event.target instanceof Element) || !event.target.closest('.bn-db-embed')) return original(event);
    // Straight from a real table into the database: hide that table's
    // handles, as BlockNote does when the pointer leaves a table (review).
    const state = handles.state;
    if (state?.show) {
      state.show = false;
      state.showAddOrRemoveRowsButton = false;
      state.showAddOrRemoveColumnsButton = false;
      handles.emitUpdate();
    }
  };
  // The mousemove listener holds the old function: swap it as well. The
  // mouseup path calls the property, and so does BlockNote's clean-up.
  view.dom.removeEventListener('mousemove', original);
  view.dom.addEventListener('mousemove', guarded);
  handles.mouseMoveHandler = guarded;
  handles.nigariGuarded = true;
}

/**
 * #826: which editor the side menu belongs to is decided by what is on top
 * under the pointer, so a side peek over the page shows its own handles
 * (editorOwner.ts).
 */
function ownerOnTop(view: View) {
  const menu = pluginView(view, 'findClosestEditorElement');
  if (!menu) return warn('side menu');
  if (menu.nigariGuarded) return;
  menu.findClosestEditorElement = ({ clientX, clientY }: { clientX: number; clientY: number }) => {
    const root: Document | ShadowRoot = view.root;
    const editors = Array.from(root.querySelectorAll('.bn-editor'));
    // The innermost part of the page, under the pointer, that holds an
    // editor: the editor itself, a peek panel, a dialog, or the page. Asked
    // of the editors, not of each ancestor's subtree: this runs on every
    // pointer move (review).
    let surface: Element | null = root.elementFromPoint(clientX, clientY);
    while (surface && !editors.some((el) => surface!.contains(el))) surface = surface.parentElement;
    const boxes: EditorBox[] = editors.map((el) => {
      const r = (el.querySelector('.bn-block-group') ?? el).getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, onTop: !!surface && surface.contains(el) };
    });
    const found = closestEditor(boxes, clientX, clientY);
    return found ? { element: editors[found.index], distance: found.distance } : null;
  };
  menu.nigariGuarded = true;
}

/**
 * #820: on the handle, and over the resize grip between two columns, the side
 * menu stays as it is.
 *
 * - The grip fills the gap, and the handle of a line in the column right of
 *   it sits just left of the grip (styles.css, [data-past-grip]), so the
 *   pointer crosses the grip on its way from the line to its handle.
 *   BlockNote, asked what is under the grip, finds the columns block and,
 *   from its right edge, the LAST column, and the handle jumped there.
 * - The handle itself: BlockNote looks through it. A mouse on it is held by
 *   sideMenuHold.ts, but a tap is not (a finger is left alone there), and the
 *   mouse move a phone sends ahead of the tap's click moved the menu, in a
 *   layout to the last column, before the click arrived.
 *
 * Decided at the point BlockNote itself looks, rather than on the event's
 * own target: the two disagree by a fraction of a pixel at the grip's edge.
 */
function holdOnHandleAndGrip(view: View) {
  const menu = pluginView(view, 'updateStateFromMousePos');
  if (!menu) return warn('side menu');
  if (menu.nigariHeld) return;
  const original = menu.updateStateFromMousePos;
  menu.updateStateFromMousePos = () => {
    const at = menu.mousePos;
    // BlockNote asks again after every change to the document too, so a
    // handle never acts on a block that is gone: a held handle lets that
    // through (review).
    const id = menu.state?.block?.id;
    const shown = typeof id === 'string' && view.dom.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (at && menu.state?.show && shown) {
      const root: Document | ShadowRoot = view.root;
      const under = root.elementsFromPoint(at.x, at.y);
      const container = view.dom.closest('.bn-container');
      if (under[0]?.closest('.bn-side-menu') && container?.contains(under[0])) return;
      // The first thing under the point inside the editor, as BlockNote
      // picks it: what is on top can be a floating layer.
      if (under.find((el) => view.dom.contains(el))?.closest('.bn-columns-grip')) return;
    }
    original();
  };
  menu.nigariHeld = true;
}

/** Installs all three for one editor, once it is on the page. */
export function guardBlockNote(editor: { prosemirrorView?: View; onMount?: (cb: () => void) => (() => void) | void }): () => void {
  const install = () => {
    // Before it mounts, tiptap hands out a stand-in view with no plugin views.
    const view = editor.prosemirrorView;
    if (!view || !Array.isArray(view.pluginViews)) return false;
    skipDatabaseTables(view);
    ownerOnTop(view);
    holdOnHandleAndGrip(view);
    return true;
  };
  install();
  // Again on every later mount: BlockNote builds new plugin views each time
  // the editor is mounted (review).
  const off = editor.onMount?.(() => void install());
  return () => {
    if (typeof off === 'function') off();
  };
}
