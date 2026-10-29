// Keeps the old name out once the fork is nigari (spec 011, FR-013).
//
//   node scripts/check-names.mjs
//
// The rename touched 270 files. A rename that is not checked comes back one
// string at a time: a copied error message, a new wiki page written from an
// old one, a variable named after the old product. This check counts every
// "salt" that reads as a name, file by file, and compares the counts with
// names-allowlist.json, where each file that may keep some says how many and
// why (the code that moves old data, the origin notice, the password salt).
// A count may only go down, like the budgets in check-tokens.mjs: a file that
// needs one more old name says so in a reviewed change to the allowlist.
//
// "salt" as a name is "salt" not preceded by a letter: salt.md, saltmd,
// SALT_DATA, salt_session, X-Salt-Signature, "Salt fetches", salt:// all
// count; "basalt" does not. History and licence texts are skipped whole: they
// describe the past or must stay word for word.
//
// Until the rename is complete (spec 011 T031) the check only reports.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENFORCE = false;

const repo = process.env.CHECK_NAMES_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '../..');
const allowPath = join(repo, 'web/scripts/names-allowlist.json');

// Directories never read: dependencies, builds, git's own files.
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'out', 'data']);
// Files and trees kept as they are on purpose (data-model.md, "Kept on purpose").
const SKIP_PATHS = [
  /^LICENSE$/,
  /^CLA\.md$/,
  /^THIRD-PARTY-NOTICES\.md$/,
  /^\.github\/cla-signatures\.json$/,
  /^specs\/0(0\d|10|11)-/, // specs up to and including the rename are history
  /^docs\/handoffs\//,
  /^docs\/decisions\.md$/,
];

export function countNames(text) {
  return (text.match(/(?<![a-z])salt/gi) ?? []).length;
}

// counts: {path: n}; allow: {path: {count, reason}} → {fails, lower}
export function judge(counts, allow) {
  const fails = [];
  const lower = [];
  for (const [path, n] of Object.entries(counts)) {
    const a = allow[path];
    if (!a) fails.push(`${path}: ${n} old name(s), and the file is not in names-allowlist.json`);
    else if (n > a.count) fails.push(`${path}: ${n} old name(s), the allowlist says ${a.count} (${a.reason})`);
    else if (n < a.count) lower.push(`${path}: ${n} old name(s), the allowlist says ${a.count}; lower it`);
  }
  for (const [path, a] of Object.entries(allow)) {
    if (!(path in counts) && a.count > 0) lower.push(`${path}: no old name left, the allowlist says ${a.count}; remove the entry`);
    if (!a.reason) fails.push(`names-allowlist.json: ${path} has no reason`);
  }
  return { fails, lower };
}

// The check's own failing cases: a check that never fails guards nothing.
const selfFails = [];
const expect = (what, ok) => ok || selfFails.push(`self-test: ${what}`);
expect('counts salt.md, SALT_, salt_, X-Salt-, Salt and saltmd', countNames('salt.md SALT_DATA salt_session X-Salt-Signature Salt saltmd') === 6);
expect('does not count basalt', countNames('basalt') === 0);
expect('a new name in an unlisted file fails', judge({ 'a.ts': 1 }, {}).fails.length === 1);
expect('a count above the allowlist fails', judge({ 'a.ts': 3 }, { 'a.ts': { count: 2, reason: 'r' } }).fails.length === 1);
expect('a count below the allowlist asks to lower it', judge({ 'a.ts': 1 }, { 'a.ts': { count: 2, reason: 'r' } }).lower.length === 1);
expect('an entry without a reason fails', judge({ 'a.ts': 1 }, { 'a.ts': { count: 1 } }).fails.length === 1);
expect('a matching count passes', judge({ 'a.ts': 2 }, { 'a.ts': { count: 2, reason: 'r' } }).fails.length === 0);

// The repository is walked, not listed with git: the Docker image runs this
// gate on a copy without .git (Dockerfile, .dockerignore).
function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full, { throwIfNoEntry: false });
    if (!st) continue;
    if (st.isDirectory()) walk(full, out);
    else if (st.isFile() && st.size < 2_000_000) out.push(full);
  }
  return out;
}

const counts = {};
for (const full of walk(repo, [])) {
  const path = relative(repo, full).split(sep).join('/');
  if (SKIP_PATHS.some((re) => re.test(path))) continue;
  const buf = readFileSync(full);
  if (buf.includes(0)) continue; // binaries: databases, images, built programs
  const n = countNames(buf.toString('utf8'));
  if (n > 0) counts[path] = n;
}

let allow = {};
try {
  allow = JSON.parse(readFileSync(allowPath, 'utf8'));
} catch (e) {
  selfFails.push(`names-allowlist.json: ${e.message}`);
}
const { fails, lower } = judge(counts, allow);
const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (selfFails.length) {
  for (const f of selfFails) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
if (!ENFORCE) {
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, n]) => `${p} ${n}`).join(', ');
  console.log(`  names: reporting only (spec 011 until T031): ${total} old name(s) in ${Object.keys(counts).length} file(s)${top ? `; most in ${top}` : ''}`);
  process.exit(0);
}
for (const l of lower) console.log(`  note  ${l}`);
if (fails.length) {
  for (const f of fails) console.error(`  FAIL  ${f}`);
  console.error(`\n  FAILED — ${fails.length} file(s) with old names beyond names-allowlist.json. Rename them; an old name that must stay gets a counted entry with its reason.`);
  process.exit(1);
}
console.log(`  names: ${total} old name(s), all in the ${Object.keys(allow).length} allowlisted file(s)`);
