// Deleting a property, wherever it is deleted from (spec 015, research R6):
// the Edit properties dialog, a row's page, a table's column heading. One
// confirmation and one rule for the views it leaves, so the places cannot say
// or do different things.
//
// The confirmation (#524): saved, a property leaves every view of the
// database. A relation's links go with it, on both sides: the other database's
// back-relation is computed from them (derived.go), so it shows nothing once
// they are gone.

import type { PropDef, ViewDef } from './types';

type Translate = (key: string, vars?: Record<string, string>) => string;

/** The confirmation's text: the property and the database, and for a relation
 *  the database its links point at. */
export function deletePropertyMessage(
  t: Translate,
  prop: Pick<PropDef, 'name' | 'type' | 'relationCollection'>,
  databaseName: string,
  otherDatabaseName?: string,
): string {
  let message = t('Delete “{property}” from “{database}”? It will be removed from all views.', {
    property: prop.name || t('Untitled'),
    database: databaseName,
  });
  if (prop.type === 'relation' && prop.relationCollection) {
    message += '\n' + t('Its links to rows of “{database}” go with it.', { database: otherDatabaseName || t('Untitled') });
  }
  return message;
}

/** The views after a schema change: a board keeps a property it can group by,
 *  a calendar a date, and filters, sort and hidden lists drop properties that
 *  are gone. Unchanged views come back as they were. */
export function tidyViewsAfterSchema(schema: PropDef[], views: ViewDef[]): ViewDef[] {
  const propIds = new Set(schema.map((p) => p.id));
  // A board may group by a relation as well; leaving relations out here reset
  // "group by System" to the first select property on every save.
  const groupable = schema.filter((p) => p.type === 'select' || p.type === 'multiselect' || p.type === 'relation');
  const dates = schema.filter((p) => p.type === 'date');
  return views.map((v) => {
    const next = { ...v };
    if (v.type === 'board' && !propIds.has(v.groupBy ?? '')) {
      next.groupBy = groupable[0]?.id ?? '';
    }
    if (v.type === 'calendar' && !propIds.has(v.dateProp ?? '')) {
      next.dateProp = dates[0]?.id ?? '';
    }
    if (v.filters) next.filters = v.filters.filter((f) => propIds.has(f.property));
    if (v.sort && !propIds.has(v.sort.property)) next.sort = null;
    if (v.hidden) next.hidden = v.hidden.filter((id) => propIds.has(id));
    return next;
  });
}
