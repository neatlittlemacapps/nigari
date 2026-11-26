import { useSyncExternalStore } from 'react';

// Titles saved somewhere other than the page's own header, for any header
// showing that page right now (spec 026, review). A row renamed in its table
// cell while it was open in the peek beside the table kept its old title in
// the peek, and the next keystroke there saved the old one back. The list of
// pages App keeps is live, but it leaves database rows out (they can number
// in the tens of thousands), so a row's header cannot follow it: the table
// says so here instead.

const titles = new Map<string, string>();
const listeners = new Set<() => void>();

/** A page's title was saved from elsewhere. */
export function announceTitle(id: string, title: string): void {
  titles.set(id, title);
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The last title announced for a page, if any. */
export function useAnnouncedTitle(id: string): string | undefined {
  return useSyncExternalStore(subscribe, () => titles.get(id));
}
