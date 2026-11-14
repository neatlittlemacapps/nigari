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
  /** Answers whether it was saved (from a document the person may decline). */
  onSave: (p: PropDef) => Promise<boolean>;
  onDelete: (p: PropDef) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<PropDef>(property);
  const [saved, setSaved] = useState<PropDef>(property);
  const withDraft = schema.map((x) => (x.id === draft.id ? draft : x));
  const targetSchemas = useTargetSchemas(withDraft);

  // An emptied name keeps the one it had, as Rename does.
  const named = (d: PropDef): PropDef => (d.name.trim() ? { ...d, name: d.name.trim() } : { ...d, name: saved.name });

  const close = () => {
    // Nothing changed since the last save: nothing to send.
    const next = named(draft);
    if (JSON.stringify(next) !== JSON.stringify(saved)) void onSave(next);
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
      trapFocus={false}
      onOpenChange={(o, details) => {
        if (o) return;
        // A select option's editor (PropertyFields) opens in a portal of its
        // own, outside this panel: a press there edits the option, it does
        // not leave the panel.
        const target = details.event?.target;
        if (target instanceof Element && target.closest('.schema-option-editor, .schema-option-backdrop')) {
          details.cancel();
          return;
        }
        close();
      }}
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
          onChange={async (type) => {
            const next = changePropertyType(named(draft), type);
            setDraft(next);
            // Saved at once; declined (from a document) or refused, the
            // draft goes back to the stored type.
            if (await onSave(next)) setSaved(next);
            else setDraft((d) => ({ ...d, type: saved.type, options: saved.options, rollupAgg: saved.rollupAgg }));
          }}
        />
      </div>
      <PropertyFields p={draft} schema={withDraft} targets={targets} targetSchemas={targetSchemas} onPatch={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
      <Button
        variant="danger"
        size="sm"
        className="row-prop-panel-delete"
        onClick={() => {
          // The panel's edits are saved first, so Cancel on the question
          // keeps them (they were made, and the property stays).
          close();
          onDelete(property);
        }}
      >
        {t('Delete property')}
      </Button>
    </Popover>
  );
}
