import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { t } from '../i18n';
import type { ToastAction, ToastDetail, ToastKind } from '../toast';
import { Button } from '../ui/Button';

interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
  kind: ToastKind;
  /** Milliseconds left on screen, counted only while the toasts are not held. */
  left: number;
}

let nextId = 1;
const TICK = 250;

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // What the two live regions say. They stay mounted and only their text
  // changes: a region that appears together with its words is often not read
  // out at all.
  const [said, setSaid] = useState<Record<ToastKind, string>>({ info: '', error: '' });
  // Held while the pointer is over a toast or focus is in one (WCAG 2.2.1):
  // a toast with a button, or a long message, has to stay until it is read.
  const held = useRef({ hover: false, focus: false });

  useEffect(() => {
    const onToast = (e: Event) => {
      const { message, action, kind } = (e as CustomEvent<ToastDetail>).detail;
      // Longer with an action: reading the message and then reaching the
      // button takes longer than reading alone.
      setToasts((list) => [...list, { id: nextId++, message, action, kind, left: action ? 8000 : 4000 }]);
      setSaid((s) => ({ ...s, [kind]: message }));
    };
    window.addEventListener('nigari:toast', onToast);
    return () => window.removeEventListener('nigari:toast', onToast);
  }, []);

  const any = toasts.length > 0;
  useEffect(() => {
    if (!any) return;
    const timer = window.setInterval(() => {
      if (held.current.hover || held.current.focus) return;
      setToasts((list) => list.map((x) => ({ ...x, left: x.left - TICK })).filter((x) => x.left > 0));
    }, TICK);
    return () => window.clearInterval(timer);
  }, [any]);

  const drop = (id: number) => setToasts((list) => list.filter((x) => x.id !== id));
  if (!any) held.current = { hover: false, focus: false };

  return (
    <>
      {/* A notice waits its turn (polite); only a failure interrupts. Until
          #933 the one region was assertive, so "Version restored" cut into
          whatever a screen reader was saying, like a failed save. */}
      <div className="toast-say" aria-live="polite">{said.info}</div>
      <div className="toast-say" aria-live="assertive">{said.error}</div>
      {any && (
        <div
          className="toaster"
          role="region"
          aria-label={t('Notifications')}
          onPointerEnter={() => (held.current.hover = true)}
          onPointerLeave={() => (held.current.hover = false)}
          onFocus={() => (held.current.focus = true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) held.current.focus = false;
          }}
          onKeyDown={(e) => {
            // Escape on a toast's button closes that toast, not a dialog under it.
            const el = (e.target as HTMLElement).closest<HTMLElement>('[data-toast]');
            if (e.key !== 'Escape' || !el) return;
            e.preventDefault();
            drop(Number(el.dataset.toast));
          }}
        >
          {toasts.map((item) => (
            <div
              key={item.id}
              data-toast={item.id}
              className={'toast' + (item.kind === 'error' ? ' toast-error' : '')}
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
                    drop(item.id);
                  }}
                >
                  {item.action.label}
                </Button>
              )}
              <Button
                size="sm"
                emphasis="low"
                className="toast-close"
                icon={<X size={14} />}
                label={t('Dismiss')}
                onClick={() => drop(item.id)}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
