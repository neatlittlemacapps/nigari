---

description: "Tasks for the design system, batch 1: tokens, checks, catalogue, first components, the webhook screen"
---

# Tasks: Build the interface from a design system (batch 1)

**Input**: `specs/001-design-system/`: plan.md, spec.md, research.md (P1–P9), data-model.md, contracts/components.md, quickstart.md

**Tests**: required (salt.md). Every check script gets a failing case, every component a catalogue section under axe, the migrated screen a keyboard test.

**Issues**: parent #87; T001–T039 are #88–#126, in order.

**Scope**: batch 1 only (plan, Summary). Menus, popovers, toasts, tabs, the remaining 23 dialogs and the button migration follow as later batches (FR-016), each with its own tasks.

**Pull requests**: three. (1) Tokens, build, checks and budgets: Phases 1–2. (2) Components, catalogue and the webhook screen: Phases 3–4. (3) Editor mapping and token-file validation: Phases 5–7.

**Amendment found while writing the tasks**: the "webhook dialog" (US1) is the **Webhooks tab of the instance settings dialog** (`AdminSettings.tsx`, the `role="dialog"` at line 316). Its events are three checkboxes, not a select or a switch. So batch 1 adds `Checkbox` (already in FR-006's first set); its row is in `contracts/components.md` and the plan's batch 1 names it. Migrating the screen means: the settings dialog's shell becomes `Dialog`, and the Webhooks tab is built from `Field`/`Input`, `Checkbox` and `Button`. `Select` and `Switch` are still built, and they are proven in the catalogue. Removing a webhook stays a one-click action: putting an `AlertDialog` in front of it would change behaviour, and this feature does not redesign.

## Format: `[ID] [P?] [Story] [surface] Description`

---

## Phase 1: Setup

- [x] T001 [ui] Add `@base-ui/react` at exactly `1.9.0` (no caret, research P1) to `web/package.json` through `npm install --save-exact @base-ui/react@1.9.0` in `web/`. `web/package-lock.json` changes through npm only; it is protected from hand edits
- [x] T002 [P] [test] Add `@axe-core/playwright` at exactly `4.14.0` as a dev dependency of `web/tests/package.json` through `npm install --save-dev --save-exact` in `web/tests/` (research P7). The app's own `web/package.json` must not gain it

---

## Phase 2: Foundational (blocks every story)

The tokens, their build and the ratchet come first. Every component reads the generated custom properties, and every later change is measured against the budgets.

- [x] T003 [P] [ui] Primitive tokens in new `web/tokens/primitives.tokens.json` (DTCG 2025.10: `$value`, `$type`, `$description`). Include colour primitives taken from today's values in `web/src/theme.css` (light `:root` and the dark block). The type scale is "`font.size.2xs` 11px, `xs` 12px, `sm` 13px, `md` 14px, `lg` 16px, `xl` 20px, `display` `clamp(28px, 4vw, 40px)`" (research P3). The radius scale (as `radius.scale.*`) is "`radius.xs 2px`, `sm 4px`, `md 6px`, `lg 8px`, `xl 12px`, `full 999px`", and the layer scale is "`layer.raised 10`, `sticky 50`, `dropdown 200`, `overlay 300`, `modal 400`, `toast 900`, `tooltip 1000`, `top 1200`" (research P4). Add `space.*`, `shadow.*` and `motion.*` from today's `--shadow` and `--ease-out`
- [x] T004 [P] [ui] Semantic tokens in new `web/tokens/semantic.tokens.json`. Each role has its light value as `$value` and its dark value in `$extensions["md.salt.dark"]`: one token, two values (FR-002, data-model.md). The roles are `color.surface`, `color.surface.sidebar`, `color.text`, `color.text.muted`, `color.accent`, `color.border`, `color.border.strong`, `color.hover`, `color.active`, `color.danger`, `color.focus`, and the rest of today's custom properties. Each one carries `$extensions["md.salt.css"]` with today's name (`--bg`, `--fg`, `--muted`, `--accent` …), so `styles.css` keeps working unchanged. Every text-on-surface pair declares `$extensions["md.salt.contrast"]: { "on": "<token>", "min": 4.5 | 3 }`
- [x] T005 [P] [ui] Component tokens in new `web/tokens/component.tokens.json`, only where a batch-1 component needs its own value: `dialog.width.sm|md|lg`, `button.height.sm|md`, `control.height` (data-model.md)
- [x] T006 [ui] Token build in new `web/scripts/build-tokens.mjs`, with no dependency. It reads the three files and resolves aliases, and fails naming the token on a missing alias or a cycle. It writes `web/src/tokens.css`, with a "generated, do not edit" header, using exactly today's selectors: `:root` for light, `[data-theme="dark"]` and `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` for dark. Each token is emitted under its `--token-name` and its `md.salt.css` legacy name. `--check` mode compares the output with the committed file and fails when it differs (depends on T003–T005)
- [x] T007 [ui] WCAG contrast check in `web/scripts/build-tokens.mjs` (research P5). It computes WCAG 2.x relative luminance for sRGB hex, `rgb()`/`rgba()` composited over the declared surface, and OKLCH converted first. Every `md.salt.contrast` pair is checked in both themes, and the build fails below its `min`, naming the pair, theme and ratio (FR-004)
- [x] T008 [P] [test] Failing cases for the token build in new `web/scripts/check-build-tokens.mjs`, run from `npm run check`. Each case runs the build on a temporary copy of the token files and expects it to fail with the named message: a broken alias; an alias cycle; `color.text.muted` dark set to `#555` (quickstart step 1); and a hand edit to `web/src/tokens.css`. A last case expects the unmodified files to build byte-identically (depends on T006, T007)
- [x] T009 [ui] Generate and commit `web/src/tokens.css`. In `web/src/main.tsx`, import it before `styles.css`. In `web/src/theme.css`, replace the light and dark custom-property blocks with nothing: the generated file now defines the same names. Everything else in `theme.css` stays. Check light and dark by eye with `npx vite` against `main` (depends on T006)
- [x] T010 [test] Literal and component ratchet in new `web/scripts/check-tokens.mjs`, added to `npm run check` in `web/package.json` (FR-005, FR-017). It counts colour (hex, `rgb()`/`rgba()`, `hsl()`, `oklch()`), font-size, border-radius, box-shadow and `z-index` literals in `web/src/**/*.{css,tsx,ts}`. It skips `web/src/tokens.css` and lines carrying `/* token-ok: <reason> */`. It also counts `<button` in `web/src/**/*.tsx` outside `web/src/ui/` (`rawButtons`) and `role="dialog"` outside `web/src/ui/` (`handDialogs`). Above a budget it fails, naming each new file:line. Below a budget it says to lower the number. `--measure` prints today's counts
- [x] T011 [test] Budgets in new `web/tokens/budgets.json`: `literals.color`, `literals.fontSize`, `literals.radius`, `literals.shadow`, `literals.zIndex`, `rawButtons` and `handDialogs`, each from `check-tokens.mjs --measure` on this branch, plus `bundleGzip` = 528,706 + 61,440 = 590,146 B (research P8 as corrected: the main chunk measured on `main` at `2a28bc4`, "+60 KB gzip"). The literal and component budgets "may only go down"; the main chunk must "stay under" `bundleGzip` (data-model.md) (depends on T010)
- [x] T012 [P] [perf] Bundle check in new `web/scripts/check-bundle.mjs`. It gzips the largest `web/dist/assets/index-*.js` and fails above `bundleGzip`. Run it in `.github/workflows/ci.yml` after `make frontend` and in `scripts/agent-gate.sh` when `web/dist` exists, not in `npm run check`, which does not build (research P8)

**Checkpoint**: `node web/scripts/build-tokens.mjs --check` is green. `npm run check` is green and fails on `color: #ff0000` in any `.tsx` (quickstart step 2). The app looks the same as `main` in light and dark.

---

## Phase 3: User Story 1 — a contributor builds a screen from components, not CSS (P1) 🎯 MVP

**Goal**: `web/src/ui/` holds the batch-1 components. The settings dialog and its Webhooks tab are built from them and add no line to `styles.css`.

**Independent Test**: quickstart step 5. Open Settings → Webhooks: the shell is `Dialog`, the tab uses `Field`/`Input`, `Checkbox` and `Button`, and `git diff main -- web/src/styles.css` shows no added lines.

Each component is `web/src/ui/<Name>.tsx` plus `web/src/ui/<Name>.css`. It reads only `var(--…)` from `tokens.css`, holds no English text of its own (FR-008), and exposes Base UI's `data-*` state (FR-009). Props follow `contracts/components.md`.

- [ ] T013 [P] [US1] [ui] `Button` in `web/src/ui/Button.tsx` on `@base-ui/react/button`. Props: `variant: "primary" | "secondary" | "ghost" | "danger"`, `size: "sm" | "md"`, and `shortcut?: KeyName`, whose label comes from `keys.ts` (FR-010). Focus ring from `color.focus`; disabled styled through `data-disabled`
- [ ] T014 [P] [US1] [ui] `IconButton` in `web/src/ui/IconButton.tsx`, with "`label: string` (required, already through `t()`)". The accessible name is `label`, shown as a tooltip on hover and focus
- [ ] T015 [P] [US1] [ui] `Dialog` in `web/src/ui/Dialog.tsx` on `@base-ui/react/dialog`, with `title`, `description?`, `open`, `onOpenChange`, `footer?` and `size: "sm" | "md" | "lg"`. It traps focus, closes on Escape, returns focus to the trigger, and is `aria-labelledby` its title. It calls `useExclusiveModal` from `web/src/modal.ts` while open, so opening it closes any other app modal as today. The close button's accessible name is `t('Close')`
- [ ] T016 [P] [US1] [ui] `AlertDialog` in `web/src/ui/AlertDialog.tsx` on `@base-ui/react/alert-dialog`, with `title`, `description`, `confirmLabel`, `cancelLabel`, `danger?` and `onConfirm`. Initial focus goes to cancel when `danger`; it does not close on an outside click. Like `DialogHost` in `web/src/dialog.tsx`, it does not call `useExclusiveModal`, so it can layer over an open modal
- [ ] T017 [P] [US1] [ui] `Field` and `Input` in `web/src/ui/Field.tsx` on `@base-ui/react/field` and `input`, with `label`, `hint?` and `error?`. The label is linked, and the hint and error are announced through `aria-describedby`
- [ ] T018 [P] [US1] [ui] `Checkbox` in `web/src/ui/Checkbox.tsx` on `@base-ui/react/checkbox`, with `label`, `checked`, `onCheckedChange` and `description?` (a trailing node, such as the event's `<code>`). Space toggles; checked state through `data-checked`.
- [ ] T019 [P] [US1] [ui] `Select` in `web/src/ui/Select.tsx` on `@base-ui/react/select`, with `label`, `options: {value, label}[]`, `value` and `onValueChange`. Typeahead and arrow keys from the primitive; the popup at `layer.dropdown`
- [ ] T020 [P] [US1] [ui] `Switch` in `web/src/ui/Switch.tsx` on `@base-ui/react/switch`, with `label`, `checked` and `onCheckedChange`. Space toggles
- [ ] T021 [P] [US1] [i18n] Any accessible name the components add (`Close` at least) goes through `t()` with German in `web/src/locales/de.json`. `check-i18n.mjs` stays green
- [ ] T022 [US1] [ui] Catalogue: new `web/catalog.html`, `web/src/catalog/main.tsx` with a section per component, and `web/vite.catalog.config.ts` (research P6). Each section shows every state in the contract (default, hover via a `data-` forced state, focus, disabled, error, open, checked) in light and dark, with a theme toggle. `npm run build` must not emit the catalogue into `web/dist`: check that `ls web/dist` holds no `catalog*` after a build (FR-012) (depends on T013–T020)
- [ ] T023 [US1] [ui] Migrate the instance settings dialog in `web/src/components/AdminSettings.tsx` (line 316, `aria-label={t('Instance settings')}`): its shell becomes `Dialog` with `size="lg"` and `title={t('Instance settings')}`, its hand-built `modal-overlay` goes, and its tabs stay as they are (Tabs is a later batch). In the Webhooks tab, the address becomes `Field` + `Input`, the three events become `Checkbox` with the event name as `description`, and Add, I have it and Remove become `Button`. Remove's behaviour is unchanged. No new rule in `styles.css`; rules that only served the replaced markup are removed (depends on T015, T017, T018, T013)
- [ ] T024 [US1] [test] Lower `handDialogs` and `rawButtons` in `web/tokens/budgets.json` to the counts after T023. Lower any `literals.*` the removed rules took with them (depends on T023)
- [ ] T025 [P] [US1] [ui] `web/src/ui/README.md`: per component, its props, its states (`data-*`), when to use it and when not, and the catalogue section that shows it (FR-014)
- [ ] T026 [P] [US1] [ui] `.claude/rules/frontend.md`: under **Look**, tokens come from `web/tokens/` and `tokens.css` is generated. Under **Components**, use `web/src/ui/` first, with its README and catalogue (`npx vite --config vite.catalog.config.ts`). `check-tokens.mjs` budgets only go down, and a deliberate literal carries `/* token-ok: <reason> */` (spec US1 scenario 3)
- [ ] T027 [US1] [test] Keyboard regression in new `web/tests/design-system-dialog.mjs`, registered in `web/tests/package.json`'s `test` script. On a throwaway instance, open Settings from the keyboard and check that focus is inside the dialog. Tab cycles within it; Escape closes it and returns focus to the trigger. The dialog's accessible name is "Instance settings". On the Webhooks tab, Space toggles an event checkbox, and adding a webhook still shows its secret once (depends on T023)

**Checkpoint**: US1 works on its own; quickstart steps 2, 3 and 5 pass.

---

## Phase 4: User Story 2 — the same keyboard and screen-reader behaviour everywhere (P1)

**Goal**: every batch-1 component is checked by axe and by screenshot, in both themes, in CI.

**Independent Test**: `npm test --prefix web/tests -- catalog` passes, and axe reports 0 serious or critical violations in light and dark (quickstart step 4, SC-003).

- [ ] T028 [US2] [test] New `web/tests/catalog.mjs`. It serves the catalogue with `vite.catalog.config.ts`, then screenshots each section in light and dark and compares the shots against `web/tests/catalog-baselines/`. With `UPDATE_BASELINES=1` it writes the baselines instead. It also runs `@axe-core/playwright` per theme and fails on serious or critical violations. Register it in `web/tests/package.json` (FR-013)
- [ ] T029 [US2] [test] Commit the first baselines in `web/tests/catalog-baselines/`, taken in the same Chromium that CI uses (depends on T028)
- [ ] T030 [US2] [test] New `catalog` job in `.github/workflows/ci.yml`. It runs `npm ci` in `web` and `web/tests`, installs Chromium, and runs `node web/tests/catalog.mjs`. Not a required check until it has been green on three pull requests; say so in the job's comment. On failure, upload the diff images as an artifact (FR-013: "both run in CI") (depends on T028)
- [ ] T031 [US2] [test] Keyboard cases in `web/tests/catalog.mjs`. Select: arrow keys move, typing a letter jumps, Escape returns focus to the trigger. Dialog and AlertDialog: focus trap, and Escape except where the contract forbids it. Switch and Checkbox: Space. Button: `data-disabled` and no click. `check-keys.mjs` and `check-nav.mjs` stay green (spec US2 scenario 2, for the batch-1 components; Menu follows in batch 2)

**Checkpoint**: US1 and US2 pass on their own; the catalogue job is green in CI.

---

## Phase 5: User Story 3 — the look changes by changing tokens (P2)

**Goal**: the editor's Mantine menus take their colours, radii and fonts from the semantic tokens, so one accent change reaches the app and the editor.

**Independent Test**: on a scratch branch, change `color.accent` in `web/tokens/semantic.tokens.json` and rebuild. Buttons, focus rings, selected states and the editor's slash menu all show the new colour in both themes (SC-005).

- [ ] T032 [US3] [ui] Map BlockNote's Mantine theme from the tokens (FR-011). Move the `--bn-colors-*` and `--bn-border-radius` assignments of `web/src/theme.css` (lines 562–578) into component tokens in `web/tokens/component.tokens.json` (`editor.menu.background` and the like), emitted by `build-tokens.mjs` under the `--bn-*` names on `.bn-container, .bn-root`. Then remove them from `theme.css`, keeping the rules that are not custom properties
- [ ] T033 [US3] [test] New `web/tests/editor-tokens.mjs`, registered in `web/tests/package.json`. On a throwaway instance, open the slash menu in light and in dark, and check that the menu's background and its selected item read the computed `--color-…` token values, not Mantine's defaults. Then set `--accent` on `:root` at runtime and check that the selected item follows (depends on T032)

**Checkpoint**: one token file drives the app and the editor.

---

## Phase 6: User Story 4 — designers and code share one source (P3)

**Goal**: the token files are valid DTCG 2025.10, so a design tool loads them without conversion.

**Independent Test**: the format check passes on the committed files and fails on a token without a `$type`.

- [x] T034 [US4] [test] Format check in `web/scripts/build-tokens.mjs`. Every token has a `$value` and a `$type`, its own or inherited from a group, from the 2025.10 type list. Aliases use the `{group.token}` syntax. Only `$extensions` keys under `md.salt.*` are ours. Add a failing case for a missing `$type` to `web/scripts/check-build-tokens.mjs`
- [ ] T035 [P] [US4] [wiki] Add a "Design tokens" section to `CONTRIBUTING.md`: where the files live, the three tiers, how to build, how to change a colour (one token, both themes), and the contrast rule. Link to the DTCG 2025.10 format

---

## Phase 7: Polish & cross-cutting

- [ ] T036 [wiki] Retake every wiki screenshot of the instance settings dialog, since its shell changed (`admin-*` in `web/scripts/shoot-wiki.mjs`, light and dark), through `node web/scripts/shoot-wiki.mjs admin-` on a seeded instance. `check-wiki.mjs` lists none as stale (FR-015) (depends on T023)
- [ ] T037 [perf] Run quickstart step 6 (`npx vite build && node scripts/check-bundle.mjs`) and record the main chunk's gzip size against the 528,706 B baseline in the body of PR 2 and PR 3 (FR-019)
- [ ] T038 [test] Run quickstart steps 1–7 end to end, `scripts/agent-gate.sh --all`, and `npm test --prefix web/tests`. Every existing browser regression stays green (spec US2 scenario 3)
- [ ] T039 [wiki] Add today's batch-1 decisions to `docs/decisions.md` (newest first): `Checkbox` joins batch 1, and Remove stays one click

---

## Dependencies & execution order

- **Phase 1 → Phase 2 → stories.** The components need Base UI (T001) and the generated tokens (T009). The budgets (T011) must exist before any migration lowers them.
- **US1 (Phase 3)** is the MVP and blocks US2's catalogue tests (T028 needs T022).
- **US3 (Phase 5)** needs only Phase 2; it can run beside US1.
- **US4 (Phase 6)** needs only T006.
- **Polish** after the stories it names.

## Parallel opportunities

- T001 ∥ T002; T003 ∥ T004 ∥ T005; T012 alongside T010–T011.
- In US1, T013–T020 are separate files and run in parallel; so are T021, T025 and T026.
- US3 and US4 can run beside US1 once Phase 2 is done.

```text
# US1 components, together:
T013 Button · T014 IconButton · T015 Dialog · T016 AlertDialog
T017 Field/Input · T018 Checkbox · T019 Select · T020 Switch
```

## Implementation strategy

1. **PR 1, foundation:** Phases 1–2. Nothing visible changes. Tokens, build, contrast, ratchet and bundle cap are live.
2. **PR 2, MVP:** Phases 3–4. Components, catalogue under axe and screenshots, settings dialog migrated, budgets lowered.
3. **PR 3:** Phases 5–7. The editor follows the tokens, the token files are validated, screenshots are retaken.
4. **Next batches** (new tasks, same spec): menus and popovers, then the remaining 23 dialogs, then buttons, form fields and toasts (FR-016).
