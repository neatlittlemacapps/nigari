// Asserts where a database toolbar menu is drawn (src/anchoredMenu.ts).
//
//   node scripts/check-anchoredmenu.mjs
//
// Same shape as check-cardlayout.mjs: the module is bundled with esbuild and
// imported, no test framework.
//
// Why this exists: on a phone the templates menu beside New and the view
// options menu were drawn inside the sideways-scrolling toolbar, which clipped
// them to a white rim under the buttons. Where a menu goes is a rule now, and a
// rule nobody checks drifts back.
//
// Two kinds of toolbar menu follow it, and they must agree on where a phone
// begins. The menus (templates, a view's Settings) are ui/Menu with
// narrow="sheet", which reads SHEET_MAX_WIDTH and draws the sheet in CSS; the
// filter, sort and group popovers place themselves with anchoredMenuStyle.
// Spec 012 removed the Columns popover and left that function with one caller,
// which is checked below: an inline copy of the rule was what drifted before.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-menu-'));
const bundle = join(tmp, 'anchoredMenu.mjs');
try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/anchoredMenu.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }

  const am = await import(bundle);
  const out = [];
  const check = (name, got, want) => out.push({ name, got: String(got), want: String(want) });
  const phone = { width: 390, height: 844 };
  const desk = { width: 1280, height: 800 };
  const btn = { right: 380, bottom: 300 };

  // ---- Phone: a bottom sheet, whatever the button ----
  const sheet = am.anchoredMenuStyle(btn, phone, 280);
  check('phone: fixed', sheet.position, 'fixed');
  check('phone: on the bottom edge', sheet.bottom, 8);
  check('phone: full width, left', sheet.left, 8);
  check('phone: full width, right', sheet.right, 8);
  // The stylesheet gives the inline menu top: 32px. Left in place, it and
  // bottom together stretched the sheet over the whole screen.
  check('phone: top is reset', sheet.top, 'auto');
  check('phone: no width cap from the stylesheet', sheet.maxWidth, 'none');
  check('phone: no height cap without scroll', sheet.maxHeight, undefined);
  check('phone: scroll caps the height', am.anchoredMenuStyle(btn, phone, 280, true).maxHeight, phone.height * 0.72);
  check('the sheet starts at the breakpoint', am.anchoredMenuStyle(btn, { width: am.SHEET_MAX_WIDTH, height: 700 }, 280).bottom, 8);
  check('one pixel wider is a dropdown', am.anchoredMenuStyle(btn, { width: am.SHEET_MAX_WIDTH + 1, height: 700 }, 280).bottom, 'auto');

  // ---- Desktop: under the button, right edges aligned ----
  const drop = am.anchoredMenuStyle({ right: 900, bottom: 200 }, desk, 280);
  check('desktop: 6px under the button', drop.top, 206);
  check('desktop: right edge on the button', drop.left, 900 - 280);
  check('desktop: bottom is reset', drop.bottom, 'auto');
  check('desktop: kept inside on the left', am.anchoredMenuStyle({ right: 100, bottom: 200 }, desk, 280).left, 8);
  check('desktop: kept inside on the right', am.anchoredMenuStyle({ right: 1300, bottom: 200 }, desk, 280).left, 1280 - 280 - 8);
  check('desktop: scroll caps to the room below', am.anchoredMenuStyle({ right: 900, bottom: 200 }, desk, 280, true).maxHeight, 800 - 200 - 24);

  // One breakpoint for both kinds. The ui/Menu sheet reads SHEET_MAX_WIDTH
  // through a media query; a popover that hardcoded the same number went on
  // using it when the breakpoint moved (code review, spec 012 PR 2).
  const read = (f) => readFileSync(join(web, f), 'utf8');
  const menu = read('src/ui/Menu.tsx');
  check('ui/Menu reads the breakpoint from anchoredMenu.ts', /import \{ SHEET_MAX_WIDTH \} from '\.\.\/anchoredMenu'/.test(menu), true);
  check('and turns it into its media query', /max-width: \$\{SHEET_MAX_WIDTH\}px/.test(menu), true);
  const toolbar = read('src/components/CollectionView.tsx');
  check('the toolbar popovers are placed by the rule, not by a copy of it', /anchoredMenuStyle\(/.test(toolbar), true);
  check('and no breakpoint is written out beside it', !/innerWidth\s*<=\s*\d/.test(toolbar) && !/vw\s*<=\s*\d/.test(toolbar), true);

  let fail = 0;
  for (const c of out) {
    if (c.got !== c.want) {
      fail++;
      console.log(`  FAIL ${c.name}: got ${JSON.stringify(c.got)}, want ${JSON.stringify(c.want)}`);
    }
  }
  console.log(`\n  toolbar menus: ${out.length - fail} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
