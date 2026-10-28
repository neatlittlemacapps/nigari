import type { ReactElement, ReactNode } from 'react';
import { Popover as BasePopover } from '@base-ui/react/popover';
import './Popover.css';

// A panel anchored to the control that opened it, for settings that apply at
// once while the screen behind stays in view (spec 004: a chart's settings,
// where the chart redraws beside the panel). Base UI's Popover gives the
// anchoring, Escape, a click outside and the focus handling.
//
// Focus is trapped while it is open ('trap-focus') but the page is not made
// inert: the chart behind must keep drawing, and a click on it closes the
// panel like any click outside. Base UI needs a Close inside the popup so a
// touch screen reader can always leave; it is visually hidden, since Escape
// and a click outside are the ways a pointer or keyboard leaves.
//
// A Select inside the panel opens its list in a portal of its own; Base UI
// counts it as part of the panel, so picking an option does not close it.

export type PopoverProps = {
  /** The control that opens the panel, rendered as the trigger. */
  trigger: ReactElement;
  /** The panel's accessible name, already translated. */
  label: string;
  /** The hidden close button's name, already translated. */
  closeLabel: string;
  children: ReactNode;
  /** Controlled use: omit both to let the trigger open and close it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  className?: string;
};

export function Popover({ trigger, label, closeLabel, children, open, onOpenChange, side = 'bottom', align = 'end', className }: PopoverProps) {
  return (
    <BasePopover.Root open={open} onOpenChange={onOpenChange ? (o) => onOpenChange(o) : undefined} modal="trap-focus">
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal>
        <BasePopover.Positioner className="ui-popover-positioner" side={side} align={align} sideOffset={6} collisionPadding={8}>
          <BasePopover.Popup className={'ui-popover' + (className ? ' ' + className : '')} aria-label={label}>
            {children}
            <BasePopover.Close className="ui-popover-close">{closeLabel}</BasePopover.Close>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
