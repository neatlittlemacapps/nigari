// Checks every plan's Surfaces table against the surfaces registry.
//
//   node scripts/check-surfaces.mjs
//
// "Every surface, every time" (constitution VI) was a list in the plan
// template, which meant a surface added later — the design system, the
// storage budgets — reached the next plan only if whoever wrote it remembered.
// The registry (.specify/memory/surfaces.md) is the one list; this makes it
// mechanical:
//
//   1. Every plan (specs/*/plan.md) dated on or after a surface's Since date
//      has a row for it in its Surfaces table.
//   2. No such row is empty, TBD or a placeholder: it says what changes, or
//      "No change: <why>".
//
// Plans written before a surface existed are not asked about it: a plan is a
// record of what was considered at the time, not a document to keep current.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '../..');

function tableRows(md, afterHeading) {
  const start = afterHeading ? md.search(afterHeading) : 0;
  if (start < 0) return null;
  const rows = [];
  let inTable = false;
  for (const line of md.slice(start).split('\n')) {
    if (line.startsWith('|')) {
      inTable = true;
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^-+$/.test(c))) continue;
      rows.push(cells);
    } else if (inTable) {
      break;
    }
  }
  return rows.slice(1); // drop the header row
}

const registry = tableRows(readFileSync(join(repo, '.specify/memory/surfaces.md'), 'utf8'), /^\| Surface \|/m)
  .map(([name, , tag, since]) => ({ name, tag, since }));

const failures = [];
for (const s of registry) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.since)) failures.push(`surfaces.md: "${s.name}" has no Since date`);
}

// 3. Every tag in the registry is a Surface option and a surface:* label the
//    board helper creates; otherwise a task tagged with it has no column on the
//    board and board-sync.sh has nothing to set.
const board = readFileSync(join(repo, 'scripts/setup-board.sh'), 'utf8').match(/^surfaces="([^"]+)"/m)?.[1].split(',') ?? [];
for (const tag of new Set(registry.map((s) => s.tag))) {
  if (!board.includes(tag)) failures.push(`surfaces.md: tag "${tag}" is not in scripts/setup-board.sh's surfaces list — add the option to the board and the label`);
}

const specsDir = join(repo, 'specs');
let plans = 0;
for (const dir of existsSync(specsDir) ? readdirSync(specsDir) : []) {
  const path = join(specsDir, dir, 'plan.md');
  if (!existsSync(path)) continue;
  const md = readFileSync(path, 'utf8');
  const date = md.match(/\*\*Date\*\*: (\d{4}-\d{2}-\d{2})/)?.[1];
  if (!date) {
    failures.push(`specs/${dir}/plan.md: no **Date**, so the surfaces it must answer are unknown`);
    continue;
  }
  plans++;
  const rows = tableRows(md, /^## Surfaces/m) ?? [];
  for (const s of registry.filter((s) => s.since <= date)) {
    const row = rows.find(([cell]) => cell.startsWith(s.name));
    if (!row) {
      failures.push(`specs/${dir}/plan.md: no row for surface "${s.name}" (in the registry since ${s.since})`);
    } else if (!row[1] || /^(TBD|\[.*\])$/i.test(row[1])) {
      failures.push(`specs/${dir}/plan.md: the "${s.name}" row says nothing — name the change, or "No change: <why>"`);
    }
  }
}

console.log(`  surfaces: ${registry.length} in the registry, ${plans} plan(s) checked`);
if (failures.length) {
  for (const f of failures) console.log(`  FAIL  ${f}`);
  console.log(`\n  FAILED — ${failures.length} plan row(s) missing or empty. Add them; a surface that does not apply still gets "No change: <why>".`);
  process.exit(1);
}
