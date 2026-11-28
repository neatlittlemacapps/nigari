package server

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
)

// Bulk import, without the content passing through the agent.
//
// The problem being solved here: to create 654 Trello cards, an agent used to
// have to write every character itself — once reading the source, once writing
// it through create_page. At ~1.5 million characters of card content every
// agent breaks off along the way, however skilful it is. That is not a question
// of care but a hard limit of its context window.
//
// The reversal: the agent names only the SOURCE and the MAPPING (a few hundred
// characters), nigari fetches the data itself and creates the pages. The import
// is then independent of the size of the source and succeeds even for a weak
// agent — all it has to do is start a job and ask how far along it is.
//
// The security boundary: a tool that lets the server fetch arbitrary URLs is a
// classic SSRF hole. nigari sits in a private network and could reach neighbours
// through it that are unreachable from outside — routers, hypervisors, cloud
// metadata services. That is why safeDial checks EVERY resolved address and
// dials exactly the one it checked (see there).

const (
	ingestMaxBytes = 64 << 20 // upper limit for the fetched source
	ingestMaxItems = 20000    // ripcord against endless sources
)

// --- The job record ----------------------------------------------------------

// ingestJob is an import's progress as get_import_status shows it. It is kept
// in the import's task row (tasks.go), not in memory: a restart used to lose
// every job, and only the last 20 were kept even without one.
type ingestJob struct {
	ID string `json:"job_id"`
	// Status is filled from the task row when the job is read: running,
	// done, failed or cancelled (the words this tool has always used).
	Status   string   `json:"status"`
	Total    int      `json:"total"`
	Created  int      `json:"created"`
	Failed   int      `json:"failed"`
	Errors   []string `json:"errors,omitempty"`
	Note     string   `json:"note,omitempty"`
	Target   string   `json:"target"`
	Started  string   `json:"started_at"`
	Finished string   `json:"finished_at,omitempty"`
	// Reason says why a job failed or stopped (a restart, a revoked
	// credential).
	Reason string `json:"reason,omitempty"`
}

// legacyImportStatus is a task status in get_import_status's words, which
// older clients already poll for ("done").
var legacyImportStatus = map[string]string{
	taskWorking: "running", taskCompleted: "done", taskFailed: "failed", taskCancelled: "cancelled",
}

// importJob reads an import as get_import_status answers it, for the
// credential that started it only.
func (s *Server) importJob(u *user, id string) (ingestJob, error) {
	t, err := s.taskFor(u, id)
	if err != nil || t.Kind != "import" {
		return ingestJob{}, errTaskNotFound
	}
	var j ingestJob
	json.Unmarshal(t.Progress, &j)
	j.ID = t.ID
	j.Status = legacyImportStatus[t.Status]
	if t.Status != taskWorking && j.Finished == "" {
		j.Finished = t.Updated
	}
	if t.Error != "" {
		j.Reason = t.Error
	} else if t.Status == taskCancelled {
		j.Reason = t.StatusMessage
	}
	return j, nil
}

// importMessage is a task's statusMessage for an import in progress.
func importMessage(j *ingestJob) string {
	m := fmt.Sprintf("%d of %d record(s) written", j.Created, j.Total)
	if j.Failed > 0 {
		m += fmt.Sprintf(", %d failed", j.Failed)
	}
	return m
}

// --- Fetching the source -----------------------------------------------------

// fetchSource fetches the source. headers allows authentication (bearer token,
// API key) without nigari storing the credentials — they hold for this one fetch
// only.
func fetchSource(rawURL string, headers map[string]string) ([]byte, error) {
	if !strings.HasPrefix(rawURL, "http://") && !strings.HasPrefix(rawURL, "https://") {
		return nil, fmt.Errorf("url must start with http:// or https://")
	}
	req, err := http.NewRequest("GET", rawURL, nil)
	if err != nil {
		return nil, fmt.Errorf("invalid url: %v", err)
	}
	req.Header.Set("User-Agent", "nigari/"+Version+" (import)")
	req.Header.Set("Accept", "application/json, text/plain, */*")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := ingestHTTPClient().Do(req)
	if err != nil {
		return nil, fmt.Errorf("could not fetch the url: %v", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, ingestMaxBytes+1))
	if err != nil {
		return nil, fmt.Errorf("could not read the response: %v", err)
	}
	if len(body) > ingestMaxBytes {
		return nil, fmt.Errorf("the source is larger than %d MB", ingestMaxBytes>>20)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet := strings.TrimSpace(string(body))
		if len(snippet) > 300 {
			snippet = snippet[:300] + "…"
		}
		return nil, fmt.Errorf("the source answered %s: %s", resp.Status, snippet)
	}
	return body, nil
}

