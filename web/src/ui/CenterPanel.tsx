import { useRef, type ReactNode } from 'react';
import { usePanelFocus, usePanelKeys } from './panelBehaviour';
import './CenterPanel.css';

// A panel over the middle of the screen, the page behind it dimmed (spec 007,
// the centre peek). It is modal: Tab stays inside, and a click on the dimmed
// page closes it.
//
// Not ui/Dialog, though it looks like one, and the reason is the page inside
// it. Dialog joins the modal coordinator (useExclusiveModal), which closes
// every other modal when one opens; the page in a peek opens its own (history,
// share), and each of them would have closed the peek that opened it. So this
// panel keeps focus in and handles Escape itself (panelBehaviour.ts), the same
// way SidePanel does, and anything the page opens draws over it: its layer
// sits under dialogs and menus.
//
// Being modal, it marks itself aria-modal, so the app's own focus-moving
// shortcuts (modalOpen() in modal.ts) stand down while it is open, as they do
// for any dialog.

export type CenterPanelProps = {
  /** The panel's accessible name, already translated. */
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

export function CenterPanel({ label, onClose, children, className }: CenterPanelProps) {
  const ref = useRef<HTMLElement>(null);
  usePanelFocus(ref);
  usePanelKeys(ref, onClose, true);

  return (
    <div
      className="ui-center-panel-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={'ui-center-panel' + (className ? ' ' + className : '')}
      >
        {children}
      </section>
    </div>
  );
}
