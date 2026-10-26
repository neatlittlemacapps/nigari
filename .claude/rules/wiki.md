---
paths:
  - "wiki/**"
  - "docs/**"
---

# Wiki and docs

- The wiki is checked against the code by `web/scripts/check-wiki.mjs`: every
  MCP tool documented, every named tool real, every `/api/` path a real route,
  every property and view type covered, every relative link resolving.
- Screenshots are listed in `wiki/screenshots.json` with the source files they
  show. When one of those files changes, the shot is stale and the check fails.
  Retake it with `node web/scripts/shoot-wiki.mjs <id>` (see that file's header
  for the one-time setup). Never edit `wiki/img/` by hand.
- Write plainly, for someone who has never heard of a CRDT. Say what is not
  built yet; a page that only lists strengths is not trusted.
- `docs/what-it-does.md` is source material for the website and `llms.txt`:
  keep it true when a capability changes.
