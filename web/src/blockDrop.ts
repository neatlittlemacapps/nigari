// The drop line and the drop of a dragged block use one decision (spec 021,
// R1; the decision is dropTarget.ts).
//
// Two hooks into the editor, both given the same target:
// - BlockNote's drop line is switched off for a block drag
//   (`computeDropPosition` returns null) and this module draws the line
//   itself, from the boxes the decision used. BlockNote draws its line from a
//   ProseMirror position, and in our columns the position before a column's
//   first block is "after the previous column", so its line showed in the
//   column to the left (#809), however right the position was.
// - ProseMirror's drop is taken over (a capture listener on the editor runs
//   first and stops the event) and the block is moved to the target through
//   BlockNote's block calls, so its id, comments and children go with it.
//   Not ProseMirror's handleDrop prop: ProseMirror asks it only when the
//   pointer is over a text position, and gives up silently elsewhere (the gap
//   between two columns), where the line had shown a spot.
//
// Anything that is not a block from this editor's own handle (text dragged
// inside a line, a file from the desktop, a block dragged in from another
// editor on the page such as a peek) is left to BlockNote and ProseMirror as
// before. BlockNote hands a block slice to every editor on the page, so "a
// block drag" alone is not enough: the drag must have started here.
//
// The boxes are read once when a drag reaches the editor and again after a
// scroll or resize, not on every pointer step (SC-003). The only thing that
// moves the page during a drag is the opening of a new column, so they are
// read again when it opens or closes and once it has settled.

import { dropTarget, lineFor, staysPut, type Box, type Item, type Line, type Target } from './dropTarget';
import { dropLineWidth } from './dropLine';
import { closeEmptied, insertColumn, sourcesOf, wrapBeside } from './columnMoves';
import { setOpening } from './columnOpening';
import { sidewaysDwell } from './sidewaysDwell';
import { t } from './i18n';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Editor = any;
type View = any;

const rect = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
};

const outerOf = (group: Element | null | undefined): Element[] =>
  group ? Array.from(group.children).filter((c) => c.classList.contains('bn-block-outer')) : [];

const groupOf = (outer: Element): Element | null => outer.querySelector(':scope > .bn-block > .bn-block-group');
// A React block (ours: columns, callouts) has a .react-renderer between the
// block and its content.
const contentOf = (outer: Element): Element | null =>
  outer.querySelector(':scope > .bn-block > .bn-block-content, :scope > .bn-block > * > .bn-block-content');
const isColumns = (outer: Element) => contentOf(outer)?.getAttribute('data-content-type') === 'columns';

/** A block's own row and every nested row under it, in document order. */
function linesOf(outer: Element, path: string[], head: boolean, out: Line[]) {
  const id = outer.getAttribute('data-id');
  const content = contentOf(outer);
  if (!id || !content) return;
  if (isColumns(outer)) {
    // A layout inside a column or under another block (the slash menu makes
    // one anywhere) is one line, the whole box: a drop goes above or below
    // it, never into its columns, where a "sibling" would be a new column
    // (#824).
    out.push({ id, box: rect(outer), path, columns: true, ...(head ? { head: true } : {}) });
    return;
  }
  const type = content.getAttribute('data-content-type') ?? undefined;
  out.push({ id, box: rect(content), path, type, ...(head ? { head: true } : {}) });
  for (const child of outerOf(groupOf(outer))) linesOf(child, [...path, id], false, out);
}

/** The page as the decision sees it: lines and column layouts. */
export function readItems(root: Element): Item[] {
  const top = root.querySelector(':scope > .bn-block-group') ?? root.querySelector('.bn-block-group');
  const items: Item[] = [];
  for (const outer of outerOf(top)) {
    const id = outer.getAttribute('data-id');
    if (!id) continue;
    if (isColumns(outer)) {
      const group = groupOf(outer);
      const columns = outerOf(group).map((col) => {
        const lines: Line[] = [];
        linesOf(col, [id], true, lines);
        return { box: rect(col), lines };
      });
      // Across the whole block, as tall as its columns: the group is indented
      // like any block's children, and a line above the layout spans the page.
      const o = rect(outer);
      const g = group ? rect(group) : o;
      // The count it is drawn with (ColumnsBlock's data-count).
      const drawn = Number(contentOf(outer)?.querySelector('.bn-columns')?.getAttribute('data-count'));
      items.push({
        layout: { id, box: { left: o.left, right: o.right, top: g.top, bottom: g.bottom }, columns, ...(drawn ? { count: drawn } : {}) },
      });
      continue;
    }
    const lines: Line[] = [];
    linesOf(outer, [], false, lines);
    for (const line of lines) items.push({ line });
  }
  return items;
}

