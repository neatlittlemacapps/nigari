// Asserts how a row's page changes its database's properties and which it
// folds away (src/rowProperties.ts, spec 015 research R5, R7).
//
//   node scripts/check-rowproperties.mjs
//
// Same shape as check-pagefallback.mjs: esbuild bundles the module once and
// it is imported. No framework.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-rowproperties-'));
const bundle = join(tmp, 'rowProperties.mjs');

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/rowProperties.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }

  const m = await import(bundle);
  const out = [];
  const check = (name, got, want) => out.push({ name, got: JSON.stringify(got), want: JSON.stringify(want) });
  const ids = (list) => list.map((p) => p.id);

  const schema = [
    { id: 'status', name: 'Status', type: 'select', options: [{ id: 'todo', name: 'To do', color: '#111111' }] },
    { id: 'due', name: 'Due', type: 'date', pageVisibility: 'hide_empty' },
    { id: 'notes', name: 'Notes', type: 'text', pageVisibility: 'hide' },
    { id: 'owner', name: 'Owner', type: 'person' },
  ];

  // ---- one change, applied to what is stored now (R5) ----
  const renamed = m.applyPropertyChange(schema, 'due', { name: 'Due date' });
  check('a rename changes that property only', renamed.map((p) => p.name), ['Status', 'Due date', 'Notes', 'Owner']);
  check('the rest keep their keys', renamed[1].pageVisibility, 'hide_empty');
  check('the stored schema is not changed in place', schema[1].name, 'Due');
  const shownAgain = m.applyPropertyChange(schema, 'notes', { pageVisibility: undefined });
  check('back to shown removes the key', 'pageVisibility' in shownAgain[2], false);
  check('a property gone meanwhile changes nothing', ids(m.applyPropertyChange(schema, 'gone', { name: 'X' })), ids(schema));
  // A property another tab added after this page loaded survives a change
  // made here, because the change is applied to the stored schema.
  const elsewhere = [...schema, { id: 'estimate', name: 'Estimate', type: 'number' }];
  check('a property added elsewhere is kept', ids(m.applyPropertyChange(elsewhere, 'status', { name: 'State' })), ['status', 'due', 'notes', 'owner', 'estimate']);

  // ---- duplicate ----
  const dup = m.duplicateProperty(schema, 'status', 'Copy of Status');
  check('the copy sits right after the original', ids(dup), ['status', 'copy-of-status', 'due', 'notes', 'owner']);
  check('the copy has the settings', dup[1].options, schema[0].options);
  check('the copy owns its options', dup[1].options === schema[0].options || dup[1].options[0] === schema[0].options[0], false);
  check('its name', dup[1].name, 'Copy of Status');
  check('a second copy gets its own id', ids(m.duplicateProperty(dup, 'status', 'Copy of Status')).slice(0, 3), ['status', 'copy-of-status_', 'copy-of-status']);
  check('a hidden property copies hidden', m.duplicateProperty(schema, 'notes', 'Copy of Notes')[3].pageVisibility, 'hide');

  // ---- add ----
  const added = m.addProperty(schema, 'select', 'Estimate');
  check('added last', ids(added), ['status', 'due', 'notes', 'owner', 'estimate']);
  check('a select starts with no options', added[4].options, []);
  check('a rollup starts summing', m.addProperty(schema, 'rollup', 'Total')[4].rollupAgg, 'sum');
  check('a name already taken keeps the name, gets its own id', m.addProperty(schema, 'text', 'Status')[4], { id: 'status_', name: 'Status', type: 'text' });
  check('an empty name becomes Property', m.addProperty(schema, 'text', '  ')[4].name, 'Property');

  // ---- what the page shows (R7) ----
  const atOpen = m.emptyAtOpen(schema, { status: 'todo' });
  check('empty at open: only Hide-when-empty ones without a value', [...atOpen], ['due']);
  check('filled at open: not in the set', [...m.emptyAtOpen(schema, { due: '2026-11-14' })], []);
  check('an empty list counts as empty', [...m.emptyAtOpen([{ id: 'tags', name: 'T', type: 'multiselect', pageVisibility: 'hide_empty' }], { tags: [] })], ['tags']);
  const v = m.visibleOnRowPage(schema, atOpen);
  check('shown: always-shown and filled Hide-when-empty', ids(v.shown), ['status', 'owner']);
  check('folded: always hidden and empty at open, in schema order', ids(v.folded), ['due', 'notes']);
  check('a Hide-when-empty field filled at open stays shown', ids(m.visibleOnRowPage(schema, new Set()).shown), ['status', 'due', 'owner']);
  check('nothing hidden: nothing folded', m.visibleOnRowPage([schema[0], schema[3]], new Set()).folded, []);

  // ---- the one emptiness rule ----
  check('unset values', [null, undefined, '', []].map(m.isUnset), [true, true, true, true]);
  check('set values', [0, false, 'x', ['a']].map(m.isUnset), [false, false, false, false]);

  const bad = out.filter((x) => x.got !== x.want);
  for (const x of bad) console.error(`  ✗ ${x.name}: got ${x.got}, want ${x.want}`);
  if (bad.length) process.exit(1);
  console.log(`  row properties: ${out.length} cases checked`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
