import { useRef, useState, type DragEvent } from 'react';
import { Button } from './Button';
import { MenuIcon } from '../menuIcons';
import './FileDrop.css';

// "Add files" (spec 028, plan D7): a button that opens the file picker, and a
// drop target round it, with each upload's progress and the server's refusal
// under it. Built here, not in the property's component, because a form's
// file field (PR 2) is the same control.
//
// It only hands the chosen files over (onFiles); uploading them, and turning
// the server's answer into `uploads`, is the caller's. So it holds no request
// and no English: every word arrives translated.

export type FileDropUpload = {
  /** Stable while the upload runs. */
  key: string;
  /** The file's name as chosen. */
  name: string;
  /** 0–1 while it runs; absent once refused. */
  progress?: number;
  /** The refusal, translated ("The file is larger than 50 MB"). */
  error?: string;
};

export type FileDropProps = {
  /** The button's word, translated ("Add files"). */
  label: string;
  /** Shown while files are dragged over it, translated ("Drop files here"). */
  dropLabel: string;
  /** "Uploading {name}", translated: each progress bar's name. */
  progressLabel: (name: string) => string;
  onFiles: (files: File[]) => void;
  uploads?: FileDropUpload[];
  multiple?: boolean;
  /** The picker's filter, e.g. "image/*". All files when left out. */
  accept?: string;
  disabled?: boolean;
};

export function FileDrop({ label, dropLabel, progressLabel, onFiles, uploads = [], multiple = true, accept, disabled }: FileDropProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  // dragenter and dragleave fire for every child the pointer crosses: a count
  // keeps the target lit until the pointer really leaves it.
  const depth = useRef(0);
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <div
      className="ui-file-drop"
      data-over={over ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      onDragEnter={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        // A drop on a cell or a card would otherwise also reach the editor or
        // the row under it.
        e.stopPropagation();
        depth.current = 0;
        setOver(false);
        take(e.dataTransfer.files);
      }}
    >
      <input
        ref={input}
        className="ui-file-drop-input"
        type="file"
        multiple={multiple}
        accept={accept}
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        onChange={(e) => {
          take(e.currentTarget.files);
          // The same file chosen twice in a row must still arrive.
          e.currentTarget.value = '';
        }}
      />
      <Button size="sm" icon={<MenuIcon fn="addFiles" />} disabled={disabled} onClick={() => input.current?.click()}>
        {label}
      </Button>
      {over && (
        <span className="ui-file-drop-hint" aria-hidden="true">
          {dropLabel}
        </span>
      )}
      {uploads.length > 0 && (
        <ul className="ui-file-drop-uploads">
          {uploads.map((u) => (
            <li key={u.key} className="ui-file-drop-upload" data-refused={u.error ? '' : undefined}>
              <span className="ui-file-drop-name" title={u.name}>
                {u.name}
              </span>
              {u.error ? (
                <span className="ui-file-drop-error" role="alert">
                  {u.error}
                </span>
              ) : (
                <progress className="ui-file-drop-progress" max={1} value={u.progress ?? 0} aria-label={progressLabel(u.name)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
