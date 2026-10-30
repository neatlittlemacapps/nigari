// Asserts how a browser's salt.md preferences move to nigari's keys
// (src/storageMove.ts, spec 011 FR-007).
//
//   node scripts/check-storagemove.mjs
//
// Same shape as check-dropfiles.mjs: the module is bundled with esbuild and
// run against a Map standing in for localStorage. No framework.
//
// Why this exists: the move fails silently. A key it misses is a preference
// that resets on the first load of v2.0.0 (the theme, the open tabs, the
// language), and a move that overwrote the new key would undo a choice made
// after the update. Neither throws.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-storagemove-'));
const bundle = join(tmp, 'storageMove.mjs');

// A Storage over a Map, in insertion order like the browser's.
function store(entries) {
  const m = new Map(Object.entries(entries));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/storageMove.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }

  const sm = await import(bundle);
  const out = [];
  const check = (name, got, want) => out.push({ name, got: JSON.stringify(got), want: JSON.stringify(want) });

  // ---- Every key the frontend reads moves ----
  const everyOld = Object.fromEntries(Object.keys(sm.MOVED_KEYS).map((k) => [k, 'v:' + k]));
  const s1 = store({ ...everyOld, 'salt-sec-abc': '1', 'salt-update-seen-2.0.0': '1', 'salt:ui:u1': '{}' });
  sm.moveStorage(s1);
  const d1 = s1.dump();
  check('no salt key is left', Object.keys(d1).filter((k) => k.startsWith('salt')), []);
  check('the theme moved', d1['nigari-theme'], 'v:salt-theme');
  check('the tabs moved', d1['nigari-tabs'], 'v:salt-tabs');
  check('the settings cache moved', d1['nigari-prefs'], 'v:salt-prefs');
  check('a sidebar section moved by prefix', d1['nigari-sec-abc'], '1');
  check('an update notice seen moved by prefix', d1['nigari-update-seen-2.0.0'], '1');
  check('the per-account page memory moved by prefix', d1['nigari:ui:u1'], '{}');
  check('every whole key has its new key', Object.values(sm.MOVED_KEYS).every((k) => k in d1), true);

  // ---- A value under the new name wins ----
  const s2 = store({ 'salt-theme': 'dark', 'nigari-theme': 'light' });
  sm.moveStorage(s2);
  check('the new key keeps its value', s2.dump(), { 'nigari-theme': 'light' });

  // ---- Twice is once ----
  const s3 = store({ 'salt-tabs': '["a"]' });
  sm.moveStorage(s3);
  const after = JSON.stringify(s3.dump());
  check('a second run changes nothing', sm.moveStorage(s3), 0);
  check('and leaves the store as it was', JSON.stringify(s3.dump()), after);

  // ---- Legacy keys go; the old single language key is carried ----
  const s4 = store({ 'salt:view:p1': 'v', 'salt:scroll:p1': '3', 'salt:hscroll:p1': '0', 'salt-locale': 'de' });
  sm.moveStorage(s4);
  check('legacy keys are removed and the language kept', s4.dump(), { 'nigari-prefs': '{"language":"de"}' });
  const s5 = store({ 'salt-prefs': '{"language":"es"}', 'salt-locale': 'de' });
  sm.moveStorage(s5);
  check('a settings cache wins over the old language key', s5.dump(), { 'nigari-prefs': '{"language":"es"}' });

  // ---- Nothing else is touched ----
  const s6 = store({ 'other-app': 'x', basalt: 'y' });
  check('keys of other apps stay', [sm.moveStorage(s6), s6.dump()], [0, { 'other-app': 'x', basalt: 'y' }]);

  let fail = 0;
  for (const c of out) {
    if (c.got !== c.want) {
      fail++;
      console.log(`  FAIL ${c.name}: got ${c.got}, want ${c.want}`);
    }
  }
  console.log(`\n  storage move: ${out.length - fail} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
