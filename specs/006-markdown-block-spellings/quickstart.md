# Quickstart: try it

1. Over MCP, `create_page` with markdown:

   ```
   > [!WARNING]
   > Mind the gap

   ---

   <details><summary>Raw notes</summary>

   - one
   - two

   </details>

   [[toc]]

   :::: columns
   ::: column
   Left
   :::
   ::: column
   Right
   :::
   ::::
   ```

2. Open the page: a warning callout, a divider, a collapsed toggle, a table of
   contents and two columns.
3. `get_page` returns the same Markdown. Export to `.md`, import the file: the
   same page again.
