// Reads back the note viewStateOutbox.ts wrote when a page left with an edit
// unsent (#594). Loaded only when a note exists, so the main bundle does not
// carry it.

import type { Dispatch, SetStateAction } from 'react';
import { api } from './api';
import { t } from './i18n';
import { toast } from './toast';
import { outboxKey } from './viewStateOutbox';
import { parseOutbox } from './viewStateNote';
import type { PersonalViewState } from './viewState';

/** Sends again what the last page left unsent for this database, and puts it on
 *  top of what the hook shows. It is the person's latest edit, so it goes over
 *  what the server answered; the same state sent twice changes nothing. The
 *  scopes are marked as touched, so the server's answer, which may come later and
 *  lacks them, does not put the old state back. */
export function replayOutbox(
  collectionId: string,
  touched: Set<string>,
  setStates: Dispatch<SetStateAction<Record<string, PersonalViewState>>>,
  stillHere: () => boolean,
): void {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(outboxKey(collectionId));
    window.localStorage.removeItem(outboxKey(collectionId));
  } catch {
    /* storage switched off */
  }
  const owed = parseOutbox(raw, Date.now());
  for (const [scope, state] of owed) {
    const again = state ? api.putViewState(collectionId, scope, state) : api.deleteViewState(collectionId, scope);
    again.catch(() => toast(t('Your change to this view was not saved')));
  }
  if (!owed.length || !stillHere()) return;
  for (const [scope] of owed) touched.add(scope);
  setStates((cur) => {
    const next = { ...cur };
    for (const [scope, state] of owed) {
      if (state) next[scope] = state;
      else delete next[scope];
    }
    return next;
  });
}
