// Moves the preferences a browser kept under salt.md's names to nigari's,
// once (spec 011, FR-007).
//
// The fork was salt.md until v2.0.0. A browser that used it holds the theme,
// the open tabs, the recent pages, the collapsed sidebar and the language in
// localStorage under `salt-…` keys. Read under new names only, all of that
// would silently reset on the first load of v2.0.0. So this runs once per load,
// before anything else reads storage: main.tsx imports it first, ahead of
// i18n.ts, which reads its cache when it loads, and ahead of the first render.
//
// A value moves only when its new key is still empty, so running twice changes
// nothing and a value set under the new name always wins. The old key goes
// either way. This is the one place in the frontend that names the old keys
// (check-names.mjs allows them here).

/** Whole keys: old → new. */
export const MOVED_KEYS: Record<string, string> = {
  'salt-ws': 'nigari-ws',
  'salt-notes-mode': 'nigari-notes-mode',
  'salt-tabs': 'nigari-tabs',
  'salt-sidebar-collapsed': 'nigari-sidebar-collapsed',
  'salt-theme': 'nigari-theme',
  'salt-font': 'nigari-font',
  'salt-recents': 'nigari-recents',
  'salt-prefs': 'nigari-prefs',
  'salt-comments-open': 'nigari-comments-open',
  'salt-structure-open': 'nigari-structure-open',
};

/** Key families: every key under an old prefix moves to the new prefix. */
export const MOVED_PREFIXES: Record<string, string> = {
  'salt-update-seen-': 'nigari-update-seen-',
  'salt-sec-': 'nigari-sec-',
  'salt:ui:': 'nigari:ui:',
};

/** Already replaced before the rename: removed, not moved. The per-page view
 *  and scroll keys were superseded by the per-account store (pageUiState.ts);
 *  salt-locale by the settings cache (i18n.ts), and is carried into it when
 *  that cache is empty, as i18n.ts did before. */
export const LEGACY_PREFIXES = ['salt:view:', 'salt:scroll:', 'salt:hscroll:'];
const LEGACY_LOCALE = 'salt-locale';

type Store = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

/** Moves every old key in `store`; returns how many old keys it handled. */
export function moveStorage(store: Store): number {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k !== null) keys.push(k);
  }
  let handled = 0;
  const move = (from: string, to: string) => {
    const value = store.getItem(from);
    if (value !== null && store.getItem(to) === null) store.setItem(to, value);
    store.removeItem(from);
    handled++;
  };
  for (const k of keys) {
    if (k in MOVED_KEYS) {
      move(k, MOVED_KEYS[k]);
      continue;
    }
    const prefix = Object.keys(MOVED_PREFIXES).find((p) => k.startsWith(p));
    if (prefix) {
      move(k, MOVED_PREFIXES[prefix] + k.slice(prefix.length));
    } else if (LEGACY_PREFIXES.some((p) => k.startsWith(p))) {
      store.removeItem(k);
      handled++;
    }
  }
  // After the whole keys, so a salt-prefs that moved wins over salt-locale.
  const locale = store.getItem(LEGACY_LOCALE);
  if (locale !== null) {
    if (store.getItem('nigari-prefs') === null) store.setItem('nigari-prefs', JSON.stringify({ language: locale }));
    store.removeItem(LEGACY_LOCALE);
    handled++;
  }
  return handled;
}

try {
  moveStorage(localStorage);
} catch {
  /* private mode or blocked storage: there is nothing to move then either */
}
