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
- **Components.** Build from `web/src/ui/` first (Button, Dialog,
  AlertDialog, Field/Input, Checkbox, Select, Switch; `web/src/ui/README.md`
  says which for what). See them all in the catalogue: `npx vite --config
  vite.catalog.config.ts`, then `/catalog.html`. A new component gets a README
  entry and a catalogue section (`web/tests/catalog.mjs` checks it).
  `check-tokens.mjs` counts raw `<button>`s and hand-built `role="dialog"`s
  outside `web/src/ui/`, and those counts only go down. A button is
  `ui/Button`, a tab row `ui/Tabs`, a row of choices `ui/ToggleGroup`
  (spec 020). The only raw buttons allowed are BlockNote's own controls,
  each carrying `button-ok: <reason>` in a comment on its line or the line
  above (counted apart as
  `markedButtons`); a marker without a reason fails. **Menus** are
  `ui/Menu` (spec 010): an item names its function (`fn="…"`) and takes its
  icon from `web/src/menuIcons.ts`; `check-menu-icons.mjs` refuses a
  hand-built menu or two functions on one icon. **What a menu offers** comes from its
  content's action list in `web/src/actions/` (spec 015: one list per kind of
  content, every menu of that content built from it, a left-out action
  carries its reason). Group actions by what they relate to: a group of
  more than 3 related actions gets its own submenu, a smaller group stays
  on the first level behind a separator, and a choice among values is a
  submenu. Add a new action to the list, not to one menu. Not in the layer yet: toasts;
  reuse `dialog.tsx` (confirm/prompt), `modal.ts`, `toast.ts` (`toast()` for a notice, `toastError()` for something that did not happen, #924) and `keys.ts`. BlockNote for the editor, Yjs for live
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
- **How it looks is checked, not only measured** (owner, 2026-11-25,
  `docs/decisions.md`). The ux-ui-audit measures contrast and tap sizes; it
  never says a screen looks wrong. So:
  - **Mockups only where getting it wrong is a real risk** (owner,
    2026-11-26: building designs beforehand is token intensive). A
    structural change (a new view, a new panel, a phone form of something,
    a layout that moves things around) or a new design-system component
    starts with mockups the owner approves, before it is built. A change
    inside an existing layout with existing components does not: it is
    shown on the pull request's screenshots instead.
  - **Every visible change** is looked at on screenshots, light and dark, at
    1280 and 390 px wide, against the checklist below, and the screenshots go
    into the pull request. Measure what can be measured (left edges in the
    browser), do not eyeball it.
  - **The look checklist:**
    1. *One left edge.* Things that belong together start on the same line:
       a header's text where its rows' content starts, controls in the same
       slot as the controls below them. Measure it.
    2. *No indent ladders.* Hierarchy comes from weight, size, colour, a
       line or a label, not from pushing content right; on a phone never.
       Lines (borders) start and end where the content does, not over empty
       gutters.
    3. *Spacing rhythm.* Gaps from the tokens; the same relation gets the same
       gap; groups are further apart than the items in them.
    4. *Quiet secondary things.* One thing leads. Totals, counts and meta are
       muted and light; no grey band or bold where nothing needs it. Nothing
       says what something next to it already says.
    5. *A phone gets the main thing first.* No slivers, no one-word-per-line,
       no empty columns eating the width.
    6. *The same thing looks the same* across table, list, board and
       document.
    7. *Empty and edge states look meant*: no rows, one row, a long title, a
       hidden or folded group, dark mode.
