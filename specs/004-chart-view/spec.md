# Feature Specification: Chart views of a database

**Feature Branch**: `004-chart-view`

**Created**: 2026-10-27

**Status**: Draft

**Input**: Issue #20 (written by Claude from a Notion comparison): "Start with a chart view: bar, line or donut over one grouping and one aggregate, drawn without a new dependency. Dashboards (several views on one page) can build on embedded databases later." The "no new dependency" part was Claude's default; the owner chose Chart.js on 2026-10-28.

**Chart builder** (added 2026-10-28): the owner walked through Notion's chart flow in 20
screenshots (insert from the `/` menu, pick a source, the settings panel per chart type,
style, filter, hover, save as picture) and asked for it to be specced and built. User Story 5
and FR-018 to FR-029 come from that walk-through; what was left out, and why, is under
Scope.

**Issue**: #20

## Background

A database in salt.md has seven ways to show its rows (table, board, list, gallery, calendar,
timeline, form). None of them answers "how many": how many tasks per status, how much budget
per team, how many sign-ups per week. Today a person exports to a spreadsheet for that, or
counts a board's columns by eye. An agent can only fetch every row and count itself, which
past a few thousand rows is slow, and which the 5-second read limit (spec 002) stops.

Notion offers chart views (bar, line, donut) with a grouping and an aggregate, and dashboards
built from them. This feature brings the first half: the chart view. The storage work it needs
is already in place: grouped counts run as one query over the rows a person may see, on the
read-only connections, under the 5-second limit (spec 002, `groupCounts`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A person sees a database as a chart (Priority: P1)

A team lead adds a view to the Tasks database, chooses "Chart", and sees a bar per status with
the number of tasks in each. Clicking a bar shows those tasks.

**Why this priority**: it is the feature. Everything else refines it.

**Independent Test**: on a database with a select property, add a chart view grouped by it; the
bars match the counts a filter on each option would give.

**Acceptance Scenarios**:

1. **Given** a database with a status property (To do, Doing, Done), **When** a person adds a chart view grouped by status, **Then** a bar chart shows one bar per option, in the option order, with the count of rows in each, and rows without a status in a bar of their own labelled "No value".
2. **Given** that chart, **When** the person clicks the "Doing" bar, **Then** they see the rows behind it, the same rows a filter "status is Doing" would show.
3. **Given** the chart view has filters (for example "assignee is me"), **When** the chart is drawn, **Then** it counts only the rows the filters let through, as the table view with the same filters would.
4. **Given** rows the person may not see (private rows of someone else), **When** the chart is drawn, **Then** they are not counted, and no number on the chart reveals that they exist.

---

### User Story 2 - The chart says more than "how many" (Priority: P1)

A finance lead charts the Expenses database as the sum of the Amount property per category,
switches it to a donut, and then charts sign-ups per week as a line.

**Why this priority**: counting is half of what charts are for. Totals and trends over time are
the other half, and they decide which chart kinds are worth having.

**Independent Test**: on a database with a number and a date property, chart the sum and the
average per group, and a count per week; compare with values computed from the rows.

**Acceptance Scenarios**:

1. **Given** a number property, **When** the person picks "Sum of Amount" (or average, minimum, maximum), **Then** each group shows that value, computed only from the rows with a number in Amount; rows without one are left out of the sum and the average, and the chart says how many were left out.
2. **Given** a date property, **When** the person groups by it, **Then** they choose day, week, month or year, the groups run in time order, and empty periods between the first and the last show as zero, so a line does not skip them.
3. **Given** any chart, **When** the person switches between bar, line and donut, **Then** the same numbers are drawn in the new form, and the choice is saved with the view.
4. **Given** a multi-value property (tags, people), **When** the person groups by it, **Then** a row with two tags counts once under each, and the chart says so.

---

### User Story 3 - An agent reads and builds charts like a person does (Priority: P1)

A person asks their agent "how many open tasks per assignee?" The agent answers from one
aggregate request, not by reading every row, and can add the chart view to the database when
asked to.

**Why this priority**: agent parity is a rule of this codebase (constitution II). An agent that
can only count by fetching rows hits the 5-second limit on large databases, exactly where a
chart is most useful.

**Independent Test**: over MCP, ask for the count per status and the sum of a number per
category; compare with the interface's chart. Create a chart view over MCP and open it in the
interface.

**Acceptance Scenarios**:

1. **Given** an agent with read access, **When** it asks for an aggregate (grouping, aggregate, optional filters), **Then** it gets the same groups and values the chart view would show, in one answer.
2. **Given** an agent with write access, **When** it adds or changes a chart view, **Then** the same checks apply as for any other view, and the view appears in the interface.
3. **Given** a read-only token, **When** it tries to create a chart view, **Then** it is refused, and nothing is saved.
4. **Given** a workspace closed to agents, or a database the agent may not read, **When** it asks for an aggregate, **Then** it is refused with the same answer as reading rows would get.

---

### User Story 4 - Everyone can read the chart (Priority: P2)

A screen-reader user opens the chart view and hears what it shows; a keyboard user moves from
bar to bar; someone on a phone sees a chart that fits.

**Why this priority**: a picture of numbers that only some people can read is not a feature
for everyone. Spec 001 made accessibility a check, not a promise.

**Independent Test**: run the accessibility checker and the keyboard on a chart in light and
dark; read the chart's table alternative.

**Acceptance Scenarios**:

1. **Given** any chart, **When** a person asks for it as a table, **Then** they see the groups and values as a table with the same numbers.
2. **Given** a chart, **When** a keyboard user tabs into it, **Then** arrow keys move from group to group, each announced with its label and value, and Enter opens the rows behind it.
3. **Given** light and dark themes, **When** the chart is drawn, **Then** every group's colour stands apart from the background and from its neighbours, and each bar or slice is labelled, so the chart does not depend on colour alone.

---

### User Story 5 - A person builds a chart in a document, step by step (Priority: P1)

A team lead writing a weekly note types `/donut`, picks the Housing database, and a donut of
rows per Type appears at once, with the settings panel open beside it. They switch it to a
horizontal bar, sort it largest first, hide the "No value" group, pick a blue palette, add a
caption, and save the picture for a slide. A colleague reading the note hovers a bar, sees
"Student union: 2", and clicks through to those two rows.

**Why this priority**: a chart that can only be made inside a database's own page is half a
feature. People put numbers where they write about them; the builder is where they decide
what the chart says. Notion's flow (owner's walk-through) is the reference.

