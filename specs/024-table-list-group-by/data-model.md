# Data model: grouping a table or list

No table or column changes. New keys inside existing JSON (R1, R6).

## A view's grouping (in `collections.views`, and in an embed's own views)

| Key | Type | Used by | Meaning on a table or list |
|-----|------|---------|----------------------------|
| `grouped` | bool, new | table, list | Draw `groupBy` as groups. Absent or false: flat, whatever `groupBy` holds. Set by the Group menu, `set_view group_by`, and a layout change from a board. |
| `groupBy` | property id | board, chart, now table/list | The grouping property; shared across layouts. |
| `groupPeriod` | day, week, month, year | chart, now table/list | For a date: the period. Absent: month. |
| `groupReverse` | bool, new | table, list | Groups in reverse order; No value stays last. |
| `showEmptyGroups` | bool, new | table, list | Draw groups with no rows (Q1). Not the chart's `showEmpty`, which means the No value group only. |
| `hiddenGroups` | string[] (group keys) | chart, now table/list | Groups not drawn (Q1); shared. |
| `statusGroups` | bool | chart, now table/list | A status grouped by its groups (To do, In progress, Complete) instead of its options. |

Clearing a grouping removes `grouped`, `groupBy`, `groupPeriod`,
`groupReverse`, `showEmptyGroups`, `hiddenGroups` and `statusGroups` from a table or list (a board's
or chart's own keys are not touched on those layouts).

## Personal view state (per person, per view scope)

| Key | Type | Meaning |
|-----|------|---------|
| `foldedGroups` | string[], new | Group keys this person folded in this view (Q4). |

Group key: option, page or person id; `true`/`false` (checkbox); the period's
key as a chart writes it (`2026-03-14`, `2026-W11` ISO week, `2026-03`, `2026`); a status group id with `statusGroups`; `""` (No value), as a chart's `hiddenGroups` already spells it, so a group hidden on a chart is hidden on the table made from it.
