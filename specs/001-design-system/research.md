# Research: design system for salt.md

Read 25 Oct 2026, against commit `04a9506` (branch `parity-manifest`).

## What the code does today

- **No component library of its own.** `@mantine/core` is never imported in `web/src`; it is in
  the bundle only because `@blocknote/mantine` renders the editor's menus. `theme.css` overrides
  `.mantine-Menu-dropdown`, `.mantine-Popover-dropdown` and `.bn-tooltip` by hand to make them
  match.
- **Primitives written by hand:** `dialog.tsx` (115 lines), `modal.ts` (76), `toast.ts`,
  `AnchoredMenu.tsx` (57), `Overlays.tsx` (73), `Portal.tsx`. Each screen still builds its own
  dialog markup: 24 elements carry `role="dialog"`, 26 `aria-modal`.
- **Styling:** one global stylesheet, `styles.css`, 10,545 lines, organised by class prefix
  (`.bn` 87 rules, `.ws` 60, `.prop` 48, `.page` 45, `.agent` 39 …). `theme.css` (1,037 lines)
  re-states the look on top, with 45 custom properties. Literal values remain throughout:
  133 hex colours, 148 `rgb()`/`rgba()`, 34 distinct font sizes, 13 radii, 24 `z-index` values.
- **Buttons:** 356 `<button>` elements, styled by `btn`, `btn-sm`, `primary`, `danger` class
  combinations.
- **Bundle:** the main chunk is 1.8 MB on disk in `dist/assets` (minified, before compression);
  Mermaid and the icon sets are split into chunks of their own already.
- **Checks that already exist and must keep passing:** `check-i18n` (strings, formatting),
  `check-keys`, `check-nav`, `check-wiki` (screenshots record the files they show).

## Options for behaviour (focus, keyboard, ARIA)

| Option | For | Against |
| --- | --- | --- |
| **Keep hand-rolling** | No dependency | The current state: 24 dialogs, 2 menu roles. Every screen re-decides focus and keyboard |
| **Mantine (`@mantine/core`)** | Already in the bundle via BlockNote; mature | A *styled* library with its own look and theme object; salt.md would fight its defaults the way `theme.css` already does for the editor |
| **Base UI (`@base-ui/react`)** — chosen | Headless and unstyled, so salt.md's own look stays in charge; v1 stable since early 2026 (now 1.6), from the Radix, Floating UI and Material UI authors, backed by MUI; 37 components including Dialog, Alert Dialog, Menu, Context Menu, Popover, Tooltip, Select, Combobox, Field, Switch, Tabs, Toast, Toolbar; state exposed for styling | One new dependency; React version support to confirm |
| **Radix Primitives** | Similar API, widely used | Base UI is its continuation by several of the same people, with active backing |
| **shadcn/ui** | Popular, copy-in components | Built on Tailwind; salt.md has no Tailwind and does not want a CSS framework |

**Decision:** Base UI for the app's components. It matches salt.md's rule against adopting a
look it then has to override, and it covers exactly the families that are hand-rolled today.

## The editor

BlockNote ships its editor UI for three libraries:

- `@blocknote/mantine` — today's choice.
- `@blocknote/ariakit` — Ariakit components, fully stylable with your own CSS.
- `@blocknote/shadcn` — takes your own shadcn components (Badge, Button, Card, DropdownMenu,
  Form, Input, Label, Popover, Select, Tabs, Toggle, Tooltip) through a `shadCNComponents` prop,
  but **requires Tailwind**, and the components may not use portals.

There is no Base UI variant. So: keep `@blocknote/mantine` in this feature and drive its look
from the tokens. Moving the editor to `@blocknote/ariakit` (no Mantine in the bundle at all) is
worth a measured follow-up once the app no longer depends on Mantine anywhere else.

## Tokens

- The **Design Tokens Format Module 2025.10** is the first stable version of the W3C community
  group's format (28 Oct 2025): aliases and component references, CSS Color 4 colour spaces
  (OKLCH, Display P3), and light/dark and brand theming without duplicated files. Style
  Dictionary, Tokens Studio and Terrazzo are reference implementations; Figma, Penpot and others
  support or are implementing it.
- **Build:** an in-repo script, `web/scripts/build-tokens.mjs`, reading DTCG JSON and writing CSS
  custom properties and a Go file for `public.go`. This follows the repo's habit (every check is
  a small script, no framework) and its rule against dependencies without a reason. Style
  Dictionary or Terrazzo remain an option if the build grows (multiple brands, platforms).
- **Contrast** is checked in the same script, so a token change that breaks AA fails the build.

## How it fits the agent setup

- `.claude/rules/frontend.md` already says to use tokens and reuse `dialog.tsx` / `modal.ts`; it
  changes to point at `web/src/ui/` and the catalogue.
- `check-tokens.mjs` uses the same ratchet as `check-parity.mjs`: budgets in a committed file
  that may only go down, so migration progress is visible and cannot reverse.
- The catalogue screenshots reuse the Playwright set-up of `web/tests/` and `shoot-wiki.mjs`.

## Sources

