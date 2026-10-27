// What Escape and Tab do inside a hand-built modal (#134). Pure on purpose, so
// scripts/check-modal.mjs can drive it without a browser; modal.ts applies it.
//
// Every hand-built modal used to decide its own keys, and 11 of 17 decided
// nothing: Escape did not close them, Tab walked out of them into the page
// behind, and closing one left focus on nothing. ui/Dialog gets all three from
// Base UI; this gives the rest the same behaviour until they move onto it
// (spec 001, batch 2).

/** What can take focus inside a modal. Disabled controls and tabindex="-1"
 *  are left out: Tab skips them in the browser too. */
export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], ' +
  '[tabindex]:not([tabindex="-1"])';

/** Where Tab should move focus, or null to let the browser move it.
 *
 *  `index` is the focused element's position among the modal's focusables,
 *  -1 when focus is outside the modal (or on its panel itself). Only the two
 *  edges and "outside" are taken over; everything in between is the browser's
 *  own Tab order, which already knows about radio groups and the like. */
export function trapStep(index: number, count: number, shift: boolean): number | null {
  if (count === 0) return null;
  if (index < 0) return shift ? count - 1 : 0;
  if (!shift && index === count - 1) return 0;
  if (shift && index === 0) return count - 1;
  return null;
}

export type ModalEntry = { escape: boolean };

/** Which modal Escape closes: the topmost, and only if it takes Escape from
 *  here. A modal below the top never closes on Escape, even when the top one
 *  handles the key itself — otherwise one press would close two dialogs.
 *  `covered` is true while a confirmation or an alert dialog sits above every
 *  modal; Escape belongs to that one then. */
export function escapeTarget<T extends ModalEntry>(stack: readonly T[], covered: boolean): T | null {
  if (covered) return null;
  const top = stack[stack.length - 1];
  return top && top.escape ? top : null;
}
