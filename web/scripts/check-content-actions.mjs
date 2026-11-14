// Each kind of content lists its actions once, and its menus are built from
// that list (the Content actions row in .specify/memory/surfaces.md; spec 015
// research R11, R12; docs/decisions.md 2026-11-13).
//
//   node scripts/check-content-actions.mjs
//
// Why this exists: the code graph shows where menus are, not what belongs in
// them, and the same content had come to offer different actions in
// different places (a page's ⋯ and its sidebar row share 2 of their 12 and 11
// functions). Properties are the first kind with a list
// (src/actions/propertyActions.ts). This fails when:
//
//   1. an action neither applies to a place nor says why it is left out
//      there (or does both);
//   2. a group holds more than 3 related actions and is not a submenu, or a
//      submenu is not a choice among values or such a group;
//   3. the renderer (PropertyActionItems.tsx) does not draw an action of the
//      list with its function written as a literal (a choice is drawn by the
//      one file named for it in CHOICE_FILES, passed in by its place);
//   4. a menu of the content (RowProperties.tsx, TableColumnHead.tsx) has
//      items of its own instead of the renderer's, or does not use it for
//      its place.
//
// A self-test runs first on lists that must fail: a check that finds nothing
// because it broke is worse than no check.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const src = join(web, 'src');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-contentactions-'));
const bundle = join(tmp, 'propertyActions.mjs');
const reasonsBundle = join(tmp, 'propertyActionReasons.mjs');

const PLACES = ['rowPage', 'view'];
const MENUS = { rowPage: 'components/RowProperties.tsx', view: 'components/TableColumnHead.tsx' };
// A choice only one place has is drawn by a file of its own, which that place
// passes to the renderer; it must still name its function as a literal.
const CHOICE_FILES = { rowPageVisibility: 'components/RowPageVisibilityMenu.tsx' };

/** Rules 1 and 2 on a list; answers the failures. */
function listFailures(actions, menuSections, SUBMENU_ABOVE, reasons) {
  const fails = [];
  for (const a of actions) {
    for (const place of PLACES) {
      const applies = a.places.includes(place);
      const reason = (reasons[a.id]?.[place] ?? '').trim();
      if (!applies && !reason) fails.push(`${a.id}: not in ${place} and no reason in propertyActionReasons.ts`);
      if (applies && reason) fails.push(`${a.id}: in ${place} and also left out there`);
    }
  }
  for (const place of PLACES) {
    for (const s of menuSections(place, actions)) {
      const choice = s.actions.some((a) => a.choice);
      if (s.actions.length > SUBMENU_ABOVE && !s.submenu) fails.push(`${place}: group "${s.group}" has ${s.actions.length} actions on the first level`);
      if (s.submenu && !choice && s.actions.length <= SUBMENU_ABOVE) fails.push(`${place}: group "${s.group}" is a submenu with only ${s.actions.length} actions`);
      // The renderer draws a choice as its own submenu; a larger group would
      // need one it does not have yet: say so rather than draw it flat.
      if (s.submenu && !choice) fails.push(`${place}: group "${s.group}" needs a submenu PropertyActionItems does not draw yet`);
      if (choice && s.actions.length > 1) fails.push(`${place}: a choice shares group "${s.group}" with other actions`);
    }
  }
  return fails;
}

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(src, 'actions/propertyActions.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(src, 'actions/propertyActionReasons.ts'), '--bundle', '--format=esm', '--outfile=' + reasonsBundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }
  const { PROPERTY_ACTIONS, menuSections, SUBMENU_ABOVE } = await import(bundle);
  const { PROPERTY_LEFT_OUT } = await import(reasonsBundle);

  // ---- self-test: each of these must fail ----
  const ok = (id, group, places = ['rowPage', 'view'], extra = {}) => ({ id, fn: id, group, places, ...extra });
  const selfTests = [
    ['no reason', [ok('a', 'g', ['rowPage'])], {}],
    ['both', [ok('a', 'g', ['rowPage', 'view'])], { a: { view: 'why' } }],
    ['four on one level', [ok('a', 'g'), ok('b', 'g'), ok('c', 'g'), ok('d', 'g')], {}],
    ['a choice with company', [ok('a', 'g', undefined, { choice: true }), ok('b', 'g')], {}],
  ];
  for (const [name, list, reasons] of selfTests) {
    if (listFailures(list, menuSections, SUBMENU_ABOVE, reasons).length === 0) {
      console.error(`  ✗ self-test "${name}" passed; the check is broken`);
      process.exit(1);
    }
  }
  if (SUBMENU_ABOVE !== 3) {
    console.error(`  ✗ SUBMENU_ABOVE is ${SUBMENU_ABOVE}; the owner's rule is "beyond 3" (docs/decisions.md 2026-11-13)`);
    process.exit(1);
  }

  const failures = listFailures(PROPERTY_ACTIONS, menuSections, SUBMENU_ABOVE, PROPERTY_LEFT_OUT);
  for (const id of Object.keys(PROPERTY_LEFT_OUT)) {
    if (!PROPERTY_ACTIONS.some((a) => a.id === id)) failures.push(`propertyActionReasons.ts: ${id} is not an action`);
  }

  // ---- rule 3: the renderer draws every action ----
  const renderer = readFileSync(join(src, 'components/PropertyActionItems.tsx'), 'utf8');
  for (const a of PROPERTY_ACTIONS) {
    if (!renderer.includes(`case '${a.id}'`)) failures.push(`PropertyActionItems.tsx: no case for ${a.id}`);
    const drawnIn = a.choice ? CHOICE_FILES[a.id] : 'components/PropertyActionItems.tsx';
    if (!drawnIn) failures.push(`${a.id} is a choice with no file in CHOICE_FILES`);
    else if (!new RegExp(`fn="${a.fn}"`).test(readFileSync(join(src, drawnIn), 'utf8'))) failures.push(`${drawnIn}: ${a.id} is not drawn with fn="${a.fn}"`);
  }

  // ---- rule 4: the menus use the renderer, and only it ----
  for (const [place, file] of Object.entries(MENUS)) {
    const text = readFileSync(join(src, file), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (!new RegExp(`<PropertyActionItems[^>]*place="${place}"`).test(text)) failures.push(`${file}: its menu is not drawn by <PropertyActionItems place="${place}">`);
    for (const part of ['MenuItem', 'MenuSubmenu', 'MenuCheckboxItem', 'MenuRadioItem']) {
      if (new RegExp(`<${part}[\\s>]`).test(text)) failures.push(`${file}: a <${part}> of its own; add the action to propertyActions.ts instead`);
    }
  }

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${f}`);
    console.error(`\n  FAILED — a menu of a property does not follow its action list (src/actions/propertyActions.ts).`);
    process.exit(1);
  }
  const shape = PLACES.map((p) => `${p} ${menuSections(p).map((s) => (s.submenu ? `[${s.actions.length}▸]` : s.actions.length)).join('|')}`).join(', ');
  console.log(`  content actions: properties ${PROPERTY_ACTIONS.length} actions; ${shape}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
