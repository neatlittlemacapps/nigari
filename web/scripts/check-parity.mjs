// Checks capabilities.json against the code: every route and every MCP tool
// belongs to a capability, and what a capability promises about agents holds.
//
//   node scripts/check-parity.mjs
//
// Agent parity is the one rule of this codebase that nothing enforced. The
// interface and the MCP server grew side by side, and the history is a list of
// the places they drifted: a check on the REST side and not on the MCP side,
// a capability that vanished when its tool was folded into another, a route
// an agent's token could reach although agents were promised it could not.
// Each was found by a person, later, one at a time.
//
// The manifest makes the promise explicit, and this file makes it mechanical:
//
//   1. Every route in server.go is named by exactly one capability.
//   2. Every MCP tool in mcp.go is named by at least one capability, and no
//      capability names a route or a tool that does not exist.
//   3. allowed     → names routes and tools.
//      agent-only  → names tools.
//      gap         → names routes, no tools, and says why in a note.
//      closed      → no tools, a reason, and every route that changes
//                    something is session-only (sessionOnly, adminOnly or
//                    ownerOnly), so no token reaches it — unless it is listed
//                    under tokenReachable with a note, which keeps a known
//                    contradiction visible in every run until it is decided.
//                    Once decided, "accepted": true records that the exception
//                    is deliberate; the note then says where it was decided.
//      infrastructure → no tools.
//   4. The wiki page each capability names exists.
//   5. Gaps only go down: their count must equal gapBudget, so closing one
//      means lowering the budget, and opening one means saying so in review.
//
// What it cannot check is whether a tool really does what its route does.
// The parity property test (server/parity_property_test.go) checks that for
// access; behaviour stays the reviewer's job.

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../..');

const manifest = JSON.parse(readFileSync(join(repo, 'capabilities.json'), 'utf8'));
const server = readFileSync(join(repo, 'server/server.go'), 'utf8');
const mcp = readFileSync(join(repo, 'server/mcp.go'), 'utf8');

const errors = [];
const notes = [];

// ---- what the code has -----------------------------------------------------

// Routes: "METHOD /path" or a bare "/path", with whether the registration
// line wraps the handler in a middleware that refuses every token.
const routes = new Map();
for (const m of server.matchAll(/m\.Handle(?:Func)?\("([^"]+)",\s*([^\n]*)/g)) {
  routes.set(m[1], { sessionOnly: /\b(sessionOnly|adminOnly|ownerOnly)\b/.test(m[2]) });
}

// Tools: the top-level entries of mcpTools — a name followed by a description.
const listStart = mcp.indexOf('var mcpTools');
const listEnd = mcp.indexOf('\n}\n', listStart);
const tools = new Set(
  [...mcp.slice(listStart, listEnd).matchAll(/"name":\s*"([a-z_]+)",\s*\n?\s*"description"/g)].map((m) => m[1]),
);

// ---- 1 + 2: coverage ---------------------------------------------------------

const routeOwner = new Map();
const toolOwners = new Map();
const KINDS = new Set(['allowed', 'agent-only', 'gap', 'closed', 'infrastructure']);

