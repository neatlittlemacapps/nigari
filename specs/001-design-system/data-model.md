# Data model: design system

No database change. The "data" is token files, component contracts and budgets.

## Token files (`web/tokens/`, DTCG 2025.10)

| File | Tier | Holds |
|---|---|---|
| `primitives.tokens.json` | primitive | raw scales: `color.paper.*`, `color.ink.*`, `color.pink.*`, `space.*`, `font.size.*`, `radius.*`, `layer.*`, `shadow.*`, `motion.*` |
| `semantic.tokens.json` | semantic | roles, each with a light and a dark value: `color.surface`, `color.surface.sidebar`, `color.text`, `color.text.muted`, `color.accent`, `color.border`, `color.border.strong`, `color.hover`, `color.active`, `color.danger`, `color.focus` … |
| `component.tokens.json` | component | only where a component needs its own value (`dialog.width`, `menu.item.height`, `button.height.*`) |

Token: `{ "$value": …, "$type": "color" | "dimension" | "number" | "shadow" | "duration" | "fontFamily", "$description": …, "$extensions"?: { "md.salt.contrast"?: { "on": "<token>", "min": 4.5 | 3 }, "md.salt.css"?: "--legacy-name" } }`.

- Light/dark: a semantic colour's `$value` is the light value; `$extensions["md.salt.dark"]` is the dark one (one token, two values — FR-002).
- `md.salt.css` keeps today's custom property names (`--bg`, `--fg`, `--muted`, `--accent` …) as aliases so the 10,545 lines of `styles.css` keep working during migration.

## Generated output

`web/src/tokens.css`: `:root { … }` for light, `[data-theme="dark"]` and `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` for dark, exactly the selectors `theme.css` uses today. Header comment: generated, do not edit.

## Budgets (`web/tokens/budgets.json`)

| Key | Meaning | Direction |
|---|---|---|
| `literals.color` / `fontSize` / `radius` / `shadow` / `zIndex` | literal values outside `tokens.css` and `web/tokens/` | only down |
| `rawButtons` | `<button` in `web/src/**/*.tsx` outside `web/src/ui/` | only down |
| `handDialogs` | `role="dialog"` outside `web/src/ui/` | only down |
| `bundleGzip` | cap for the main chunk, gzip bytes | stay under |

## Component (`web/src/ui/<Name>.tsx`)

Props in `contracts/components.md`; state as `data-*` attributes from Base UI (`data-open`, `data-disabled`, `data-highlighted`, `data-checked`); styles in `web/src/ui/<Name>.css` reading only `var(--…)` from `tokens.css`.
