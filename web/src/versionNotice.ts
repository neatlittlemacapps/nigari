// When to say "a new version is available" (issue #923).
//
// The server's version reaches the tab twice: in /api/me when the app starts,
// and in the `hello` that opens every live-updates connection. That connection
// is rebuilt often — the 60-second silence watchdog (a phone in the
// background, a sleeping laptop, a tunnel dropping the stream), and every Sync
// or pull-to-refresh, which refetch data but do not reload the page. The flag
// that was meant to stop a repeat lived inside the effect that builds the
// connection, so each rebuild reset it, and a window one release behind said
// the same thing again and again. On a day with several releases, an open
// window is nearly always behind.
//
// So the memory lives here, at module level, outside every effect: one notice
// per server version per page load. Deliberately NOT sessionStorage: a reload
// that still lands on the old build (the service worker's offline shell, a
// stale proxy, a reload in the middle of a deploy) has not fixed anything and
// should hear it again, and a duplicated tab, which copies sessionStorage,
// should hear it too. A NEW server version is announced as well: that is new
// information.

/** Where "already announced for version X" is kept. */
export interface NoticeMemory {
  get(): string | null;
  set(version: string): void;
}

let announced: string | null = null;

/** This page load's memory. */
export const loadMemory: NoticeMemory = {
  get: () => announced,
  set: (version) => {
    announced = version;
  },
};

/** True exactly once per server version that differs from this build, and
 *  records that it said so. Empty or equal versions never announce. */
export function shouldAnnounce(
  serverVersion: string | undefined | null,
  buildVersion: string,
  memory: NoticeMemory = loadMemory,
): boolean {
  if (!serverVersion || serverVersion === buildVersion) return false;
  if (memory.get() === serverVersion) return false;
  memory.set(serverVersion);
  return true;
}