**Independent Test**: in a document, insert each of the five chart entries from the `/` menu,
pick a database, change every setting in the panel, reload, and see each setting kept; hover
and click a group; save the picture.

**Acceptance Scenarios**:

1. **Given** a document, **When** a person types `/` and picks "Bar chart", "Horizontal bar chart", "Line chart", "Donut chart" or "Number chart", **Then** they pick a database from the same list the database block offers, a chart view of that kind is added to the database, the document shows it, and its settings open, all without leaving the document.
2. **Given** a new chart, **When** it is first drawn, **Then** it already shows something: grouped by the database's first select or status property (else the first property that groups, else a number chart of the row count), counting rows.
3. **Given** the settings panel, **When** the person changes the kind, the grouping, the value, the sort, a group's visibility, the palette or a style setting, **Then** the chart redraws at once and the setting is saved with the view.
4. **Given** a bar, line or donut chart, **When** the person sorts it, **Then** they choose the property's own order, label A→Z or Z→A, or value low→high or high→low; and each group can be hidden or shown again from a list, with "Hide all" and "Show all".
5. **Given** a number chart, **When** it is drawn, **Then** it shows one big number (the count of rows, or the sum, average, minimum or maximum of a number property) under a title the person can change.
6. **Given** any chart, **When** the person hovers or focuses a group, **Then** a tooltip shows its label and value and says that a click shows the rows; clicking shows them (FR-006).
7. **Given** any chart, **When** the person chooses "Save chart as" and a background, **Then** they can copy the picture as PNG or download it as PNG.
8. **Given** a viewer of the workspace (read only), **When** they open a document with a chart, **Then** they see and use the chart (hover, rows, table, picture) but its settings are not offered. **Given** anyone whose change the server refuses, **When** they save a setting, **Then** they are told, and the chart returns to what is stored, as for every other view setting.

### Edge Cases

- **No rows, or every row filtered out:** the chart says there is nothing to chart, rather than drawing an empty frame.
- **Many groups** (a select with 40 options, or people): the largest groups are drawn, the rest are summed into "Other", and the table alternative lists every group.
- **A grouping property is deleted or changes type:** the chart says which setting no longer works and offers to pick another; it does not break the database.
- **Numbers stored as text,** negative values, very large values: sums and averages handle negatives; a donut cannot show negative parts, so it says so and offers a bar chart.
- **The aggregate takes longer than 5 seconds:** the chart shows the same sentence as any long read (spec 002) and keeps the last drawn chart visible.
- **Rows change while the chart is open:** it updates when the view is reloaded or when rows change in this session, like the other views; it does not poll.
- **Option colours:** a select's own option colours are used for its bars when they set them; otherwise a palette from the design tokens.
- **Language and number format:** labels, dates and numbers follow the reader's language and format settings (`format.ts`), like every number in the app.
- **Every group hidden:** the chart says so and offers "Show all", rather than drawing nothing.
- **A hidden group's option is deleted or renamed:** hiding is by key, so a renamed option stays hidden and a deleted one is simply gone from the list.
- **A database without any property that groups,** picked from the `/` menu: the chart starts as a number chart of the row count.
- **Switching a number chart to a bar, line or donut chart** with no grouping chosen: the default grouping of scenario 5.2 is filled in, so the chart never lands in an unsaveable state.
- **A single-colour palette with more groups than shades:** shades repeat; each group still carries its label (FR-015), so no two groups are told apart by colour alone.
- **Copy as PNG where the browser refuses the clipboard** (no permission, or not offered): the person is told so and offered the download instead.

