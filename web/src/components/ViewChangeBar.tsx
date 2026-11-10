import { RotateCcw, Users } from 'lucide-react';
import { t } from '../i18n';
import { Button } from '../ui/Button';

// The bar above a view the person has changed for themselves (spec 013, US1,
// contracts/ui.md). A filter or sort edit is theirs alone until they choose:
// Reset drops it, Save for everyone writes it to the view. Before this, one
// person narrowing "Open tasks" to their own narrowed it for the whole team
// (#279).
//
// Save for everyone is not offered to someone who could not change the view
// anyway (a reader, or anyone while the views are locked): an offer the
// server would refuse breaks a promise. Reset is always there.
//
// role="status": the bar appears as a result of the person's own edit, and a
// screen reader should say that the change is only theirs without taking
// the focus away from the filter they are still setting.
export default function ViewChangeBar({
  onReset,
  onSaveForEveryone,
}: {
  onReset: () => void;
  /** Absent when the person may not change the view for everyone. */
  onSaveForEveryone?: () => void;
}) {
  return (
    <div className="view-change-bar" role="status">
      <span className="view-change-bar-text">{t('Only you see these changes')}</span>
      <span className="view-change-bar-actions">
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw size={14} aria-hidden="true" /> {t('Reset')}
        </Button>
        {onSaveForEveryone && (
          <Button variant="secondary" size="sm" onClick={onSaveForEveryone}>
            <Users size={14} aria-hidden="true" /> {t('Save for everyone')}
          </Button>
        )}
      </span>
    </div>
  );
}
