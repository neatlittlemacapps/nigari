# Data model: A new row takes the values its view's filters pin down

No stored data changes.

- **View** (`collections.views`, JSON, existing): `id`, `type`, `filters[]`. Read only.
- **Filter** (existing, `filterJSON` → `rowFilter`): `property`, `op`, `value`,
  `values[]`, `value2`.
- **Pins** (computed, not stored): `map[propertyID]value` in the property's stored form
  (research R1). Recomputed on every create.
- **Create answer** (REST JSON / MCP text, new field): `matchesView: bool`. Present only
  when a view was named.

State: none. A view edited between two creates simply gives different pins.