for (const [id, cap] of Object.entries(manifest.capabilities)) {
  const rest = cap.rest ?? [];
  const tls = cap.mcp ?? [];
  if (!KINDS.has(cap.agent)) errors.push(`${id}: agent must be one of ${[...KINDS].join(', ')}, not "${cap.agent}"`);
  if (!cap.summary) errors.push(`${id}: no summary`);

  for (const r of rest) {
    if (!routes.has(r)) errors.push(`${id}: names the route "${r}", which server.go does not register`);
    else if (routeOwner.has(r)) errors.push(`"${r}" belongs to both ${routeOwner.get(r)} and ${id}`);
    else routeOwner.set(r, id);
  }
  for (const t of tls) {
    if (!tools.has(t)) errors.push(`${id}: names the tool \`${t}\`, which mcp.go does not offer`);
    toolOwners.set(t, [...(toolOwners.get(t) ?? []), id]);
  }

  // ---- 3: what each kind promises ----
  switch (cap.agent) {
    case 'allowed':
      if (!rest.length) errors.push(`${id}: allowed but names no route — is it agent-only?`);
      if (!tls.length) errors.push(`${id}: allowed but names no tool — is it a gap?`);
      break;
    case 'agent-only':
      if (!tls.length) errors.push(`${id}: agent-only but names no tool`);
      break;
    case 'gap':
      if (tls.length) errors.push(`${id}: marked gap but names tools — if the gap is closed, mark it allowed and lower gapBudget`);
      if (!rest.length) errors.push(`${id}: a gap names the routes a person uses`);
      if (!cap.note) errors.push(`${id}: a gap needs a note saying what is missing`);
      break;
    case 'closed':
      if (tls.length) errors.push(`${id}: closed to agents but names tools`);
      if (!cap.reason) errors.push(`${id}: closed needs a reason`);
      {
        // A known contradiction is listed, with a note, so it stays visible
        // in every run instead of being forgotten; anything unlisted fails.
        const listed = new Set(cap.tokenReachable?.routes ?? []);
        if (listed.size && !cap.tokenReachable.note) errors.push(`${id}: tokenReachable needs a note saying what is undecided`);
        for (const r of rest) {
          const route = routes.get(r);
          const open = route && !r.startsWith('GET ') && !route.sessionOnly;
          if (open && !listed.has(r)) {
            errors.push(`${id}: "${r}" changes something agents are promised they cannot change, but a token can reach it — wrap it in sessionOnly`);
          }
          if (!open && listed.has(r)) {
            errors.push(`${id}: "${r}" is listed as tokenReachable but no token reaches it any more — remove it from the list`);
          }
        }
        for (const r of listed) {
          if (!rest.includes(r)) errors.push(`${id}: tokenReachable names "${r}", which is not one of its routes`);
        }
        if (listed.size) {
          const state = cap.tokenReachable.accepted ? 'accepted' : 'open';
          notes.push(`${state} ${id}: ${listed.size} route(s) a token reaches — ${cap.tokenReachable.note}`);
        }
      }
      break;
    case 'infrastructure':
      if (tls.length) errors.push(`${id}: infrastructure names tools`);
      break;
  }

  // ---- 4: the wiki page ----
  if (!cap.wiki) errors.push(`${id}: names no wiki page`);
  else if (!existsSync(join(repo, cap.wiki))) errors.push(`${id}: wiki page ${cap.wiki} does not exist`);
}

for (const r of routes.keys()) {
  if (!routeOwner.has(r)) errors.push(`the route "${r}" belongs to no capability — add it to capabilities.json`);
}
for (const t of tools) {
  if (!toolOwners.has(t)) errors.push(`the tool \`${t}\` belongs to no capability — add it to capabilities.json`);
}

// ---- 5: gaps only go down -----------------------------------------------------

const gaps = Object.entries(manifest.capabilities).filter(([, c]) => c.agent === 'gap');
if (gaps.length > manifest.gapBudget) {
  errors.push(`${gaps.length} parity gaps, gapBudget is ${manifest.gapBudget} — a new capability reached the interface without reaching agents`);
} else if (gaps.length < manifest.gapBudget) {
  errors.push(`${gaps.length} parity gaps, gapBudget is still ${manifest.gapBudget} — lower it to ${gaps.length} so the gap cannot reopen unnoticed`);
}
for (const [id, c] of gaps) notes.push(`gap  ${id}: ${c.note}`);

// ---- report ----------------------------------------------------------------

const counts = {};
for (const c of Object.values(manifest.capabilities)) counts[c.agent] = (counts[c.agent] ?? 0) + 1;
console.log(`\n  parity: ${Object.keys(manifest.capabilities).length} capabilities, ${routes.size} routes, ${tools.size} tools`);
console.log(`          ${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ')}`);
for (const n of notes) console.log(`  note  ${n}`);
for (const e of errors) console.log(`  FAIL  ${e}`);
if (errors.length) {
  console.log(`\n  FAILED — capabilities.json and the code disagree in ${errors.length} place(s).\n`);
  process.exit(1);
}
console.log('  ok — every route and tool has a capability, and every capability keeps its promise\n');
