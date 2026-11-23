import { useEffect, useState } from 'react';
import { t } from '../i18n';
import type { ToastAction, ToastDetail, ToastKind } from '../toast';
import { Button } from '../ui/Button';

interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
  kind: ToastKind;
}

let nextId = 1;

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const { message, action, kind } = (e as CustomEvent<ToastDetail>).detail;
      const id = nextId++;
      setToasts((t) => [...t, { id, message, action, kind }]);
      // Longer with an action: reading the message and then reaching the
      // button takes longer than reading alone.
      window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 8000 : 4000);
    };
    window.addEventListener('nigari:toast', onToast);
    return () => window.removeEventListener('nigari:toast', onToast);
  }, []);

  // Toasts are the app's only failure feedback, so the region must announce to
  // screen readers. assertive: a failed save is worth interrupting for.
  if (toasts.length === 0) return null;
  return (
    <div className="toaster" role="region" aria-label={t('Notifications')} aria-live="assertive" aria-atomic="false">
      {toasts.map((item) => (
        <div
          key={item.id}
          className={'toast' + (item.kind === 'error' ? ' toast-error' : '') + (item.action ? ' toast-with-action' : '')}
        >
          {/* The mark is the error's, so it is not read out: the words say it. */}
          <span>
            {item.kind === 'error' && <span aria-hidden="true">⚠ </span>}
            {item.message}
          </span>
          {item.action && (
            <Button
              size="sm"
              className="toast-action"
              onClick={() => {
                item.action?.run();
                setToasts((list) => list.filter((x) => x.id !== item.id));
              }}
            >
              {item.action.label}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
