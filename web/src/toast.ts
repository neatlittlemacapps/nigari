// Minimal toast bus. Anywhere in the app can surface a transient message via
// toast('…'); <Toaster/> in App renders them. Used so silent save failures
// become visible instead of the UI wrongly implying "saved".
//
// An action (spec 005) is one button in the toast, for the case where the
// message is about something the person can go to: a new row that does not
// show in the view it was made in, with Open beside it.
//
// Two kinds (#924). toast() says something happened ("Link copied", "A new
// version is available") and is drawn in the neutral ink colour; toastError()
// says something did not happen ("Change not saved") and is drawn in the
// destructive colour with a warning mark. Until #924 every toast was red with
// a ⚠, so "Settings saved" read as a failure, and a real failure no longer
// stood out from the confirmations around it.
export interface ToastAction {
  label: string;
  run: () => void;
}

export type ToastKind = 'info' | 'error';

export interface ToastDetail {
  message: string;
  action?: ToastAction;
  kind: ToastKind;
}

function show(kind: ToastKind, message: string, action?: ToastAction) {
  window.dispatchEvent(new CustomEvent<ToastDetail>('nigari:toast', { detail: { message, action, kind } }));
}

/** A confirmation or a notice: something happened, or is worth knowing. */
export function toast(message: string, action?: ToastAction) {
  show('info', message, action);
}

/** A failure: what the person asked for did not happen. */
export function toastError(message: string, action?: ToastAction) {
  show('error', message, action);
}