## Requirements *(mandatory)*

### Functional Requirements

**The chart view**

- **FR-001**: A database MUST offer "Chart" as an eighth view type, added, renamed, filtered, reordered and deleted like the others.
- **FR-002**: A chart view MUST have a kind (bar, horizontal bar, line, donut, number), one grouping property (none for a number chart), and one aggregate: count of rows, or sum, average, minimum or maximum of a number property (including a formula or rollup that yields numbers).
- **FR-003**: Grouping MUST work for select, multi-select, person, checkbox, date and relation properties. Dates group by day, week, month or year. A multi-value property counts a row once under each of its values.
- **FR-004**: A chart view MUST count only the rows its own filters let through and that the reader may see, exactly the rows the same filters would show in a table view.
- **FR-005**: Groups MUST appear in the property's own order for selects and checkboxes, in time order for dates, and largest first otherwise. Rows without a value form a group labelled "No value", unless the person hides it.
- **FR-006**: Selecting a group MUST show the rows behind it.
- **FR-007**: At most a set number of groups (decided in the plan) are drawn; the rest are combined into "Other". The table alternative lists all groups.

**Aggregation**

- **FR-008**: Aggregates MUST be computed by the server over the rows the reader may see, in one read, not by sending rows to the browser. The read runs under the 5-second limit of spec 002 and on the read-only connections.
- **FR-009**: Sums and averages MUST leave out rows without a number and report how many were left out.
- **FR-010**: The same aggregate MUST be available to the interface and to agents, through one function both use (constitution III), with the same permission checks as reading rows.

**Agents**

- **FR-011**: An agent MUST be able to request an aggregate (grouping, aggregate, optional filters) and receive the groups and values in one answer.
- **FR-012**: An agent with write access MUST be able to create and change chart views, with the same validation as the interface. A read-only token MUST be refused.

**Drawing and accessibility**

