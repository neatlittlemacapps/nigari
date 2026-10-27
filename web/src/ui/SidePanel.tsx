import { useEffect, useRef, type ReactNode } from 'react';
import './SidePanel.css';

// A panel beside the screen that keeps the screen usable (spec 007, research
// R6). The side peek is its first user: a database row opens here while the
// view it came from stays where it was.
//
// Deliberately NOT a dialog. A dialog makes everything behind it inert, and
// the point of a peek is that the view behind it is not: click the next row
// and the panel shows that one. So there is no focus trap and no backdrop; it
// overlays the right edge without moving the view's columns, which is also
// why the view's scroll position survives opening and closing it.
//
// What it does take care of:
//   - focus moves into the panel when it opens, and back to whatever opened it
//     when it closes, if that is still on the page;
//   - Escape closes it, unless something on top of it wants the key first (a
//     menu, a dialog, a confirmation) or focus is in a text field, where the
//     first Escape leaves the field and the second closes the panel. Typing
//     is never one stray key away from losing the panel.

export type SidePanelProps = {
  /** The panel's accessible name, already translated. */
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

// Something drawn over the panel that owns Escape while it is open. Read off
// the DOM, as modal.ts does: these do not register anywhere, and asking each
// of them to would be the per-component opt-in that went wrong for #134.
const ON_TOP =
  '.modal-overlay, [role="alertdialog"], [aria-modal="true"], .fs-backdrop, [role="menu"], [role="listbox"], .bn-suggestion-menu';

// Only what is on screen counts: a closed Select keeps its listbox mounted
// and hidden, and that must not swallow every Escape after it.
function somethingOnTop(): boolean {
  return Array.from(document.querySelectorAll(ON_TOP)).some((el) => el.getClientRects().length > 0);
}

function isTextField(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !['checkbox', 'radio', 'button', 'submit'].includes(el.type);
  return false;
}

export function SidePanel({ label, onClose, children, className }: SidePanelProps) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Focus in on open, back out on close.
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
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      if (somethingOnTop()) return;
      const panel = ref.current;
      const active = document.activeElement;
      if (panel && active && panel.contains(active) && isTextField(active)) {
        e.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      e.preventDefault();
      closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <aside
      ref={ref}
      className={'ui-side-panel' + (className ? ' ' + className : '')}
      aria-label={label}
      tabIndex={-1}
    >
      {children}
    </aside>
  );
}
