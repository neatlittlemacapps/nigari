import { LockKeyhole } from 'lucide-react';
import { api } from '../api';
import { formatMoment } from '../format';
import { t } from '../i18n';
import type { ViewsLock } from '../types';
import { Button } from '../ui/Button';
import { Popover } from '../ui/Popover';
import { toast } from '../toast';

/** Locks or unlocks a database's views (Settings › Database settings) and
 *  answers the lock as the server now stores it, or undefined when the server
 *  refused (said in a toast). Here and not in CollectionView, which is over
 *  1,400 lines (frontend rules). */
export async function setViewsLocked(collectionId: string, lock: boolean): Promise<ViewsLock | null | undefined> {
  try {
    const r = lock ? await api.lockViews(collectionId) : await api.unlockViews(collectionId);
    return r.viewsLocked;
  } catch (e) {
    toast((e as Error).message);
    return undefined;
  }
}

// The views lock's marker beside a database's view tabs (spec 013, US2,
// contracts/ui.md). It says the views are locked to everyone who opens the
// database, readers included (US2 scenario 6), and who locked them and when.
//
// A button with a small panel rather than a hover tooltip: who and when must
// reach someone on a phone, where nothing hovers, and someone on a keyboard.
// Unlocking is not offered here but in Settings › Database settings, beside
// Lock views: one place to look for both, and a reader, who has no Settings,
// is offered nothing they would be refused.
export default function ViewsLockMarker({ lock }: { lock: ViewsLock }) {
  const who = lock.byName || t('Someone');
  return (
    <Popover
      label={t('Views locked')}
      closeLabel={t('Close')}
      align="start"
      className="views-lock-panel"
      trigger={
        <Button variant="ghost" size="sm" className="views-lock-marker">
          <LockKeyhole size={14} aria-hidden="true" /> {t('Views locked')}
        </Button>
      }
    >
      <p className="views-lock-line">{t('Locked by {name} on {date}', { name: who, date: formatMoment(lock.at, 'datetime') })}</p>
      <p className="views-lock-hint">
        {t('Nobody can change, add or remove its views until they are unlocked. Rows can still be edited.')}
      </p>
    </Popover>
  );
}
