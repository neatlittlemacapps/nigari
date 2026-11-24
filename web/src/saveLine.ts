// A database's config saves, sent one at a time (#530).
//
// Each save sends the whole views array. Sent side by side, two quick changes
// (three properties ticked off in Settings › Property visibility) could reach
// the server out of order, and a refused first save put the screen back to
// the state from before it, undoing the second and third on screen while the
// server kept the third. Here a save waits for the one in flight; the changes
// made meanwhile go together in the next request, the later key winning. A
// refusal also drops the waiting ones: they hold the refused change too.
// The caller then shows what the server last took (`onRefused`).

export interface SaveLine<P> {
  /** Resolves true once the server took this change, false when it or the
   *  save it waited on was refused. */
  save: (patch: P) => Promise<boolean>;
}

export function saveLine<P extends object>(
  send: (patch: P) => Promise<unknown>,
  onSaved: (patch: P) => void,
  onRefused: (e: unknown) => void,
): SaveLine<P> {
  let busy = false;
  let waiting: { patch: P; done: ((ok: boolean) => void)[] } | null = null;

  const run = async (patch: P, done: ((ok: boolean) => void)[]) => {
    busy = true;
    let ok = true;
    try {
      await send(patch);
      onSaved(patch);
    } catch (e) {
      ok = false;
      const dropped = waiting;
      waiting = null;
      for (const d of dropped?.done ?? []) d(false);
      onRefused(e);
    }
    for (const d of done) d(ok);
    const next = waiting;
    waiting = null;
    busy = false;
    if (next) void run(next.patch, next.done);
  };

  return {
    save: (patch) =>
      new Promise<boolean>((resolve) => {
        if (!busy) {
          void run(patch, [resolve]);
          return;
        }
        waiting = {
          patch: { ...waiting?.patch, ...patch } as P,
          done: [...(waiting?.done ?? []), resolve],
        };
      }),
  };
}
