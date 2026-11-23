// Asserts when "a new version is available" is said (src/versionNotice.ts).
//
//   node scripts/check-versionnotice.mjs
//
// Same shape as check-tablelead.mjs: esbuild bundles the module once and it is
// imported. No framework. What would hurt if it drifted: issue #923, the notice
// repeating on every reconnect and every Sync while the window stays one
// release behind; or the opposite, a real new release that never speaks up.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-versionnotice-'));
const bundle = join(tmp, 'versionNotice.mjs');

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/versionNotice.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }
  const { shouldAnnounce, loadMemory } = await import(bundle);

  let failed = 0;
  let passed = 0;
  const check = (name, got, want) => {
    if (JSON.stringify(got) === JSON.stringify(want)) passed++;
    else {
      failed++;
      console.error(`  FAIL  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
  };
  const memory = () => {
    let v = null;
    return { get: () => v, set: (x) => (v = x) };
  };

  // Same version, or none: never.
  check('same version', shouldAnnounce('2.1.61', '2.1.61', memory()), false);
  check('no server version', shouldAnnounce(undefined, '2.1.61', memory()), false);
  check('empty server version', shouldAnnounce('', '2.1.61', memory()), false);

  // #923: the start (/api/me) and every live-updates hello carry the same
  // version. Only the first of them speaks.
  {
    const m = memory();
    const said = [1, 2, 3, 4, 5].map(() => shouldAnnounce('2.1.62', '2.1.61', m));
    check('one notice for repeated reconnects', said, [true, false, false, false, false]);
  }

  // A release after that one is new information, and speaks once more.
  {
    const m = memory();
    check('first release', shouldAnnounce('2.1.62', '2.1.61', m), true);
    check('same release again', shouldAnnounce('2.1.62', '2.1.61', m), false);
    check('next release', shouldAnnounce('2.1.63', '2.1.61', m), true);
    check('next release again', shouldAnnounce('2.1.63', '2.1.61', m), false);
  }

  // A version equal to this build never records anything, so it cannot
  // swallow a later real release.
  {
    const m = memory();
    check('equal does not record', [shouldAnnounce('2.1.61', '2.1.61', m), m.get()], [false, null]);
  }

  // The default memory is the page load's own: it needs no storage API.
  check('load memory first', shouldAnnounce('9.9.9', '1.0.0'), true);
  check('load memory repeat', shouldAnnounce('9.9.9', '1.0.0', loadMemory), false);

  if (failed) {
    console.error(`check-versionnotice: ${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`check-versionnotice: ${passed} passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
