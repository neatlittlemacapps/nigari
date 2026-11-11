// What CollectionView and the views it renders in their own modules
// (BoardView) share about a row and its grouping. Kept apart so a view moved
// out of the big file does not have to import from it back.

import type { PropDef } from './types';

export interface Row {
  id: string;
  title: string;
  icon: string;
  cover: string;
  props: Record<string, unknown>;
  position: number;
  tags?: string[];
}

export const UNSET = '__unset__';

// The value to store for a group option, respecting the property's type.
// A relation holds an array of ids, same shape as a multiselect — dragging a
// card into the "nigari" column therefore means "this task belongs to nigari".
export function groupValueFor(schema: PropDef[], propId: string, optId: string): unknown {
  const prop = schema.find((p) => p.id === propId);
  return prop?.type === 'multiselect' || prop?.type === 'relation' ? [optId] : optId;
}
