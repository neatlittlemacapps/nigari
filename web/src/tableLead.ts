// Which checkbox leads a table, and how its columns move around it
// (owner, 2026-11-22).
//
// The first checkbox a table view shows is drawn before Name, as narrow as its
// box, so rows can be ticked off down the side of the table. It keeps its
// place in the view's stored column order; only the drawing moves it. So the
// other columns move among themselves (a drag, Move left/right, Hide), and the
// lead is put back where it was before the new order is saved. Moving it in
// the stored order would change nothing on screen and surprise whoever opens
// the same view on a database without that rule.

/** The checkbox that leads, among the columns a view shows, in their order. */
export function leadCheckbox<T extends { type: string }>(columns: T[]): T | undefined {
  return columns.find((c) => c.type === 'checkbox');
}

/** The columns that move among themselves: every one but the lead. */
export function movableColumns(ids: string[], leadId: string | undefined): string[] {
  return leadId === undefined ? ids : ids.filter((id) => id !== leadId);
}

/** A new order of the movable columns, with the lead back at the index it had
 *  in the order before (or at the end when that index is past it). */
export function withLead(next: string[], leadId: string | undefined, before: string[]): string[] {
  if (leadId === undefined) return next;
  const at = before.indexOf(leadId);
  if (at < 0) return next;
  const out = next.filter((id) => id !== leadId);
  out.splice(Math.min(at, out.length), 0, leadId);
  return out;
}
