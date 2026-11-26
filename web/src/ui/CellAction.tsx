import type { MouseEvent, ReactNode } from 'react';
import { Button } from './Button';
import './CellAction.css';

// A small button at the end of a table cell, over the cell's text (spec 026):
// the table's Open button, Close while its row is in the peek. Built here and
// not as table CSS because the rules are a pattern every "act on this item"
// button in a cell or a card needs (plan D5): it shows while its host is
// hovered or holds the focus, always on a touch screen that cannot hover
// (there is no hover to reveal it), always when pinned, and never while the
// host edits. Shown or hidden is CSS, not state, so a table of thousands of
// rows adds no listener per row (SC-005).
//
// The host is the nearest ancestor with `data-cell-action-host` (the table
// row); `data-editing` on it hides the button. The button is placed in the
// nearest positioned ancestor (the cell), which the caller makes
// `position: relative`.

export type CellActionProps = {
  /** The word on the button, translated ("Open"). */
  children: ReactNode;
  /** Its accessible name, translated, saying which item it acts on ("Open
   *  Roadmap review"): every row's button reads the same word. */
  label: string;
  /** Always shown, whatever the pointer does (the row open in the peek). */
  pinned?: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  /** The middle button, which a browser reports as `auxclick`. */
  onAuxClick?: (e: MouseEvent<HTMLButtonElement>) => void;
};

export function CellAction({ children, label, pinned, onClick, onAuxClick }: CellActionProps) {
  return (
    <span className="ui-cell-action" data-pinned={pinned ? '' : undefined}>
      <Button size="xs" aria-label={label} onClick={onClick} onAuxClick={onAuxClick}>
        {children}
      </Button>
    </span>
  );
}
