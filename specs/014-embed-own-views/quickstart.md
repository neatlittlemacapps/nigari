# Quickstart: checking spec 014 by hand

A throwaway instance with the seeded Tasks database (views: a table, a
board, a chart), and two documents, A and B. Account 1 edits everything;
account 2 is a viewer in the workspace.

1. **Own views** (US1): in A, embed Tasks. One table view shows, no other
   tabs. Filter it to "Status is To do", add a board, rename the table "Open
   work". Open Tasks' own page: its views are as before. Embed Tasks in B:
   one table, no filter.
2. **Twice in one document** (US1-3): embed Tasks again in A; change the
   second embed's view; the first is unchanged.
3. **Copy** (US2): in A's embed, ＋ › Views on Tasks › the chart. The same
   chart draws. Change its grouping; Tasks' chart is unchanged.
4. **New row** (FR-005): in "Open work", add a row: it has Status To do.
5. **Settings** (US3): Settings › View settings: rename, hide a property,
   Open pages in › Side peek, move, remove. Only the embed changes. Remove is
   not offered on the last view.
6. **Properties** (US4): Settings › Edit properties, rename a property, Save:
   the confirmation names Tasks; Cancel keeps the dialog; Save again and
   confirm: Tasks' page shows the new name. Click ✕ on a property: the
   delete confirmation names it and Tasks (also on Tasks' own page, #524).
7. **Reader** (US1-5, US3-3): account 2 opens A: can switch views and filter
   for themselves; no Settings changes, no ＋.
8. **Old embed** (US5): open a document written by the previous release
   (`server/testdata/embedviews/` has the shapes; the fixture in
   `web/tests/embed-views.mjs` writes one): same view, rows, filter and tabs.
   Change its filter: Tasks' view is unchanged; the block now holds `"v":2`.
9. **Agent** (US6): `get_page` on A lists the embed with its views;
   `set_view` with `embed_id` and `copy_of` adds a filtered board; a person
   sees it in A; Tasks' views are unchanged. With a read-scoped token:
   refused, nothing changes.
10. **History** (edge case): restore an older revision of A: its embed shows
    the views it had then.
