// Checks that installing, updating and releasing point at this fork, and that
// every build stamps one version into both of its halves (spec 009, #265).
//
//   node scripts/check-release.mjs
//
// Before #265 the fork had no releases, and install.sh, the update check, the
// container image and the install docs all named upstream (saltmd/salt.md), so
// installing the fork installed upstream's v1.1.4. Each of those is one line
// in a different file; an upstream merge or a copied snippet puts any of them
// back without a test failing. So:
//
//   1. The fork's name is read from server/update.go (updateRepo), the one
//      place the running server uses, and must not be upstream's.
//   2. install.sh defaults to it; the image is this repository's; the install
//      lines in README, wiki, docs and deployment files name it.
//   3. release.yml, the Makefile and the Dockerfile feed one version into the
//      frontend (NIGARI_VERSION) and the server (-X nigari/server.Version). Two
//      versions show "a new version is available" on every page load.
//   4. Server releases are latest and not prereleases; desktop releases are
//      never latest (install.sh and the update check read /releases/latest).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = process.env.CHECK_RELEASE_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(join(repo, p), 'utf8');
const UPSTREAM = 'saltmd/salt.md';
const fails = [];
const fail = (where, what) => fails.push(`${where}: ${what}`);

// 1. The fork's name.
const fork = read('server/update.go').match(/updateRepo\s*=\s*"([^"]+)"/)?.[1];
if (!fork) fail('server/update.go', 'no updateRepo constant found');
else if (fork === UPSTREAM) fail('server/update.go', `updateRepo is upstream's (${UPSTREAM}); the update notice would offer upstream's releases`);

// 2. Where people install from.
const install = read('install.sh');
const def = install.match(/^REPO="\$\{NIGARI_REPO:-([^}]+)\}"/m)?.[1];
if (def !== fork) fail('install.sh', `REPO must default to ${fork} through NIGARI_REPO, found ${def ?? 'none'}`);

const docker = read('.github/workflows/docker.yml');
if (!docker.includes('ghcr.io/${{ github.repository }}:')) fail('.github/workflows/docker.yml', 'image tags must be ghcr.io/${{ github.repository }}');
if (docker.includes(`ghcr.io/${UPSTREAM}`)) fail('.github/workflows/docker.yml', `pushes to ghcr.io/${UPSTREAM}, which the fork cannot write`);

// Install lines: the script URL, the image, release downloads.
const upstreamLinks = [`raw.githubusercontent.com/${UPSTREAM}/`, `ghcr.io/${UPSTREAM}`, `github.com/${UPSTREAM}/releases`];
const docFiles = ['README.md', 'docker-compose.yml', 'deploy/nigari.container', 'install.sh'];
for (const dir of ['wiki', 'docs']) {
  for (const f of readdirSync(join(repo, dir))) if (f.endsWith('.md')) docFiles.push(`${dir}/${f}`);
}
// decisions.md and handoffs record history, which names upstream on purpose.
for (const f of docFiles.filter((f) => f !== 'docs/decisions.md' && existsSync(join(repo, f)))) {
  read(f).split('\n').forEach((line, i) => {
    for (const link of upstreamLinks) {
      if (line.includes(link) && !line.includes('NIGARI_REPO')) fail(`${f}:${i + 1}`, `installs from upstream (${link}); use ${fork}`);
    }
  });
}

// 3. One version for both halves.
const release = read('.github/workflows/release.yml');
const fe = release.match(/NIGARI_VERSION:\s*(\$\{\{[^}]+\}\})/)?.[1];
const be = release.match(/VERSION="(\$\{\{[^}]+\}\})"/)?.[1];
if (!fe || !be || fe !== be) fail('.github/workflows/release.yml', `the frontend (${fe ?? 'none'}) and the server (${be ?? 'none'}) must be built with the same version`);
if (!/-X nigari\/server\.Version=\$\{VERSION\}/.test(release)) fail('.github/workflows/release.yml', 'the binaries must be stamped with -X nigari/server.Version=${VERSION}');

const make = read('Makefile');
if (!/NIGARI_VERSION=\$\(VERSION\)/.test(make) || !/-X nigari\/server\.Version=\$\(VERSION\)/.test(make)) {
  fail('Makefile', 'frontend and backend must both take $(VERSION) (NIGARI_VERSION=$(VERSION), -X nigari/server.Version=$(VERSION))');
}
const dockerfile = read('Dockerfile');
// The image's frontend stage runs this whole gate (npm run build), so it must
// have every file the gate reads. Copying directories one by one broke the
// image each time a check read a new one (v1.6.9: .specify/).
const webStage = dockerfile.slice(dockerfile.indexOf(' AS web'), dockerfile.search(/^RUN .*npm run build/m));
if (!/^COPY \. \/src$/m.test(webStage)) fail('Dockerfile', 'the frontend stage must COPY . /src before npm run build: the gate inside it reads files all over the repository');
if (!/NIGARI_VERSION=\$\{VERSION\}/.test(dockerfile) || !/-X nigari\/server\.Version=\$\{VERSION\}/.test(dockerfile)) {
  fail('Dockerfile', 'frontend and backend must both take ${VERSION}');
}

// 4. Which release is "latest".
if (!/branches:\s*\[main\]/.test(release)) fail('.github/workflows/release.yml', 'must run on every push to main');
if (!/make_latest:\s*"true"/.test(release) || !/prerelease:\s*false/.test(release)) fail('.github/workflows/release.yml', 'server releases must be full releases marked latest');
if (!/make_latest:\s*"false"/.test(read('.github/workflows/desktop.yml'))) fail('.github/workflows/desktop.yml', 'desktop releases must never be marked latest');

if (fails.length) {
  for (const f of fails) console.error(`  FAIL  ${f}`);
  console.error(`\n  FAILED — ${fails.length} place(s) point away from the fork's releases.`);
  process.exit(1);
}
console.log(`  release: installs, updates and images point at ${fork}; one version per build`);
