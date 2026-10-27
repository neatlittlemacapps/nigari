import type { ReactElement, ReactNode, RefObject } from 'react';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { useExclusiveModal } from '../modal';
import './Dialog.css';

// The one dialog. 24 screens each built their own overlay, focus handling and
// Escape key, and re-decided them a little differently each time (spec 001,
// US2). Base UI traps focus, closes on Escape and on a click outside, returns
// focus to whatever opened it, and labels the popup by its title.
//
// Mounted means open, the way every dialog in the app is used today: the
// caller renders <Dialog> while it should show and drops it on onClose. While
// mounted it takes part in useExclusiveModal, so opening it closes any other
// modal, as every hand-built dialog did.
//
// It shows no close button of its own: today's dialogs close through their
// footer (Cancel, Close), and a new X would change every migrated screen. The
// footer's dismiss action should be <DialogClose>, which Base UI asks for so a
// touch screen reader can always leave the dialog.

export type DialogProps = {
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg';
  footer?: ReactNode;
  className?: string;
  /** Where focus goes on close. By default the element that had focus when
   *  the dialog opened; pass this when that element goes away with the
   *  opening, like an item in a menu that closes. */
  returnFocus?: RefObject<HTMLElement | null>;
  children?: ReactNode;
};

export function Dialog({ title, description, onClose, size = 'md', footer, className, returnFocus, children }: DialogProps) {
  useExclusiveModal(onClose);
  return (
    <BaseDialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="ui-dialog-backdrop" />
        <BaseDialog.Viewport className="ui-dialog-viewport">
          <BaseDialog.Popup
            className={'ui-dialog ring' + (className ? ' ' + className : '')}
            data-size={size}
            finalFocus={returnFocus ?? true}
          >
            <BaseDialog.Title className="ui-dialog-title">{title}</BaseDialog.Title>
            {description && <BaseDialog.Description className="ui-dialog-description">{description}</BaseDialog.Description>}
            {children}
            {footer && <div className="ui-dialog-footer">{footer}</div>}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

/** The footer action that closes the dialog (Cancel, Close). Rendered as the
 *  element you pass, usually a <Button>. */
export function DialogClose({ children }: { children: ReactElement }) {
  return <BaseDialog.Close render={children} />;
}
