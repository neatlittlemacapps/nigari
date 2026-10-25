import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// A find-and-replace edit lands while a person is typing in the same page
// (#13, spec 003 FR-008). The editor is moved onto the new text, as with every
// write from outside it; what must never happen is that either side's words are
// lost: the agent's edit is in the page, and the person's typing is in the page
// or in its history. Delivering the edit without the reload is #26.
await withFixture(async ({ page, api, base, workspace }) => {
  page.setDefaultTimeout(15000);
  const doc = await api('POST', '/api/pages', { title: 'Shared draft', workspaceId: workspace.id });
  await api('PATCH', `/api/pages/${doc.id}`, {
    content: Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`, type: 'paragraph', props: {},
      content: [{ type: 'text', text: `Paragraph ${i + 1}`, styles: {} }], children: [],
    })),
  });

  await page.goto(`${base}/p/${doc.id}`);
  const first = page.locator('.bn-block-outer[data-id="p0"] .bn-inline-content');
  await first.waitFor();
  await first.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' typed by a person');

  await api('POST', `/api/pages/${doc.id}/edits`, {
    edits: [{ old: 'Paragraph 5', new: 'Paragraph five, fixed by an agent' }],
  });

  // The open editor shows the agent's edit without the person reloading.
  await eventually(async () =>
    (await page.locator('.bn-block-outer[data-id="p4"]').innerText()).includes('fixed by an agent'));

  const body = JSON.stringify((await api('GET', `/api/pages/${doc.id}`)).content);
  assert(body.includes('fixed by an agent'), 'the edit is not in the page');

  // The person's words: in the page, or kept in the history.
  let kept = body.includes('typed by a person');
  if (!kept) {
    for (const rev of await api('GET', `/api/pages/${doc.id}/revisions`)) {
      const full = await api('GET', `/api/pages/${doc.id}/revisions/${rev.id}`);
      if (JSON.stringify(full).includes('typed by a person')) { kept = true; break; }
    }
  }
  assert(kept, "the person's typing was lost: neither in the page nor in its history");

  console.log('Find-and-replace with an open editor: the edit arrived and the typing was kept.');
});
