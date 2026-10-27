// How a link to a page opens, wherever it is clicked — a row in a table, a card
// on a board, a note in the notes column. It is the sidebar's rule, in one
// place so no view can spell it differently: a plain click navigates the tab
// you are in (the way a browser tab works), while ⌘-click (Ctrl-click on
// Windows and Linux) and the middle button add a tab beside the active one.
//
// `onOpenInNewTab` is optional because a view can be rendered without one — an
// embedded collection reaches it through the editor's context, but a bare
// component in a test may not. Plain navigation is then the honest fallback.

import { createContext, useCallback, useContext } from 'react';
import { getPrefs } from './i18n';
import { rowOpenAction, WIDE_QUERY, type ViewOpenIn } from './peek';

export type PageOpeners = {
  onNavigate: (id: string) => void;
  onOpenInNewTab?: (id: string) => void;
};

const open = (id: string, o: PageOpeners) => (o.onOpenInNewTab ?? o.onNavigate)(id);

/** A click, with or without ⌘/Ctrl. */
export function openPage(
  e: { metaKey?: boolean; ctrlKey?: boolean },
  id: string,
  o: PageOpeners,
): void {
  if (e.metaKey || e.ctrlKey) open(id, o);
  else o.onNavigate(id);
}

/** The middle button, which a browser reports on `auxclick` — as every button
 *  but the left one — rather than as a `click`. */
export function openPageAux(
  e: { button?: number; preventDefault: () => void },
  id: string,
  o: PageOpeners,
): void {
  if (e.button !== 1) return;
  e.preventDefault();
  open(id, o);
}

// ---- collection rows ----

// Rows follow the sidebar rule: a plain click navigates the current tab,
// ⌘/Ctrl (or the middle button) adds a tab beside it. The account can opt
// into always opening rows in a new tab instead (server prefs, default off);
// the modifier then changes nothing, exactly as in a browser.
//
// A view can choose a peek instead (spec 007): the row opens beside the view.
// What a click does is decided in peek.ts, one rule for every kind of view.
export const collectionRowNewTab = (): boolean => getPrefs().openRowsNewTab === 'on';

/** The view whose rows are being clicked: its open setting and the way to
 *  open a peek. CollectionView provides it around the view it renders, so the
 *  table, the board, the list, the gallery, the calendar and the timeline all
 *  read the same answer without each passing it down. */
export type RowOpenCtx = { openIn?: ViewOpenIn | string; onPeek?: (id: string) => void };
export const RowOpenContext = createContext<RowOpenCtx>({});

const wideScreen = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(WIDE_QUERY).matches;

/** A click on a collection row, with or without ⌘/Ctrl. */
export function openCollectionRow(
  e: { metaKey?: boolean; ctrlKey?: boolean },
  id: string,
  o: PageOpeners,
  view: RowOpenCtx = {},
): void {
  const action = rowOpenAction(e, view.openIn, collectionRowNewTab(), wideScreen());
  if ((action === 'side' || action === 'center') && view.onPeek) view.onPeek(id);
  else if (action === 'new_tab') open(id, o);
  else o.onNavigate(id);
}

/** openCollectionRow for the view this component is drawn in. */
export function useOpenRow(o: PageOpeners): (e: { metaKey?: boolean; ctrlKey?: boolean }, id: string) => void {
  const view = useContext(RowOpenContext);
  const { onNavigate, onOpenInNewTab } = o;
  return useCallback(
    (e, id) => openCollectionRow(e, id, { onNavigate, onOpenInNewTab }, view),
    [onNavigate, onOpenInNewTab, view],
  );
}
