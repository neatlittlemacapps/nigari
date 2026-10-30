// Checks that every upgrade step ships with the database that proves it
// (spec 008, FR-012, FR-013, T022).
//
//   node scripts/check-upgrades.mjs
//
// A step changes stored data on every instance that starts the new release.
// TestUpgradeFixtures proves a step against a database written by the code
// before it, but only against the fixtures that exist: a step added without
// its fixture is a step nothing tested on a real older database, and the tests
// stay green. So, from server/upgrade_steps.go and server/testdata/upgrade/:
//
//   1. Steps are numbered 1, 2, 3 … in order, without a gap or a repeat.
//      goose runs them by number; a gap reads as a step that was removed after
//      instances ran it, and their databases would then be "newer" than every
//      release.
//   2. Every step N has step-<N-1>.db, written by the code just before it.
//   3. No fixture is written by code at or past the newest step: step-<K>.db
//      with K >= newest was made by a database that already has every step,
//      so it proves no step at all.
//   4. Every fixture is named in testdata/upgrade/README.md, which says which
//      commit wrote it: a fixture nobody can trace is one nobody can trust.
//
// The rules are a pure function, run first against cases that must fail, so a
// regex that stops matching cannot turn this check into one that passes
// everything.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = process.env.CHECK_UPGRADES_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '../..');

/** The step numbers in upgradeSteps(), in the order they are listed. */
export function stepsIn(source) {
  const body = source.match(/func upgradeSteps\(\)[^{]*\{([\s\S]*?)\n\}/)?.[1];
  if (body === undefined) return null;
  return [...body.matchAll(/goose\.NewGoMigration\(\s*(\d+)\s*,/g)].map((m) => Number(m[1]));
}

/** What is wrong, as sentences that say what to add. Empty when nothing is. */
export function problems({ source, fixtures, readme }) {
  const out = [];
  const steps = stepsIn(source);
  if (steps === null) return ['server/upgrade_steps.go: no upgradeSteps() function found'];
  if (steps.length === 0) return ['server/upgrade_steps.go: upgradeSteps() lists no step'];
  steps.forEach((n, i) => {
    if (n !== i + 1) out.push(`server/upgrade_steps.go: step ${i + 1} is listed as ${n}; steps are numbered 1, 2, 3 … in order, without a gap or a repeat`);
  });
  const newest = Math.max(...steps);
  const have = new Set(fixtures);
  for (const n of steps) {
    const want = `step-${n - 1}.db`;
    if (!have.has(want)) {
      out.push(`server/testdata/upgrade/${want} is missing: step ${n} needs a database written by the code just before it. ` +
        `Write it from the commit before step ${n}: NIGARI_WRITE_UPGRADE_FIXTURE=$PWD/server/testdata/upgrade/${want} go test ./server -run TestWriteUpgradeFixture -count=1`);
    }
  }
  for (const f of fixtures) {
    const k = Number(f.match(/^step-(\d+)\.db$/)?.[1]);
    if (!Number.isInteger(k)) {
      out.push(`server/testdata/upgrade/${f}: not a fixture name; fixtures are step-<N>.db`);
      continue;
    }
    if (k >= newest) out.push(`server/testdata/upgrade/${f}: written at step ${k}, but the newest step is ${newest}; it proves no step. Add step ${k + 1} with it, or remove it`);
    if (!readme.includes('`' + f + '`')) out.push(`server/testdata/upgrade/README.md: add ${f} to the table, with the commit that wrote it`);
  }
  return out;
}

// ---- cases that must fail, and one that must pass ----

const step = (n) => `\t\tgoose.NewGoMigration(${n}, &goose.GoFunc{RunTx: s${n}}, nil),`;
const src = (...ns) => `func upgradeSteps() []*goose.Migration {\n\treturn []*goose.Migration{\n${ns.map(step).join('\n')}\n\t}\n}\n`;
const listed = (...fs) => fs.map((f) => '| `' + f + '` | x |').join('\n');
const cases = [
  ['step 2 without step-1.db', { source: src(1, 2), fixtures: ['step-0.db'], readme: listed('step-0.db') }, /step-1\.db is missing/],
  ['a gap in the numbers', { source: src(1, 3), fixtures: ['step-0.db', 'step-2.db'], readme: listed('step-0.db', 'step-2.db') }, /listed as 3/],
  ['a repeated number', { source: src(1, 1), fixtures: ['step-0.db'], readme: listed('step-0.db') }, /listed as 1/],
  ['a fixture past the newest step', { source: src(1), fixtures: ['step-0.db', 'step-1.db'], readme: listed('step-0.db', 'step-1.db') }, /proves no step/],
  ['a fixture missing from the README', { source: src(1, 2), fixtures: ['step-0.db', 'step-1.db'], readme: listed('step-0.db') }, /add step-1\.db to the table/],
  ['no upgradeSteps()', { source: 'package server\n', fixtures: [], readme: '' }, /no upgradeSteps/],
];
let selfFail = 0;
for (const [name, input, want] of cases) {
  const got = problems(input);
  if (!got.some((p) => want.test(p))) {
    console.error(`  FAIL  self-test "${name}": want a problem matching ${want}, got ${JSON.stringify(got)}`);
    selfFail++;
  }
}
const clean = problems({ source: src(1, 2), fixtures: ['step-0.db', 'step-1.db'], readme: listed('step-0.db', 'step-1.db') });
if (clean.length) {
  console.error(`  FAIL  self-test "a complete set": want no problem, got ${JSON.stringify(clean)}`);
  selfFail++;
}
if (selfFail) process.exit(1);

// ---- the repository ----

const dir = join(repo, 'server/testdata/upgrade');
const real = {
  source: readFileSync(join(repo, 'server/upgrade_steps.go'), 'utf8'),
  fixtures: existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.db')) : [],
  readme: existsSync(join(dir, 'README.md')) ? readFileSync(join(dir, 'README.md'), 'utf8') : '',
};
const found = problems(real);
if (found.length) {
  for (const p of found) console.error(`  FAIL  ${p}`);
  console.error(`\n  FAILED — ${found.length} upgrade step(s) or fixture(s) out of order.`);
  process.exit(1);
}
const steps = stepsIn(real.source);
console.log(`  upgrades: steps 1–${steps.length}, each with the fixture written before it; ${cases.length + 1} self-test cases`);
