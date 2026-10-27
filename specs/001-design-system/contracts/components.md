# Contract: `web/src/ui/` components (batch 1)

Batch 1 builds the components User Story 1 needs; later batches follow FR-016's order.

| Component | Base UI part | Props (beyond the primitive's) | Required behaviour |
|---|---|---|---|
| `Button` | `@base-ui/react/button` | `variant: "primary" \| "secondary" \| "ghost" \| "danger"`, `size: "sm" \| "md"`, `shortcut?: KeyName` (rendered from `keys.ts`) | focus ring from `color.focus`; `disabled` via `data-disabled` |
| `IconButton` | button | `label: string` (required, already through `t()`), `icon` | accessible name = `label`; tooltip on hover/focus |
| `Dialog` | `@base-ui/react/dialog` | `title`, `description?`, `onClose`, `footer?: ReactNode`, `size: "sm" \| "md" \| "lg"`, `returnFocus?: RefObject` (mounted means open, as every dialog is used today) | focus trap, Escape and outside click close, focus returns to the trigger (or `returnFocus`), `aria-labelledby` the title; no X of its own: the footer's dismiss action is `<DialogClose>` |
| `AlertDialog` | `@base-ui/react/alert-dialog` | `title`, `description`, `confirmLabel`, `cancelLabel`, `danger?: boolean`, `onConfirm` | initial focus on cancel when `danger`; no close on outside click |
| `Field` + `Input` | `@base-ui/react/field`, `input` | `label`, `hint?`, `error?` | label linked; error announced (`aria-describedby`) |
| `Checkbox` | `@base-ui/react/checkbox` | `label`, `checked`, `onCheckedChange`, `description?: ReactNode` | Space toggles; `data-checked` |
| `Select` | `@base-ui/react/select` | `label`, `options: {value, label}[]`, `value`, `onValueChange` | typeahead; arrow keys |
| `Switch` | `@base-ui/react/switch` | `label`, `checked`, `onCheckedChange` | Space toggles |

Rules for every component:
- No English text inside; every string arrives through props, already `t()`-translated (FR-008).
- Styles read only custom properties from `tokens.css`; `check-tokens.mjs` enforces it.
- Each has a catalogue section listing every state in light and dark, and a README entry.
