import { lazy, Suspense, useRef, useState, type ReactNode } from 'react';
import { confirm } from '../dialog';
import { t } from '../i18n';
import { toast } from '../toast';
import type { CollectionConfig, PropDef } from '../types';
// The save logic is imported when a change is made, not with every page:
// a table heading's menu is drawn far more often than a property is changed
// (spec 015: the main bundle's cap).
const ops = () =>
  Promise.all([import('../propertyChange'), import('../propertyDelete'), import('../rowProperties')]).then(
    ([change, del, row]) => ({ ...change, ...del, ...row }),
  );
type Ops = Awaited<ReturnType<typeof ops>>;
import type { PropertyChanges } from './TableColumnHead';

// A table column heading's property actions (spec 015, T028): rename, Edit
// property, duplicate, delete, the same as on a row's page and saved the same
// way (propertyChange.ts). Kept out of CollectionView.tsx, which is long.
//
// In a document (an embed) a change to the database asks first, naming it:
// spec 014 FR-012, the rule the Edit properties dialog follows there. Delete
// asks its own question instead, which already names the database and says
// the property leaves every view.

// The panel and the type settings it carries load when it opens (spec 015:
// the main bundle's cap).
const EditPropertyPanel = lazy(() => import('./EditPropertyPanel').then((m) => ({ default: m.EditPropertyPanel })));

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
}): { changesFor: (p: PropDef) => PropertyChanges; panel: ReactNode; askFromDocument: () => Promise<boolean> } {
  const [editing, setEditing] = useState<PropDef | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  // One after another, as on a row's page (RowProperties): two quick changes
  // would otherwise each start from a schema without the other.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // From a document, the open panel asks once: a type change saved at once
  // and the rest saved on close are one edit to the person (review finding).
  const panelAgreed = useRef<string | null>(null);

  // The question a change from a document asks first (spec 014, FR-012),
  // the Edit properties dialog's too: one sentence, one place.
  const askFromDocument = () =>
    confirm(
      t('Change the properties of {database}?', { database: databaseName }) + '\n' + t('This changes the database and every view of it, everywhere.'),
      { confirmText: t('Change properties') },
    );

  const change = async (next: (o: Ops) => (stored: PropDef[]) => PropDef[], tidyViews = false, ask = embedded, panelId?: string): Promise<boolean> => {
    if (ask && !(panelId && panelAgreed.current === panelId)) {
      if (!(await askFromDocument())) return false;
      if (panelId) panelAgreed.current = panelId;
    }
    const run = queue.current.then(async () => {
      try {
        const o = await ops();
        onSaved(await o.changeSchema(collectionId, next(o), tidyViews));
        return true;
      } catch (e) {
        toast((e as Error).message);
        onRefused();
        return false;
      }
    });
    queue.current = run;
    return run;
  };

  const remove = async (p: PropDef) => {
    const other = p.relationCollection ? titleOf(p.relationCollection) : undefined;
    const { deletePropertyMessage } = await ops();
    const ok = await confirm(deletePropertyMessage(t, p, databaseName, other), { confirmText: t('Delete property'), danger: true });
    if (ok) await change(() => (s) => s.filter((x) => x.id !== p.id), true, false);
  };

  const changesFor = (p: PropDef): PropertyChanges => ({
    onRename: (name) => void change((o) => (s) => o.applyPropertyChange(s, p.id, { name })),
    onEdit: (heading) => {
      anchor.current = heading;
      panelAgreed.current = null;
      setEditing({ ...p });
    },
    onDuplicate: () => void change((o) => (s) => o.duplicateProperty(s, p.id, t('Copy of {name}', { name: p.name }))),
    onDelete: () => void remove(p),
  });

  const panel = editing && (
    <Suspense fallback={null}>
    <EditPropertyPanel
      key={editing.id}
      property={editing}
      schema={schema}
      targets={targets}
      anchor={anchor}
      onSave={(next) => change(() => (s) => s.map((x) => (x.id === next.id ? next : x)), false, embedded, next.id)}
      onDelete={(x) => void remove(x)}
      onClose={() => setEditing(null)}
    />
    </Suspense>
  );

  return { changesFor, panel, askFromDocument };
}
