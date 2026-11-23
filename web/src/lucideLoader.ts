import { useEffect, useReducer } from 'react';
import type { LucideIcon } from 'lucide-react';

// The curated Lucide set for page icons (lucideSet.ts, ~380 icons) costs about
// 31 KB gzip. In the main bundle it left the app 0.9 KB under its size cap
// (web/tokens/budgets.json), so it is a chunk of its own, loaded the way
// mdiLoader.ts loads the MDI set. Unlike MDI, almost every workspace shows a
// Lucide icon somewhere, so the load starts as soon as this module is imported
// rather than at the first icon: it runs beside the app's own start-up and is
// usually in before the sidebar draws. Until then an icon keeps its place as
// an empty box of its size, so nothing jumps when it lands.

let SET: Record<string, LucideIcon> | null = null;
let NAMES: string[] = [];
let loading: Promise<void> | null = null;
const subscribers = new Set<() => void>();

export function loadLucide(): Promise<void> {
  if (SET) return Promise.resolve();
  if (!loading) {
    loading = import('./lucideSet')
      .then((m) => {
        SET = m.LUCIDE_SET;
        NAMES = m.LUCIDE_NAMES;
        subscribers.forEach((f) => f());
      })
      .catch(() => {
        loading = null; // allow a retry (e.g. after a flaky network)
      });
  }
  return loading;
}

export function lucideIcon(name: string): LucideIcon | undefined {
  return SET?.[name];
}

export function lucideNames(): string[] {
  return NAMES;
}

/** Subscribe to the Lucide set; true once it has loaded. */
export function useLucide(want: boolean): boolean {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!want || SET) return;
    subscribers.add(force);
    void loadLucide();
    return () => {
      subscribers.delete(force);
    };
  }, [want]);
  return SET !== null;
}

void loadLucide();