// --- Feldzuordnung -----------------------------------------------------------

// jsonPath reads a value through a path like "name", "card.due" or
// "labels[].name" (the last one picks the field out of every element of a
// list). Deliberately kept small: that covers the shape REST answers almost
// always have, without dragging a whole query language along.
func jsonPath(v any, path string) any {
	if path == "" || v == nil {
		return v
	}
	seg, rest, _ := strings.Cut(path, ".")
	pluck := strings.HasSuffix(seg, "[]")
	seg = strings.TrimSuffix(seg, "[]")

	cur := v
	if seg != "" {
		m, ok := v.(map[string]any)
		if !ok {
			return nil
		}
		cur = m[seg]
	}
	if pluck {
		arr, ok := cur.([]any)
		if !ok {
			return nil
		}
		out := []any{}
		for _, e := range arr {
			if rest == "" {
				out = append(out, e)
			} else if x := jsonPath(e, rest); x != nil {
				out = append(out, x)
			}
		}
		return out
	}
	if rest == "" {
		return cur
	}
	return jsonPath(cur, rest)
}

// scalarString turns a JSON value into text for titles and text fields.
func scalarString(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case bool:
		if t {
			return "true"
		}
		return "false"
	case float64:
		if t == float64(int64(t)) {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	case []any:
		parts := make([]string, 0, len(t))
		for _, e := range t {
			if s := scalarString(e); s != "" {
				parts = append(parts, s)
			}
		}
		return strings.Join(parts, ", ")
	}
	return ""
}

// ingestResolve describes a link inside the same answer: an element carries a
// foreign id while the plain text sits in another list. That is exactly the
// shape of Trello (card → idList → lists[].name), Jira, Airtable and Asana.
// Without it the column would hold a meaningless id.
type ingestResolve struct {
	From  string `json:"from"`  // path to the lookup list, e.g. "lists"
	Match string `json:"match"` // field in it that matches the id, e.g. "id"
	To    string `json:"to"`    // field whose value is put in, e.g. "name"
}

type ingestSpec struct {
	URL        string                   `json:"url"`
	Headers    map[string]string        `json:"headers"`
	Items      string                   `json:"items"`
	Title      string                   `json:"title"`
	Markdown   string                   `json:"markdown"`
	Properties map[string]string        `json:"properties"`
	Resolve    map[string]ingestResolve `json:"resolve"`
	DatabaseID string                   `json:"database_id"`
	ParentID   string                   `json:"parent_id"`
	WorkspaceI string                   `json:"workspace_id"`
	Limit      int                      `json:"limit"`
}

// buildResolvers builds dictionaries id → plain text from the lookup lists.
func buildResolvers(doc any, spec ingestSpec) map[string]map[string]string {
	out := map[string]map[string]string{}
	for field, r := range spec.Resolve {
		arr, ok := jsonPath(doc, r.From).([]any)
		if !ok {
			continue
		}
		table := map[string]string{}
		for _, e := range arr {
			k := scalarString(jsonPath(e, r.Match))
			v := scalarString(jsonPath(e, r.To))
			if k != "" && v != "" {
				table[k] = v
			}
		}
		out[field] = table
	}
	return out
}

// applyResolve ersetzt Ids durch Klartext — auch innerhalb von Listen.
func applyResolve(v any, table map[string]string) any {
	if table == nil {
		return v
	}
	if arr, ok := v.([]any); ok {
		out := make([]any, 0, len(arr))
		for _, e := range arr {
			out = append(out, applyResolve(e, table))
		}
		return out
	}
	if s := scalarString(v); s != "" {
		if mapped, ok := table[s]; ok {
			return mapped
		}
	}
	return v
}

// --- Carrying it out ---------------------------------------------------------

type ingestItem struct {
	title string
	md    string
	props map[string]any
}

