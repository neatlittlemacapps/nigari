import { Button } from '../ui/Button';
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Revision } from '../types';
import Portal from './Portal';
import { confirm } from '../dialog';
import { useExclusiveModal } from '../modal';
import { toast, toastError } from '../toast';
import { formatMoment } from '../format';
import { t } from '../i18n';

const when = (iso: string) => formatMoment(iso, 'full');

export function HistoryModal({
  pageId,
  onClose,
  onRestored,
}: {
  pageId: string;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  useExclusiveModal(onClose);
  const load = () => void api.listRevisions(pageId).then(setRevisions).catch(() => {});
  useEffect(load, [pageId]);

  const restore = async (rev: Revision) => {
    if (!(await confirm(t('Restore the version from {when}? The current state is saved as a version first.', { when: when(rev.createdAt) })))) return;
    try {
      await api.restoreRevision(pageId, rev.id);
      toast(t('Version restored'));
      onRestored();
      onClose();
    } catch (e) {
      toastError((e as Error).message || t('Restoring failed'));
    }
  };

  return (
    <Portal>
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={t('Version history')}>
        <h2>{t('Version history')}</h2>
        <p className="dialog-hint">{t('Snapshots are taken on save (at most every 2 minutes, the latest 50).')}</p>
        <div className="user-list">
          {revisions.map((r) => (
            <div key={r.id} className="user-row">
              <span className="user-row-name">🕘 {when(r.createdAt)}</span>
              <span className="user-row-email">{r.authorName || t('unknown')}</span>
              <Button size="sm" onClick={() => void restore(r)}>{t('Restore')}</Button>
            </div>
          ))}
          {revisions.length === 0 && <div className="dialog-hint">{t('No versions yet.')}</div>}
        </div>
        <Button className="dialog-close" onClick={onClose}>{t('Close')}</Button>
      </div>
    </div>
    </Portal>
  );
}
