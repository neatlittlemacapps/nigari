import { useEffect, useRef, useState } from 'react';
import { Input } from '../ui/Field';
import { t } from '../i18n';

// A row's title, typed in place: the + puts the row it adds in this state, so
// the next keys are its name (spec 022, US4), and a click on a row's name
// does too (spec 026). Enter or leaving the field saves; Escape keeps the old
// name. As the column header's rename does (TableColumnHead.tsx). The field
// is the flat cell variant, so both ways in look the same (FR-007).
//
// `byKey` says the field closed by Enter or Escape, so the caller can give
// the focus back to the name; a blur already took it somewhere else.
export function RowTitleInput({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (title: string | null, byKey: boolean) => void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (save: boolean, byKey = false) => {
    if (done.current) return;
    done.current = true;
    const title = value.trim();
    onDone(save && title !== initial.trim() ? title : null, byKey);
  };
  // The field can go without a blur: a collaborator moves the row to another
  // group, the grouping is turned off, a reload filters the row away. What
  // was typed is kept, as leaving the field keeps it, and the table forgets
  // the row is being typed (review: the state stayed, and the field came
  // back with the focus when the row did). A timer, because StrictMode
  // unmounts and mounts every effect once on purpose: that is not the end.
  const latest = useRef(finish);
  latest.current = finish;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.setTimeout(() => {
        if (!alive.current) latest.current(true);
      }, 0);
    };
  }, []);
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
          finish(true, true);
        }
        if (e.key === 'Escape') {
          e.stopPropagation();
          finish(false, true);
        }
      }}
      onBlur={() => finish(true)}
    />
  );
}
