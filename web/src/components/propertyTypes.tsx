import type { PropDef, PropType } from '../types';

// A property's types, the picker and the type change: small enough to load
// with every page, where PropertyFields (the type settings) loads only when a
// panel or the Edit properties dialog opens (spec 015, the main bundle's cap).

export const TYPES: { value: PropType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Select' },
  { value: 'multiselect', label: 'Multi-select' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Checkbox' },
  // A checklist is not a checkbox with extra steps: it holds sub-tasks and
  // shows their progress, which is what a card needs to say "half done".
  { value: 'checklist', label: 'Checklist' },
  // The server has long known url (validPropTypes) and MCP advertises it —
  // only the interface never offered it and quietly treated it as text.
  { value: 'url', label: 'URL' },
  { value: 'person', label: 'Person' },
  { value: 'relation', label: 'Relation' },
  { value: 'backrelation', label: 'Backrelation' },
  { value: 'rollup', label: 'Rollup' },
  // Read-only and self-updating: there is nothing to configure, which is why it
  // sits with the computed types rather than the ones you fill in.
  { value: 'lastActivity', label: 'Last activity' },
  { value: 'formula', label: 'Formula' },
];

/** A property with a new type. Non-destructive (Q23): existing row values stay
 *  in pages.props and are coerced at render, so a text→number switch keeps the
 *  raw string; only the schema side is adjusted. */
export function changePropertyType(p: PropDef, type: PropType): PropDef {
  const next: PropDef = { ...p, type };
  if (type === 'select' || type === 'multiselect') next.options = p.options ?? [];
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
      {TYPES.map((x) => (
        <option key={x.value} value={x.value}>
          {x.label}
        </option>
      ))}
    </select>
  );
}