/** The ids of the blocks a drag carries: the node selection made at its start. */
export function draggedIds(state: any): string[] {
  const { from, to } = state.selection;
  const ids: string[] = [];
  state.doc.nodesBetween(from, to, (node: any, pos: number) => {
    if (node.type.name !== 'blockContainer') return true;
    if (pos >= from && pos + node.nodeSize <= to) {
      ids.push(node.attrs.id);
      return false; // its children travel with it
    }
    return true;
  });
  return ids;
}

/** A block from the handle, not text: BlockNote hands it over as whole blocks. */
const isBlockDrag = (view: View) => {
  const slice = view.dragging?.slice;
  return !!slice && slice.openStart === 0 && slice.content.firstChild?.type.name === 'blockContainer';
};

/** Thrown inside the transaction to drop the whole change: nothing is
 *  removed unless the blocks also land (found by review). */
class NoPlace extends Error {}
const noPlace = (): never => {
  throw new NoPlace();
};

/** Moves the blocks to the target, in one change, or changes nothing. */
export function moveTo(editor: Editor, target: Target, ids: string[]) {
  try {
    editor.transact(() => land(editor, target, ids));
  } catch (e) {
    // BlockNote dispatches the transaction only when the callback returns.
    if (!(e instanceof NoPlace)) throw e;
  }
}

function land(editor: Editor, target: Target, ids: string[]) {
  const blocks = ids.map((id) => editor.getBlock(id)).filter(Boolean);
  if (blocks.length === 0 || ids.includes(target.id) || !editor.getBlock(target.id)) return;
  // The columns the dragged blocks leave, read before they go (FR-008).
  const sources = sourcesOf(editor, ids);
  editor.removeBlocks(ids);
  const keep = target.kind === 'column' ? target.id : undefined;
  const { kept, replaced } = closeEmptied(editor, sources, keep);
  if (target.kind === 'column') {
    if (!insertColumn(editor, target.id, target.before, blocks, kept)) noPlace();
    return;
  }
  if (target.kind === 'beside') {
    if (!wrapBeside(editor, target.id, target.edge, blocks)) noPlace();
    return;
  }
  // A layout the drag emptied down to one column is plain blocks now: above
  // it is above the first of them, below it below the last.
  const stand = replaced.get(target.id);
  const anchor = stand ? (target.kind === 'before' ? stand[0] : stand[stand.length - 1]) : target.id;
  const at = editor.getBlock(anchor) ?? noPlace();
  // Still a column's first block: the layout it was in may just have turned
  // back into plain blocks.
  const head = target.head && editor.getParentBlock(at.id)?.type === 'columns';
  if (!head) {
    editor.insertBlocks(blocks, at, target.kind);
    return;
  }
  if (target.kind === 'after') {
    // Below a column's first line is still that column: the head's first
    // child, not a sibling (a sibling of a column is a new column, #824).
    if (at.children.length) editor.insertBlocks(blocks, at.children[0], 'before');
    else editor.updateBlock(at, { children: blocks });
    return;
  }
  // Above a column's first line: the dragged block becomes the column's
  // first line, and the old one and the rest of the column its next lines.
  const [first, ...rest] = blocks;
  const column = {
    ...first,
    children: [...(first.children ?? []), ...rest, { ...at, children: [] }, ...at.children],
  };
  editor.replaceBlocks([at], [column]);
}

/** BlockNote's own line is off for a block drag: blockDrop draws it. */
export const computeDropPosition = <P,>({ view, defaultPosition }: { view: View; defaultPosition: P }): P | null =>
  isBlockDrag(view) ? null : defaultPosition;

const sayColumn = () => t('Drop to make a new column here');
const sayBeside = () => t('Drop to put the two blocks side by side');

/**
 * Lets BlockNote's UniqueID plugin see a drop that this module took over
 * (#861). UniqueID remembers which editor a drag started in and forgets it
 * only in its own `handleDOMEvents.drop`, which the stopped event never
 * reaches. Left set, the next drop that started outside this window (a block
 * from another tab, which fires no dragstart here) was taken for one from
 * inside, and the ids it carried were kept instead of new ones. Its handler
 * only reads the event and resets that state; it changes nothing in the
 * document. Not by letting the event through with `preventDefault()`:
 * ProseMirror then ignores the event altogether (`eventBelongsToView`), its
 * plugins' handlers included.
 */