- [Base UI documentation index (v1.6)](https://app.unpkg.com/@base-ui/react@1.6.0/files/docs/index.md)
- [InfoQ: Base UI v1](https://infoq.com/news/2026/02/baseui-v1-accessible/)
- [BlockNote with Ariakit](https://blocknotejs.org/docs/advanced/ariakit)
- [BlockNote with shadcn](https://blocknotejs.org/docs/advanced/shadcn)
- [Design Tokens specification reaches first stable version](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/)
- [Design Tokens Format Module 2025.10](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/)

## Plan-time decisions (2026-10-26)

Each: decision, why, rejected.

### P1. Base UI 1.9.0, pinned

- **Decision**: `@base-ui/react` `1.9.0` (released 2026-10-09), exact version in `web/package.json`.
- **Why**: peer range `react ^17 || ^18 || ^19`, so React 18.3 needs no upgrade (the spec's open assumption). `date-fns` peers are optional and only for its date components, which this feature does not use. Components are imported per subpath (`@base-ui/react/dialog`), so unused ones are not bundled.
- **Rejected**: a caret range (a headless library's behaviour is the contract we test against; upgrades are deliberate PRs).

### P2. No Go token file: public pages already load the app stylesheet

- **Decision**: the token build writes `web/src/tokens.css` only. FR-003's Go output is dropped (spec amended).
- **Why**: `server/public.go` links the built app CSS (`publicCSSHref(index)` in `server/public_assets.go`) and its inline style already reads `var(--bg)`, `var(--accent)` and the rest. Generated Go constants would be a second copy of values the page already receives.
- **Rejected**: generating Go anyway "for later" (a file with no reader rots).

### P3. Type scale: 7 steps

Measured: 34 literal sizes; 75% of uses are 11–14 px in half-pixel steps.

| Token | Value | Absorbs today |
|---|---|---|
| `font.size.2xs` | 11px | 7–11.5 |
| `font.size.xs` | 12px | 12, 12.5 |
| `font.size.sm` | 13px | 13, 13.5 |
| `font.size.md` | 14px | 14, 14.5, 15 |
| `font.size.lg` | 16px | 16, 17, 18 |
| `font.size.xl` | 20px | 19–24 |
| `font.size.display` | `clamp(28px, 4vw, 40px)` | 25–60 (page titles, empty states) |

- **Why**: seven steps cover every use within ±1px except display sizes, which become one fluid token. Collapsing half pixels is the only visible change this feature allows itself (spec: "encodes, does not redesign"); it happens per migration batch, with screenshots retaken.
- **Rejected**: keeping half-pixel steps (14 steps is no scale); a modular ratio scale (would move every size).

### P4. Radius and layer scales

- Radius: `radius.xs 2px`, `sm 4px`, `md 6px`, `lg 8px`, `xl 12px`, `full 999px` (5, 7, 9, 10 round to the nearest). Built as `radius.scale.*` (`--radius-scale-sm`): `--radius-sm` and `--radius-lg` already name today's 7px and 14px, which `theme.css` and the public pages read.
- Layers (`z-index`), named instead of 24 numbers: `layer.raised 10`, `sticky 50`, `dropdown 200`, `overlay 300`, `modal 400`, `toast 900`, `tooltip 1000`, `top 1200`. Base UI portals render menus and dialogs at body level, which removes most stacking fights the high numbers were patching.

### P5. Contrast check without a dependency

- **Decision**: `build-tokens.mjs` computes WCAG 2.x relative luminance itself (sRGB and alpha-over-surface; OKLCH converted first). Pairs to check are declared in the semantic tier (`$extensions["md.salt.contrast"]: { on: "color.surface", min: 4.5 }`).
- **Rejected**: `culori`/`colorjs.io` as dependencies (40 lines of math vs. a package; rule against dependencies without a reason).

### P6. Catalogue as a dev-only Vite entry

- **Decision**: `web/catalog.html` + `web/catalog/` (amended at task time: outside `src/`, see tasks.md), served by `npx vite` in development and by a second config `web/vite.catalog.config.ts` for tests. `npm run build` uses the existing config, so the catalogue never reaches `web/dist` or the binary (FR-012).
- **Rejected**: Storybook (a framework and hundreds of packages for one page).

### P7. Visual and accessibility tests

- **Decision**: `web/tests/catalog.mjs` screenshots each catalogue section in light and dark against baselines in `web/tests/catalog-baselines/`, and runs `@axe-core/playwright` 4.14.0 (dev dependency of `web/tests` only) failing on serious/critical.
- **Amended 2026-10-27 (PR 2):** the baselines are not committed. CI's runner draws text differently from any other machine: committed shots differed on every section by about a thousand pixels, with nothing changed. The reference is drawn on the same machine just before the comparison: in CI from the base branch, as the storage benchmarks do; locally with `UPDATE_BASELINES=1`. A difference is a warning in the job summary, not a failure, since it may be the point of the pull request; axe and the keyboard checks still fail.
- **Why**: reuses the existing Playwright set-up; nothing is added to the shipped app.

### P8. Bundle budget

- Baseline at `c4de997`: main chunk 1,802,733 B raw, 790,888 B gzip.
- **Corrected 2026-10-27, when `check-bundle.mjs` first ran:** the gzip figure above was never reproduced. On `main` at `2a28bc4` the main chunk is 1,803,270 B raw and **528,706 B** gzip (level 9; Vite reports 530.18 kB at its own level). The raw size matches, so the 790,888 B was a measuring mistake, not growth. The cap is that baseline + 60 KB: **590,146 B**.
- **Budget**: +60 KB gzip for the whole feature, checked by `check-bundle.mjs` against `web/tokens/budgets.json` after `vite build` (CI), not in `npm run check` (which does not build).

### P9. Ratchets live in one file

`web/tokens/budgets.json` holds `literals` (per kind: colour, font-size, radius, shadow, z-index), `rawButtons`, `handDialogs` and `bundleGzip`. Starting values are measured by the first run of `check-tokens.mjs --measure` and committed in the same PR, then may only go down (`bundleGzip` may only stay under its cap).
