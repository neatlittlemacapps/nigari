# Quickstart: try it

1. Open a Tasks database with a Status select and a number Estimate. **+** → **Chart**.
2. Group by Status: one bar per status, in the option order, with the counts a filter on
   each status would give. Rows without a status are in **No value**.
3. Click the **Doing** bar: the rows with status Doing are listed under the chart.
4. Switch the aggregate to **Sum of Estimate**: the bars show totals; the chart says how
   many rows had no estimate.
5. Switch to **Donut**, then **Line**: the same numbers, redrawn; reload, the choice stays.
6. Group by a date property, by **Month**: months in order, empty months at zero.
7. Press Tab into the chart, move with the arrow keys, press Enter on a bar; turn on
   **Show as table**.
8. Over MCP: `query_rows {page_id, group_by: "status"}` and
   `query_rows {page_id, group_by: "category", aggregate: "sum", aggregate_property: "amount"}`
   give the same numbers. `set_view {page_id, type: "chart", group_by: "status"}` adds the view.

## The chart builder (US5)

9. In a document, type `/donut` → **Donut chart**, pick the database: a donut of rows per its
   first select appears, with the settings open.
10. Switch the kind to **Horizontal bar**, sort **Value high → low**, hide **No value**,
    palette **Blue**, height **Large**, caption "Per type". Reload: all of it stays.
11. Hover a bar: its label, its value and "Click to view data". Click: its rows.
12. **Save chart as** → background → **Download PNG**: the file has the chart and caption.
13. Switch to **Number**: one number with the title "Count all"; rename it.
14. Over MCP: `set_view {page_id, type: "chart", chart_kind: "donut", group_by: "type"}`,
    then `embed_database {page_id: <doc>, database_id, view_id}`: the same chart in the
    document.
