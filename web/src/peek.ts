// What a click on a database row does (spec 007, research R3).
//
// A view can open its rows as a full page (the tab navigates, as it always
// did) or in a peek beside the view. Several things decide the answer — the
// click's modifier keys, the view's setting, the account's "Open rows in new
// tab", the width of the screen — and every row opener in every kind of view
// has to give the same answer. So the decision lives here, pure, with a check
// beside it (scripts/check-peek.mjs) instead of in the components.
//
// The rules, in the order they apply:
//   1. ⌘/Ctrl or the middle button always opens a new tab, as in a browser.
//   2. A view on full page keeps today's behaviour, including the account's
//      "Open rows in new tab". Views saved before this feature are full page.
//   3. A view on a peek beats the account preference: somebody chose the peek
//      for this view on purpose.
//   4. On a narrow screen there is no room beside the view, so a side peek
//      opens as a centre peek, which fills the screen.

export type ViewOpenIn = 'side_peek' | 'center_peek' | undefined;
export type RowOpenAction = 'navigate' | 'new_tab' | 'side' | 'center';
/** How a peek is drawn: beside the page or over it. */
export type PeekMode = 'side' | 'center';

/** Flipped by the centre peek's follow-up (spec 007, phase 7), together with
 *  `centerPeekShipped` in server/viewopen.go. */
export const CENTER_PEEK_SHIPPED = true;

export function rowOpenAction(
  click: { metaKey?: boolean; ctrlKey?: boolean; middle?: boolean },
  openIn: ViewOpenIn | string,
  newTabPreferred: boolean,
  wide: boolean,
  centerShipped: boolean = CENTER_PEEK_SHIPPED,
): RowOpenAction {
  if (click.metaKey || click.ctrlKey || click.middle) return 'new_tab';
  if (openIn === 'side_peek') {
    if (wide) return 'side';
    return centerShipped ? 'center' : 'navigate';
  }
  if (openIn === 'center_peek' && centerShipped) return 'center';
  // Full page, a missing setting, or a value this build does not know (a
  // newer server, or centre peek before it ships): today's behaviour.
  return newTabPreferred ? 'new_tab' : 'navigate';
}

/** The width from which the app lays out as a desktop (App.tsx uses the same
 *  query for the sidebar), and so from which a side peek has room. */
export const WIDE_QUERY = '(min-width: 901px)';
