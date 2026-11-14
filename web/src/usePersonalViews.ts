import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { t } from './i18n';
import { toast } from './toast';
import type { PersonalViewState } from './viewState';
import { outboxKey } from './viewStateOutbox';

// How long a filter or sort edit waits before it is sent: typing a filter
// value is many edits, and each PUT carries the whole state.
const SAVE_DELAY = 400;

/** A person's own view states for one database (spec 013, US1): loaded once
 *  when the database opens, changed here at once and stored a moment later.
 *
 *  Here and not in CollectionView, which is over 1,400 lines (frontend
 *  rules). The state lives on the account, so it follows the person to another
 *  device (research R2). The browser's storage holds only what a page that is
 *  going away still owes the server, for a minute (viewStateOutbox.ts, #594).
 *
 *  Until the first answer the view draws as shared (research R2): the rows
 *  are not held back by this request. Someone with their own filter sees the
 *  shared rows for a moment, then theirs. */
export function usePersonalViews(collectionId: string) {
  const [states, setStates] = useState<Record<string, PersonalViewState>>({});
  // Scopes changed here since the load started: the answer of a load must
  // not put back what the person has just edited.
  const touched = useRef(new Set<string>());
  const pending = useRef(new Map<string, { timer: number; state: PersonalViewState | null }>());

  const send = useCallback(
    (scope: string, state: PersonalViewState | null) => {
      const done = state ? api.putViewState(collectionId, scope, state) : api.deleteViewState(collectionId, scope);
      done.catch(() => toast(t('Your change to this view was not saved')));
    },
    [collectionId],
  );

  // What is still waiting when the page goes away (a reload, a closed tab, a
  // link to another page): sent with keepalive, which the browser finishes
  // after the page is gone. An ordinary request is cancelled with the page,
  // and the edit of the last 400 ms was lost (found by embeds.mjs: a reload
  // right after removing a filter brought the filter back).
  //
  // The browser does not always finish that request: after a reload straight
  // after an edit it never reached the server about half the time (#594). So
  // the same edit is also noted in the browser's storage, and the next open of
  // this database sends it again (below).
  const flushWaiting = useCallback(() => {
    if (pending.current.size) {
      try {
        window.localStorage.setItem(outboxKey(collectionId), JSON.stringify({ at: Date.now(), items: [...pending.current].map(([k, p]) => [k, p.state]) }));
      } catch {
        // Storage switched off or full: the keepalive request is what there is.
      }
    }
    for (const [scope, p] of pending.current) {
      window.clearTimeout(p.timer);
      const done = p.state ? api.putViewState(collectionId, scope, p.state, true) : api.deleteViewState(collectionId, scope, true);
      // Nobody is left to tell when the page is gone.
      done.catch(() => {});
    }
    pending.current.clear();
  }, [collectionId]);

  // Also when the page goes to the background (another tab, the phone's home
  // screen): a hidden page's timers are slowed or stopped, so the 400 ms
  // wait could last until the person came back, and on a phone the page may
  // be closed from the background without a pagehide (quick-filters.mjs
  // found the first: a pick in a page that was not in front was not stored).
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flushWaiting();
    };
    window.addEventListener('pagehide', flushWaiting);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', flushWaiting);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [flushWaiting]);

  useEffect(() => {
    let live = true;
    touched.current = new Set();
    setStates({});
    api
      .getViewStates(collectionId)
      .then((r) => {
        if (!live) return;
        setStates((cur) => {
          const next = { ...(r.states ?? {}) };
          for (const scope of touched.current) {
            if (scope in cur) next[scope] = cur[scope];
            else delete next[scope];
          }
          return next;
        });
      })
      // Not signed in the usual way, or the request failed: the shared view.
      .catch(() => {});
    // What the last page left unsent here (viewStateOutbox.ts) is sent again by
    // code loaded only when a note exists.
    try {
      if (window.localStorage.getItem(outboxKey(collectionId))) {
        void import('./viewStateReplay').then((m) => m.replayOutbox(collectionId, touched.current, setStates, () => live));
      }
    } catch {
      /* storage switched off */
    }
    return () => {
      live = false;
      // Leaving the database (another page, another database here): what is
      // still waiting is sent now.
      flushWaiting();
    };
  }, [collectionId, flushWaiting]);

  /** Sets (or with null, removes) the state of one scope. */
  const setState = useCallback(
    (scope: string, state: PersonalViewState | null) => {
      touched.current.add(scope);
      setStates((cur) => {
        const next = { ...cur };
        if (state) next[scope] = state;
        else delete next[scope];
        return next;
      });
      const waiting = pending.current.get(scope);
      if (waiting) window.clearTimeout(waiting.timer);
      const timer = window.setTimeout(() => {
        pending.current.delete(scope);
        send(scope, state);
      }, SAVE_DELAY);
      pending.current.set(scope, { timer, state });
    },
    [send],
  );

  return { states, setState };
}
