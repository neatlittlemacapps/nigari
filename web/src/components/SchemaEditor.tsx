import { useState } from 'react';
import type { CollectionConfig, PropDef, PropType, ViewDef } from '../types';
import Portal from './Portal';
import { useExclusiveModal } from '../modal';
import { confirm } from '../dialog';
import { GripVertical } from 'lucide-react';
import { t } from '../i18n';
import { PropertyFields, PropertyTypeSelect, autoOptionColor, changePropertyType, slug, useTargetSchemas } from './PropertyFields';
import { deletePropertyMessage, tidyViewsAfterSchema } from '../propertyDelete';


export default function SchemaEditor({
  config,
  databaseName,
  titleOf,
  collections,
  onSave,
  onClose,
}: {
  config: CollectionConfig;
  /** The database's name as the reader sees it, for the confirmations. */
  databaseName: string;
  /** Any database's name by id, trashed ones included: a relation can point
   *  at one that `collections` (the pickable ones) leaves out. */
  titleOf?: (id: string) => string | undefined;
  collections?: { id: string; title: string }[];
  /** Answers false when the save was refused: the dialog then stays open with
   *  its edits (the refusal is said by the caller). */
  onSave: (c: CollectionConfig) => Promise<boolean | void>;
  onClose: () => void;
}) {
  const [schema, setSchema] = useState<PropDef[]>(config.schema);
  const [dragProperty, setDragProperty] = useState<string | null>(null);
  const [dropProperty, setDropProperty] = useState<{ id: string; after: boolean } | null>(null);
  const [views, setViews] = useState<ViewDef[]>(config.views);
  useExclusiveModal(onClose);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<PropType>('select');

  // Schemas of the databases relations point at (PropertyFields, spec 015).
  const targetSchemas = useTargetSchemas(schema);
  const targets = collections ?? [];

  const addProp = () => {
    const name = newName.trim() || 'Property';
    let id = slug(name);
    while (schema.some((p) => p.id === id)) id += '_';
    const def: PropDef = { id, name, type: newType };
    if (newType === 'select' || newType === 'multiselect') def.options = [];
    if (newType === 'rollup') def.rollupAgg = 'sum';
    setSchema([...schema, def]);
    setNewName('');
  };

  const updateProp = (id: string, patch: Partial<PropDef>) =>
    setSchema((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  // Changing a property's type is non-destructive (Q23, changePropertyType).
  const changeType = (id: string, type: PropType) =>
    setSchema((prev) => prev.map((p) => (p.id === id ? changePropertyType(p, type) : p)));

  const moveProperty = (id: string, targetId: string, after: boolean) => {
    setSchema((previous) => {
      const source = previous.findIndex((property) => property.id === id);
      const target = previous.findIndex((property) => property.id === targetId);
      if (source < 0 || target < 0 || source === target) return previous;
      const next = [...previous];
      const [property] = next.splice(source, 1);
      next.splice(target - (source < target ? 1 : 0) + Number(after), 0, property);
      return next;
    });
  };

  const endPropertyDrag = () => {
    setDragProperty(null);
    setDropProperty(null);
  };

  // Deleting a property asks first (#524): saved, it leaves every view of the
  // database, and save() drops the filters, sorts and hidden entries that
  // named it. A select option already asked; the whole property did not.
  // One added in this same visit is not stored yet, so nothing is lost and
  // there is nothing to ask. A relation's links go with it, on both sides:
  // the other database's back-relation is computed from them (derived.go),
  // so it shows nothing once they are gone.
  const removeProp = async (id: string) => {
    const p = schema.find((x) => x.id === id);
    if (!p) return;
    if (config.schema.some((x) => x.id === id)) {
      const other = p.relationCollection
        ? titleOf?.(p.relationCollection) || collections?.find((c) => c.id === p.relationCollection)?.title
        : undefined;
      const message = deletePropertyMessage(t, p, databaseName, other);
      const ok = await confirm(message, { confirmText: t('Delete property'), danger: true });
      if (!ok) return;
    }
    setSchema((prev) => prev.filter((x) => x.id !== id));
  };

  const save = async () => {
    // Every option WITHOUT a colour gets the fallback written in on save.
    // Otherwise the editor shows a colour (the fallback) while the board shows
    // grey — because only the stored colour counts there. After saving the two
    // agree, and export and MCP see real colours too.
    const colored = schema.map((p) =>
      p.type === 'select' || p.type === 'multiselect'
        ? { ...p, options: (p.options ?? []).map((o) => (o.color ? o : { ...o, color: autoOptionColor(o.name) })) }
        : p,
    );

    // Keep board views pointing at a valid select property, and drop any
    // filters/sort that reference a property the user just deleted
    // (tidyViewsAfterSchema, shared with a row's page, spec 015).
    const fixedViews = tidyViewsAfterSchema(colored, views);
    // While the database's views are locked (spec 013) the views are sent
    // back exactly as they were, so only the schema is saved: the lock covers
    // the views, not the properties, and tidying the views here (a removed
    // property's filter, a board's missing grouping) would be refused and
    // take every property edit in the dialog down with it. A view that used a
    // removed property keeps the setting, as it does when an agent removes
    // one with update_schema.
    // A refused save keeps the dialog and every edit in it (conductor
    // review): when the views were locked from elsewhere after this dialog
    // opened, the save with tidied views is refused 409, the caller reloads
    // the config, and Save again sends the schema alone (above). Closing here
    // threw all of it away. The same for a property a locked view uses
    // (property_in_locked_view): the sentence names the view.
    if ((await onSave({ schema: colored, views: config.viewsLocked ? config.views : fixedViews })) === false) return;
    onClose();
  };

  return (
    <Portal>
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog wide">
        <h2>{t('Collection properties')}</h2>
        <div className="schema-list">
          {schema.map((p) => (
            <div
              key={p.id}
              className={'schema-item' +
                (dragProperty === p.id ? ' schema-dragging' : '') +
                (dropProperty?.id === p.id ? (dropProperty.after ? ' schema-drop-after' : ' schema-drop-before') : '')}
              onDragOver={(e) => {
                if (!dragProperty) return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                const bounds = e.currentTarget.getBoundingClientRect();
                setDropProperty(dragProperty === p.id ? null : {
                  id: p.id, after: e.clientY > bounds.top + bounds.height / 2,
                });
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropProperty(null);
              }}
              onDrop={(e) => {
                if (!dragProperty) return;
                e.preventDefault();
                e.stopPropagation();
                const bounds = e.currentTarget.getBoundingClientRect();
                moveProperty(dragProperty, p.id, e.clientY > bounds.top + bounds.height / 2);
                endPropertyDrag();
              }}
            >
              <div className="schema-row">
                <span
                  className="schema-drag-handle"
                  draggable
                  title={t('Drag to reorder property')}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', p.id);
                    setDragProperty(p.id);
                  }}
                  onDragEnd={endPropertyDrag}
                ><GripVertical size={16} aria-hidden="true" /></span>
                <input
                  className="prop-input"
                  value={p.name}
                  onChange={(e) => updateProp(p.id, { name: e.target.value })}
                />
                <PropertyTypeSelect value={p.type} onChange={(type) => changeType(p.id, type)} label={t('Type')} />
                <button className="icon-btn danger" title={t('Delete property')} onClick={() => void removeProp(p.id)}>
                  ✕
                </button>
              </div>
              <PropertyFields
                p={p}
                schema={schema}
                targets={targets}
                targetSchemas={targetSchemas}
                onPatch={(patch) => updateProp(p.id, patch)}
              />
            </div>
          ))}
        </div>
        <div className="schema-add">
          <input
            className="prop-input"
            placeholder={t('New property name')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addProp()}
          />
          <PropertyTypeSelect value={newType} onChange={setNewType} className="prop-select" label={t('Type')} />
          <button className="btn" onClick={addProp}>Add</button>
        </div>
        <div className="dialog-buttons">
          <button className="btn" onClick={onClose}>{t('Cancel')}</button>
          <button className="btn primary" onClick={save}>{t('Save')}</button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
