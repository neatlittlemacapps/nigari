---
paths:
  - "web/src/**/*.{ts,tsx,css}"
---

# Frontend

- **Strings.** Every user-facing string is `t('English sentence')` from
  `i18n.ts`, counts through `plural()`. The English is the key. A string that
  must stay raw carries `// i18n-ok: <reason>` on its line.
- **Dates, numbers, sorting** go through `format.ts`: no `toLocale*`, no
  `Intl.*`, no `localeCompare`, no hardcoded locale tags elsewhere.
  `check-i18n.mjs` fails the build on each.
- **Look.** Colours, surfaces, hairlines, radii and layers come from the
  design tokens: `web/tokens/*.tokens.json`, built into `web/src/tokens.css`
  by `node scripts/build-tokens.mjs` (never edit the generated file). New code
  reads the token names (`--color-surface-default`, `--radius-scale-md`, …);
  the old names (`--bg`, `--fg`, `--muted`, …) still work. No literal values:
  `check-tokens.mjs` counts them against budgets in `web/tokens/budgets.json`
  that only go down, and a value that must stay literal carries
  `/* token-ok: <reason> */`. Every change is checked in light and dark.
  `theme.css` re-states the look; it adds no features.
- **Components.** Build from `web/src/ui/` first (Button, IconButton, Dialog,
  AlertDialog, Field/Input, Checkbox, Select, Switch; `web/src/ui/README.md`
  says which for what). See them all in the catalogue: `npx vite --config
  vite.catalog.config.ts`, then `/catalog.html`. A new component gets a README
  entry and a catalogue section (`web/tests/catalog.mjs` checks it).
  `check-tokens.mjs` counts raw `<button>`s and hand-built `role="dialog"`s
  outside `web/src/ui/`, and those counts only go down. Not in the layer yet:
  menus and toasts; reuse `dialog.tsx` (confirm/prompt), `modal.ts`,
  `toast.ts` and `keys.ts` for those. BlockNote for the editor, Yjs for live
  documents.
- **Keyboard.** Shortcuts register in `keys.ts`; focus movement goes through
  `nav.ts`. Both have checks (`check-keys.mjs`, `check-nav.mjs`) — extend them
  when you change the rules.
- **Pure logic** that decides something (layout zones, tree modes, dropped
  files) lives in its own module with a `web/scripts/check-*.mjs` next to it.
  Follow that shape for new decision logic rather than burying it in a
  component.
- **Large files.** `CollectionView.tsx`, `Editor.tsx`, `Sidebar.tsx` and
  `App.tsx` are each over 1,400 lines. Add new behaviour in a new module the
  big file imports, not inline.
- **After a visible change**, run the affected Playwright spec in `web/tests/`
  and note which wiki screenshots are now stale (`check-wiki.mjs` lists them).
