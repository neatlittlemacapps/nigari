// The peeked row lives in the address (spec 007, research R4):
// /p/<page>?peek=<row>. Back closes the peek, a reload or a copied link
// reopens it. App owns the address and the tab history; these are the few
// rules about the peek's part of it, kept out of App.tsx. A centre peek adds
// &as=center; a side peek, the common one, adds nothing.
//
// A history entry's state is App's tab snapshot ({ tabs, active }) plus
// `peek` (the row shown) and `peekPushed` (whether opening the peek added this
// entry). Only an entry the peek pushed may be left with Back when the peek
// closes; a peek that arrived with the page (a reload, a link) has no entry of
// its own to go back from, so closing it rewrites the address instead.

import type { PeekMode } from './peek';

const ID = /^[0-9a-f]+$/;

export type PeekState = {
  tabs?: string[];
  active?: string | null;
  peek?: string | null;
  peekMode?: PeekMode;
  peekPushed?: boolean;
};

/** The row shown, and how. */
export type Peek = { id: string; mode: PeekMode };

export function peekFromLocation(): Peek | null {
  const q = new URLSearchParams(window.location.search);
  const v = q.get('peek');
  if (!v || !ID.test(v)) return null;
  return { id: v, mode: q.get('as') === 'center' ? 'center' : 'side' };
}

export function pageUrl(id: string | null, peek?: Peek | null): string {
  if (!id) return '/';
  if (!peek) return `/p/${id}`;
  return `/p/${id}?peek=${peek.id}` + (peek.mode === 'center' ? '&as=center' : '');
}

/** Show `row` beside the active page. Switching from one peeked row to the
 *  next rewrites the entry rather than adding one, so Back always closes the
 *  peek instead of walking back through every row looked at. */
export function pushPeek(active: string, tabs: string[], peek: Peek): void {
  const st = (history.state ?? {}) as PeekState;
  const open = !!st.peek;
  const next: PeekState = { ...st, tabs, active, peek: peek.id, peekMode: peek.mode, peekPushed: open ? !!st.peekPushed : true };
  if (open) history.replaceState(next, '', pageUrl(active, peek));
  else history.pushState(next, '', pageUrl(active, peek));
}

/** Close the peek. Returns true when it went Back (the popstate handler then
 *  clears the peek), false when it rewrote the address in place. */
export function dropPeek(active: string | null): boolean {
  const st = (history.state ?? {}) as PeekState;
  if (st.peek && st.peekPushed) {
    history.back();
    return true;
  }
  history.replaceState({ ...st, peek: null, peekMode: undefined, peekPushed: false }, '', pageUrl(active, null));
  return false;
}

/** The peek a history entry shows: its own state, or the address for an entry
 *  with none (the very first load). */
export function peekOfEntry(state: unknown): Peek | null {
  const st = state as PeekState | null;
  if (st && Array.isArray(st.tabs)) return st.peek ? { id: st.peek, mode: st.peekMode ?? 'side' } : null;
  return peekFromLocation();
}