- **FR-013**: Charts MUST take their colours, type and spacing from the design tokens (spec 001), in light and dark, and follow a theme switch without a reload. They are drawn with Chart.js (owner's choice, 2026-10-28), loaded only when a chart is shown.
- **FR-014**: Every chart MUST offer a table of its groups and values, have an accessible name and summary, and be navigable by keyboard group by group.
- **FR-015**: Group colours MUST reach a 3:1 contrast against the chart background (WCAG 1.4.11, graphical objects), checked by the token build, and every group MUST carry a text label so colour is never the only cue.
- **FR-016**: Numbers, dates and labels MUST be formatted through `format.ts` and translated through `t()`.

**The chart builder (User Story 5)**

- **FR-018**: The `/` menu of a document MUST offer "Bar chart", "Horizontal bar chart", "Line chart", "Donut chart" and "Number chart". Each inserts a database block that asks for a database; picking one adds a chart view of that kind to it (FR-001), shows that view in the block, and opens the chart's settings.
- **FR-019**: A new chart view MUST start drawable: grouped by the first select or status property, else the first property that groups (FR-003), else as a number chart; counting rows. Switching to a grouped kind without a grouping fills in the same default.
- **FR-020**: A chart's settings MUST be one panel, ordered as a person builds: kind; data (what to show = grouping and period, value = aggregate and property, sort, groups); style; and the actions (show as table, save as picture). Every change redraws at once and is saved with the view, through the same check as the server's (FR-012).
- **FR-021**: Sort MUST offer the default order (FR-005), label A→Z, label Z→A, value low→high and value high→low.
- **FR-022**: Each group MUST be hideable by its key from a list in the panel, with "Hide all" and "Show all". Hidden groups are left out of the drawing, the folding into "Other" and the total, and are listed in the table alternative as hidden. "No value" is one of these groups.
- **FR-023**: Bar, horizontal bar and line charts MUST be able to show options with no rows as zero ("Show empty options", off by default); dates always fill their gaps (US2.2).
- **FR-024**: Style MUST offer: palette (automatic, colourful, colourless, or one of eight single colours: blue, yellow, green, purple, teal, orange, pink, red), height (small, medium, large, extra large), legend (bottom, right, hidden; donut and line), value labels on the bars, slices or points (on/off), the total in a donut's centre with its own label (default "Total"), and a caption under the chart. A number chart has a title (default its aggregate, e.g. "Count all"), palette and height. Every palette is made of design tokens and every colour in it reaches 3:1 against the chart background (FR-015).
- **FR-025**: Hovering or focusing a group MUST show a tooltip with its label and value and the hint that clicking shows its rows.
- **FR-026**: "Save chart as" MUST offer a background (the page's surface or one of four soft colours, from tokens) and "Copy as PNG" and "Download PNG". The picture carries the chart, its caption and its legend.
- **FR-027**: Chart settings MUST be offered wherever the chart is shown, in a database's own page and in a document's database block, except to a viewer of the workspace; the server refuses a save the person may not make, and the chart returns to what is stored (as every view setting does, spec 007). A viewer sees, hovers, drills into, tabulates and saves the chart.
- **FR-028**: An agent MUST be able to build the same chart: every setting above through `set_view`, and placing it in a document through `embed_database` with the view to show. Saving a picture is drawn by the browser; an agent reads the same numbers through `query_rows`.
- **FR-029**: A number chart MUST read its value through the same aggregate (FR-008, FR-010) without a grouping, and an agent MUST get the same single value from `query_rows` with an aggregate and no grouping.

**Scope**

- **FR-017**: Dashboards (several views on one page), stacked or grouped bars, two groupings, and charts on public shared pages are out of scope; the design must not rule them out. From the owner's Notion walk-through these are also left out of this feature: a second grouping on bar and line charts (Notion's "Group by" under an axis), reference lines and a fixed axis range (later, with stacked bars); Download SVG (Chart.js draws on a canvas, so an SVG would be a second drawing of the chart); creating a new database or importing a CSV from the chart's picker (the picker lists existing databases, as the database block does); "Save for everyone" / "Reset" on filters, the folding toolbar and "Lock views" (they change every view type, not charts: separate backlog items); "Hide negative values", "Load limit" and "Show data source title".

### Key Entities

- **Chart view**: a view of a database with a kind, a grouping (property, and for dates a period; none for a number chart), an aggregate (function and, unless counting, a number property), the view's filters, whether the "No value" group and empty options show, a sort, the hidden groups, and its style (palette, height, legend, value labels, centre total, caption, title).
- **Chart block**: the existing database block of a document, showing one chart view of its database (the embed's own view, #26).
- **Aggregate result**: the groups in order, each with its key, label, value and row count, plus the number of rows left out of a sum or average, and whether groups were combined into "Other".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person goes from a database to a chart of it in under 30 seconds, without leaving the view menu.
- **SC-002**: A chart's numbers equal those of the corresponding filtered table view, for every grouping type and aggregate, in automated tests.
- **SC-003**: Over a 10,000-row database, a chart draws within its storage budget (set in the plan from measurement, as spec 002 does); over 100,000 rows it either draws or shows the time-limit sentence, and never hangs.
- **SC-004**: An agent answers "how many per X" over a 10,000-row database with one request, and its numbers equal the chart's.
- **SC-005**: The accessibility checker reports no serious or critical violations on a chart in either theme, and the chart can be read in full from the keyboard and as a table.
- **SC-006**: The main bundle grows by no more than a budget set in the plan; the chart library loads only with a chart.
- **SC-007**: From an empty line in a document, a person has a chart of a chosen database on the page in three actions (`/` entry, database, done), and every setting of FR-020 to FR-024 survives a reload, in automated tests.

## Assumptions

- Aggregates beyond count are sum, average, minimum and maximum, as in Notion. Median and percentiles can come later.
- Bar, horizontal bar, line, donut and number, as in Notion's chart types (owner's walk-through, 2026-10-28). Horizontal bar is a kind of its own in the settings, as Notion shows it, though it draws the same data as a bar chart.
- Chart settings in a document's database block are an exception to #22 (an embed shows rows, not the database's settings): a chart built from the `/` menu has to be finished where it was inserted. Other view types keep #22.
- The `/` menu's picker lists existing databases only, as the database block does today.
- A chart follows the same view permissions as other views: anyone who can read the database can read its charts; changing them needs write access.
- Charts are not shown on public shared pages in this feature; a public database page keeps showing its table.
- Charts do not refresh on their own; they redraw on reload and after changes in the same session, like the board's counts.
- The reader's language and number settings (`format.ts`) apply, as everywhere.
