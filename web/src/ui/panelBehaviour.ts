import { useEffect, useRef, type RefObject } from 'react';
import { FOCUSABLE, trapStep } from '../modalKeys';

// What the peek panels share (spec 007): SidePanel beside the page and
// CenterPanel over it. Kept out of both so the two cannot drift apart on the
// keys a person learns once.
//
//   - focus moves into the panel when it opens, and back to whatever opened it
//     when it closes, if that is still on the page;
//   - Escape closes it, unless something on top of it wants the key first (a
//     menu, a dialog, a confirmation) or focus is in a text field, where the
//     first Escape leaves the field and the second closes the panel. Typing
//     is never one stray key away from losing the panel;
//   - CenterPanel alone keeps Tab inside it, because the page behind it is
//     dimmed and out of reach. It does that itself instead of joining the
//     modal coordinator: a coordinated modal closes every other modal when
//     one opens, and the page inside a peek opens its own (history, share).

// Something drawn over the panel that owns the keys while it is open. Read
// off the DOM, as modal.ts does: these do not register anywhere, and asking
// each of them to would be the per-component opt-in that went wrong for #134.
const ON_TOP =
  '.modal-overlay, [role="alertdialog"], [aria-modal="true"], .fs-backdrop, [role="menu"], [role="listbox"], .bn-suggestion-menu';

/** True while something other than `self` is drawn on top and owns the keys.
 *  Only what is on screen counts: a closed Select keeps its listbox mounted
 *  and hidden, and that must not swallow every Escape after it. */
export function somethingOnTop(self: Element | null): boolean {
  return Array.from(document.querySelectorAll(ON_TOP)).some(
    (el) => el !== self && !(self && el.contains(self)) && el.getClientRects().length > 0,
  );
}

function isTextField(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !['checkbox', 'radio', 'button', 'submit'].includes(el.type);
  return false;
}

/** Focus in on open, back to the opener on close. */
export function usePanelFocus(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      const panel = ref.current;
      if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      const active = document.activeElement;
      const lost = !active || active === document.body || !document.contains(active);
      if (opener && opener.isConnected && (lost || ref.current?.contains(active))) {
        opener.focus({ preventScroll: true });
      }
    };
    // Once per opening: the ref's element does not change while mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Escape: leave a text field first, then close. With `trap`, Tab also stays
 *  inside the panel. */
export function usePanelKeys(ref: RefObject<HTMLElement | null>, onClose: () => void, trap = false): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const panel = ref.current;
      if (!panel || somethingOnTop(panel)) return;
      const active = document.activeElement;
      if (e.key === 'Escape') {
        if (active && panel.contains(active) && isTextField(active)) {
          e.preventDefault();
          panel.focus({ preventScroll: true });
          return;
        }
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (!trap || e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0,
      );
      const index = active instanceof HTMLElement ? items.indexOf(active) : -1;
      // Inside the panel but on something the list does not hold (the panel
      // itself, a node inside the editor): let the browser move on from there.
      if (index < 0 && active && panel.contains(active) && active !== panel) return;
      const next = trapStep(index, items.length, e.shiftKey);
      if (next === null) return;
      e.preventDefault();
      items[next].focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trap]);
}