// planIngest fetches the source and shapes it into entries — without writing
// anything. A wrongly mapped import therefore fails BEFORE half-created pages
// are lying around.
func planIngest(spec ingestSpec) ([]ingestItem, error) {
	body, err := fetchSource(spec.URL, spec.Headers)
	if err != nil {
		return nil, err
	}
	var doc any
	if err := json.Unmarshal(body, &doc); err != nil {
		return nil, fmt.Errorf("the source is not valid JSON: %v", err)
	}
	return mapItems(doc, spec)
}

// mapItems shapes a fetched document into entries. Separate from planIngest so
// the mapping is testable without network access — it is the part the mistakes
// live in.
func mapItems(doc any, spec ingestSpec) ([]ingestItem, error) {
	raw := doc
	if spec.Items != "" {
		raw = jsonPath(doc, spec.Items)
	}
	arr, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("items path %q does not point at a list — pass the path to the array of records (for example \"cards\"), or omit it if the response is a list itself", spec.Items)
	}
	if len(arr) == 0 {
		return nil, fmt.Errorf("the source contains no records at %q", spec.Items)
	}
	if len(arr) > ingestMaxItems {
		return nil, fmt.Errorf("the source has %d records, more than the limit of %d", len(arr), ingestMaxItems)
	}
	limit := spec.Limit
	if limit > 0 && limit < len(arr) {
		arr = arr[:limit]
	}
	resolvers := buildResolvers(doc, spec)

	items := make([]ingestItem, 0, len(arr))
	for i, e := range arr {
		title := strings.TrimSpace(scalarString(jsonPath(e, spec.Title)))
		if title == "" {
			title = fmt.Sprintf("Untitled %d", i+1)
		}
		if len([]rune(title)) > maxTitleLen {
			title = string([]rune(title)[:maxTitleLen])
		}
		it := ingestItem{title: title, props: map[string]any{}}
		if spec.Markdown != "" {
			it.md = scalarString(jsonPath(e, spec.Markdown))
		}
		for prop, path := range spec.Properties {
			v := jsonPath(e, path)
			// The mapping names the SOURCE PATH; the lookup goes through its last
			// segment, so that "idList" and "card.idList" behave the same.
			key := path
			if i := strings.LastIndexByte(key, '.'); i >= 0 {
				key = key[i+1:]
			}
			v = applyResolve(v, resolvers[strings.TrimSuffix(key, "[]")])
			if v != nil {
				it.props[prop] = v
			}
		}
		items = append(items, it)
	}
	return items, nil
}

// ensureIngestOptions creates the missing select options — ONCE for the whole
// import, not per row.
//
// Without it the import is unusable for a weak agent: the 11 Trello lists are
// not options in the nigari schema to begin with, every row would get an empty
// status, and the agent would have to notice the gap itself. The import knows
// better than it does — so the import does it.
func (s *Server) ensureIngestOptions(dbID string, items []ingestItem, nameToID map[string]string) (int, error) {
	schema, views, err := s.loadCollection(dbID)
	if err != nil {
		return 0, err
	}
	// Collect the wanted values per select property, keeping the order stable.
	want := map[string][]string{}
	seen := map[string]bool{}
	for _, it := range items {
		for prop, v := range it.props {
			id := nameToID[strings.ToLower(prop)]
			if id == "" {
				continue
			}
			for _, val := range valueStrings(v) {
				k := id + "\x00" + strings.ToLower(val)
				if !seen[k] {
					seen[k] = true
					want[id] = append(want[id], val)
				}
			}
		}
	}
	added := 0
	for i, p := range schema {
		id, _ := p["id"].(string)
		typ, _ := p["type"].(string)
		if !optionTypes[typ] {
			continue
		}
		opts, _ := p["options"].([]any)
		have := map[string]bool{}
		taken := map[string]bool{}
		for _, o := range opts {
			om, _ := o.(map[string]any)
			if n, _ := om["name"].(string); n != "" {
				have[strings.ToLower(n)] = true
			}
			if oid, _ := om["id"].(string); oid != "" {
				taken[oid] = true
			}
		}
		for _, val := range want[id] {
			if have[strings.ToLower(val)] {
				continue
			}
			// Give it a colour right away: an option without one shows in the
			// board as a colourless header, and a kanban lives on telling the
			// columns apart by hue. Taken in turn from optionPalette
			// (import_csv.go) — the same source as the CSV import, so that no
			// second truth appears.
			opt := map[string]any{
				"id":    slugID(val, taken),
				"name":  val,
				"color": optionPalette[added%len(optionPalette)],
			}
			if typ == "status" {
				// Placed by its name, as a conversion places one (spec 016, R6).
				opt["group"] = guessStatusGroup(val)
			}
			opts = append(opts, opt)
			have[strings.ToLower(val)] = true
			added++
		}
		schema[i]["options"] = opts
	}
	if added > 0 {
		// Every option has its group, so this only keeps them in group order.
		if err := prepareStatusProps(schema, snapshotStatus(nil)); err != nil {
			return 0, err
		}
		if err := s.saveCollection(dbID, schema, views); err != nil {
			return 0, err
		}
	}
	return added, nil
}

