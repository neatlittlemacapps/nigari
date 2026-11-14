// Reads the note usePersonalViews writes when a page leaves with an edit unsent
// (viewStateOutbox.ts, #594). Pure, and apart from the code that sends, so a
// check can run it without the browser.

import type { PersonalViewState } from './viewState';

/** How long a note waits for the next open of its database. */
export const OUTBOX_TTL_MS = 60_000;

/** What the note says to send, or nothing: it is stale (older than a minute),
 *  unreadable, or of another shape. */
export function parseOutbox(raw: string | null, now: number): [string, PersonalViewState | null][] {
  try {
    const note = JSON.parse(raw ?? 'null');
    if (!(now - note.at < OUTBOX_TTL_MS) || !Array.isArray(note.items)) return [];
    return note.items.filter((i: unknown) => Array.isArray(i) && typeof i[0] === 'string');
  } catch {
    return [];
  }
}
