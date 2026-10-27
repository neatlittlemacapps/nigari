// The ratchet of the design system: literal values and hand-built controls may
// only go down.
//
//   node scripts/check-tokens.mjs            # compare with web/tokens/budgets.json
//   node scripts/check-tokens.mjs --measure  # print today's counts
//   node scripts/check-tokens.mjs --src <dir> --budgets <file>   # for the checks
//
// Every screen used to pick its own colours, sizes, radii, shadows and layers:
// 133 hex colours, 148 rgb(a) literals, 34 font sizes, 13 radii and 24 z-index
// values when spec 001 measured them, and every new feature added more. The
// tokens (web/tokens/) and the components (web/src/ui/) are the way out, but a
// way out only works if the count cannot creep back up while the migration
// takes months. So, like gapBudget in capabilities.json, each count has a
// budget in web/tokens/budgets.json that a change may lower and never raise
// (FR-005, FR-017).
//
// Counted in web/src/**/*.{css,ts,tsx}, comments left out:
//   color     #hex, rgb()/rgba()/hsl()/hsla()/oklch() not built on var()
//   fontSize  font-size / fontSize with a number
//   radius    border-*-radius / borderRadius with a number
//   shadow    box-shadow / boxShadow not built from var(), none or inherit
//   zIndex    z-index / zIndex with a number
//   rawButtons   <button in .tsx outside web/src/ui/
//   handDialogs  role="dialog" outside web/src/ui/
// Not counted: web/src/tokens.css (generated from the tokens), and any line
// carrying `token-ok: <reason>` for a value that must stay literal.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const src = arg('--src', join(web, 'src'));
const budgetsFile = arg('--budgets', join(web, 'tokens/budgets.json'));
const measure = args.includes('--measure');

const KINDS = ['color', 'fontSize', 'radius', 'shadow', 'zIndex'];

const RULES = {
  color: /(?<![\w&-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|\b(?:rgba?|hsla?|oklch)\(\s*(?!var\()/g,
  fontSize: /\bfont-size\s*:\s*-?[\d.]|\bfontSize\s*:\s*['"`]?-?[\d.]/g,
  radius: /\bborder(?:-[a-z]+)*-radius\s*:\s*[\d.]|\bborder\w*Radius\s*:\s*['"`]?[\d.]/g,
  shadow: /\bbox-shadow\s*:\s*(?!var\(|none\b|inherit\b|initial\b|unset\b)|\bboxShadow\s*:\s*['"`](?!var\(|none\b)/g,
  zIndex: /\bz-index\s*:\s*-?\d|\bzIndex\s*:\s*['"`]?-?\d/g,
  rawButtons: /<button\b/g,
  handDialogs: /role\s*[=:]\s*\{?\s*['"]dialog['"]/g,
};

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(css|tsx?|)$/.test(name) && /\.(css|ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

// Comments become spaces, so a colour in a comment explaining a choice is not
// counted and every offset still maps to its line. `//` only counts as a
// comment where it cannot be part of a URL.
function blankComments(text, isCss) {
  const re = isCss ? /\/\*[\s\S]*?\*\//g : /\/\*[\s\S]*?\*\/|(?<![:'"`\\/])\/\/[^\n]*/g;
  return text.replace(re, (m) => m.replace(/[^\n]/g, ' '));
}

const counts = Object.fromEntries([...KINDS, 'rawButtons', 'handDialogs'].map((k) => [k, 0]));
const hits = Object.fromEntries(Object.keys(counts).map((k) => [k, []]));

for (const file of files(src)) {
  const rel = relative(web, file).split(sep).join('/');
  if (rel === 'src/tokens.css') continue;
  const inUi = rel.startsWith('src/ui/');
  const raw = readFileSync(file, 'utf8');
  const lines = raw.split('\n');
  const text = blankComments(raw, file.endsWith('.css'));
  const lineOf = (i) => text.slice(0, i).split('\n').length;
  for (const [kind, re] of Object.entries(RULES)) {
    if (kind === 'rawButtons' && (!file.endsWith('.tsx') || inUi)) continue;
    if (kind === 'handDialogs' && inUi) continue;
    for (const m of text.matchAll(re)) {
      const line = lineOf(m.index);
      if (lines[line - 1].includes('token-ok:')) continue;
      counts[kind]++;
      hits[kind].push(`${rel}:${line}`);
    }
  }
}

const now = {
  literals: Object.fromEntries(KINDS.map((k) => [k, counts[k]])),
  rawButtons: counts.rawButtons,
  handDialogs: counts.handDialogs,
};

if (measure) {
  console.log(JSON.stringify(now, null, 2));
  process.exit(0);
}

const budgets = JSON.parse(readFileSync(budgetsFile, 'utf8'));

// Where a count went over, the lines this branch added are the likely
// culprits: the added lines of changed files, and every line of new ones.
// Without git, every line of that kind is listed.
function addedLines() {
  const git = (...a) => execFileSync('git', a, { cwd: web, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    const base = git('merge-base', 'HEAD', 'origin/main').trim();
    const added = new Set();
    let file = null;
    for (const line of git('diff', '-U0', '--relative', base, '--', '.').split('\n')) {
      const f = line.match(/^\+\+\+ b\/(.*)$/);
      if (f) file = f[1];
      const h = line.match(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/);
      if (h && file) for (let i = 0; i < Number(h[2] ?? 1); i++) added.add(`${file}:${Number(h[1]) + i}`);
    }
    const untracked = git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean);
    return (hit) => added.has(hit) || untracked.includes(hit.split(':')[0]);
  } catch {
    return null;
  }
}

const errors = [];
const lower = [];
const check = (label, kind, have, budget) => {
  if (typeof budget !== 'number') {
    errors.push(`${label}: no budget in ${relative(web, budgetsFile)}`);
    return;
  }
  if (have > budget) {
    const isNew = addedLines();
    const where = isNew ? hits[kind].filter(isNew) : hits[kind];
    errors.push(
      `${label}: ${have}, over its budget of ${budget}. Use a token or a web/src/ui/ component instead` +
        (where.length ? `; on lines this branch added:\n      ${where.join('\n      ')}` : ''),
    );
  } else if (have < budget) {
    lower.push(`${label}: ${have}, under its budget of ${budget}. Lower the budget to ${have} in ${relative(web, budgetsFile)}`);
  }
};
for (const k of KINDS) check(`literals.${k}`, k, now.literals[k], budgets.literals?.[k]);
check('rawButtons', 'rawButtons', now.rawButtons, budgets.rawButtons);
check('handDialogs', 'handDialogs', now.handDialogs, budgets.handDialogs);

// Under budget fails too: a ratchet that is not lowered when the count drops
// lets the next change spend the difference without anyone seeing it.
if (errors.length || lower.length) {
  console.error(`tokens: ${errors.length + lower.length} problem(s)\n` + [...errors, ...lower].map((e) => '  ' + e).join('\n'));
  process.exit(1);
}
console.log(
  `  tokens: literals ${KINDS.map((k) => `${k} ${now.literals[k]}`).join(', ')}; ${now.rawButtons} raw buttons, ${now.handDialogs} hand-built dialogs, all within budget`,
);
