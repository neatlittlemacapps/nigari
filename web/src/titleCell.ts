// What a click on a table row's name does (spec 026, D1). The name cell used
// to be one button that opened the row, so renaming a row meant opening it,
// editing its title and coming back (#981). Now an editor's click renames it
// in place and an Open button beside the name opens it.
//
// The order matters: ⌘/Ctrl or the middle button is a request for a new tab,
// which a reader and an editor both make, so it comes first; then a reader,
// who may not rename, opens the row as before; only then does an editor edit.
// Enter on the focused name is a plain click (owner's Q1 = A), and a double
// click is two plain clicks (Q2 = A), so neither needs a rule of its own.

export type TitleClick = 'edit' | 'open' | 'new_tab';

export function titleClick(e: { canEdit: boolean; metaKey?: boolean; ctrlKey?: boolean; button?: number }): TitleClick {
  if (e.metaKey || e.ctrlKey || e.button === 1) return 'new_tab';
  return e.canEdit ? 'edit' : 'open';
}