const forgetDragSource = (v: View, e: DragEvent) => {
  let found = false;
  for (const plugin of v.state.plugins) {
    const drop = typeof plugin.key === 'string' && plugin.key.startsWith('uniqueID$') ? plugin.props.handleDOMEvents?.drop : undefined;
    if (!drop) continue;
    found = true;
    drop(v, e);
  }
  // A BlockNote upgrade that renames the plugin or moves the reset would
  // bring #861 back without an error (block-drop-ids.mjs guards it too).
  if (!found && import.meta.env?.DEV) console.warn("blockDrop: BlockNote's UniqueID drop handler was not found (issue 861)");
};

/** Below this editor width there is no room for a new column (FR-010):
 *  the phone's page, where four columns would be slivers. */
const SIDEWAYS_MIN_WIDTH = 480;

/** The opening's 150 ms (OPENING_MS in blocks.tsx) and a little over. */
const OPENING_SETTLED_MS = 200;

/** A drop that copies rather than moves (Alt, or Ctrl off a Mac): ProseMirror's. */
const copies = (e: DragEvent) => e.altKey || (!/Mac/.test(navigator.platform) && e.ctrlKey);

/**
 * Installs the decision for one editor; returns the function that removes it.
 * `editor` is asked on each event because the editor mounts after this runs.
 */
