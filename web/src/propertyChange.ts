// Saving one change to a database's properties from outside the Edit
// properties dialog: a row's page or a table's column heading (spec 015,
// research R5, R6).
//
// The change is applied to the schema as stored a moment ago, not to the copy
// the screen loaded when it opened: saving that copy would undo whatever was
// changed elsewhere since (handlePutCollection's comment tells the same story
// for views). Only the schema is sent, unless the change removed a property:
// then the views are tidied with the dialog's rule, except while they are
// locked (spec 013), when the server keeps them and refuses a property a
// locked view uses (property_in_locked_view), which the caller shows.

import { api } from './api';
import type { CollectionConfig, PropDef } from './types';
import { tidyViewsAfterSchema } from './propertyDelete';

export async function changeSchema(
  collectionId: string,
  next: (stored: PropDef[]) => PropDef[],
  tidyViews = false,
): Promise<CollectionConfig> {
  const fresh = await api.getCollection(collectionId);
  const schema = next(fresh.schema);
  const body: Partial<CollectionConfig> = { schema };
  if (tidyViews && !fresh.viewsLocked) body.views = tidyViewsAfterSchema(schema, fresh.views);
  const saved = await api.putCollection(collectionId, body);
  return { ...fresh, ...saved };
}
