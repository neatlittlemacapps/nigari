// Asserts what a person's own view state owes the server when the page goes
// away (src/viewStateNote.ts, #594).
//
//   node scripts/check-viewstateoutbox.mjs
//
// Same shape as check-viewstate.mjs: the module is bundled with esbuild and
// imported, no test framework.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-outbox-'));
const bundle = join(tmp, 'outbox.mjs');
const bundle2 = join(tmp, 'replay.mjs');
const canon = (v) => JSON.stringify(v);
try {
  try {
    execFileSync(join(web, 'node_modules/esbuild/bin/esbuild'), [join(web, 'src/viewStateOutbox.ts'), '--bundle', '--format=esm', '--outfile=' + bundle], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }
  execFileSync(join(web, 'node_modules/esbuild/bin/esbuild'), [join(web, 'src/viewStateNote.ts'), '--bundle', '--format=esm', '--outfile=' + bundle2], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const ob = await import(bundle);
  const rp = await import(bundle2);
  const out = [];
  const check = (name, got, want) => out.push({ name, got: canon(got), want: canon(want) });
  // The reader (loaded only when a note exists) against the note the hook
  // writes.
  const filters = { filters: [{ property: 'status', op: 'is', value: 'done' }] };
  const T0 = 1_000_000;
  // The shape usePersonalViews writes (see viewStateOutbox.ts).
  const note = (items, at = T0) => JSON.stringify({ at, items });

  check('the key is per database', ob.outboxKey('c1'), 'nigari-view-outbox:c1');
  check('a note reads back what was waiting', rp.parseOutbox(note([['table', filters], ['board', null]]), T0 + 1000), [['table', filters], ['board', null]]);
  check('one second inside the minute it is still read', rp.parseOutbox(note([['table', filters]]), T0 + rp.OUTBOX_TTL_MS - 1).length, 1);
  check('a minute old it is not', rp.parseOutbox(note([['table', filters]]), T0 + rp.OUTBOX_TTL_MS), []);
  check('no note, nothing owed', rp.parseOutbox(null, T0), []);
  check('unreadable storage is nothing owed', rp.parseOutbox('{not json', T0), []);
  check('storage holding something else is nothing owed', rp.parseOutbox('{"a":1}', T0), []);
  check('a number is nothing owed', rp.parseOutbox('7', T0), []);
  check('a note without a time is stale', rp.parseOutbox('{"items":[["table",null]]}', T0), []);
  check('entries of the wrong shape are left out', rp.parseOutbox(JSON.stringify({ at: T0, items: [1, 'x', null, ['table', null], [7, null]] }), T0), [['table', null]]);
  check('an empty set writes an empty note', rp.parseOutbox(note([]), T0), []);

  const failed = out.filter((r) => r.got !== r.want);
  for (const r of failed) console.error(`  FAIL  ${r.name}\n        got  ${r.got}\n        want ${r.want}`);
  console.log(`\n  view state outbox: ${out.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length) process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
