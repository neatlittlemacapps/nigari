// Every menu item has an icon, and an icon means one thing (spec 010).
//
//   node scripts/check-menu-icons.mjs
//
// Why this exists: menus were hand-built one by one, each importing its own
// icons, and nothing looked at two of them together. The same bin ended up on
// "Move to trash" and "Remove view", the same clock on "Version history" and
// "Activity log", and "Export Markdown" had two different icons in two menus.
// The pairing now lives in src/menuIcons.ts and every menu is built with
// src/ui/Menu.tsx; this keeps it that way. It fails when:
//
//   1. a menu is built by hand (a className "menu …", an AnchoredMenu, a
//      role="menu") instead of with ui/Menu, or a raw <button> sits inside a
//      ui/Menu (an item without an icon);
//   2. two functions in MENU_ICONS share an icon;
//   3. a <MenuValues> has no reason, or a <MenuValueItem> sits outside one;
//   4. the editor library's / menu or block menu has an item that
//      SLASH_FUNCTIONS / DRAG_HANDLE_FUNCTIONS does not map (an upgrade added
//      a block), or maps a key the library no longer has;
//   5. an fn={…} is not a string literal or a ternary of two, so this script
//      cannot read it;
//   6. Base UI's menu is imported outside src/ui, which would build a menu
//      that skips the pairing.
//
// The menus still to move (spec 010's second pull request) are reported by
// rule 1 with their count instead of failing, while REPORT_ONLY_HAND_BUILT is
// true. The second pull request sets it to false.
//
// A self-test runs first: rules 1–3 on three inline snippets that must fail.
// A check that finds nothing because it broke is worse than no check.

import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPORT_ONLY_HAND_BUILT = true;

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const src = join(web, 'src');

const MENU_PARTS_WITH_FN = new Set(['MenuItem', 'MenuCheckboxItem', 'MenuSubmenu']);

function parse(file, text) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function attr(open, name) {
  for (const a of open.attributes.properties) {
    if (ts.isJsxAttribute(a) && a.name.getText() === name) return a;
  }
  return null;
}

function stringValue(init) {
  if (!init) return null;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)) return init.expression.text;
  return null;
}

function labelOf(node) {
  const text = node.getText();
  const m = text.match(/t\('([^']+)'\)/);
  if (m) return m[1];
  return text.replace(/\s+/g, ' ').slice(0, 60);
}

