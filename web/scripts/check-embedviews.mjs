// Asserts how an embedded database's own views are read
// (src/embedViews.ts, spec 014 research R2 and R10).
//
//   node scripts/check-embedviews.mjs
//
// Same shape as check-viewstate.mjs: the module is bundled with esbuild and
// imported, no test framework.
//
// Why this exists: the reader is written twice. The browser shows an embed
// with this one; the server reads it with its own (readEmbedLocal,
// server/embedviews.go) when an agent asks for or changes an embed's views.
// If they disagreed, an agent would see other views than the person, or
// change a view the person does not have. Both run every case in
// server/testdata/embedviews (the Go side: TestEmbedViewsReadInBothShapes),
// so a case added there is checked on both sides.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const cases = join(web, '..', 'server', 'testdata', 'embedviews');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-embedviews-'));
const bundle = join(tmp, 'embedViews.mjs');
// Key order is not part of the answer: Go writes a map's keys sorted.
const canon = (v) =>
  JSON.stringify(v, (_, x) =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x,
  );
try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/embedViews.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }
  const ev = await import(bundle);
  const out = [];
  const check = (name, got, want) => out.push({ name, got: canon(got), want: canon(want) });

  // ---- The cases shared with the server ----
  const files = readdirSync(cases).filter((f) => f.endsWith('.json'));
  if (!files.length) {
    console.error('  embedviews: no cases in server/testdata/embedviews');
    process.exit(1);
  }
  for (const f of files) {
    const c = JSON.parse(readFileSync(join(cases, f), 'utf8'));
    const got = ev.readEmbedLocal(c.local, c.databaseViews);
    // "*" is a view the reader made up (the default table): any id, and
    // the open view is then that id.
    const want = {
      viewId: c.expect.viewId === '*' ? got.views[0]?.id : c.expect.viewId,
      views: c.expect.views.map((v, i) => (v.id === '*' ? { ...v, id: got.views[i]?.id } : v)),
    };
    if (c.expect.views.some((v) => v.id === '*') && !got.views[0]?.id) check(f + ': a made-up view has an id', false, true);
    check(f, got, want);
    // What is written reads back as itself.
    check(f + ': round trip', ev.readEmbedLocal(ev.encodeEmbedLocal(got.viewId, got.views), c.databaseViews), got);
  }

  // ---- Beyond the shared cases ----
  const db = [{ id: 'a', name: 'A', type: 'table', filters: [] }];
  const read = ev.readEmbedLocal('{"viewId":"a","views":{"a":{"filters":[{"property":"x","op":"is","value":"1"}]}}}', db);
  read.views[0].name = 'Changed';
  check('the copy shares nothing with the database view', db[0], { id: 'a', name: 'A', type: 'table', filters: [] });
  check('the default table takes the name it is given', ev.readEmbedLocal('', [], 'Tabelle').views[0].name, 'Tabelle');
  check('written with its version first', ev.encodeEmbedLocal('x', []).startsWith('{"v":2,'), true);
  check('a form is not an embed view', ev.embedViewType('form'), false);
  check('a chart is', ev.embedViewType('chart'), true);
  const taken = new Set(['vaaaaaaa']);
  check('a new id is not a taken one', taken.has(ev.newEmbedViewId(taken)), false);
  check('a new id is spelled like the interface\'s', /^v[0-9a-z]{7}$/.test(ev.newEmbedViewId()), true);

  // ---- A block in the new shape survives the interface's edits ----
  const v2 = ev.encodeEmbedLocal('b', [
    { id: 'a', name: 'A', type: 'table' },
    { id: 'b', name: 'B', type: 'board', groupBy: 'status' },
  ]);
  const parsed = ev.parseEmbedBlockLocal(v2);
  check('a new-shape block opens its open view', parsed.viewId, 'b');
  const filter = [{ property: 'status', op: 'is', value: 'open' }];
  const edited = ev.serializeEmbedBlockLocal({ ...parsed, views: { ...parsed.views, b: { ...parsed.views.b, filters: filter } } });
  check('a filter set in the interface stays on its view and the list stays a list',
    JSON.parse(edited), { v: 2, viewId: 'b', views: [{ id: 'a', name: 'A', type: 'table' }, { id: 'b', name: 'B', type: 'board', groupBy: 'status', filters: filter }] });
  check('switching view keeps both views', JSON.parse(ev.serializeEmbedBlockLocal({ ...parsed, viewId: 'a' })).views.length, 2);
  check('an old-shape block is written as before',
    JSON.parse(ev.serializeEmbedBlockLocal(ev.parseEmbedBlockLocal('{"viewId":"x","views":{"x":{"filters":[]}}}'))), { viewId: 'x', views: { x: { filters: [] } } });
  check('an empty block', ev.parseEmbedBlockLocal(''), { viewId: '', views: {} });

  const failed = out.filter((r) => r.got !== r.want);
  for (const r of failed) console.error(`  FAIL  ${r.name}\n        got  ${r.got}\n        want ${r.want}`);
  console.log(`\n  embed views: ${out.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length) process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
