# Quickstart: try it

1. Make a database with a Status select (To do, Doing, Done) and a number Estimate.
2. Add a view "To do" with the filter *Status is To do*. Press **New**: the row stays and
   its Status is *To do*.
3. Add the filter *Estimate > 3*. Press **New**: a notice says the row doesn't match;
   **Open** opens it.
4. Over MCP: `create_page {parent_id: <db>, title: "Agent task", view_id: <view>}`. The
   answer says `matches_view` and the row has Status *To do*.
5. `create_page` with `view_id` of another database is refused and creates nothing.
