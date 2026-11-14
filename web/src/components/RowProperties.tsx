import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ChevronDown, ChevronUp, EyeDashed, Plus } from 'lucide-react';
import { api } from '../api';
import { toast } from '../toast';
import { confirm } from '../dialog';
import { plural, t } from '../i18n';
import type { CollectionConfig, PropDef, PropOption, PropType } from '../types';
import PropertyValue from './PropertyValue';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import { Menu, type MenuPoint } from '../ui/Menu';
import { Popover } from '../ui/Popover';
import { PropertyActionItems } from './PropertyActionItems';
import { PropertyTypeSelect } from './PropertyFields';
import { EditPropertyPanel } from './EditPropertyPanel';
import { deletePropertyMessage } from '../propertyDelete';
import { changeSchema } from '../propertyChange';
import { addProperty, applyPropertyChange, duplicateProperty, emptyAtOpen, visibleOnRowPage } from '../rowProperties';

// A database row's typed properties on its page (Status, Priority, … as real
// fields, not text in the body), shown when the page is a child of a
// collection. Reuses the cells (PropertyValue) of the table and board.
//
// Spec 015 (#582): someone who may change the database also manages the
// properties from here. A name opens the property's menu, built from the one
// property action list (actions/propertyActions.ts) like a table heading's;
// Edit property opens the Edit properties dialog's fields for this property
// alone (PropertyFields); **+ Add a property** adds one; and properties can be
// hidden on row pages, folded under "N more properties".
//
// Every change starts from the schema as stored a moment ago and saves the
// schema alone (rowProperties.ts, research R5): this page's copy is as old as
// the page, and saving it would undo what was changed elsewhere since.

