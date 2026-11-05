// Which page to show when there is none to keep: the open page was trashed,
// nothing is open yet, or the person switched workspaces (#571).
//
// The fallback used to look at every workspace's pages. Trashing the last page
// of one workspace then opened a page of another, while the sidebar said "No
// pages yet": the empty state that invites the first page was never reached
// while any other workspace had pages. Both callers (App's fallback effect and
// switchWorkspace) now ask this one function, so they cannot drift again.

export interface FallbackPage {
  id: string;
  parentId?: string | null;
  workspaceId: string;
  trashed: boolean;
}

/**
 * The page to land on in workspace `ws`, or null for its empty state.
 * Prefers a still-open tab of that workspace (other than `leaving`, the page
 * being left), so trashing the active page lands beside it; then the
 * workspace's first top-level page; then any of its pages.
 * An empty `ws` (workspaces not loaded yet) does not narrow the search.
 */
export function fallbackPage(
  pages: readonly FallbackPage[],
  ws: string,
  openTabs: readonly string[] = [],
  leaving: string | null = null,
): string | null {
  const inWs = (p: FallbackPage) => !p.trashed && (!ws || p.workspaceId === ws);
  const byId = new Map(pages.map((p) => [p.id, p]));
  const tab = openTabs.find((id) => {
    const p = byId.get(id);
    return !!p && inWs(p) && id !== leaving;
  });
  if (tab) return tab;
  const first = pages.find((p) => inWs(p) && !p.parentId) ?? pages.find(inWs);
  return first ? first.id : null;
}
