import { useLayoutEffect, useRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import type { Row } from '../collectionRow';
import { t } from '../i18n';
import { PageIcon } from '../pageIcon';
import { tagColorClass } from '../tags';
import { titleClick } from '../titleCell';
import { usePeekedRow } from '../peekedRow';
import { CellAction } from '../ui/CellAction';
import { AgentDot } from './AgentBadge';
import { RowTitleInput } from './RowTitleInput';

// A table row's name cell (spec 026, #981). It used to be one button that
// opened the row, so a row could only be renamed by opening it. Now:
//
// - The whole cell is the target (owner: "The element you're working with is
//   the cell, not the text in the cell"): a click anywhere in it, the space
//   beside a short name too, does what titleClick says. An editor renames in
//   place, a reader opens the row, and ⌘/Ctrl or the middle button opens a
//   new tab for everyone. Enter on the focused name is a click (Q1 = A).
// - An Open button at the cell's end opens the row as the view says; for the
//   row in the peek it reads Close, always shown, and closes it (US3). It is a
//   ui/CellAction: the row (data-cell-action-host, set by TableView) reveals
//   it on hover and focus, and hides it while the name is typed.
//
// The name keeps its button, `.db-title-link`: it is what Tab reaches, what
// the row menu returns focus to, and what the tests and wiki shots find.

export function TitleCell({
  row,
  style,
  depth,
  before,
  tagColors,
  editing,
  onEdit,
  onDone,
  onOpen,
  onOpenAux,
}: {
  row: Row;
  style?: CSSProperties;
  depth: number;
  /** The sub-item toggle or its spacer, before the name. */
  before?: ReactNode;
  tagColors: Record<string, string>;
  /** This copy of the row is the one whose name is being typed. */
  editing: boolean;
  /** Start typing the name. Absent: the person may not rename it (a reader,
   *  an embed of a database they only read), and a click opens the row. */
  onEdit?: () => void;
  onDone: (title: string | null) => void;
  /** Open the row as the view says, ⌘/Ctrl adding a tab (useOpenRow). */
  onOpen: (e: { metaKey?: boolean; ctrlKey?: boolean }) => void;
  /** The middle button (openPageAux). */
  onOpenAux: (e: MouseEvent) => void;
}) {
  const peeked = usePeekedRow();
  // After Enter or Escape in the field, the focus goes back to the name, so
  // Tab reaches Open and the row's shortcuts keep working (US4). It fell to
  // the page before (review). A blur took it elsewhere already: left alone.
  const link = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useLayoutEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    link.current?.focus();
  }, [editing]);
  const inPeek = peeked.id === row.id;
  const name = row.title || t('Untitled');

  const act = (e: MouseEvent) => {
    const what = titleClick({ canEdit: !!onEdit, metaKey: e.metaKey, ctrlKey: e.ctrlKey, button: e.button });
    if (what === 'edit') onEdit?.();
    else if (e.button === 1) onOpenAux(e);
    else onOpen(e);
  };
  // A click in the cell outside the name's own button (the space beside a
  // short name, the tags) is a click on the name. Other controls in the cell
  // (the sub-item toggle, Open, the field) keep their own click.
  const onCell = (e: MouseEvent<HTMLTableCellElement>) => {
    if (editing || (e.target as HTMLElement).closest('button, input, a')) return;
    act(e);
  };

  return (
    <td
      className={'db-title-col' + (editing ? ' is-editing' : '')}
      style={style}
      data-editable={onEdit ? '' : undefined}
      onClick={onCell}
      onAuxClick={(e) => e.button === 1 && onCell(e)}
    >
      <span className="db-title-inner" style={depth ? { paddingLeft: depth * 20 } : undefined}>
        {before}
        {editing ? (
          <RowTitleInput
            initial={row.title}
            onDone={(title, byKey) => {
              refocus.current = byKey;
              onDone(title);
            }}
          />
        ) : (
          // The raw button TableView drew before, moved here: the count in
          // check-tokens.mjs stays as it was (plan, design system row).
          <button ref={link} className="db-title-link" onClick={act} onAuxClick={(e) => e.button === 1 && act(e)}>
            {row.icon && (
              <span className="inline-icon">
                <PageIcon icon={row.icon} size={14} />{' '}
              </span>
            )}
            {name}
          </button>
        )}
        {/* Presence was drawn on the board card and nowhere else, so
            anybody working in the table saw nothing at all — which is
            most of the time. The mark belongs wherever a row is
            listed, not only where it happens to be a card. */}
        <AgentDot pageId={row.id} />
        {/* The row's tags follow the name on its line, as they always did
            (#1031: #1030 moved them under it, and the row grew 12px). They
            give way before the name does; the field being typed has the
            whole line. */}
        {!editing && !!row.tags?.length && (
          <span className="db-row-tags">
            {row.tags.map((tag) => (
              <span key={tag} className={'row-tag ' + tagColorClass(tag, tagColors)}>
                #{tag}
              </span>
            ))}
          </span>
        )}
      </span>
      {inPeek ? (
        <CellAction label={t('Close {name}', { name })} pinned onClick={peeked.close}>
          {t('Close')}
        </CellAction>
      ) : (
        <CellAction label={t('Open {name}', { name })} onClick={(e) => onOpen(e)} onAuxClick={(e) => e.button === 1 && onOpenAux(e)}>
          {t('Open')}
        </CellAction>
      )}
    </td>
  );
}
