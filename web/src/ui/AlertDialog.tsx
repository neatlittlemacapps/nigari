import { useRef } from 'react';
import { AlertDialog as BaseAlertDialog } from '@base-ui/react/alert-dialog';
import { Button } from './Button';
import './Dialog.css';

// A question that needs an answer before anything else: delete this? An alert
// dialog does not close on a click outside (a stray click must not count as
// either answer), and when the answer destroys something, focus starts on
// Cancel, so Enter pressed out of habit keeps the data.
//
// Unlike Dialog it does not take part in useExclusiveModal: a confirmation
// layers on top of the dialog that asked for it, as DialogHost's does
// (dialog.tsx).

export type AlertDialogProps = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function AlertDialog({ title, description, confirmLabel, cancelLabel, danger, onConfirm, onClose }: AlertDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <BaseAlertDialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <BaseAlertDialog.Portal>
        <BaseAlertDialog.Backdrop className="ui-dialog-backdrop" />
        <BaseAlertDialog.Viewport className="ui-dialog-viewport">
          <BaseAlertDialog.Popup className="ui-dialog ring" data-size="sm" initialFocus={danger ? cancel : true}>
            <BaseAlertDialog.Title className="ui-dialog-title">{title}</BaseAlertDialog.Title>
            <BaseAlertDialog.Description className="ui-dialog-description">{description}</BaseAlertDialog.Description>
            <div className="ui-dialog-footer">
              <BaseAlertDialog.Close render={<Button ref={cancel}>{cancelLabel}</Button>} />
              <Button
                variant={danger ? 'danger' : 'primary'}
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
              >
                {confirmLabel}
              </Button>
            </div>
          </BaseAlertDialog.Popup>
        </BaseAlertDialog.Viewport>
      </BaseAlertDialog.Portal>
    </BaseAlertDialog.Root>
  );
}
