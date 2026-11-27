import { useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { File as FileIcon } from 'lucide-react';
import { Button } from './Button';
import { MenuIcon } from '../menuIcons';
import './FileList.css';

// The files of one Files & media value (spec 028, plan D7). Built here and not
// in the property's own component because the same list is drawn in a table
// cell, on a board or gallery card, on a row's page and in the cell's editor:
// one look for a file everywhere (look checklist 6).
//
// Two forms:
// - compact: one line of small thumbnails and file chips, then "+N". Not
//   interactive itself: the cell or the card around it is the control.
// - full: one row per file, its thumbnail and its name, the name opening the
//   file in a new tab. When editable, each row has Remove, and the rows can be
//   reordered by dragging or with ⌘/Ctrl+↑/↓ on the name.
//
// Whether a file is an image is the caller's call (filesValue.ts reads it from
// the address), so this component knows nothing about stored values.

export type FileListItem = {
  /** The file's address, "/files/<name>". */
  url: string;
  /** The name as uploaded, shown to people. */
  name: string;
  /** Drawn as a thumbnail of itself. */
  image: boolean;
};

type Common = {
  /** The list's accessible name, translated (the property's name). */
  label: string;
  items: FileListItem[];
};

export type FileListProps = Common &
  (
    | {
        variant: 'compact';
        /** How many files are drawn before "+N" (default 3). */
        max?: number;
        /** "+{count}", translated. */
        moreLabel: (count: number) => string;
      }
    | {
        variant: 'full';
        /** "Open {name}", translated: the name's accessible name. */
        openLabel: (name: string) => string;
        /** "Remove {name}", translated. Given with onRemove. */
        removeLabel?: (name: string) => string;
        onRemove?: (index: number) => void;
        /** Move the file at `from` to `to`. Without it the rows stay put. */
        onMove?: (from: number, to: number) => void;
        /** false: names only, no link and no thumbnail of the file itself.
         *  A public form's visitor cannot open an upload that is not sent
         *  yet (spec 028), so a link would lead to a refusal. */
        openable?: boolean;
      }
  );

export function FileList(props: FileListProps) {
  if (props.variant === 'compact') return <CompactList {...props} />;
  return <FullList {...props} />;
}

function Thumb({ item }: { item: FileListItem }) {
  if (item.image) return <img className="ui-file-thumb" src={item.url} alt="" loading="lazy" draggable={false} />;
  return (
    <span className="ui-file-thumb" data-kind="file" aria-hidden="true">
      <FileIcon />
    </span>
  );
}

function CompactList({ label, items, max = 3, moreLabel }: Extract<FileListProps, { variant: 'compact' }>) {
  if (items.length === 0) return null;
  const shown = items.slice(0, max);
  const hidden = items.length - shown.length;
  // Spans with list roles, not <ul>: the compact list sits inside the table
  // cell's button, which may hold only phrasing content.
  return (
    <span className="ui-file-list" data-variant="compact" role="list" aria-label={label}>
      {shown.map((it, i) => (
        <span key={it.url + i} role="listitem" className="ui-file-item" data-kind={it.image ? 'image' : 'file'} title={it.name}>
          <Thumb item={it} />
          {/* A file chip names its file; an image speaks for itself, and its
              name is in the title and for a screen reader. */}
          {it.image ? <span className="ui-file-sr">{it.name}</span> : <span className="ui-file-name">{it.name}</span>}
        </span>
      ))}
      {hidden > 0 && (
        <span role="listitem" className="ui-file-more">
          {moreLabel(hidden)}
        </span>
      )}
    </span>
  );
}

function FullList({ label, items, openLabel, removeLabel, onRemove, onMove, openable = true }: Extract<FileListProps, { variant: 'full' }>) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  // After a keyboard move the moved file's name keeps the focus, at its new
  // place: the list re-renders under it.
  const refocus = useRef<number | null>(null);
  const links = useRef<(HTMLElement | null)[]>([]);
  useLayoutEffect(() => {
    if (refocus.current === null) return;
    links.current[refocus.current]?.focus();
    refocus.current = null;
  });
  if (items.length === 0) return null;

  const onKey = (i: number) => (e: KeyboardEvent<HTMLElement>) => {
    if (!onMove || !(e.metaKey || e.ctrlKey)) return;
    const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1;
    if (to < 0 || to >= items.length) return;
    e.preventDefault();
    e.stopPropagation();
    refocus.current = to;
    onMove(i, to);
  };
  const drop = (i: number) => (e: DragEvent<HTMLLIElement>) => {
    if (dragFrom === null || !onMove) return;
    e.preventDefault();
    if (dragFrom !== i) onMove(dragFrom, i);
    setDragFrom(null);
    setDropAt(null);
  };

  return (
    <ul className="ui-file-list" data-variant="full" aria-label={label}>
      {items.map((it, i) => (
        <li
          key={it.url + i}
          className="ui-file-item"
          data-kind={it.image ? 'image' : 'file'}
          data-dragging={dragFrom === i ? '' : undefined}
          data-drop-target={dropAt === i && dragFrom !== i ? '' : undefined}
          draggable={!!onMove}
          onDragStart={(e) => {
            if (!onMove) return;
            e.dataTransfer.effectAllowed = 'move';
            setDragFrom(i);
          }}
          onDragOver={(e) => {
            if (dragFrom === null) return;
            e.preventDefault();
            setDropAt(i);
          }}
          onDragEnd={() => {
            setDragFrom(null);
            setDropAt(null);
          }}
          onDrop={drop(i)}
        >
          <Thumb item={openable ? it : { ...it, image: false }} />
          {!openable ? (
            // Focusable when the rows can be moved, so ⌘/Ctrl+↑/↓ still works
            // without a link to carry the focus (code review).
            <span
              ref={(el) => {
                links.current[i] = el;
              }}
              className="ui-file-name"
              title={it.name}
              tabIndex={onMove ? 0 : undefined}
              onKeyDown={onKey(i)}
            >
              {it.name}
            </span>
          ) : (
          <a
            ref={(el) => {
              links.current[i] = el;
            }}
            className="ui-file-name"
            href={it.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={openLabel(it.name)}
            title={it.name}
            draggable={false}
            onKeyDown={onKey(i)}
            onClick={(e) => e.stopPropagation()}
          >
            {it.name}
          </a>
          )}
          {onRemove && removeLabel && (
            <Button emphasis="low" size="sm" icon={<MenuIcon fn="delete" />} label={removeLabel(it.name)} onClick={() => onRemove(i)} />
          )}
        </li>
      ))}
    </ul>
  );
}
