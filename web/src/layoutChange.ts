// Changing a view's layout from its Settings (spec 018, R3, R6): the steps
// around the pure rule in viewLayout.ts that need the person. Kept out of
// CollectionView.tsx, which is already past the size one reads at once.
//
//   1. A database's only form view, while a public form link exists: the link
//      stops working until there is a form view again, so ask first (FR-008).
//   2. A calendar or timeline on a database with no date property: offer to
//      add one, and save the property and the switched view in one request,
//      so they land together or not at all (R3). Without the right to change
//      the database's properties, say who can and change nothing (FR-004a).
//   3. Say the default the new layout was given and where it is changed
//      (FR-006).

import { api } from './api';
import { confirm } from './dialog';
import { t } from './i18n';
import { toast, toastError } from './toast';
import type { PropDef, ViewDef } from './types';
import { newDateProperty, switchLayout } from './viewLayout';

export interface LayoutChangeContext {
  collectionId: string;
  /** The views as stored (not a person's own filter or sort laid over them)
   *  and the schema, as they are NOW: read again after every wait (the form
   *  link, a dialog), because the config reloads while a dialog is open and
   *  a property an agent added meanwhile must not be saved away. */
  current: () => { views: ViewDef[]; schema: PropDef[] };
  /** In a document's embed (spec 014): its views live in the document. */
  embedded: boolean;
  /** Whether the person may change the database's properties. */
  canEditSchema: boolean;
  /** The interface's name for a layout, in the person's language: a view
   *  still named after its layout takes the new one's name. */
  label: (type: ViewDef['type']) => string;
  /** Saves the views (the database's, or the embed's in the document). */
  saveViews: (views: ViewDef[]) => void;
  /** Saves a new schema and views together, in one request (database views). */
  saveSchemaAndViews: (schema: PropDef[], views: ViewDef[]) => void;
  /** Saves only the schema (an embed: its views then go to the document). */
  saveSchema: (schema: PropDef[]) => Promise<boolean>;
}

export async function changeLayout(ctx: LayoutChangeContext, viewId: string, type: ViewDef['type']): Promise<void> {
  const first = ctx.current();
  const stored = first.views.find((v) => v.id === viewId);
  if (!stored || stored.type === type) return;

  if (stored.type === 'form' && !ctx.embedded && first.views.filter((v) => v.type === 'form').length === 1) {
    const shared = await api.formShareStatus(ctx.collectionId).then((s) => s.shared, () => false);
    if (
      shared &&
      !(await confirm(t('This is the only form view, and the database has a public form link. The link stops working until there is a form view again. Change the layout anyway?'), {
        confirmText: t('Change layout'),
      }))
    ) {
      return;
    }
  }

  let needsDate = switchLayout(stored, type, first.schema, ctx.label).needsDate;
  let added: PropDef | null = null;
  if (needsDate) {
    if (!ctx.canEditSchema) {
      toastError(t('This layout shows rows by date, and the database has no date property. Someone who can edit the database can add one.'));
      return;
    }
    const prop = newDateProperty(first.schema, t('Date'));
    if (!(await confirm(t('This layout shows rows by date, and the database has no date property. Add one named {name}?', { name: prop.name }), { confirmText: t('Add and switch') }))) {
      return;
    }
    added = prop;
  }

  // From here on, what is current: the waits above may have taken a while.
  const now = ctx.current();
  const latest = now.views.find((v) => v.id === viewId);
  if (!latest) return;
  let schema = now.schema;
  if (added) {
    // Someone may have added a date property meanwhile; then it is used and
    // nothing is added.
    needsDate = switchLayout(latest, type, schema, ctx.label).needsDate;
    if (needsDate) {
      const prop = schema.some((p) => p.id === added!.id) ? newDateProperty(schema, added.name) : added;
      schema = [...schema, prop];
    }
  }
  const { view } = switchLayout(latest, type, schema, ctx.label);
  const next = now.views.map((v) => (v.id === viewId ? view : v));
  if (schema === now.schema) {
    ctx.saveViews(next);
  } else if (ctx.embedded) {
    // The property is the database's, the view the document's: the property
    // first, and the view only once it is there.
    if (!(await ctx.saveSchema(schema))) return;
    ctx.saveViews(next);
  } else {
    ctx.saveSchemaAndViews(schema, next);
  }
  const said =
    schema !== now.schema && (view.type === 'calendar' || view.type === 'timeline')
      ? t('Added the date property {name}. Change the dates in Settings.', { name: schema[schema.length - 1].name })
      : defaultSaid(latest, view, schema);
  if (said) toast(said);
}

/** The default the switch gave the view, and where it is changed (FR-006);
 *  "" when it chose nothing (the view already had what the layout needs). */
function defaultSaid(before: ViewDef, after: ViewDef, schema: PropDef[]): string {
  const name = (id: string | undefined) => schema.find((p) => p.id === id)?.name;
  switch (after.type) {
    case 'board': {
      const g = name(after.groupBy);
      return g && after.groupBy !== before.groupBy ? t('Grouped by {name}. Change it with Group.', { name: g }) : '';
    }
    case 'calendar':
    case 'timeline': {
      const d = name(after.dateProp);
      return d && after.dateProp !== before.dateProp ? t('Dates from {name}. Change them in Settings.', { name: d }) : '';
    }
    case 'chart': {
      if (before.chartKind && after.groupBy === before.groupBy) return '';
      const g = name(after.groupBy);
      return g ? t('Counted by {name}. Change it in the chart settings.', { name: g }) : t('Shown as a chart. Change it in the chart settings.');
    }
  }
  return '';
}
