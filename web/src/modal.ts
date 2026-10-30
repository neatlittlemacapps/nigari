import { useEffect, useRef } from 'react';
import { escapeTarget, FOCUSABLE, trapStep } from './modalKeys';

// Global single-modal coordinator. Every modal calls useExclusiveModal(onClose)
// on mount: it announces itself on the "nigari:modal" event (which closes any
// other open modal and collapses the sidebar drawer via App's listener) and
// closes itself when a *different* modal announces. Confirm/prompt dialogs
// (DialogHost) deliberately do NOT participate, so a confirmation can layer on
// top of an open modal.

export function announceModal(): symbol {
  const id = Symbol('modal');
  window.dispatchEvent(new CustomEvent('nigari:modal', { detail: id }));
  return id;
}

type ModalOptions = {
  /** false when the modal closes on Escape by itself (the search palette, the
   *  file preview, the registry-driven sheets). It still counts as the top
   *  modal, so the press cannot fall through to anything below it. */
  escape?: boolean;
  /** false when something else already traps and returns focus: ui/Dialog,
   *  which gets both from Base UI. */
  focus?: boolean;
};

type OpenModal = { escape: boolean; focus: boolean; close: () => void; panel: Element | null };

// Open modals, oldest first. Usually one, since opening a modal closes the
// others, but a modal can open while another is still closing.
const stack: OpenModal[] = [];
let listening = false;

/** True while a confirmation (DialogHost) or an AlertDialog sits on top of
 *  every modal. Neither joins the coordinator, on purpose (see above), so they
 *  are found in the DOM. Escape and Tab belong to them then. */
function covered(): boolean {
  return !!document.querySelector('.confirm-dialog, [role="alertdialog"]');
}

function visible(el: HTMLElement): boolean {
  return el.offsetParent !== null || el.getClientRects().length > 0;
}

// Bubble phase on window, so it runs LAST: a menu, a picker or a popover
// inside the modal that handles Escape itself and stops it (the schema
// editor's option popover) or marks it handled (useMenuDismiss, DialogHost)
// closes alone, and only an Escape nobody wanted closes the modal.
function onModalKey(e: KeyboardEvent) {
  if (e.defaultPrevented || e.isComposing) return;
  if (e.key === 'Escape') {
    const top = escapeTarget(stack, covered());
    if (!top) return;
    e.preventDefault();
    top.close();
    return;
  }
  if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return;
  const top = stack[stack.length - 1];
  if (!top || !top.focus || !top.panel || covered()) return;
  const items = Array.from(top.panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible);
  const active = document.activeElement as HTMLElement | null;
  const index = active ? items.indexOf(active) : -1;
  // Inside the panel but on something the list does not name (the panel
  // itself, a rich text field's inner node): the browser's next stop is
  // inside the panel anyway.
  if (index < 0 && active && top.panel.contains(active)) return;
  const next = trapStep(index, items.length, e.shiftKey);
  if (next === null) return;
  e.preventDefault();
  items[next].focus();
}

/** The panel of the modal that just mounted: the newest overlay that is not a
 *  confirmation. Read off the DOM for the same reason as modalOpen() below —
 *  every modal here already renders a .modal-overlay, and asking each of them
 *  for a ref is the per-modal opt-in that went wrong for Escape. */
function newestPanel(): Element | null {
  const overlays = Array.from(document.querySelectorAll('.modal-overlay')).filter(
    (o) => !o.querySelector('.confirm-dialog'),
  );
  const overlay = overlays[overlays.length - 1];
  if (!overlay) return null;
  return overlay.querySelector('[aria-modal="true"], .dialog') ?? overlay;
}

// The last few elements that had focus. A modal opened from a menu item
// mounts after the item is gone, so "what had focus" is already nothing by
// then; the newest of these that is still on the page is what opened it, in
// practice the menu's own button.
const recentFocus: HTMLElement[] = [];
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    recentFocus.push(e.target);
    if (recentFocus.length > 8) recentFocus.shift();
  });
}

function focusBefore(): HTMLElement | null {
  const active = document.activeElement;
  // Not something inside a modal: an autoFocus field has focus before this
  // runs, and it is about to disappear with the modal.
  if (active instanceof HTMLElement && active !== document.body && !active.closest('.modal-overlay')) return active;
  for (let i = recentFocus.length - 1; i >= 0; i--) {
    const el = recentFocus[i];
    if (el.isConnected && !el.closest('.modal-overlay')) return el;
  }
  return null;
}

export function useExclusiveModal(onClose: () => void, options: ModalOptions = {}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const escape = options.escape !== false;
  const focus = options.focus !== false;
  useEffect(() => {
    const myId = announceModal();
    const onOther = (e: Event) => {
      if ((e as CustomEvent<symbol>).detail !== myId) closeRef.current();
    };
    window.addEventListener('nigari:modal', onOther);

    // Where focus was before the modal took it, to put it back on close.
    const returnTo = focusBefore();
    const entry: OpenModal = {
      escape,
      focus,
      close: () => closeRef.current(),
      panel: focus ? newestPanel() : null,
    };
    stack.push(entry);
    if (!listening) {
      window.addEventListener('keydown', onModalKey);
      listening = true;
    }
    // Into the modal, unless the modal already put focus somewhere in it (a
    // search box, a name field): those focus in their own effect or a frame
    // later, so look a frame later too.
    const frame = requestAnimationFrame(() => {
      const panel = entry.panel;
      if (!(panel instanceof HTMLElement) || panel.contains(document.activeElement)) return;
      if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
      panel.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('nigari:modal', onOther);
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      // Back where it came from, but only if nothing else has taken focus
      // since: a modal that navigates (search, a template) hands focus to the
      // page it opened, and pulling it back would undo that.
      if (!focus || !returnTo || !returnTo.isConnected) return;
      const now = document.activeElement;
      if (!now || now === document.body || (entry.panel && entry.panel.contains(now))) {
        returnTo.focus({ preventScroll: true });
      }
    };
    // Options are read once, at mount: a modal does not change its nature
    // while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Dropdown menus (⋯, share, workspace, tag colours, tree context) used to close
// only on mouse-leave, so clicking elsewhere left them hanging open — and on
// touch there is no leave event at all. useMenuDismiss closes on an outside
// pointer-down and on Escape. Pass the menu's wrapper ref; clicks INSIDE the
// wrapper (including the toggle button) are ignored so the button keeps its own
// toggle behaviour.
export function useMenuDismiss(
  open: boolean,
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Handled: the modal this menu sits in must not close on the same press.
      e.preventDefault();
      closeRef.current();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, ref]);
}

/** True while something modal is covering the app.
 *
 *  Read off the DOM rather than kept in a counter, and on purpose: every modal
 *  in this codebase renders a `.modal-overlay` (most also mark the panel
 *  inside it `aria-modal`), including the confirm/prompt dialogs that
 *  deliberately stay out of the coordinator above. A counter would have to be
 *  opted into one modal at a time, and the one that forgot would be the one
 *  that misbehaves — whereas a query is right for every modal that already
 *  looks like a modal, including the next one somebody writes.
 *
 *  What it is for: shortcuts that MOVE FOCUS in the application behind the
 *  modal (the arrow keys entering the sidebar) must do nothing while a modal
 *  owns the screen. */
export function modalOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector('.modal-overlay, [aria-modal="true"]');
}
