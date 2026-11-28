import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { eventually, withFixture } from './fixture.mjs';

// A client that asks for no scope in particular, as Claude Code's
// `claude mcp add --transport http` does, got read access with no way to say
// more on the consent screen (#83). The screen offers both now, starts on what
// was asked for, and the token answer names what was granted.
await withFixture(async ({ page, context, base }) => {
  page.setDefaultTimeout(15000);
  const redirect = `${base}/oauth-test-callback`;
  const client = await (
    await context.request.post(`${base}/oauth/register`, {
      data: { client_name: 'Consent test', redirect_uris: [redirect] },
    })
  ).json();
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const authorize =
    `${base}/oauth/authorize?` +
    new URLSearchParams({
      response_type: 'code',
      client_id: client.client_id,
      redirect_uri: redirect,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'xyz',
    });
  // The callback is the client's address, not a page of ours: keep the code
  // from the address as the browser arrives there. (Routing the request does
  // not work: the app's service worker answers it first.)
  let code = '';
  let iss = '';
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && frame.url().startsWith(redirect)) {
      code = new URL(frame.url()).searchParams.get('code') ?? '';
      iss = new URL(frame.url()).searchParams.get('iss') ?? '';
    }
  });
  await page.goto(authorize);
  const read = page.getByRole('radio', { name: 'read pages', exact: true });
  const write = page.getByRole('radio', { name: 'read and change pages', exact: true });
  await read.waitFor();
  assert.equal(await read.isChecked(), true, 'a request without a scope starts on read');
  await write.check();
  await page.getByRole('radio', { name: /Every workspace/ }).check();
  await page.getByRole('button', { name: 'Allow', exact: true }).click();
  await eventually(async () => code !== '');
  // RFC 9207 (spec 027): the answer names the server it came from, the same
  // issuer the metadata names, so a client talking to two servers cannot be
  // handed one's code as the other's.
  const meta = await (await context.request.get(`${base}/.well-known/oauth-authorization-server`)).json();
  assert.equal(iss, meta.issuer, 'the code comes back with iss, the metadata issuer');

  const token = await (
    await context.request.post(`${base}/oauth/token`, {
      form: {
        grant_type: 'authorization_code',
        code,
        client_id: client.client_id,
        redirect_uri: redirect,
        code_verifier: verifier,
      },
    })
  ).json();
  assert.equal(token.scope, 'write', 'the token answer names what was granted');

  // And the agent can write with it.
  const answer = await (
    await context.request.post(`${base}/mcp`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      data: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'create_page', arguments: { title: 'Written by the agent' } },
      },
    })
  ).json();
  assert(!answer.error && !answer.result?.isError, JSON.stringify(answer).slice(0, 300));

  // #1130: Deny sent the browser to whatever redirect_uri the link named, and
  // a javascript: address ran as script on this page, signed in. A link
  // naming one now shows an error and offers nothing to click, and nothing
  // runs.
  const evil = `${base}/oauth/consent?` + new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: 'javascript:window.__ran=1//',
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  await page.goto(evil);
  await page.locator('.dialog-error').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Deny', exact: true }).count(), 0, 'Deny is offered for a script address');
  assert.equal(await page.evaluate(() => window.__ran), undefined, 'the script address ran');

  // Deny with the client's own address answers it, with iss.
  let denied = '';
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && frame.url().startsWith(redirect)) denied = frame.url();
  });
  await page.goto(authorize);
  await page.getByRole('button', { name: 'Deny', exact: true }).click();
  await eventually(async () => denied !== '');
  const answer2 = new URL(denied).searchParams;
  assert.equal(answer2.get('error'), 'access_denied');
  assert.equal(answer2.get('iss'), meta.issuer, 'Deny answers with iss');

  console.log('OAuth consent: read and write offered, iss on both answers, a script address refused.');
});
