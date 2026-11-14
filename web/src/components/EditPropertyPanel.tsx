import { useState, type RefObject } from 'react';
import { t } from '../i18n';
import type { PropDef } from '../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import { Popover } from '../ui/Popover';
import { PropertyFields, PropertyTypeSelect, changePropertyType, useTargetSchemas } from './PropertyFields';

// One property's Edit property panel, beside its name on a row's page or its
// heading in a table (spec 015, research R4). The fields are the Edit
// properties dialog's own (PropertyFields). The panel edits a draft that is
// saved when it closes (Escape, a click outside); a type change is saved at
// once, so the fields that come with the new type work on what is stored.

export function EditPropertyPanel({
  property,
  schema,
  targets,
  anchor,
  onSave,
  onDelete,
  onClose,
}: {
  property: PropDef;
  /** The whole schema the property belongs to (a formula lists the others). */
  schema: PropDef[];
  targets: { id: string; title: string }[];
  anchor: RefObject<HTMLElement | null>;
  onSave: (p: PropDef) => void;
  onDelete: (p: PropDef) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<PropDef>(property);
  const [saved, setSaved] = useState<PropDef>(property);
  const withDraft = schema.map((x) => (x.id === draft.id ? draft : x));
  const targetSchemas = useTargetSchemas(withDraft);

  const close = () => {
    // Nothing changed since the last save: nothing to send.
    // An emptied name keeps the one it had, as Rename does.
    const next = draft.name.trim() ? { ...draft, name: draft.name.trim() } : { ...draft, name: saved.name };
    if (JSON.stringify(next) !== JSON.stringify(saved)) onSave(next);
    onClose();
  };

  return (
    <Popover
      label={t('Edit property')}
      closeLabel={t('Close')}
      align="start"
      open
      anchor={anchor}
      returnFocus={anchor}
      onOpenChange={(o) => !o && close()}
      className="row-prop-panel"
    >
      <div className="row-prop-panel-head">
        <Input
          aria-label={t('Property name')}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && close()}
        />
        <PropertyTypeSelect
          value={draft.type}
          className="prop-select"
          label={t('Type')}
          onChange={(type) => {
            const next = changePropertyType(draft, type);
            setDraft(next);
            setSaved(next);
            onSave(next);
          }}
        />
      </div>
      <PropertyFields p={draft} schema={withDraft} targets={targets} targetSchemas={targetSchemas} onPatch={(patch) => setDraft({ ...draft, ...patch })} />
      <Button
        variant="danger"
        size="sm"
        className="row-prop-panel-delete"
        onClick={() => {
          onClose();
          onDelete(property);
        }}
      >
        {t('Delete property')}
      </Button>
    </Popover>
  );
}
