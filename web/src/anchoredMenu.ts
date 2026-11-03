// Where a menu opened from a database toolbar button is drawn on a phone.
//
// On a phone the toolbar is a single row that scrolls sideways
// (.collection-toolbar in styles.css), and a scrolling box clips whatever is
// drawn inside it. A menu placed under its button with position: absolute was
// therefore cut off at the toolbar's lower edge: the backdrop dimmed the page,
// and of the menu itself only a white rim showed. The templates menu beside
// New and the view options menu (…) both did this.
//
// So every toolbar menu is a ui/Menu with narrow="sheet": portaled into
// <body>, and at or below this width a sheet along the bottom edge, full
// width, which the thumb reaches and no toolbar can clip (Menu.css,
// [data-sheet]). Above it, Base UI places the menu under its button.
//
// This file held anchoredMenuStyle as well, the hand-placed version of that
// rule, for the Columns popover, which was not a ui/Menu. Spec 012 moved
// property visibility into the Settings menu and the popover went with it,
// leaving no caller; the function went too (check-anchoredmenu.mjs says so).

/** At or below this window width a toolbar menu becomes a bottom sheet. */
export const SHEET_MAX_WIDTH = 640;
