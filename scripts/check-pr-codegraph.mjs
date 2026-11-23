// Fails a pull request whose description does not say what the code graph showed.
//
//   node scripts/check-pr-codegraph.mjs              # in Actions: reads $GITHUB_EVENT_PATH
//   node scripts/check-pr-codegraph.mjs --self-test  # the cases at the bottom
//
// Every pull request carries a "## CodeGraph" section: the graph queries the
// session ran (`codegraph explore`, `callers`, `impact`) and what they found,
// or why it was not used (a change to docs only). The rule was an instruction
// (AGENTS.md, .claude/rules/codegraph.md, the handoff on #643) and nothing
// checked it: project threads clone the repository after the session starts,
// so the SessionStart hook never built the graph, and #907, #920 and #922 went
// out without it. Only a person reading the description could notice (#926).
//
// The plans already have the same rule, checked by web/scripts/check-surfaces.mjs;
// this is its twin for the description, which lives on GitHub, not in the tree.
//
// Not asked: bots (dependabot, release and store bots) and anyone who is not
// the owner or a collaborator. They have no session and no graph, and a red
// mark on a first contribution (#821) would only tell them about our tooling.

import { readFileSync } from 'node:fs';

// Who is asked. GitHub's author_association for the pull request's author.
const ASKED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

// A section shorter than this says nothing ("n/a", "used it", "-").
const MIN_LENGTH = 30;

// The section's body, or null when there is no such heading. "CodeGraph" and
// "Code graph" both count; the section runs to the next heading of level 1 or 2.
export function codegraphSection(body) {
  const text = (body ?? '').replace(/\r\n/g, '\n');
  const m = text.match(/^##[ \t]+Code[ \t]?graph\b[^\n]*\n?([\s\S]*?)(?=^#{1,2}[ \t]|(?![\s\S]))/im);
  return m ? m[1] : null;
}

// What is wrong with the description, or null when it passes.
export function problem(body) {
  const section = codegraphSection(body);
  if (section === null) {
    return 'The description has no "## CodeGraph" section. Say which graph queries you ran (codegraph explore, callers, impact) and what they found, or why the graph does not apply (.claude/rules/codegraph.md).';
  }
  const said = section.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!said) {
    return 'The "## CodeGraph" section is empty or still the template\'s comment. Say which graph queries you ran and what they found.';
  }
  if (said.length < MIN_LENGTH || /^(n\/?a|none|todo|tbd|-+|\.+)$/i.test(said)) {
    return `The "## CodeGraph" section says too little ("${said}"). Name the queries and what they found, or why the graph does not apply.`;
  }
  return null;
}

// Whether this pull request's author is asked at all.
export function asked(pr) {
  if (pr.user?.type === 'Bot') return false;
  return ASKED.has(pr.author_association);
}

function selfTest() {
  const good = 'Ran `codegraph callers shouldAnnounce`: one caller, announceNewVersion.';
  const cases = [
    [`## Why\nx\n\n## CodeGraph\n${good}\n\n## Reviews\ny`, true],
    [`## Code graph\n${good}`, true],
    [`## Codegraph (synced after the edits)\n${good}`, true],
    [`## CodeGraph\r\n${good}\r\n## Reviews\r\ny`, true],
    [`## CodeGraph\n### Queries\n${good}\n## Reviews\ny`, true],
    ['## CodeGraph\nNot used: this changes docs/decisions.md only, no code.', true],
    ['## Why\nx\n## Reviews\ny', false],
    ['', false],
    [null, false],
    ['## CodeGraph\n\n## Reviews\ny', false],
    ['## CodeGraph\n<!-- Which queries ran, and what they found. -->\n\n## Reviews\ny', false],
    ['## CodeGraph\nn/a\n## Reviews\ny', false],
    ['## CodeGraph\nused it', false],
    [`### CodeGraph\n${good}`, false],
    [`Mentions ## CodeGraph inline\n${good}`, false],
  ];
  let failed = 0;
  for (const [body, passes] of cases) {
    const got = problem(body) === null;
    if (got !== passes) {
      failed++;
      console.error(`self-test: expected ${passes ? 'pass' : 'fail'} for ${JSON.stringify(body)}, got ${problem(body) ?? 'pass'}`);
    }
  }
  const who = [
    [{ user: { type: 'User' }, author_association: 'OWNER' }, true],
    [{ user: { type: 'User' }, author_association: 'COLLABORATOR' }, true],
    [{ user: { type: 'User' }, author_association: 'FIRST_TIME_CONTRIBUTOR' }, false],
    [{ user: { type: 'User' }, author_association: 'CONTRIBUTOR' }, false],
    [{ user: { type: 'Bot' }, author_association: 'OWNER' }, false],
  ];
  for (const [pr, want] of who) {
    if (asked(pr) !== want) {
      failed++;
      console.error(`self-test: asked(${JSON.stringify(pr)}) should be ${want}`);
    }
  }
  if (failed) process.exit(1);
  console.log(`check-pr-codegraph self-test: ${cases.length + who.length} cases pass`);
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const pr = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).pull_request;
  if (!pr) {
    console.log('Not a pull request event; nothing to check.');
  } else if (!asked(pr)) {
    console.log(`Not asked: ${pr.user.login} (${pr.user.type}, ${pr.author_association}) has no session and no code graph.`);
  } else {
    const why = problem(pr.body);
    if (why) {
      console.log(`::error title=CodeGraph section::${why}`);
      process.exit(1);
    }
    console.log('The description says what the code graph showed.');
  }
}
