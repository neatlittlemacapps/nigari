// Asserts where a database toolbar menu is drawn on a phone (src/anchoredMenu.ts
// and the ui/Menu sheet that reads it).
//
//   node scripts/check-anchoredmenu.mjs
//
// Why this exists: on a phone the templates menu beside New and the view
// options menu were drawn inside the sideways-scrolling toolbar, which clipped
// them to a white rim under the buttons. Where a menu goes is a rule now, and a
// rule nobody checks drifts back.
//
// Until spec 012 this check also covered anchoredMenuStyle, the hand-placed
// version of the rule the Columns popover used (fixed position, bottom sheet
// on a phone, right-aligned under the button on a desktop). Spec 012 moved
// property visibility into the Settings menu, a ui/Menu, and removed the
// popover; anchoredMenuStyle had no caller left and was removed with its
// cases. What remains is the rule every toolbar menu now follows through
// ui/Menu: one breakpoint, and a sheet below it.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(web, f), 'utf8');
const out = [];
const check = (name, ok) => out.push({ name, ok });

const am = read('src/anchoredMenu.ts');
const menu = read('src/ui/Menu.tsx');
const css = read('src/ui/Menu.css');
const view = read('src/components/CollectionView.tsx') + read('src/components/ViewSettingsMenu.tsx');

const width = Number(/export const SHEET_MAX_WIDTH = (\d+);/.exec(am)?.[1]);
check('the breakpoint is a phone width (640px)', width === 640);
check('ui/Menu reads the breakpoint from anchoredMenu.ts', /import \{ SHEET_MAX_WIDTH \} from '\.\.\/anchoredMenu'/.test(menu));
check('ui/Menu turns it into a max-width query', /max-width: \$\{SHEET_MAX_WIDTH\}px/.test(menu));
check('the sheet is fixed to the bottom edge, full width', /\.ui-menu-positioner\[data-sheet\]\s*\{[^}]*position: fixed[^}]*inset: auto var\(--space-200\) var\(--space-200\) var\(--space-200\)/.test(css));
check('a menu of its own max-width does not narrow the sheet', /\[data-sheet\] \.ui-menu\s*\{[^}]*max-width: none/.test(css));
// Every toolbar menu that opens from a button asks for the sheet.
const toolbarMenus = (view.match(/<Menu\b[^>]*?label=\{t\('(?:Templates|\{name\} view settings)'[\s\S]*?>/g) ?? []);
check('the templates menu and the Settings menu exist', toolbarMenus.length === 2);
check('both are sheets on a phone', toolbarMenus.length === 2 && toolbarMenus.every((m) => m.includes('narrow="sheet"')));
check('no hand-placed toolbar menu is left', !/anchoredMenuStyle/.test(view));

let fail = 0;
for (const c of out) {
  if (!c.ok) {
    fail++;
    console.log(`  FAIL ${c.name}`);
  }
}
console.log(`\n  toolbar menus: ${out.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
