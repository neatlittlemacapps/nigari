import { useRef, useState } from 'react';
import { Input } from '../ui/Field';
import { t } from '../i18n';

// A new row's title, typed in place (spec 022, US4): the + puts the row it
// adds in this state, so the next keys are its name. Enter or leaving the
// field saves; Escape keeps the row untitled. As the column header's rename
// does (TableColumnHead.tsx).
export function RowTitleInput({ initial, onDone }: { initial: string; onDone: (title: string | null) => void }) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const title = value.trim();
    onDone(save && title !== initial.trim() ? title : null);
  };
  return (
    <Input
      autoFocus
      className="db-title-input"
      aria-label={t('Row title')}
      placeholder={t('Untitled')}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        }
        if (e.key === 'Escape') {
          e.stopPropagation();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
    />
  );
}
