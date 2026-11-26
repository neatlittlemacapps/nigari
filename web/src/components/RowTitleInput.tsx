import { useRef, useState } from 'react';
import { Input } from '../ui/Field';
import { t } from '../i18n';

// A row's title, typed in place: the + puts the row it adds in this state, so
// the next keys are its name (spec 022, US4), and a click on a row's name
// does too (spec 026). Enter or leaving the field saves; Escape keeps the old
// name. As the column header's rename does (TableColumnHead.tsx). The field
// is the flat cell variant, so both ways in look the same (FR-007).
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
      variant="cell"
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