export function blockDrop(editor: Editor): () => void {
  let items: Item[] | null = null;
  let line: HTMLElement | null = null;
  let shown = '';
  // The drag started at this editor's own handle (see the top of the file).
  let origin = false;
  // What the line shows now: the drop commits exactly this (#820). Deciding
  // again at the drop, from boxes read then, could disagree with the line:
  // a column opening that was still closing had moved the layout 19px, a
  // block dragged up a column's edge was dropped as a new column while the
  // line showed it under the line above.
  // `undefined`: no dragover has decided since the line was last hidden;
  // `null`: one did and found no target, so the drop moves nothing (review).
  let shownTarget: { target: Target; all: Item[]; ids: string[] } | null | undefined;
  // How long the pointer has rested at a sideways edge (#820).
  const dwell = sidewaysDwell();
  let rest: ReturnType<typeof setTimeout> | undefined;
  // What a screen reader is told when a drop would make columns (T022): the
  // vertical line and the opening are only seen.
  // The region is put on the page when the drag starts, empty: one made and
  // filled at once is often not read (found by review).
  let live: HTMLElement | null = null;
  let said = '';
  const listen = () => {
    if (live) return;
    live = document.createElement('div');
    live.className = 'nigari-drop-say';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    document.body.append(live);
  };
  const say = (text: string) => {
    if (text === said) return;
    said = text;
    if (live) live.textContent = text;
  };
  // The opening moves the layout's lines while it runs: the boxes are read
  // again when it changes and once it has settled (found by review).
  let opened = '';
  let settle: ReturnType<typeof setTimeout> | undefined;
  const opening = (o: { id: string; at: number } | null) => {
    const key = o ? `${o.id}:${o.at}` : '';
    if (key === opened) return;
    opened = key;
    setOpening(o);
    clearTimeout(settle);
    settle = setTimeout(() => {
      items = null;
      shown = '';
    }, OPENING_SETTLED_MS);
  };
  const view = (): View | undefined => editor.prosemirrorView;

  const hide = () => {
    line?.remove();
    line = null;
    shown = '';
    shownTarget = undefined;
    dwell.reset();
    clearTimeout(rest);
    opening(null);
    say('');
  };
  const decide = (v: View, x: number, y: number) => {
    if (!items) items = readItems(v.dom);
    const ids = draggedIds(v.state);
    // Sideways only where there is room for columns side by side (FR-010).
    const sideways = v.dom.getBoundingClientRect().width >= SIDEWAYS_MIN_WIDTH;
    let target = dropTarget(items, x, y, ids, { sideways });
    // A new column, or a layout beside a block, only after a short rest at
    // that edge (#820, sidewaysDwell.ts); until then the line it would be
    // without sideways drops.
    const edge = target?.kind === 'column' ? `column:${target.id}:${target.at}` : target?.kind === 'beside' ? `beside:${target.id}:${target.edge}` : null;
    const now = performance.now();
    clearTimeout(rest);
    if (!dwell.ready(edge, now) && edge) {
      target = dropTarget(items, x, y, ids, { sideways: false });
      // Asked again when the wait is over: dragover can come too seldom
      // for the 0.4 s (review).
      rest = setTimeout(() => overAt(x, y), dwell.left(now) + 20);
    }
    return target ? { target, all: items, ids } : null;
  };
  const draw = (box: Box | null, key: string) => {
    if (key === shown) return;
    shown = key;
    if (!box) {
      line?.remove();
      line = null;
      return;
    }
    if (!line) {
      line = document.createElement('div');
      line.className = 'nigari-drop-line';
      line.setAttribute('aria-hidden', 'true');
      // On the body, above the peek panel and the template dialog (styles.css).
      document.body.append(line);
    }
    line.style.left = `${box.left}px`;
    line.style.top = `${box.top}px`;
    line.style.width = `${box.right - box.left}px`;
    line.style.height = `${box.bottom - box.top}px`;
  };

  const onOver = (e: DragEvent) => overAt(e.clientX, e.clientY);
  function overAt(x: number, y: number) {
    const v = view();
    if (!v || !v.editable || !origin || !isBlockDrag(v)) return;
    const d = decide(v, x, y);
    shownTarget = d;
    if (!d) {
      draw(null, 'none');
      opening(null);
      say('');
      return;
    }
    const to = d.target;
    draw(lineFor(d.all, to, dropLineWidth()), to.kind === 'column' ? `column:${to.id}:${to.at}` : to.kind === 'beside' ? `beside:${to.id}:${to.edge}` : `${to.kind}:${to.id}`);
    // The columns slide apart to open the room (FR-005); anywhere else they
    // close again.
    opening(to.kind === 'column' ? { id: to.id, at: to.at } : null);
    say(to.kind === 'column' ? sayColumn() : to.kind === 'beside' ? sayBeside() : '');
  }
  const onLeave = (e: DragEvent) => {
    const v = view();
    if (!v || !(e.relatedTarget instanceof Node) || !v.dom.contains(e.relatedTarget)) hide();
  };
  const onStart = (e: DragEvent) => {
    const v = view();
    const container = v?.dom.closest('.bn-container') ?? v?.dom.parentElement;
    origin = !!container && e.target instanceof Node && container.contains(e.target);
    if (origin) listen();
  };
  // A drag that ends anywhere else (Escape, outside the editor, another
  // editor on the page) never reaches a drop here: UniqueID's state is reset
  // on its end as well (found by review). Its drop handler, which already ran
  // for any drop ProseMirror handled here, only clears it again.
  const onEnd = (e: DragEvent) => {
    const v = view();
    if (v) forgetDragSource(v, e);
    origin = false;
    items = null;
    hide();
  };
  const onDrop = (e: DragEvent) => {
    const v = view();
    if (!v || !v.editable || !origin || !isBlockDrag(v) || copies(e)) return;
    origin = false;
    // The target the line showed. Only a drop no dragover came before (none
    // fires between some drag starts and their drop) is decided here, from
    // fresh boxes.
    if (shownTarget === undefined) items = null;
    const d = shownTarget === undefined ? decide(v, e.clientX, e.clientY) : shownTarget;
    items = null;
    hide();
    e.preventDefault();
    e.stopPropagation();
    forgetDragSource(v, e);
    v.dragging = null;
    if (d && !staysPut(d.all, d.target, d.ids)) moveTo(editor, d.target, d.ids);
  };
  // A scroll or resize moves every box: read them again on the next step.
  const onScroll = () => {
    items = null;
    hide();
  };
  // A collaborator's edit during the drag moves the boxes too.
  const offChange = editor.onChange?.(() => {
    if (origin) onScroll();
  });

  // On the document, in the capture phase: ahead of ProseMirror's own drop
  // handler on the editor, and in place before the editor has mounted. Each
  // editor on the page answers only for events inside itself.
  const mine = (e: Event) => {
    const v = view();
    return v && e.target instanceof Node && v.dom.contains(e.target) ? v : undefined;
  };
  const over = (e: DragEvent) => mine(e) && onOver(e);
  const leave = (e: DragEvent) => mine(e) && onLeave(e);
  const drop = (e: DragEvent) => mine(e) && onDrop(e);
  document.addEventListener('dragstart', onStart, true);
  document.addEventListener('dragover', over, true);
  document.addEventListener('dragleave', leave, true);
  document.addEventListener('drop', drop, true);
  document.addEventListener('dragend', onEnd, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll);
  return () => {
    document.removeEventListener('dragstart', onStart, true);
    document.removeEventListener('dragover', over, true);
    document.removeEventListener('dragleave', leave, true);
    document.removeEventListener('drop', drop, true);
    document.removeEventListener('dragend', onEnd, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
    if (typeof offChange === 'function') offChange();
    hide();
    clearTimeout(settle);
    live?.remove();
  };
}
