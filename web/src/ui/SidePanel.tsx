import { useRef, type ReactNode } from 'react';
import { usePanelFocus, usePanelKeys } from './panelBehaviour';
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
// Focus and Escape behave as in CenterPanel; both come from panelBehaviour.ts.

export type SidePanelProps = {
  /** The panel's accessible name, already translated. */
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

export function SidePanel({ label, onClose, children, className }: SidePanelProps) {
  const ref = useRef<HTMLElement>(null);
  usePanelFocus(ref);
  usePanelKeys(ref, onClose);

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