// valueStrings breaks a mapped value into individual select values.
func valueStrings(v any) []string {
	if arr, ok := v.([]any); ok {
		out := []string{}
		for _, e := range arr {
			if s := strings.TrimSpace(scalarString(e)); s != "" {
				out = append(out, s)
			}
		}
		return out
	}
	if s := strings.TrimSpace(scalarString(v)); s != "" {
		return []string{s}
	}
	return nil
}

// startIngest checks target and mapping, fetches the source and starts the job
// in the background. The caller gets a job id back straight away — an import
// with hundreds of entries would otherwise run into every timeout there is.
func (s *Server) startIngest(u *user, spec ingestSpec) (string, error) {
	if strings.TrimSpace(spec.URL) == "" {
		return "", fmt.Errorf("url is required")
	}
	if spec.Title == "" {
		return "", fmt.Errorf("title is required — name the field each record's title comes from (for example \"name\")")
	}

	// Work out the target and check write permission BEFORE anything is fetched.
	var parentID, workspaceID, target string
	var nameToID map[string]string
	if spec.DatabaseID != "" {
		// tokenCanReach on top: canWrite does not know the workspace boundary of a
		// restricted token, which would otherwise write outside its own area.
		if !s.canWrite(u.ID, spec.DatabaseID) || u.TokenScope == "read" || !s.credentialMayEnter(u, s.pageWorkspace(spec.DatabaseID)) {
			return "", fmt.Errorf("database %q not found", spec.DatabaseID)
		}
		schema, _, err := s.loadCollection(spec.DatabaseID)
		if err != nil {
			return "", err
		}
		if err := s.db.QueryRow(`SELECT workspace_id FROM pages WHERE id = ? AND trashed_at IS NULL`,
			spec.DatabaseID).Scan(&workspaceID); err != nil {
			return "", fmt.Errorf("database %q not found", spec.DatabaseID)
		}
		nameToID = map[string]string{}
		known := []string{}
		for _, p := range schema {
			id, _ := p["id"].(string)
			name, _ := p["name"].(string)
			if id != "" {
				nameToID[strings.ToLower(id)] = id
				known = append(known, name)
			}
			if name != "" {
				nameToID[strings.ToLower(name)] = id
			}
		}
		// A misspelled column may not quietly run into nothing.
		for prop := range spec.Properties {
			if nameToID[strings.ToLower(prop)] == "" {
				return "", fmt.Errorf("the database has no property %q — it has: %s (call get_schema, or add it with update_schema first)",
					prop, strings.Join(known, ", "))
			}
		}
		parentID = spec.DatabaseID
		target = "database " + spec.DatabaseID
	} else if spec.ParentID != "" {
		if !s.canWrite(u.ID, spec.ParentID) || u.TokenScope == "read" || !s.credentialMayEnter(u, s.pageWorkspace(spec.ParentID)) {
			return "", fmt.Errorf("parent page %q not found", spec.ParentID)
		}
		if err := s.db.QueryRow(`SELECT workspace_id FROM pages WHERE id = ? AND trashed_at IS NULL`,
			spec.ParentID).Scan(&workspaceID); err != nil {
			return "", fmt.Errorf("parent page %q not found", spec.ParentID)
		}
		parentID = spec.ParentID
		target = "pages under " + spec.ParentID
	} else {
		ws, err := s.mcpCreateWorkspaceTarget(u, spec.WorkspaceI)
		if err != nil {
			return "", err
		}
		workspaceID = ws
		target = "top-level pages in workspace " + ws
	}

	// Fetching and mapping happen BEFORE the background job: a typo in the path or
	// an unreachable source should come back as an error immediately, not only when
	// somebody asks.
	items, err := planIngest(spec)
	if err != nil {
		return "", err
	}

	note := ""
	if spec.DatabaseID != "" {
		added, err := s.ensureIngestOptions(spec.DatabaseID, items, nameToID)
		if err != nil {
			return "", err
		}
		if added > 0 {
			note = fmt.Sprintf("added %d missing select option(s) from the source", added)
		}
	}

	job := &ingestJob{
		ID: newID(), Total: len(items),
		Target: target, Started: now(), Note: note,
	}
	// Stored before the id goes back: a client may poll the moment it has
	// it, and the Tasks extension forbids a handle tasks/get cannot find.
	owner := taskOwnerOf(u)
	if err := s.createTask(owner, job.ID, "import", importMessage(job), job); err != nil {
		return "", err
	}
	go s.runIngest(job, owner, parentID, workspaceID, items, nameToID)
	return job.ID, nil
}

