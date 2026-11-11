// Asserts what a person sees in a view they changed for themselves
// (src/viewState.ts, spec 013 research R5).
//
//   node scripts/check-viewstate.mjs
//
// Same shape as check-columndrag.mjs: the module is bundled with esbuild and
// imported, no test framework.
//
// Why this exists: the same merge is written twice. The browser draws the
// rows with this one; the server fills in a new row with its own
// (mergeViewState, server/viewprefs.go). If they disagreed, a row made in a
// view filtered to "only mine" would not be mine. Both read ONE fixture,
// server/testdata/viewstate.json (the Go side:
// TestMergeViewStateMatchesTheBrowser), so a case added there is checked on
// both sides.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-viewstate-'));
const bundle = join(tmp, 'viewState.mjs');
// Key order is not part of the answer: Go writes a map's keys sorted.
const canon = (v) =>
  JSON.stringify(v, (_, x) =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x,
  );
try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/viewState.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }
  const vs = await import(bundle);
  const out = [];
  const check = (name, got, want) => out.push({ name, got: canon(got), want: canon(want) });

  // ---- The fixture shared with the server ----
  const fixture = JSON.parse(readFileSync(join(web, '..', 'server', 'testdata', 'viewstate.json'), 'utf8'));
  if (!fixture.cases?.length) {
    console.error('  viewstate: the fixture has no cases');
    process.exit(1);
  }
  for (const c of fixture.cases) {
    check('fixture: ' + c.name, vs.mergeViewState(c.view, c.personal), { filters: c.filters, sort: c.sort });
  }

  // ---- When the bar shows ----
  const shared = { filters: [{ property: 'status', op: 'is', value: 'open' }], sort: { property: 'due', dir: 'asc' } };
  check('no state: no change', vs.hasPersonalChange(shared, null), false);
  check('an empty state: no change', vs.hasPersonalChange(shared, {}), false);
  check('another filter: a change', vs.hasPersonalChange(shared, { filters: [{ property: 'owner', value: 'ada' }] }), true);
  check('filters removed: a change', vs.hasPersonalChange(shared, { filters: [] }), true);
  check('sort removed: a change', vs.hasPersonalChange(shared, { sort: null }), true);
  check('the same filters, written the other way: no change',
    vs.hasPersonalChange(shared, { filters: [{ value: 'open', property: 'status' }] }), false);
  check('the same sort: no change', vs.hasPersonalChange(shared, { sort: { dir: 'asc', property: 'due' } }), false);
  check('only quick picks or folded lanes: no bar', vs.hasPersonalChange(shared, { quickPicks: { owner: 'ada' }, foldedLanes: ['x'] }), false);
  check('a view with no filters and an empty personal list: no change', vs.hasPersonalChange({}, { filters: [], sort: null }), false);
  // The server stores value "" on a condition without one; that is no change.
  check('the server\'s empty value is not a difference',
    vs.hasPersonalChange({ filters: [{ property: 'due', op: 'is_empty', value: '' }] }, { filters: [{ property: 'due', op: 'is_empty' }] }), false);

  // ---- An edit ----
  const mine = [{ property: 'owner', op: 'is', value: 'ada' }];
  check('a filter edit sets filters only', vs.withPersonalEdit(shared, null, { filters: mine }), { filters: mine });
  check('a sort edit keeps the personal filters', vs.withPersonalEdit(shared, { filters: mine }, { sort: null }), { filters: mine, sort: null });
  check('editing back to the shared filters drops the key', vs.withPersonalEdit(shared, { filters: mine, sort: null }, { filters: shared.filters }), { sort: null });
  check('editing everything back leaves nothing', vs.withPersonalEdit(shared, { filters: mine }, { filters: shared.filters }), null);
  check('an edit keeps quick picks', vs.withPersonalEdit(shared, { quickPicks: { owner: 'ada' } }, { sort: null }), { quickPicks: { owner: 'ada' }, sort: null });

  // ---- Reset and Save for everyone ----
  check('reset drops filter and sort', vs.withoutFilterAndSort({ filters: mine, sort: null }), null);
  check('reset keeps quick picks and folded lanes',
    vs.withoutFilterAndSort({ filters: mine, quickPicks: { owner: 'ada' }, foldedLanes: ['x'] }), { quickPicks: { owner: 'ada' }, foldedLanes: ['x'] });
  check('reset of nothing', vs.withoutFilterAndSort(null), null);

  // ---- Scopes ----
  check('a view on its page', vs.viewScope('v1'), 'v1');
  check('a view in an embed', vs.viewScope('v1', { pageId: 'p', blockId: 'b' }), 'embed:p:b:v1');

  const failed = out.filter((r) => r.got !== r.want);
  for (const r of failed) console.error(`  FAIL  ${r.name}\n        got  ${r.got}\n        want ${r.want}`);
  console.log(`\n  view state: ${out.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length) process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
