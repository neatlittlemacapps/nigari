// Asserts what deleting a property says and does to the views
// (src/propertyDelete.ts, spec 015 research R6), the rule the Edit properties
// dialog and a row's page share.
//
//   node scripts/check-propertydelete.mjs
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
const tmp = mkdtempSync(join(tmpdir(), 'nigari-propertydelete-'));
const bundle = join(tmp, 'propertyDelete.mjs');

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/propertyDelete.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }

  const { deletePropertyMessage, tidyViewsAfterSchema } = await import(bundle);
  const out = [];
  const check = (name, got, want) => out.push({ name, got: JSON.stringify(got), want: JSON.stringify(want) });
  // The English key with its variables filled in, as t() does without a locale.
  const t = (key, vars = {}) => key.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);

  // ---- the confirmation (#524) ----
  check('names the property and the database',
    deletePropertyMessage(t, { name: 'Due', type: 'date' }, 'Tasks'),
    'Delete “Due” from “Tasks”? It will be removed from all views.');
  check('an unnamed property reads Untitled',
    deletePropertyMessage(t, { name: '', type: 'text' }, 'Tasks'),
    'Delete “Untitled” from “Tasks”? It will be removed from all views.');
  check('a relation adds where its links go',
    deletePropertyMessage(t, { name: 'Project', type: 'relation', relationCollection: 'p' }, 'Tasks', 'Projects'),
    'Delete “Project” from “Tasks”? It will be removed from all views.\nIts links to rows of “Projects” go with it.');
  check('a relation to a database not known by name',
    deletePropertyMessage(t, { name: 'Project', type: 'relation', relationCollection: 'p' }, 'Tasks'),
    'Delete “Project” from “Tasks”? It will be removed from all views.\nIts links to rows of “Untitled” go with it.');
  check('a relation without a target says nothing more',
    deletePropertyMessage(t, { name: 'Project', type: 'relation' }, 'Tasks'),
    'Delete “Project” from “Tasks”? It will be removed from all views.');

  // ---- the views it leaves ----
  const schema = [
    { id: 'status', name: 'Status', type: 'select' },
    { id: 'project', name: 'Project', type: 'relation' },
    { id: 'due', name: 'Due', type: 'date' },
  ];
  const board = { id: 'b', name: 'Board', type: 'board', groupBy: 'gone' };
  const cal = { id: 'c', name: 'Calendar', type: 'calendar', dateProp: 'gone' };
  const table = {
    id: 't', name: 'Table', type: 'table',
    filters: [{ property: 'gone', op: 'is', value: 'x' }, { property: 'status', op: 'is', value: 'todo' }],
    sort: { property: 'gone', direction: 'asc' },
    hidden: ['gone', 'due'],
  };
  const [b, c, tb] = tidyViewsAfterSchema(schema, [board, cal, table]);
  check('a board regroups by the first groupable property', b.groupBy, 'status');
  check('a calendar takes the first date', c.dateProp, 'due');
  check('filters drop the gone property', tb.filters, [{ property: 'status', op: 'is', value: 'todo' }]);
  check('a sort on it is cleared', tb.sort, null);
  check('hidden drops it', tb.hidden, ['due']);
  check('a board grouped by a relation keeps it',
    tidyViewsAfterSchema(schema, [{ ...board, groupBy: 'project' }])[0].groupBy, 'project');
  check('a relation counts as groupable when a board regroups',
    tidyViewsAfterSchema([schema[1], schema[0]], [board])[0].groupBy, 'project');
  check('a board with nothing to group by gets none',
    tidyViewsAfterSchema([{ id: 'n', name: 'N', type: 'number' }], [board])[0].groupBy, '');
  const untouched = { id: 'u', name: 'U', type: 'table', filters: [{ property: 'due', op: 'is_empty' }], sort: { property: 'due', direction: 'desc' } };
  check('a view naming only live properties is unchanged', tidyViewsAfterSchema(schema, [untouched])[0], untouched);
  check('the original views are not changed in place', table.filters.length, 2);

  const bad = out.filter((x) => x.got !== x.want);
  for (const x of bad) console.error(`  ✗ ${x.name}: got ${x.got}, want ${x.want}`);
  if (bad.length) process.exit(1);
  console.log(`  property delete: ${out.length} cases checked`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