// runIngest creates the entries. Runs in the background and writes the
// progress into the task row after each record, so an agent can watch.
//
// Before each record it checks that the task is still working (a cancel
// stops it there; records already written stay) and that the credential that
// started it may still write there: revoking or narrowing a token is how a
// person stops an agent, and an import of thousands of records must not run
// on for minutes after. Measured on 2000 records (2026-11-28, three runs
// each): 1.67–1.71 s with the checks, 1.40–1.70 s without them.
func (s *Server) runIngest(job *ingestJob, owner taskOwner, parentID, workspaceID string, items []ingestItem, nameToID map[string]string) {
	userID := owner.userID
	defer s.pagesChanged()
	var pos float64
	if parentID != "" {
		s.db.QueryRow(`SELECT COALESCE(MAX(position), 0) + 1 FROM pages WHERE parent_id = ?`, parentID).Scan(&pos)
	} else {
		s.db.QueryRow(`SELECT COALESCE(MAX(position), 0) + 1 FROM pages WHERE parent_id IS NULL AND workspace_id = ?`, workspaceID).Scan(&pos)
	}
	var parent any
	if parentID != "" {
		parent = parentID
	}

	for _, it := range items {
		if !s.mayStillWrite(job.ID, workspaceID) {
			job.Finished = now()
			s.endTask(job.ID, taskFailed, taskRevoked, taskRevoked, job)
			return
		}
		working, perr := s.progressTask(job.ID, importMessage(job), job)
		if perr != nil {
			log.Printf("import %s: progress not written: %v", job.ID, perr)
		}
		if !working {
			// Cancelled. endTask keeps the cancelled state and stores the
			// final count.
			job.Finished = now()
			s.endTask(job.ID, taskCancelled, "", "", job)
			return
		}
		content := "[]"
		if it.md != "" {
			if c, err := mdToBlocksJSON(it.md); err == nil {
				content = c
			}
		}
		id := newID()
		ts := now()
		_, err := s.db.Exec(`INSERT INTO pages (id, parent_id, title, content, position, created_at, updated_at, workspace_id, owner_id, visibility)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'workspace')`,
			id, parent, it.title, content, pos, ts, ts, workspaceID, userID)
		if err != nil {
			job.Failed++
			if len(job.Errors) < 10 {
				job.Errors = append(job.Errors, fmt.Sprintf("%s: %v", it.title, err))
			}
			continue
		}
		pos++
		if len(it.props) > 0 && nameToID != nil {
			patch := map[string]any{}
			for prop, v := range it.props {
				if pid := nameToID[strings.ToLower(prop)]; pid != "" {
					patch[pid] = v
				}
			}
			if len(patch) > 0 {
				b, _ := json.Marshal(patch)
				if _, err := s.mcpSetProperties(id, b, nil); err != nil {
					if len(job.Errors) < 10 {
						job.Errors = append(job.Errors, fmt.Sprintf("%s: properties: %v", it.title, err))
					}
				}
			}
		}
		// Into a database: a status the item did not set starts in To-do
		// (spec 016, FR-017). Pages outside a database have no schema.
		if parentID != "" && nameToID != nil {
			s.fillStatusDefaults(parentID, id)
		}
		s.reindexPage(id)
		job.Created++
	}

	job.Finished = now()
	s.endTask(job.ID, taskCompleted, importMessage(job), "", job)
}
