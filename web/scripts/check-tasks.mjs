// Checks every spec's tasks.md against what the board automation reads.
//
//   node scripts/check-tasks.mjs
//
// The board follows the tasks without anyone moving cards: ticking a task on
// main closes its issue (scripts/tasks-sync.sh) and the issue's Surface comes
// from its label (scripts/board-sync.sh). Both read tasks.md, so a tasks.md
// they cannot read silently stops the board from following. That happened
// once already: spec 003 merged with its twenty task issues still open.
//
//   1. tasks.md has an `**Issues**:` line that names the feature issue
//      (`parent #N`), or says `none yet` until /speckit-github-taskstoissues
//      has run.
//   2. Every task line is `- [ ] T001 …` or `- [x] T001 …` with a unique ID.
//   3. Every task carries exactly one surface tag from the registry
//      (.specify/memory/surfaces.md), which becomes its label and board field.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '../..');
const registry = readFileSync(join(repo, '.specify/memory/surfaces.md'), 'utf8');
const tags = new Set(
  registry.split('\n')
    .filter((l) => l.startsWith('|'))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim())[2])
    .filter((t) => t && /^[a-z0-9]+$/.test(t)),
);

const errors = [];
let checked = 0;
for (const dir of readdirSync(join(repo, 'specs')).sort()) {
  const path = join('specs', dir, 'tasks.md');
  if (!existsSync(join(repo, path))) continue;
  checked++;
  const md = readFileSync(join(repo, path), 'utf8');

  const issues = md.match(/^\*\*Issues\*\*:(.*)$/m);
  if (!issues) {
    errors.push(`${path}: no "**Issues**:" line; write "parent #N" once the issues exist, "none yet" before`);
  } else if (!/parent #\d+/.test(issues[1]) && !/none yet/i.test(issues[1])) {
    errors.push(`${path}: the Issues line names no "parent #N" (the feature issue the tasks are sub-issues of)`);
  }

  const seen = new Set();
  md.split('\n').forEach((line, i) => {
    if (!/^- \[[ xX]\]/.test(line)) return;
    const where = `${path}:${i + 1}`;
    const m = line.match(/^- \[[ xX]\] (T\d{3,})\b(.*)$/);
    if (!m) {
      errors.push(`${where}: a checkbox line without a task ID (T001); the board cannot match it to an issue`);
      return;
    }
    const [, id, rest] = m;
    if (seen.has(id)) errors.push(`${where}: ${id} appears twice`);
    seen.add(id);
    const lineTags = [...rest.matchAll(/\[([a-z0-9]+)\]/g)].map((t) => t[1]).filter((t) => t !== 'p' && !/^us\d+$/.test(t));
    const known = lineTags.filter((t) => tags.has(t));
    if (known.length !== 1) {
      errors.push(`${where}: ${id} needs exactly one surface tag from the registry (${[...tags].join(', ')}); found ${known.length ? known.join(', ') : 'none'}`);
    }
  });
}

if (errors.length) {
  console.error(`tasks: ${errors.length} problem(s)\n` + errors.map((e) => '  ' + e).join('\n'));
  process.exit(1);
}
console.log(`  tasks: ${checked} tasks.md file(s) checked`);
