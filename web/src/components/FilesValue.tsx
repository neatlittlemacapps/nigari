import { useRef, useState } from 'react';
import type { PropDef } from '../types';
import { api, ApiError } from '../api';
import { serverMessage } from '../serverErrors';
import { t } from '../i18n';
import { Popover } from '../ui/Popover';
import { Button } from '../ui/Button';
import { FileList } from '../ui/FileList';
import { FileDrop, type FileDropUpload } from '../ui/FileDrop';
import { addFiles, fileListItems, moveFile, readFiles, removeFile, type FileItem } from '../filesValue';

// A Files & media value (spec 028, FR-006b/c), in the three places a value is
// drawn:
// - a table, list or card cell: the files compact, on one line; a click or
//   Enter opens a panel with the full list and Add files;
// - the row's page: the full list and Add files in place;
// - a card, or anyone who may only read: the files, opened but not changed.
//
// The look is ui/FileList and ui/FileDrop (plan D7); this file only joins
// them to a stored value and to the upload.
//
// An upload goes to /api/upload without a page, and the value is written
// after it: the server records the row as the file's carrier when the value is
// stored (server/filesprop.go, recordRowFiles), and checks every file then.

type Props = {
  def: PropDef;
  value: unknown;
  onChange?: (v: unknown) => void;
  readOnly?: boolean;
  compact?: boolean;
  showEmpty?: boolean;
};

const more = (count: number) => t('+{count}', { count });
const openName = (name: string) => t('Open {name}', { name });
const removeName = (name: string) => t('Remove {name}', { name });
const uploading = (name: string) => t('Uploading {name}', { name });

function uploadError(e: unknown): string {
  if (e instanceof ApiError) return e.code ? serverMessage(e.code, e.message) : e.message;
  return t('Upload failed');
}

/** The uploads of one value, and the edits that keep the value current while
 *  several files finish at different times. */
function useFileEdits(files: FileItem[], onChange?: (v: unknown) => void) {
  const [uploads, setUploads] = useState<FileDropUpload[]>([]);
  // The value as this component last wrote it: two uploads finishing after
  // each other must both land, though the second one's render may not yet
  // carry the first one's value.
  const latest = useRef(files);
  latest.current = files;
  const write = (next: FileItem[]) => {
    latest.current = next;
    onChange?.(next);
  };
  const upload = (chosen: File[]) => {
    for (const file of chosen) {
      const key = Math.random().toString(36).slice(2) + file.name;
      setUploads((u) => [...u, { key, name: file.name, progress: 0 }]);
      api
        .upload(file, undefined, (p) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress: p } : x))))
        .then((url) => {
          setUploads((u) => u.filter((x) => x.key !== key));
          write(addFiles(latest.current, [{ url, name: file.name }]));
        })
        .catch((e) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress: undefined, error: uploadError(e) } : x))));
    }
  };
  return {
    uploads,
    upload,
    remove: (i: number) => write(removeFile(latest.current, i)),
    move: (from: number, to: number) => write(moveFile(latest.current, from, to)),
  };
}

function Editor({ def, files, onChange }: { def: PropDef; files: FileItem[]; onChange?: (v: unknown) => void }) {
  const edit = useFileEdits(files, onChange);
  return (
    <div className="prop-files-editor">
      <FileList
        variant="full"
        label={def.name}
        items={fileListItems(files)}
        openLabel={openName}
        removeLabel={removeName}
        onRemove={edit.remove}
        onMove={edit.move}
      />
      <FileDrop label={t('Add files')} dropLabel={t('Drop files here')} progressLabel={uploading} uploads={edit.uploads} onFiles={edit.upload} />
    </div>
  );
}

export default function FilesValue({ def, value, onChange, readOnly, compact, showEmpty }: Props) {
  const files = readFiles(value);
  const items = fileListItems(files);
  const ro = readOnly || !onChange;

  if (ro) {
    if (items.length === 0) return <span className="prop-empty">{showEmpty ? t('Empty') : null}</span>;
    if (showEmpty && !compact) return <FileList variant="full" label={def.name} items={items} openLabel={openName} />;
    return <FileList variant="compact" label={def.name} items={items} moreLabel={more} />;
  }

  // The row's page (the one caller that passes showEmpty): everything in
  // place.
  if (showEmpty && !compact) return <Editor def={def} files={files} onChange={onChange} />;

  // A table, list or card cell: the compact list is the trigger of the panel
  // that edits it, so the row keeps its height.
  return (
    <Popover
      label={def.name}
      closeLabel={t('Close')}
      align="start"
      className="prop-files-popover"
      trigger={
        <Button emphasis="low" size="sm" aria-label={t('Edit') + ': ' + def.name}>
          {items.length ? <FileList variant="compact" label={def.name} items={items} moreLabel={more} /> : <span className="prop-empty" />}
        </Button>
      }
    >
      <Editor def={def} files={files} onChange={onChange} />
    </Popover>
  );
}
