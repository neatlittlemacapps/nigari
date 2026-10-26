# Feature Specification: Build the interface from a design system

**Feature Branch**: `001-design-system`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "Research and write out a spec for building the UI via a design system with components."

Evidence and sources: [research.md](research.md).

## Why now

The interface is built by hand, one screen at a time, and the numbers show what that costs:

| Today (commit `04a9506`) | Count |
| --- | --- |
| Lines in `web/src/styles.css` | 10,545 (plus 1,037 in `theme.css`) |
| Hard-coded colour literals in `styles.css` (hex) | 133 |
| `rgb()`/`rgba()` literals in `styles.css` | 148 |
| Distinct literal font sizes | 34 |
| Distinct literal border radii | 13 |
| Distinct `z-index` values | 24 |
| Raw `<button>` elements in components | 356 |
| Separately built dialogs (`role="dialog"`) | 24 |
| Elements exposing a menu role | 2 |
| Design tokens defined (`theme.css`) | 45 |

`@mantine/core` is not imported anywhere in salt.md's own code. It arrives only through
BlockNote's editor (`@blocknote/mantine`). Everything else — buttons, dialogs, menus,
popovers, toasts — is hand-rolled, and five of six open pull requests touched
`styles.css` at once (the reason `theme.css` exists, per its header).

