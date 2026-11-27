import type { PropDef, PropType } from '../types';
import { fillEmptyGroups, orderByGroup } from '../statusGroups';
import { optionId } from '../rowProperties';
import { t } from '../i18n';

// A property's types, the picker and the type change: small enough to load
// with every page, where PropertyFields (the type settings) loads only when a
// panel or the Edit properties dialog opens (spec 015, the main bundle's cap).

/** The types a property can have, in the picker's order, named in the
 *  reader's language. A function, not a constant: the names were plain
 *  strings in a list, so nothing translated them and check-i18n could not
 *  see them (#1117). Each is a literal t() call for that reason. */
export function propertyTypes(): { value: PropType; label: string }[] {
  return [
    { value: 'text', label: t('Text') },
    { value: 'number', label: t('Number') },
    { value: 'select', label: t('Select') },
    { value: 'multiselect', label: t('Multi-select') },
    // Options like a select, each in one of three groups (spec 016).
    { value: 'status', label: t('Status') },
    { value: 'date', label: t('Date') },
    { value: 'checkbox', label: t('Checkbox') },
    // A checklist is not a checkbox with extra steps: it holds sub-tasks and
    // shows their progress, which is what a card needs to say "half done".
    { value: 'checklist', label: t('Checklist') },
    // The server has long known url (validPropTypes) and MCP advertises it —
    // only the interface never offered it and quietly treated it as text.
    { value: 'url', label: t('URL') },
    // Uploads to this nigari, shown as thumbnails and file chips (spec 028).
    { value: 'files', label: t('Files & media') },
    { value: 'person', label: t('Person') },
    { value: 'relation', label: t('Relation') },
    { value: 'backrelation', label: t('Backrelation') },
    { value: 'rollup', label: t('Rollup') },
    // Read-only and self-updating: there is nothing to configure, which is why it
    // sits with the computed types rather than the ones you fill in.
    { value: 'lastActivity', label: t('Last activity') },
    { value: 'formula', label: t('Formula') },
  ];
}

/** A property with a new type. Non-destructive (Q23): existing row values stay
 *  in pages.props and are coerced at render, so a text→number switch keeps the
 *  raw string; only the schema side is adjusted. */
export function changePropertyType(p: PropDef, type: PropType): PropDef {
  const next: PropDef = { ...p, type };
  // Stays a literal test: this is the conversion to select/multiselect only. A
  // status keeps its option ids and loses only the group (FR-011): a row's
  // value is an option id either way, so nothing in the rows is rewritten.
  if (type === 'select' || type === 'multiselect') next.options = (p.options ?? []).map(({ group: _group, ...o }) => o);
  // To a status: each option is placed by its name, an empty group gets a
  // default option, a type with no options gets one per group (R6), and the options are kept in group order (R2). The
  // server does the same for an agent; statusGroups.ts is the shared guess.
  if (type === 'status') {
    next.options = orderByGroup(
      p.type === 'status' ? p.options ?? [] : fillEmptyGroups(p.options ?? [], optionId),
    );
  }
  if (type === 'rollup' && !next.rollupAgg) next.rollupAgg = 'sum';
  return next;
}

/** The property-type picker the dialog and the panel share. */
export function PropertyTypeSelect({ value, onChange, className = 'prop-select schema-type-select', label }: {
  value: PropType;
  onChange: (type: PropType) => void;
  className?: string;
  label?: string;
}) {
  return (
    <select className={className} value={value} aria-label={label} onChange={(e) => onChange(e.target.value as PropType)}>
      {propertyTypes().map((x) => (
        <option key={x.value} value={x.value}>
          {x.label}
        </option>
      ))}
    </select>
  );
}

