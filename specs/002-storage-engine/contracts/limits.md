# Contract: bounded reads

This applies to `GET /api/collections/{id}/rows`, MCP `query_rows`, rollup computation, and chart aggregation when #20 lands.

- A read stops after **5 s** and returns nothing partial.
- REST: `503` with `{"error": "<sentence>", "code": "query_timeout"}`. The browser translates the code (`web/src/serverErrors.ts`).
- MCP: a tool error with the same sentence.
- Writes are not bounded by this limit. `busy_timeout(5000)` already covers them.
