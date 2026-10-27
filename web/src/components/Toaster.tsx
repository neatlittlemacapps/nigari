import { useEffect, useState } from 'react';
import { t } from '../i18n';
import type { ToastAction, ToastDetail } from '../toast';
import { Button } from '../ui/Button';

interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
}

let nextId = 1;

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const { message, action } = (e as CustomEvent<ToastDetail>).detail;
      const id = nextId++;
      setToasts((t) => [...t, { id, message, action }]);
      // Longer with an action: reading the message and then reaching the
      // button takes longer than reading alone.
      window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 8000 : 4000);
    };
    window.addEventListener('salt:toast', onToast);
    return () => window.removeEventListener('salt:toast', onToast);
  }, []);

  // Toasts are the app's only failure feedback, so the region must announce to
  // screen readers. assertive: a failed save is worth interrupting for.
  if (toasts.length === 0) return null;
  return (
    <div className="toaster" role="region" aria-label={t('Notifications')} aria-live="assertive" aria-atomic="false">
      {toasts.map((item) => (
        <div key={item.id} className={item.action ? 'toast toast-with-action' : 'toast'}>
          <span>⚠ {item.message}</span>
          {item.action && (
            <Button
              size="sm"
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