Every new feature on the board (#13–#25) adds screens. Without a component layer each one
adds its own dialog, its own menu and its own colours, and the agent that builds it has
nothing to reuse but copy-paste.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A contributor builds a screen from components, not CSS (Priority: P1)

A contributor (person or agent) adding the settings screen for webhooks (#15) composes it
from `Dialog`, `Field`, `Select`, `Switch` and `Button`, and writes no new colour, size or
spacing value.

**Why this priority**: it is the point of the whole feature. Every later story depends on
the components existing, and every issue on the board benefits immediately.

**Independent Test**: build one real screen (the webhook dialog in `AdminSettings.tsx`)
from the components only; `check-tokens.mjs` reports no new literal values.

**Acceptance Scenarios**:

1. **Given** the component layer exists, **When** a contributor builds a dialog, **Then** they import `Dialog` from `web/src/ui/` and the dialog traps focus, closes on Escape, restores focus and is announced to screen readers without extra code.
2. **Given** a change adds a hex colour or a px font size outside the token files, **When** the gate runs, **Then** `check-tokens.mjs` fails and names the file and line.
3. **Given** an agent opens `web/src/components/`, **When** the path-scoped rule `.claude/rules/frontend.md` loads, **Then** it tells the agent to use `web/src/ui/` and where the catalogue is.

---

### User Story 2 - Keyboard and screen-reader users get the same behaviour everywhere (Priority: P1)

Someone navigating by keyboard opens any menu, picks an item with the arrow keys and
Enter, and every dialog behaves the same way: same focus order, same Escape, same
announcement.

**Why this priority**: today 24 dialogs and the menus each re-decide this, and only two
expose a menu role. Accessibility cannot be fixed one screen at a time.

**Independent Test**: run the component catalogue through automated accessibility checks
in light and dark, plus the existing keyboard checks (`check-keys.mjs`, `check-nav.mjs`).

**Acceptance Scenarios**:

1. **Given** the catalogue page, **When** the accessibility check runs on every component in light and dark, **Then** it reports no serious or critical violations.
2. **Given** any `Menu`, **When** it opens from the keyboard, **Then** focus moves into it, arrow keys move between items, typing a letter jumps to a matching item, and Escape returns focus to the trigger.
3. **Given** a migrated screen, **When** its existing Playwright regression in `web/tests/` runs, **Then** it still passes.

---

### User Story 3 - The look changes by changing tokens (Priority: P2)

An administrator or a fork changes the accent colour, the corner radius or the density,
and the whole interface — app and editor — follows, in light and dark, without touching
component code.

**Why this priority**: salt.md already has a light and dark theme kept apart by hand, and
forks (this one included) will want their own look. White-labelling becomes a token file.

**Independent Test**: change the accent token and the radius scale; take the wiki
screenshots; every screen changes and nothing else does.

**Acceptance Scenarios**:

1. **Given** the token source files, **When** the accent is changed, **Then** buttons, links, focus rings, selected states and the editor's menus all show the new colour in both themes.
2. **Given** a colour pair used for text on a surface, **When** the token build runs, **Then** it fails if the pair falls below WCAG AA contrast (4.5:1 for body text, 3:1 for large text and UI components).

---

### User Story 4 - Designers and code share one source (Priority: P3)

A designer works in Figma with the same tokens and component names the code uses, and a
change to a token can be exported from Figma and checked into the repository.

**Why this priority**: valuable, but only after the tokens and components exist.

**Independent Test**: export the token files in the DTCG format from a design tool and
build them without edits.

**Acceptance Scenarios**:

1. **Given** the token files follow the Design Tokens Format Module 2025.10, **When** they are opened in a tool that supports it, **Then** they load without conversion.

### Edge Cases

- **BlockNote's own menus** (slash menu, formatting toolbar, suggestion menus) are rendered by `@blocknote/mantine`. They must take their colours, radii and fonts from the same tokens even if their components are not ours.
- **Public pages and print** (`server/public.go`) are rendered server-side; they link the app stylesheet and read its custom properties, so they follow the tokens without a copy (research P2).
- **Desktop app** (`desktop/`) shows the same frontend and needs nothing of its own.
- **Right-to-left text and long German labels** must not break buttons or menus (German is a required catalogue).
- **Reduced motion** is respected by every animated component.
- **Partial migration** is the normal state for months: old and new components side by side must look the same.

## Requirements *(mandatory)*

### Functional Requirements

**Tokens**

- **FR-001**: Design tokens MUST live in `web/tokens/` as JSON in the Design Tokens Format Module 2025.10 (`$value`, `$type`, aliases), in three tiers: primitives (raw scales), semantic (roles such as `color.surface`, `color.text.muted`, `color.accent`), and component tokens only where a component needs its own value.
- **FR-002**: Light and dark MUST be two values of the same semantic tokens, not two token sets. The existing `[data-theme]` and `prefers-color-scheme` behaviour MUST be kept.
- **FR-003**: A build step MUST generate `web/src/tokens.css` (CSS custom properties) from the JSON. The generated file is committed and marked as generated. (Amended at plan time: no Go output — public pages already load the app stylesheet, research P2.)
- **FR-004**: The token build MUST check contrast for every declared text/surface pair in both themes and fail below WCAG AA.
- **FR-005**: `check-tokens.mjs`, added to `npm run check`, MUST fail on colour, font-size, radius, shadow and `z-index` literals in `web/src/**/*.{css,tsx,ts}` outside the generated token file, except lines marked `/* token-ok: <reason> */`. Existing literals are allowed under a budget that may only go down (`literalBudget`), the same ratchet as `gapBudget` in `capabilities.json`.

**Components**

- **FR-006**: A component layer MUST live in `web/src/ui/`, one module per component, each styled only through tokens. The first set: `Button`, `IconButton`, `Dialog`, `AlertDialog`, `Menu`, `ContextMenu`, `Popover`, `Tooltip`, `Select`, `Combobox`, `Field` + `Input`, `Checkbox`, `Switch`, `Tabs`, `Toast`, `Toolbar`.
- **FR-007**: Behaviour (focus management, keyboard interaction, ARIA roles, dismissal, positioning) MUST come from a headless primitive library rather than be re-implemented per component. See research.md for the choice: **Base UI** (`@base-ui/react`).
- **FR-008**: Components MUST take user-facing text only as props or children translated by the caller through `t()`; a component MUST NOT hold English text of its own except accessible names passed through `t()`.
- **FR-009**: Components MUST expose state through `data-*` attributes (open, disabled, highlighted, checked) for styling, not through class names computed in JavaScript.
- **FR-010**: Keyboard shortcuts shown in components MUST come from `keys.ts`; focus movement between rows and blocks MUST stay in `nav.ts`.

**Editor**

- **FR-011**: The BlockNote editor MUST keep `@blocknote/mantine` in this feature, with its colours, radii and fonts mapped from the semantic tokens (replacing the hand overrides in `theme.css`). Switching the editor to `@blocknote/ariakit` is a separate, later decision (research.md).

**Catalogue, tests, documentation**

- **FR-012**: A component catalogue page MUST render every component in every state, in light and dark. It is a separate Vite entry used in development and tests, and MUST NOT be served by the production binary.
- **FR-013**: Playwright MUST screenshot the catalogue in both themes, compare against committed baselines, and run automated accessibility checks on it; both run in CI.
- **FR-014**: `web/src/ui/README.md` MUST document each component's props, states and when to use it; `.claude/rules/frontend.md` MUST point to it.
- **FR-015**: Each migrated screen MUST keep its wiki screenshots current (`shoot-wiki.mjs`); migration batches retake them together.

**Migration**

- **FR-016**: Migration MUST be incremental, by component family, in this order: dialogs (24), menus and popovers, buttons, form fields, toasts. Each batch is one pull request that leaves the app working.
- **FR-017**: A second budget in `check-tokens.mjs` MUST count raw `<button>` and hand-built `role="dialog"` elements outside `web/src/ui/` and may only go down.

**Constraints**

- **FR-018**: No new runtime service and no CSS framework requirement (no Tailwind). New dependencies are limited to the headless library; the token build is an in-repo script, like the other `check-*.mjs`.
- **FR-019**: The main bundle MUST NOT grow by more than a budget set in the plan from the measured baseline; components are imported per module so unused ones are not shipped.

### Key Entities

- **Token**: a named design decision (`$value`, `$type`, description), in a tier, possibly an alias of another token.
- **Component**: a module in `web/src/ui/` that renders one headless primitive with token-based styles and documented states.
- **Budget**: a number in a committed file that a check compares against and that may only go down.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Hard-coded colour literals outside the token files drop from 133 hex + 148 `rgb(a)` to 0, enforced by the ratchet.
- **SC-002**: Hand-built dialogs drop from 24 to 0; every dialog is the `Dialog` or `AlertDialog` component.
- **SC-003**: The catalogue has no serious or critical automated accessibility violations in either theme.
- **SC-004**: A new screen built after migration adds no lines to `styles.css`.
- **SC-005**: Changing the accent token changes every accent-coloured element, including the editor's menus, verified by retaking the wiki screenshots.
- **SC-006**: Distinct font sizes drop from 34 to the type scale's steps (decided in the plan, typically 6–8).

## Assumptions

- React 18 stays; Base UI supports it (to verify in the plan).
- The visual language stays the one in `theme.css` (paper and ink, one accent). This feature encodes it; it does not redesign it.
- Upstream (`saltmd/salt.md`) is not asked to take this as one change. If it is offered upstream, it goes as an issue first, then in batches (`CONTRIBUTING.md`).
- The Figma side (User Story 4) needs the token files only; Code Connect mappings are out of scope here.

## Out of Scope

- A visual redesign.
- Replacing BlockNote, or switching its UI package (separate decision).
- A public component package for other projects.
