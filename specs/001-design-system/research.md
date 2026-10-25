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
