# Quickstart: try it

1. Open a database with a few rows. In the view's **⋯** menu choose **Open pages in →
   Side peek**.
2. Click a row: it opens beside the view. Click another row: the panel switches.
3. Press Escape: the panel closes and the view is where you left it.
4. Open a row again and copy the address; open it in a new tab: the same row is
   peeked. Press Back: the peek closes.
5. ⌘/Ctrl-click a row: it opens in a new tab.
6. Another view of the same database, left on **Full page**, still navigates.
7. Over MCP: `set_view {page_id: <db>, view_id: <view>, open_in: "side_peek"}`, then
   `get_collection {page_id: <db>}` shows `"openIn": "side_peek"` on that view.
8. `set_view` with `open_in: "sideways"` is refused and changes nothing.
