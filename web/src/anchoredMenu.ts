// Where a menu opened from a database toolbar button is drawn.
//
// On a phone the toolbar is a single row that scrolls sideways
// (.collection-toolbar in styles.css), and a scrolling box clips whatever is
// drawn inside it. A menu placed under its button with position: absolute was
// therefore cut off at the toolbar's lower edge: the backdrop dimmed the page,
// and of the menu itself only a white rim showed. The templates menu beside
// New and the view options menu (…) both did this; the filter popover did not,
// because it was already drawn into <body> through a Portal and placed by this
// rule. Spec 012 moved the menus to ui/Menu and removed the Columns popover;
// FilterSortControls is the one caller left, and the breakpoint is shared, so
// a popover and a menu cannot disagree about where a phone begins.
//
// So every toolbar menu is portaled. The menus (templates, a view's Settings)
// are ui/Menu with narrow="sheet", which reads SHEET_MAX_WIDTH below and draws
// the sheet in CSS (Menu.css, [data-sheet]). The filter, sort and group
// popovers are not menus and place themselves, through this function:
//   - narrow screens: a sheet along the bottom edge, full width, which the
//     thumb reaches and no toolbar can clip;
//   - wider screens: under the button, its right edge on the button's right
//     edge, pushed back inside the window when that would leave it.
//
// Every side is set, auto included, so a stylesheet's own top/right for the
// inline version of a menu cannot stretch the sheet across the whole screen.

import type { CSSProperties } from 'react';

/** At or below this window width a menu becomes a bottom sheet. */
export const SHEET_MAX_WIDTH = 640;

const EDGE = 8;

export interface AnchorRect {
  right: number;
  bottom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/**
 * The fixed position of a menu `width` pixels wide, opened from a button whose
 * rectangle is `anchor`. With `scroll`, the menu gets a height limit and
 * scrolls inside it (for long lists); without, it keeps its natural height,
 * so a sub-menu inside it is not clipped.
 */
export function anchoredMenuStyle(anchor: AnchorRect, viewport: Viewport, width: number, scroll = false): CSSProperties {
  if (viewport.width <= SHEET_MAX_WIDTH) {
    return {
      position: 'fixed',
      top: 'auto',
      left: EDGE,
      right: EDGE,
      bottom: EDGE,
      width: 'auto',
      maxWidth: 'none',
      ...(scroll ? { maxHeight: viewport.height * 0.72, overflowY: 'auto' } : {}),
    };
  }
  const left = Math.max(EDGE, Math.min(anchor.right - width, viewport.width - width - EDGE));
  const top = anchor.bottom + 6;
  return {
    position: 'fixed',
    top,
    left,
    right: 'auto',
    bottom: 'auto',
    width,
    ...(scroll ? { maxHeight: viewport.height - anchor.bottom - 24, overflowY: 'auto' } : {}),
  };
}
