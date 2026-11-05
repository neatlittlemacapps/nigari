# nigari on Umbrel: the community app store

These files are an [Umbrel](https://umbrel.com) community app store with one app,
nigari. Umbrel adds a store by the address of a Git repository and reads
`umbrel-app-store.yml` at that repository's root, so **this folder is copied to
the root of the store's own repository**, `neatlittlemacapps/yokogaki-umbrel`,
whose address is what you add on the Umbrel. It is drafted here, beside the
code, so a change to nigari and the store that runs it can be reviewed together.

```
umbrel-app-store.yml                     the store: id and name
yokogaki-nigari/
  umbrel-app.yml                         the app as the store lists it
  docker-compose.yml                     what Umbrel runs
  icon.svg                               the app's icon in Umbrel
  data/.gitkeep                          see "The data folder" below
```

How to install it, and why it is set up the way it is, is in the wiki:
[Self-hosting, Run on Umbrel](../wiki/self-hosting.md#run-on-umbrel).

## Releases and what is still missing

- **Updating to a new release.** Put the version in `umbrel-app.yml` (`version`
  and the release-notes link) and the pinned image in `docker-compose.yml`, in
  nigari's `umbrel/` and in the store repository alike. To find the digest:

  ```sh
  docker buildx imagetools inspect ghcr.io/neatlittlemacapps/nigari:<version>
  ```

  The `Digest:` line at the top (the index, covering amd64 and arm64) is the one
  to pin, as `ghcr.io/neatlittlemacapps/nigari:<version>@sha256:<digest>`.
- **Screenshots are missing**, marked `TODO` in `umbrel-app.yml`; none were made up.
  The icon (`yokogaki-nigari/icon.svg`, the owner's artwork, 2026-11-05) is served
  from the store repository; nigari's own logo in the app is #322.
- **The store id** is `yokogaki` (the owner's choice, 2026-11-05). It names the
  app folder, the app id (`yokogaki-nigari`) and the container `APP_HOST`
  points at, together. Changing it means changing all three together.

## The data folder

nigari runs as uid 1000, the user Umbrel gives each app's data. Umbrel creates
`${APP_DATA_DIR}` from the app's folder in the store, so `data/` exists, owned
by that user, before the container starts. Without `data/.gitkeep`, Docker
would create the folder itself, owned by root, and nigari stops at startup with
`mkdir /data/files: permission denied` (tried: it then restarts in a loop).

## How it was tested

Not on an Umbrel device. On a Linux machine with Docker (2026-11-05), the way
umbrelOS runs an app:

- Umbrel's own proxy image, `getumbrel/app-proxy:1.7.0`, in front, with this
  `docker-compose.yml` and the settings umbrelOS adds (`UMBREL_AUTH_SECRET`,
  `MANAGER_IP`, the manifest mounted at `/extra/umbrel-app.yml`), published on
  port 18420 over plain HTTP.
- The app folder copied to a data directory owned by uid 1000, as Umbrel does.
- Chromium (Playwright) at two addresses, `http://172.17.0.1:18420` and
  `http://127.0.0.1:18420`, and an MCP client with an API token.

Results for 2.1.14, the release before the fixes, and for 2.1.15 as the store pins it (the 2.1.15 column was first measured on a build of the branch and then again on the released image).

| Check | 2.1.14 | 2.1.15 |
| --- | --- | --- |
| First-run screen, first account created | pass | pass |
| A page edited; the edit appears live in a second tab (WebSocket through the proxy) | pass | pass |
| The edit is still there after a reload | pass | pass |
| Upload, then the file served back | pass | pass |
| `/mcp` with a token: initialize, tools/list (34 tools) | pass | pass |
| `/mcp/{token}`: `get_page` reads the edit | pass | pass |
| `/mcp` without a token: 401, and the OAuth metadata names the address used | pass | pass |
| Data kept across a container restart | not run | pass (branch build) |
| Visitor's address as nigari sees it | the proxy's | the visitor's |
| A page on another port of the same host creates a page with the sign-in | **went through** | refused |
| The same page opens the live-editing socket and reads the document | **read 32 messages** | refused |

Not tested: a real Umbrel device (its install flow, the App Store screens,
Umbrel's backups), the arm64 image (the digest lists it; only amd64 ran here),
the MCP OAuth sign-in in a browser (only its metadata), the desktop app, and
access over Tailscale.
