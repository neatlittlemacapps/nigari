// A database's config saves go one at a time and a refusal puts back what the
// server last took, never a snapshot from before a later change (#530).
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const tmp = mkdtempSync(join(tmpdir(), 'nigari-saveline-'));
try {
  const outfile = join(tmp, 'saveLine.mjs');
  await build({
    entryPoints: [fileURLToPath(new URL('../src/saveLine.ts', import.meta.url))],
    bundle: true, format: 'esm', outfile,
  });
  const { saveLine } = await import(pathToFileURL(outfile).href);

  // A server whose answers the test hands out one by one.
  const server = () => {
    const calls = [];
    const send = (patch) => new Promise((ok, fail) => calls.push({ patch, ok, fail }));
    return { calls, send };
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  // Three quick changes: the first goes at once, the other two wait and go
  // together, the later one winning. Never two requests in flight.
  {
    const { calls, send } = server();
    const saved = [];
    const refused = [];
    const line = saveLine(send, (p) => saved.push(p), (e) => refused.push(e));
    const a = line.save({ views: 'v1' });
    const b = line.save({ views: 'v2' });
    const c = line.save({ views: 'v3', schema: 's3' });
    await tick();
    assert.equal(calls.length, 1, 'one request in flight');
    assert.deepEqual(calls[0].patch, { views: 'v1' });
    calls[0].ok();
    await tick();
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].patch, { views: 'v3', schema: 's3' }, 'waiting changes go together, the latest winning');
    calls[1].ok();
    assert.deepEqual(await Promise.all([a, b, c]), [true, true, true]);
    assert.deepEqual(saved, [{ views: 'v1' }, { views: 'v3', schema: 's3' }]);
    assert.equal(refused.length, 0);
  }

  // The first save is refused while two wait: they hold its change too, so
  // they are dropped, the refusal is reported once and nothing else is sent.
  {
    const { calls, send } = server();
    const refused = [];
    const line = saveLine(send, () => {}, (e) => refused.push(e.message));
    const a = line.save({ views: 'v1' });
    const b = line.save({ views: 'v2' });
    await tick();
    calls[0].fail(new Error('no'));
    assert.deepEqual(await Promise.all([a, b]), [false, false]);
    await tick();
    assert.equal(calls.length, 1, 'nothing sent after a refusal');
    assert.deepEqual(refused, ['no']);
    // The line is free again for the next change.
    const c = line.save({ views: 'v4' });
    await tick();
    assert.equal(calls.length, 2);
    calls[1].ok();
    assert.equal(await c, true);
  }

  // A refusal of the second request leaves the first as saved.
  {
    const { calls, send } = server();
    const saved = [];
    const line = saveLine(send, (p) => saved.push(p), () => {});
    const a = line.save({ views: 'v1' });
    const b = line.save({ views: 'v2' });
    await tick();
    calls[0].ok();
    await tick();
    calls[1].fail(new Error('no'));
    assert.deepEqual(await Promise.all([a, b]), [true, false]);
    assert.deepEqual(saved, [{ views: 'v1' }]);
  }
  console.log('check-saveline: ok');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
