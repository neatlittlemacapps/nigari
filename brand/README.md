# nigari's brand artwork

The owner's artwork (#322, 2026-11-06). Every logo and icon the product ships
is drawn from these files; none of them is served as-is.

| File | What it is | Where it ends up |
| --- | --- | --- |
| `mark.svg` | The mark on its own, transparent | `web/src/Logo.tsx`, `web/public/logo.svg`, `favicon.svg`, `favicon.ico`, the shared-page header in `server/public.go` |
| `icon-light.svg` | The mark on its lilac tile, a plain square | Home-screen icons (`apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`); the desktop app icon |
| `icon-dark.svg` | The same on the dark tile | The desktop app's dock icon in dark mode |
| `mark-animation.svg` | The mark assembling itself, 3 s | Not used yet: kept for the empty screen, once the owner's set of situational icons arrives |

The tiles are plain squares on purpose: iOS, Android and macOS put their own
mask on an icon, and a pre-rounded tile is rounded twice and shows a pale halo.
The desktop icon is the exception, because macOS does not round an app icon:
`web/scripts/build-app-icons.mjs` puts the square on Apple's 824 px tile with
its corners rounded.

**Flattened.** The artwork as drawn coloured the overlap with `mix-blend-mode`
(multiply, color-burn, darken). A blend mixes with whatever lies behind the
SVG, so on a dark page the front shape turned black. These files draw three
plain shapes instead, in the colours the blend gave on white: `#A98AFB` (back),
`#6542E8` (front) and `#391FA2` (the overlap). `mark-animation.svg` keeps the
blend because it isolates its own group (`isolation: isolate`), which is what
keeps it correct on dark.

After changing a file here, run `node web/scripts/build-app-icons.mjs` and
copy the mark into `Logo.tsx`, `logo.svg`, `favicon.svg` and `server/public.go`
(`web/scripts/check-brand.mjs` fails until they match).
