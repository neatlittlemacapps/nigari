// Minimal toast bus. Anywhere in the app can surface a transient message via
// toast('…'); <Toaster/> in App renders them. Used so silent save failures
// become visible instead of the UI wrongly implying "saved".
//
// An action (spec 005) is one button in the toast, for the case where the
// message is about something the person can go to: a new row that does not
// show in the view it was made in, with Open beside it.
export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastDetail {
  message: string;
  action?: ToastAction;
}

export function toast(message: string, action?: ToastAction) {
  window.dispatchEvent(new CustomEvent<ToastDetail>('nigari:toast', { detail: { message, action } }));
}
