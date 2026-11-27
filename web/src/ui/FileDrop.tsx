import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { X } from 'lucide-react';
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
  /** Takes a refused upload off the list (code review: it stayed until the
   *  control was closed). Given with dismissLabel. */
  onDismiss?: (key: string) => void;
  /** "Dismiss: {name}", translated. */
  dismissLabel?: (name: string) => string;
  multiple?: boolean;
  /** The picker's filter, e.g. "image/*". All files when left out. */
  accept?: string;
  disabled?: boolean;
};

export function FileDrop({ label, dropLabel, progressLabel, onFiles, uploads = [], onDismiss, dismissLabel, multiple = true, accept, disabled }: FileDropProps) {
  const input = useRef<HTMLInputElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  // dragenter and dragleave fire for every child the pointer crosses: a count
  // keeps the target lit until the pointer really leaves it.
  const depth = useRef(0);
  const latest = useRef({ onFiles, multiple, disabled });
  latest.current = { onFiles, multiple, disabled };

  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    const { onFiles: hand, multiple: many } = latest.current;
    if (files.length) hand(many ? files : files.slice(0, 1));
  };

  // Native listeners on the control itself, not React's: React handles a drag
  // event only once it reaches the root, and a host on the way may listen
  // natively. The editor does, on the row page's whole body (Editor.tsx), and
  // added every file dropped here a second time as a block (code review).
  // Stopped here, the drop belongs to this control alone.
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.stopPropagation();
      if (latest.current.disabled) return;
      e.preventDefault();
      depth.current += 1;
      setOver(true);
    };
    const overZone = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.stopPropagation();
      if (latest.current.disabled) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.stopPropagation();
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.stopPropagation();
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      if (!latest.current.disabled) take(e.dataTransfer?.files ?? null);
    };
    el.addEventListener('dragenter', enter);
    el.addEventListener('dragover', overZone);
    el.addEventListener('dragleave', leave);
    el.addEventListener('drop', drop);
    return () => {
      el.removeEventListener('dragenter', enter);
      el.removeEventListener('dragover', overZone);
      el.removeEventListener('dragleave', leave);
      el.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <div ref={zone} className="ui-file-drop" data-over={over ? '' : undefined} data-disabled={disabled ? '' : undefined}>
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
                <>
                  <span className="ui-file-drop-error" role="alert">
                    {u.error}
                  </span>
                  {onDismiss && dismissLabel && (
                    <Button emphasis="low" size="xs" icon={<X />} label={dismissLabel(u.name)} onClick={() => onDismiss(u.key)} />
                  )}
                </>
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