export default function RowProperties({
  pageId,
  parentId,
  initialProps,
  canEdit,
  databaseName,
  titleOf,
  targets,
}: {
  pageId: string;
  parentId: string;
  initialProps: Record<string, unknown>;
  canEdit: boolean;
  /** The database's name as the reader sees it, for the delete confirmation. */
  databaseName: string;
  titleOf: (id: string) => string | undefined;
  /** The databases a relation may point at. */
  targets: { id: string; title: string }[];
}) {
  const [config, setConfig] = useState<CollectionConfig | null>(null);
  const [props, setProps] = useState<Record<string, unknown>>(initialProps ?? {});
  // Which Hide-when-empty properties were empty when this page opened (R7).
  const [emptyAtStart, setEmptyAtStart] = useState<Set<string> | null>(null);
  const [unfolded, setUnfolded] = useState(false);
  // The menu stays mounted after it closes: an item that opens a dialog
  // (Delete property) runs once the menu has finished closing (ui/Menu's
  // AfterClose), which an unmounted menu never does.
  const [menuFor, setMenuFor] = useState<{ id: string; at: MenuPoint } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | null>(null);
  const [editing, setEditing] = useState<PropDef | null>(null);
  const [adding, setAdding] = useState<{ name: string; type: PropType } | null>(null);
  const names = useRef(new Map<string, HTMLButtonElement>());
  const anchor = useRef<HTMLElement | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setProps(initialProps ?? {});
  }, [pageId, initialProps]);

  // A new page: fold again and take the empty ones afresh.
  useEffect(() => {
    setUnfolded(false);
    setEmptyAtStart(null);
    setRenaming(null);
    setEditing(null);
  }, [pageId]);

  const load = () =>
    api
      .getCollection(parentId)
      .then((c) => setConfig(c))
      .catch(() => {});

  useEffect(() => {
    let alive = true;
    api
      .getCollection(parentId)
      .then((c) => alive && setConfig(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [parentId]);

  useEffect(() => {
    if (config && !emptyAtStart) setEmptyAtStart(emptyAtOpen(config.schema, initialProps ?? {}));
  }, [config, emptyAtStart, initialProps]);

  if (!config) return null;
  const schema = config.schema;
  const { shown, folded } = visibleOnRowPage(schema, emptyAtStart ?? new Set());
  if (schema.length === 0 && !canEdit) return null;

  const setProp = async (propId: string, value: unknown) => {
    setProps((p) => ({ ...p, [propId]: value }));
    try {
      await api.updatePage(pageId, { propsPatch: { [propId]: value } });
    } catch {
      toast(t('Property not saved'));
    }
  };

  /** One change to the stored schema (propertyChange.ts). A refusal says
   *  why and reloads. */
  const change = async (next: (stored: PropDef[]) => PropDef[], tidyViews = false): Promise<boolean> => {
    try {
      setConfig(await changeSchema(parentId, next, tidyViews));
      return true;
    } catch (e) {
      toast((e as Error).message);
      void load();
      return false;
    }
  };

  const setOptions = (propId: string, options: PropOption[]) => void change((s) => applyPropertyChange(s, propId, { options }));

  const openMenu = (id: string) => {
    const r = names.current.get(id)?.getBoundingClientRect();
    if (!r) return;
    setMenuFor({ id, at: { x: r.left, y: r.bottom } });
    setMenuOpen(true);
  };

  const remove = async (p: PropDef) => {
    const other = p.relationCollection ? titleOf(p.relationCollection) : undefined;
    const ok = await confirm(deletePropertyMessage(t, p, databaseName, other), { confirmText: t('Delete property'), danger: true });
    if (ok) await change((s) => s.filter((x) => x.id !== p.id), true);
  };

  const finishRename = (save: boolean) => {
    const r = renaming;
    setRenaming(null);
    if (!r) return;
    const name = r.draft.trim();
    if (save && name) void change((s) => applyPropertyChange(s, r.id, { name }));
    requestAnimationFrame(() => names.current.get(r.id)?.focus());
  };

  const menuProp = menuFor ? schema.find((p) => p.id === menuFor.id) : undefined;

  const row = (p: PropDef, isFolded: boolean) => (
    <div key={p.id} className={'row-prop' + (isFolded ? ' row-prop--hidden' : '')}>
      <div className="row-prop-label" title={p.name}>
        {renaming?.id === p.id ? (
          <Input
            autoFocus
            className="row-prop-rename"
            aria-label={t('Property name')}
            value={renaming.draft}
            onChange={(e) => setRenaming({ id: p.id, draft: e.target.value })}
            onKeyDown={(e: ReactKeyboardEvent) => {
              if (e.key === 'Enter') finishRename(true);
              if (e.key === 'Escape') {
                e.stopPropagation();
                finishRename(false);
              }
            }}
            onBlur={() => finishRename(true)}
          />
        ) : canEdit ? (
          <Button
            ref={(el) => {
              if (el) names.current.set(p.id, el);
              else names.current.delete(p.id);
            }}
            variant="ghost"
            size="sm"
            className="row-prop-name"
            aria-haspopup="menu"
            aria-expanded={menuOpen && menuFor?.id === p.id ? true : undefined}
            onClick={() => openMenu(p.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenuFor({ id: p.id, at: { x: e.clientX, y: e.clientY } });
              setMenuOpen(true);
            }}
          >
            {p.name}
          </Button>
        ) : (
          <span className="row-prop-name">{p.name}</span>
        )}
        {isFolded && (
          <EyeDashed size={12} className="row-prop-hidden-mark" aria-label={t('Hidden on row pages')} role="img" />
        )}
      </div>
      <div className="row-prop-value">
        <PropertyValue
          def={p}
          value={props[p.id]}
          onChange={canEdit ? (v) => setProp(p.id, v) : undefined}
          onOptionsChange={canEdit ? (o) => setOptions(p.id, o) : undefined}
          readOnly={!canEdit}
          showEmpty
        />
      </div>
    </div>
  );

  return (
    <div className="row-props">
      {shown.map((p) => row(p, false))}
      {unfolded && folded.map((p) => row(p, true))}
      {(canEdit || folded.length > 0) && (
        <div className="row-props-foot">
          {canEdit && (
            <Popover
              label={t('Add a property')}
              closeLabel={t('Close')}
              align="start"
              open={!!adding}
              onOpenChange={(o) => setAdding(o ? { name: '', type: 'text' } : null)}
              trigger={
                <Button ref={addButton} variant="ghost" size="sm" className="row-props-add">
                  <Plus size={14} aria-hidden="true" />
                  {t('Add a property')}
                </Button>
              }
            >
              {adding && (
                <form
                  className="row-props-add-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const a = adding;
                    setAdding(null);
                    void change((s) => addProperty(s, a.type, a.name));
                  }}
                >
                  <Input
                    autoFocus
                    aria-label={t('Property name')}
                    placeholder={t('Property name')}
                    value={adding.name}
                    onChange={(e) => setAdding({ ...adding, name: e.target.value })}
                  />
                  <PropertyTypeSelect
                    value={adding.type}
                    className="prop-select"
                    label={t('Type')}
                    onChange={(type) => setAdding({ ...adding, type })}
                  />
                  <Button type="submit" variant="primary" size="sm">
                    {t('Add')}
                  </Button>
                </form>
              )}
            </Popover>
          )}
          {folded.length > 0 && (
            <Button variant="ghost" size="sm" className="row-props-fold" aria-expanded={unfolded} onClick={() => setUnfolded((u) => !u)}>
              {unfolded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
              {unfolded
                ? plural(folded.length, 'Hide {n} property', 'Hide {n} properties')
                : plural(folded.length, '{n} more property', '{n} more properties')}
            </Button>
          )}
        </div>
      )}
      {menuProp && (
        <Menu
          label={t('{name} property', { name: menuProp.name })}
          open={menuOpen}
          onOpenChange={(o) => !o && setMenuOpen(false)}
          anchorPoint={menuFor!.at}
          returnFocus={{ current: names.current.get(menuProp.id) ?? null }}
        >
          <PropertyActionItems
            place="rowPage"
            handlers={{
              rename: () => setRenaming({ id: menuProp.id, draft: menuProp.name }),
              editProperty: () => {
                anchor.current = names.current.get(menuProp.id) ?? null;
                setEditing({ ...menuProp });
              },
              rowPageVisibility: {
                value: menuProp.pageVisibility,
                onChange: (v) => void change((s) => applyPropertyChange(s, menuProp.id, { pageVisibility: v })),
              },
              duplicate: () =>
                void change((s) => duplicateProperty(s, menuProp.id, t('Copy of {name}', { name: menuProp.name }))),
              delete: () => void remove(menuProp),
            }}
          />
        </Menu>
      )}
      {editing && (
        <EditPropertyPanel
          key={editing.id}
          property={editing}
          schema={schema}
          targets={targets}
          anchor={anchor}
          onSave={(p) => void change((s) => s.map((x) => (x.id === p.id ? p : x)))}
          onDelete={(p) => void remove(p)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
