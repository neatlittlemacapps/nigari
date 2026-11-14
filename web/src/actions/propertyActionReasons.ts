// Why a place leaves out a property action (propertyActions.ts). Read by
// check-content-actions.mjs, which fails an action missing from a place
// without a reason here; the app never needs the sentences, so they stay out
// of its bundle.

import type { PropertyAction, PropertyPlace } from './propertyActions';

const NO_VIEW_ON_A_ROW_PAGE =
  'A row’s page shows no view: its properties follow the schema’s order, and it hides them with Property visibility.';

export const PROPERTY_LEFT_OUT: Partial<Record<PropertyAction['id'], Partial<Record<PropertyPlace, string>>>> = {
  rowPageVisibility: {
    view: 'A view shows its columns its own way (Hide in view, its Settings); the row page’s setting does not apply to it, so it is set where it shows.',
  },
  moveLeft: { rowPage: NO_VIEW_ON_A_ROW_PAGE },
  moveRight: { rowPage: NO_VIEW_ON_A_ROW_PAGE },
  hideInView: { rowPage: NO_VIEW_ON_A_ROW_PAGE },
};