/** Rules 1, 3, 5 and 6 over one file. Returns { problems, handBuilt }. */
export function scanFile(rel, text) {
  const sf = parse(rel, text);
  const problems = [];
  const handBuilt = [];
  let menus = 0;
  // The local name of ui/Menu's Menu, if this file imports it. Not every
  // <Menu> is ours: Lucide has a Menu icon (the hamburger), and Editor.tsx uses it.
  let menuName = null;
  const at = (node) => `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const from = st.moduleSpecifier.text;
      if (/(^|\/)ui\/Menu$/.test(from) && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings)) {
        for (const el of st.importClause.namedBindings.elements) {
          if ((el.propertyName ?? el.name).getText() === 'Menu') menuName = el.name.getText();
        }
      }
      if (/^@base-ui\/react\/(menu|context-menu|menubar)$/.test(from)) {
        problems.push(`${at(st)}: imports ${from} outside web/src/ui. Use ui/Menu, so every menu gets its icons and keyboard the same way.`);
      }
    }
  }

  const visit = (node, ctx) => {
    let next = ctx;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const open = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = open.tagName.getText();
      const cls = stringValue(attr(open, 'className')?.initializer) ?? '';
      const role = stringValue(attr(open, 'role')?.initializer);
      // A popover that wears the menu's look but is not a list of actions (a
      // colour picker, a share panel, a person picker; research R1) says so
      // with data-menu-exempt="<why>", and spec 001's popover batch moves it.
      const exempt = attr(open, 'data-menu-exempt');
      const exemptWhy = stringValue(exempt?.initializer);
      if (exempt && !exemptWhy?.trim()) {
        problems.push(`${at(open)}: data-menu-exempt needs its reason, e.g. data-menu-exempt="a colour picker, not a list of actions".`);
      }
      if (!exempt && (tag === 'AnchoredMenu' || /(^|\s)menu(\s|$)/.test(cls) || (role === 'menu' && /^[a-z]/.test(tag)))) {
        handBuilt.push(`${at(open)}: a hand-built menu (${tag === 'AnchoredMenu' ? 'AnchoredMenu' : role === 'menu' && !/(^|\s)menu(\s|$)/.test(cls) ? 'role="menu"' : `className "${cls}"`}). Build it with ui/Menu.`);
      }
      if (menuName && tag === menuName) {
        menus++;
        next = { ...next, inMenu: true };
      }
      if (tag === 'MenuValues') {
        const reason = attr(open, 'reason');
        const r = stringValue(reason?.initializer);
        if (!reason || (r !== null && !r.trim())) {
          problems.push(`${at(open)}: <MenuValues> needs reason="…" saying why its entries have no function of their own.`);
        }
        next = { ...next, inValues: true };
      }
      if (tag === 'MenuValueItem' && !ctx.inValues) {
        problems.push(`${at(open)}: <MenuValueItem> outside a <MenuValues>. Wrap the list in <MenuValues reason="…">, or make it a <MenuItem fn="…">.`);
      }
      if (tag === 'button' && ctx.inMenu) {
        problems.push(`${at(open)}: "${labelOf(node)}" is a menu item without an icon. Draw it with <MenuItem fn="…">, adding the function to src/menuIcons.ts if it is new.`);
      }
      if (MENU_PARTS_WITH_FN.has(tag)) {
        const fn = attr(open, 'fn');
        const e = fn?.initializer;
        const readable =
          e &&
          (ts.isStringLiteral(e) ||
            (ts.isJsxExpression(e) &&
              e.expression &&
              (ts.isStringLiteralLike(e.expression) ||
                (ts.isConditionalExpression(e.expression) &&
                  ts.isStringLiteralLike(e.expression.whenTrue) &&
                  ts.isStringLiteralLike(e.expression.whenFalse)))));
        if (!readable) problems.push(`${at(open)}: fn={…} must be a string literal (or a ternary of two) so the menu-icons check can read it.`);
      }
    }
    ts.forEachChild(node, (c) => visit(c, next));
  };
  visit(sf, { inMenu: false, inValues: false });
  return { problems, handBuilt, menus };
}

/** Rule 2: the keys of MENU_ICONS whose icon another key already has. */
export function sharedIcons(text) {
  const sf = parse('menuIcons.ts', text);
  const problems = [];
  let found = false;
  const seen = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText() === 'MENU_ICONS') {
      found = true;
      let init = node.initializer;
      while (init && (ts.isSatisfiesExpression?.(init) || ts.isAsExpression(init))) init = init.expression;
      if (init && ts.isObjectLiteralExpression(init)) {
        for (const p of init.properties) {
          if (!ts.isPropertyAssignment(p)) continue;
          const fn = p.name.getText();
          const icon = p.initializer.getText();
          if (seen.has(icon)) problems.push(`src/menuIcons.ts: ${seen.get(icon)} and ${fn} both use ${icon}. One icon means one function: pick an icon no other function has.`);
          else seen.set(icon, fn);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!found) problems.push('src/menuIcons.ts: MENU_ICONS not found — did the file change shape?');
  return { problems, functions: seen.size };
}

function objectKeys(text, name) {
  const sf = parse('menuIcons.ts', text);
  let keys = null;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText() === name) {
      let init = node.initializer;
      while (init && (ts.isSatisfiesExpression?.(init) || ts.isAsExpression(init))) init = init.expression;
      if (init && ts.isObjectLiteralExpression(init)) keys = init.properties.filter(ts.isPropertyAssignment).map((p) => p.name.getText().replace(/^['"]|['"]$/g, ''));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return keys;
}

// --- self-test --------------------------------------------------------------
{
  const failures = [];
  const noIcon = scanFile('selftest.tsx', `import { Menu } from '../ui/Menu';\nconst a = <Menu label="x"><button onClick={f}>{t('Archive')}</button></Menu>;`);
  if (!noIcon.problems.some((p) => p.includes('without an icon'))) failures.push('a raw <button> inside a <Menu> passed');
  const shared = sharedIcons(`const MENU_ICONS = { moveToTrash: Trash2, archive: Trash2 } satisfies Record<string, LucideIcon>;`);
  if (!shared.problems.some((p) => p.includes('both use Trash2'))) failures.push('two functions on one icon passed');
  const noReason = scanFile('selftest.tsx', `import { Menu } from '../ui/Menu';\nconst a = <Menu label="x"><MenuValues>{x}</MenuValues></Menu>;`);
  if (!noReason.problems.some((p) => p.includes('needs reason'))) failures.push('a <MenuValues> without a reason passed');
  const hand = scanFile('selftest.tsx', `const a = <div className="menu ws-menu"><button>x</button></div>;`);
  if (!hand.handBuilt.length) failures.push('a hand-built menu was not seen');
  const lucide = scanFile('selftest.tsx', `import { Menu } from 'lucide-react';\nconst a = <Menu size={16}><button>x</button></Menu>;`);
  if (lucide.problems.length || lucide.menus) failures.push("Lucide's Menu icon was taken for ui/Menu");
  if (failures.length) {
    console.log('  menu icons: the self-test failed, so this check cannot be trusted:');
    for (const f of failures) console.log(`    ${f}`);
    process.exit(1);
  }
}

// --- the real run -----------------------------------------------------------
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (p !== join(src, 'ui')) walk(p);
    } else if (p.endsWith('.tsx')) files.push(p);
  }
})(src);

const problems = [];
const handBuilt = [];
let menus = 0;
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  const r = scanFile(relative(web, f), text);
  menus += r.menus;
  problems.push(...r.problems);
  handBuilt.push(...r.handBuilt);
}

const iconsText = readFileSync(join(src, 'menuIcons.ts'), 'utf8');
const shared = sharedIcons(iconsText);
problems.push(...shared.problems);

// Rule 4: the editor library's own items.
const { en } = await import('@blocknote/core/locales');
for (const [dict, name] of [
  ['slash_menu', 'SLASH_FUNCTIONS'],
  ['drag_handle', 'DRAG_HANDLE_FUNCTIONS'],
]) {
  const library = Object.keys(en[dict] ?? {});
  const mapped = objectKeys(iconsText, name);
  if (!mapped) {
    problems.push(`src/menuIcons.ts: ${name} not found — did the file change shape?`);
    continue;
  }
  for (const k of library) if (!mapped.includes(k)) problems.push(`@blocknote/core ${dict} has "${k}", which ${name} does not map. Give it a function and an icon in src/menuIcons.ts.`);
  for (const k of mapped) if (!library.includes(k)) problems.push(`src/menuIcons.ts: ${name} maps "${k}", which @blocknote/core ${dict} no longer has. Remove it.`);
}

if (!REPORT_ONLY_HAND_BUILT) problems.push(...handBuilt);

if (problems.length) {
  for (const p of problems) console.log(`  FAIL  ${p}`);
  console.log(`\n  menu icons: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`  menu icons: ${menus} ui/Menu menus, ${shared.functions} functions, all distinct`);
if (handBuilt.length) {
  console.log(`  menu icons: ${handBuilt.length} hand-built menu(s) still to move (reported, not failing until spec 010's second pull request):`);
  for (const h of handBuilt) console.log(`    ${h}`);
}
