import { useRef, useState, type ReactNode } from 'react';
import { confirm } from '../dialog';
import { t } from '../i18n';
import { toast } from '../toast';
import type { CollectionConfig, PropDef } from '../types';
import { changeSchema } from '../propertyChange';
import { deletePropertyMessage } from '../propertyDelete';
import { applyPropertyChange, duplicateProperty } from '../rowProperties';
import { EditPropertyPanel } from './EditPropertyPanel';
import type { PropertyChanges } from './TableColumnHead';

// A table column heading's property actions (spec 015, T028): rename, Edit
// property, duplicate, delete, the same as on a row's page and saved the same
// way (propertyChange.ts). Kept out of CollectionView.tsx, which is long.
//
// In a document (an embed) a change to the database asks first, naming it:
// spec 014 FR-012, the rule the Edit properties dialog follows there. Delete
// asks its own question instead, which already names the database and says
// the property leaves every view.

export function useColumnPropertyChanges({
  collectionId,
  databaseName,
  schema,
  titleOf,
  targets,
  embedded,
  onSaved,
  onRefused,
}: {
  collectionId: string;
  databaseName: string;
  schema: PropDef[];
  titleOf: (id: string) => string | undefined;
  targets: { id: string; title: string }[];
  embedded: boolean;
  onSaved: (c: CollectionConfig) => void;
  onRefused: () => void;
}): { changesFor: (p: PropDef) => PropertyChanges; panel: ReactNode } {
  const [editing, setEditing] = useState<PropDef | null>(null);
  const anchor = useRef<HTMLElement | null>(null);

  const change = async (next: (stored: PropDef[]) => PropDef[], tidyViews = false, ask = embedded) => {
    if (ask) {
      const ok = await confirm(
        t('Change the properties of {database}?', { database: databaseName }) + '\n' + t('This changes the database and every view of it, everywhere.'),
        { confirmText: t('Change properties') },
      );
      if (!ok) return;
    }
    try {
      onSaved(await changeSchema(collectionId, next, tidyViews));
    } catch (e) {
      toast((e as Error).message);
      onRefused();
    }
  };

  const remove = async (p: PropDef) => {
    const other = p.relationCollection ? titleOf(p.relationCollection) : undefined;
    const ok = await confirm(deletePropertyMessage(t, p, databaseName, other), { confirmText: t('Delete property'), danger: true });
    if (ok) await change((s) => s.filter((x) => x.id !== p.id), true, false);
  };

  const changesFor = (p: PropDef): PropertyChanges => ({
    onRename: (name) => void change((s) => applyPropertyChange(s, p.id, { name })),
    onEdit: (heading) => {
      anchor.current = heading;
      setEditing({ ...p });
    },
    onDuplicate: () => void change((s) => duplicateProperty(s, p.id, t('Copy of {name}', { name: p.name }))),
    onDelete: () => void remove(p),
  });

  const panel = editing && (
    <EditPropertyPanel
      key={editing.id}
      property={editing}
      schema={schema}
      targets={targets}
      anchor={anchor}
      onSave={(next) => void change((s) => s.map((x) => (x.id === next.id ? next : x)))}
      onDelete={(x) => void remove(x)}
      onClose={() => setEditing(null)}
    />
  );

  return { changesFor, panel };
}
