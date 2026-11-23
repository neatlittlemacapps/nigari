// Why a place leaves out a row action (rowActions.ts). Read by
// check-content-actions.mjs, which fails an action missing from a place
// without a reason here; the app never needs the sentences.

import type { RowAction, RowPlace } from './rowActions';

export const ROW_LEFT_OUT: Partial<Record<RowAction['id'], Partial<Record<RowPlace, string>>>> = {
  addRowBelow: {
    boardCard: 'A board has no order between columns to add below in: a new card is added in its column, with the column’s own +.',
  },
  moveToColumn: {
    table: 'A table has no columns of values to move a row between; the row’s property is changed in its cell or under Edit property.',
  },
};
