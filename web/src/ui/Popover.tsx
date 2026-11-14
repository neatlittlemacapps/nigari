import type { ReactElement, ReactNode, RefObject } from 'react';
import type { PopoverRoot } from '@base-ui/react/popover';
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
  /** The control that opens the panel, rendered as the trigger. Omit it for a
   *  panel another control opens (a menu item): then pass `anchor`, and
   *  control it with `open`. */
  trigger?: ReactElement;
  /** What the panel is placed against when it has no trigger: a row page's
   *  property name opens a menu on click, and the menu's Edit property opens
   *  this panel beside the same name (spec 015). */
  anchor?: RefObject<Element | null>;
  /** Where focus goes when the panel closes, when it has no trigger. */
  returnFocus?: RefObject<HTMLElement | null>;
  /** The panel's accessible name, already translated. */
  label: string;
  /** The hidden close button's name, already translated. */
  closeLabel: string;
  children: ReactNode;
  /** Controlled use: omit both to let the trigger open and close it. */
  open?: boolean;
  /** `details` can cancel a close (details.cancel()), for a press outside
   *  that belongs to the panel after all, such as an editor it portals out. */
  onOpenChange?: (open: boolean, details: PopoverRoot.ChangeEventDetails) => void;
  /** Focus is trapped by default. false for a panel whose own editors open
   *  outside it (spec 015's Edit property: a select option's editor), which
   *  the trap would pull focus away from. */
  trapFocus?: boolean;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  className?: string;
};

export function Popover({ trigger, anchor, returnFocus, label, closeLabel, children, open, onOpenChange, trapFocus = true, side = 'bottom', align = 'end', className }: PopoverProps) {
  return (
    <BasePopover.Root open={open} onOpenChange={onOpenChange ? (o, details) => onOpenChange(o, details) : undefined} modal={trapFocus ? 'trap-focus' : false}>
      {trigger && <BasePopover.Trigger render={trigger} />}
      <BasePopover.Portal>
        <BasePopover.Positioner className="ui-popover-positioner" side={side} align={align} sideOffset={6} collisionPadding={8} anchor={trigger ? undefined : anchor}>
          <BasePopover.Popup className={'ui-popover' + (className ? ' ' + className : '')} aria-label={label} finalFocus={trigger ? undefined : returnFocus}>
            {children}
            <BasePopover.Close className="ui-popover-close">{closeLabel}</BasePopover.Close>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
