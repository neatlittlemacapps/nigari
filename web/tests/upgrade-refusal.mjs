import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { eventually } from './fixture.mjs';

// Spec 008, US4: a binary started on a database a newer release upgraded does
// not start. It says why on its usual address, to a person at / and to a
// script or agent at /api/, and leaves the database file as it was.
//
// Its own fixture, not withFixture: the test needs the same data directory
// started twice, with the database moved one step ahead of this binary in
// between, which is what a downgrade looks like from the inside.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temp = await mkdtemp(join(tmpdir(), 'salt-upgrade-refusal-'));
const data = join(temp, 'data');
const dbFile = join(data, 'salt.db');
let server;
let browser;

async function freePort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(done => listener.close(done));
  return port;
}

function start(binary, port) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NIGARI_')));
  return spawn(binary, [], { env: { ...env, NIGARI_DATA: data, NIGARI_ADDR: `127.0.0.1:${port}` }, stdio: 'ignore' });
}

async function stop(proc) {
  if (!proc || proc.exitCode !== null) return;
  const exited = once(proc, 'exit');
  proc.kill('SIGTERM');
  const timer = setTimeout(() => proc.kill('SIGKILL'), 2000);
  await exited;
  clearTimeout(timer);
}

const sha = async file => createHash('sha256').update(await readFile(file)).digest('hex');

try {
  const binary = join(temp, process.platform === 'win32' ? 'salt.exe' : 'salt');
  const build = spawnSync(process.env.GO_BINARY || 'go', ['build', '-o', binary, '.'], { cwd: root, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr || String(build.error || 'Build failed'));

  // First start: a normal instance, which creates the database at this
  // binary's newest step. Stopped cleanly, so the WAL is checkpointed.
  let port = await freePort();
  server = start(binary, port);
  let base = `http://127.0.0.1:${port}`;
  await eventually(async () => {
    if (server.exitCode !== null) throw new Error('The first start exited before becoming ready');
    try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; }
  });
  await stop(server);

  // A newer release ran one more step on it.
  const db = new DatabaseSync(dbFile);
  const newest = db.prepare('SELECT MAX(version_id) AS v FROM goose_db_version').get().v;
  db.prepare('INSERT INTO goose_db_version (version_id, is_applied) VALUES (?, 1)').run(newest + 1);
  db.close();
  const before = await sha(dbFile);

  // Second start: refused, but answering on its address.
  port = await freePort();
  server = start(binary, port);
  base = `http://127.0.0.1:${port}`;
  await eventually(async () => {
    if (server.exitCode !== null) throw new Error('The refused start exited instead of serving the refusal');
    try { return (await fetch(`${base}/api/me`)).status === 503; } catch { return false; }
  });

  const answer = await fetch(`${base}/api/me`);
  assert.equal(answer.status, 503);
  const body = await answer.json();
  assert.equal(body.code, 'upgrade_refused');
  assert.match(body.error, new RegExp(`at upgrade step ${newest + 1}, but this salt\\.md .* only knows steps up to ${newest}\\.`));

  const mcp = await fetch(`${base}/mcp`, { method: 'POST', body: '{}' });
  assert.equal(mcp.status, 503);
  assert.equal((await mcp.json()).code, 'upgrade_refused');

  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  });
  const page = await (await browser.newContext({ locale: 'en-US' })).newPage();
  const response = await page.goto(`${base}/p/anything`);
  assert.equal(response.status(), 503);
  await page.getByRole('heading', { name: 'salt.md did not start' }).waitFor();
  assert.match(await page.textContent('body'), /It has not been changed\./);
  assert.match(await page.textContent('body'), /upgrade_refused/);
  assert.equal(await page.locator('script').count(), 0, 'the refusal page carries a script');

  await stop(server);
  assert.equal(await sha(dbFile), before, 'the refused start changed the database file');
  console.log('upgrade refusal: page, /api/ and /mcp answer 503 with the sentence; the database is untouched');
} finally {
  await browser?.close();
  await stop(server);
  await rm(temp, { recursive: true, force: true });
}
