// Enter inside a column (#317). Our columns block has no container of its own
// (blocks.tsx, "Columns"): each CHILD of the columns block is one column, and
// the rest of a column is that first block's children. The server reads and
// writes the same shape (export.go, mdimport.go). BlockNote's own Enter knows
// none of this, and both of its moves were wrong here:
//
// - in a column's first block it splits the block into a SIBLING, and a
//   sibling of a column is the next column: the cursor jumped across;
// - on an empty line further down it "lifts" the block one level, which takes
//   it out of the column and makes it a column of its own.
//
// So Enter decides here first, and hands back to BlockNote whatever it does
// right already: a line further down that has text splits into a sibling,
// which is the same column.

/** Where the cursor is, as far as the decision needs it. */
export interface EnterContext {
  /** The cursor's block is a column's first block (a child of a columns block). */
  head: boolean;
  /** The cursor's block is a later line of a column (a child of a head). */
  body: boolean;
  /** The block holds editable text (not a table, a code block, an image). */
  inline: boolean;
  type: string;
  /** The block has no text. */
  empty: boolean;
  /** The slash menu (or another suggestion menu) is open: Enter is its. */
  menuOpen: boolean;
}

export type EnterAction =
  /** Leave Enter to BlockNote. */
  | 'default'
  /** Split the column's first block at the cursor; the rest becomes the
   *  column's next line (the first child of the head). */
  | 'split-head'
  /** An empty line in a column: another empty line below it, in the column. */
  | 'new-line';

const LIST = ['bulletListItem', 'numberedListItem', 'checkListItem', 'toggleListItem'];

export function columnEnterAction(c: EnterContext): EnterAction {
  if (c.menuOpen || !c.inline || c.type === 'codeBlock') return 'default';
  // An empty list item turns into a paragraph first (BlockNote's own rule):
  // the block stays where it is, so that is right in a column too.
  if (c.empty && LIST.includes(c.type)) return 'default';
  if (c.head) return 'split-head';
  if (c.body && c.empty) return 'new-line';
  return 'default';
}

/** A list item's next line is the same kind of item; everything else's is a
 *  paragraph. BlockNote's split does the same. */
export const keepsType = (type: string) => LIST.includes(type);

// ---- applying it to the editor ----
// Typed loosely on purpose: the ProseMirror classes come in through the
// editor, not as an import of our own, so this module stays light enough for
// its check to bundle without the editor.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Tr = any;
type PmNode = any;
interface ColumnsEditor {
  transact<T>(fn: (tr: Tr) => T): T;
  setTextCursorPosition(id: string, place: 'start' | 'end'): void;
}

/** The cursor's block and its place among the columns, read from the
 *  transaction. Null when the cursor is not inside a column. */
function locate(tr: Tr) {
  const $from = tr.selection.$from;
  // The blockContainer holding the cursor: the deepest one.
  let d = $from.depth;
  while (d > 0 && $from.node(d).type.name !== 'blockContainer') d--;
  if (d === 0) return null;
  const container = $from.node(d);
  const content = container.firstChild as PmNode;
  // blockContainer > blockGroup > blockContainer: the parent block is two up.
  const contentType = (depth: number) => (depth > 0 ? ($from.node(depth).firstChild as PmNode)?.type.name : undefined);
  const parent = contentType(d - 2);
  const grandparent = contentType(d - 4);
  return {
    depth: d,
    container,
    content,
    containerPos: $from.before(d),
    head: parent === 'columns',
    body: grandparent === 'columns',
  };
}

/** Handles Enter when the cursor is in a column. Returns false to leave the
 *  key to BlockNote. */
export function columnEnter(editor: ColumnsEditor, menuOpen: boolean): boolean {
  const at = editor.transact((tr: Tr) => {
    const l = locate(tr);
    if (!l) return null;
    const action = columnEnterAction({
      head: l.head,
      body: l.body,
      inline: l.content.type.spec.content?.includes('inline') ?? false,
      type: l.content.type.name,
      empty: l.content.childCount === 0,
      menuOpen,
    });
    return action === 'default' ? null : { action };
  });
  if (!at) return false;

  // Our own id on the new block, so the cursor can be put into it by id
  // afterwards; BlockNote's UniqueID keeps an id it is given.
  const id = crypto.randomUUID();
  editor.transact((tr: Tr) => {
    if (!tr.selection.empty) tr.deleteSelection();
    const l = locate(tr)!;
    const nodes = tr.doc.type.schema.nodes;
    const contentStart = l.containerPos + 2; // inside container, inside its content
    const cut = tr.selection.from - contentStart;
    const type = keepsType(l.content.type.name) ? l.content.type : nodes.paragraph;
    if (at.action === 'split-head') {
      // The text after the cursor moves to the new line; the new line goes
      // first among the head's children, right under the head.
      const tail = l.content.content.cut(cut);
      const line = nodes.blockContainer.create({ id }, type.create(null, tail));
      const group = l.container.childCount > 1 ? (l.container.child(1) as PmNode) : null;
      const contentEnd = contentStart + l.content.content.size;
      if (group) {
        tr.insert(l.containerPos + 1 + l.content.nodeSize + 1, line);
      } else {
        tr.insert(l.containerPos + l.container.nodeSize - 1, nodes.blockGroup.create(null, line));
      }
      if (contentEnd > contentStart + cut) tr.delete(contentStart + cut, contentEnd);
    } else {
      // An empty line below this one, in the same column.
      const line = nodes.blockContainer.create({ id }, type.create(null));
      tr.insert(l.containerPos + l.container.nodeSize, line);
    }
  });
  editor.setTextCursorPosition(id, 'start');
  return true;
}
