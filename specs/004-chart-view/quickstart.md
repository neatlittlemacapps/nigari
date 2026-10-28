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
