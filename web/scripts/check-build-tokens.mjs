// Proves that build-tokens.mjs refuses what it promises to refuse.
//
//   node scripts/check-build-tokens.mjs
//
// A check that never fails guards nothing, and the token build's refusals are
// the whole point of it: a broken alias would emit `undefined` into the
// stylesheet, a cycle would hang it, a colour below AA would ship unnoticed,
// and a hand edit to the generated file would be overwritten by the next
// build. Each case copies the token files to a temporary directory, breaks one
// thing, and expects the build to fail naming it. The last two cases expect the
// committed files to pass: built byte for byte into the committed tokens.css,
// and nothing else fails with them.

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(web, 'scripts/build-tokens.mjs');
const failures = [];

function run(args) {
  const r = spawnSync(process.execPath, [build, ...args], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

// Copy the tokens, apply `edit` to one tier's JSON, build into a scratch file.
function broken(name, tier, edit, expect) {
  const dir = mkdtempSync(join(tmpdir(), 'nigari-tokens-'));
  try {
    cpSync(join(web, 'tokens'), dir, { recursive: true });
    const file = join(dir, `${tier}.tokens.json`);
    const json = JSON.parse(readFileSync(file, 'utf8'));
    edit(json);
    writeFileSync(file, JSON.stringify(json, null, 2));
    const r = run(['--dir', dir, '--out', join(dir, 'tokens.css')]);
    if (r.code === 0) failures.push(`${name}: the build passed`);
    else if (!expect.test(r.out)) failures.push(`${name}: failed, but without naming it:\n${r.out}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

broken('a broken alias', 'semantic', (j) => {
  j.color.text.default.$value = '{color.ink.404}';
}, /color\.text\.default.*\{color\.ink\.404\} names no token/);

broken('an alias cycle', 'semantic', (j) => {
  j.color.focus.$value = '{color.focus}';
}, /alias cycle: color\.focus → color\.focus/);

// Quickstart step 1: muted text this dark is about 2.6:1 on the dark document.
broken('a colour below AA', 'semantic', (j) => {
  j.color.text.muted.$extensions['io.github.neatlittlemacapps.nigari.dark'] = { colorSpace: 'srgb', components: [0.3333, 0.3333, 0.3333], hex: '#555555' };
}, /contrast: color\.text\.muted on color\.surface\.default \(dark\) is [\d.]+:1, below 4\.5:1/);

broken('a token without a $type', 'component', (j) => {
  delete j.control.height.$type;
}, /control\.height: no \$type/);

broken('a type outside DTCG', 'component', (j) => {
  j.control.height.$type = 'size';
}, /control\.height: \$type "size" is not a DTCG 2025\.10 type/);

broken("an extension that is not ours", 'component', (j) => {
  j.control.height.$extensions = { 'com.example.x': 1 };
}, /control\.height: extension "com\.example\.x" is not ours/);

// The bug this guards: the radius scale's --radius-sm (4px) once overwrote the
// --radius-sm (7px) that theme.css and the public pages read.
broken('two tokens writing one property', 'primitives', (j) => {
  j.radius.sm = j.radius.scale.sm;
}, /writes --radius-sm, which .* writes too/);

// A hand edit to the generated file.
{
  const dir = mkdtempSync(join(tmpdir(), 'nigari-tokens-'));
  try {
    const out = join(dir, 'tokens.css');
    writeFileSync(out, readFileSync(join(web, 'src/tokens.css'), 'utf8').replace('--bg:', '--bg: #000; --x:'));
    const r = run(['--check', '--out', out]);
    if (r.code === 0 || !/does not match the token files/.test(r.out)) failures.push(`a hand edit to tokens.css: not caught\n${r.out}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The committed files: they build into exactly the committed tokens.css.
{
  const r = run(['--check']);
  if (r.code !== 0) failures.push(`the committed tokens:\n${r.out}`);
}

if (failures.length) {
  console.error(`build-tokens: ${failures.length} problem(s)\n` + failures.map((f) => '  ' + f).join('\n'));
  process.exit(1);
}
console.log('  build-tokens: refuses broken aliases, cycles, contrast below AA, bad types, foreign extensions, clashing names and hand edits; committed tokens up to date');
