package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

// Spec 027, US3: import_url as a task of the MCP Tasks extension, and the
// stored task row behind it (tasks.go, mcp_tasks.go).

const capsTasks = `{"extensions":{"io.modelcontextprotocol/tasks":{}}}`

// taskCall sends a modern request with the given client capabilities. The
// routing headers name the tool or the task, as the revision requires.
func taskCall(t *testing.T, s *Server, tok, caps, method string, params map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	params["_meta"] = map[string]any{
		mcpMetaProtocolVersion:               mcpModernVersion,
		mcpMetaClientCapabilities:            json.RawMessage(caps),
		"io.modelcontextprotocol/clientInfo": map[string]any{"name": "test", "version": "1"},
	}
	body, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 3, "method": method, "params": params})
	h := map[string]string{"MCP-Protocol-Version": mcpModernVersion, "Mcp-Method": method}
	if n, _ := params["name"].(string); n != "" {
		h["Mcp-Name"] = n
	}
	if id, _ := params["taskId"].(string); id != "" {
		h["Mcp-Name"] = id
	}
	return mcpPost(s, tok, string(body), h)
}

// taskAnswer is what tasks/get, tools/call (as a task) and the acks return.
type taskAnswer struct {
	Result struct {
		ResultType     string `json:"resultType"`
		TaskID         string `json:"taskId"`
		Status         string `json:"status"`
		StatusMessage  string `json:"statusMessage"`
		TTLms          int64  `json:"ttlMs"`
		PollIntervalMs int64  `json:"pollIntervalMs"`
		Result         *struct {
			IsError bool `json:"isError"`
			Content []struct {
				Text string `json:"text"`
			} `json:"content"`
		} `json:"result"`
		Error *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	} `json:"result"`
	Error *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func readTask(t *testing.T, rec *httptest.ResponseRecorder) taskAnswer {
	t.Helper()
	var a taskAnswer
	if err := json.Unmarshal(rec.Body.Bytes(), &a); err != nil {
		t.Fatalf("unreadable answer %d: %s", rec.Code, rec.Body.String())
	}
	return a
}

// importSource serves a JSON list of records, on loopback: the import's
// address guard is opened for the test and closed again after it.
func importSource(t *testing.T, titles ...string) string {
	t.Helper()
	items := []map[string]string{}
	for _, ti := range titles {
		items = append(items, map[string]string{"name": ti})
	}
	b, _ := json.Marshal(map[string]any{"cards": items})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	}))
	t.Cleanup(srv.Close)
	was := allowPrivateImport
	allowPrivateImport = true
	t.Cleanup(func() { allowPrivateImport = was })
	return srv.URL
}

type taskFixture struct {
	s           *Server
	uid, tok    string
	ws, parent  string
	otherTok    string // another person
	narrowedTok string // the same person, a token narrowed to one workspace
}

func newTaskFixture(t *testing.T) *taskFixture {
	t.Helper()
	f := &taskFixture{s: testServer(t)}
	f.uid, _ = signedIn(t, f.s, "tasks@example.test")
	f.ws = f.s.firstWorkspaceOf(t, f.uid)
	f.parent = f.s.makePage(t, f.ws, f.uid, "", "Imports", `{}`)
	f.tok = mcpToken(t, f.s, f.uid, "write")
	other, _ := signedIn(t, f.s, "other@example.test")
	f.otherTok = mcpToken(t, f.s, other, "write")
	f.narrowedTok = mcpToken(t, f.s, f.uid, "write")
	if _, err := f.s.db.Exec(`UPDATE api_tokens SET workspace_scope = ? WHERE token_hash = ?`, f.ws, tokenHash(f.narrowedTok)); err != nil {
		t.Fatal(err)
	}
	return f
}

func (f *taskFixture) importArgs(url string) map[string]any {
	return map[string]any{"name": "import_url", "arguments": map[string]any{
		"url": url, "items": "cards", "title": "name", "parent_id": f.parent}}
}

// children are the titles written under the import's parent page.
func (f *taskFixture) children(t *testing.T) []string {
	t.Helper()
	rows, err := f.s.db.Query(`SELECT title FROM pages WHERE parent_id = ? ORDER BY position`, f.parent)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var ti string
		rows.Scan(&ti)
		out = append(out, ti)
	}
	return out
}

// waitTask polls tasks/get until the task has ended.
func (f *taskFixture) waitTask(t *testing.T, tok, id string) taskAnswer {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for {
		a := readTask(t, taskCall(t, f.s, tok, capsTasks, "tasks/get", map[string]any{"taskId": id}))
		if a.Error != nil {
			t.Fatalf("tasks/get: %d %s", a.Error.Code, a.Error.Message)
		}
		if a.Result.Status != taskWorking {
			return a
		}
		if time.Now().After(deadline) {
			t.Fatalf("task %s still working after 10 s", id)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

// A client that declared the extension gets a task, stored before the answer
// went out, and reads the import's result from it once it has ended.
func TestImportIsATaskForAClientThatDeclaredTasks(t *testing.T) {
	f := newTaskFixture(t)
	url := importSource(t, "One", "Two", "Three")

	a := readTask(t, taskCall(t, f.s, f.tok, capsTasks, "tools/call", f.importArgs(url)))
	if a.Error != nil || a.Result.ResultType != "task" || a.Result.TaskID == "" {
		t.Fatalf("import_url did not answer with a task: %+v", a)
	}
	if a.Result.PollIntervalMs != taskPollMs || a.Result.TTLms != taskKeep.Milliseconds() {
		t.Errorf("poll interval %d, ttl %d", a.Result.PollIntervalMs, a.Result.TTLms)
	}
	// Stored before the handle went out (FR-012): the row is there.
	var n int
	f.s.db.QueryRow(`SELECT COUNT(*) FROM mcp_tasks WHERE id = ?`, a.Result.TaskID).Scan(&n)
	if n != 1 {
		t.Fatalf("the task's row is missing")
	}

	end := f.waitTask(t, f.tok, a.Result.TaskID)
	if end.Result.Status != taskCompleted || end.Result.ResultType != "complete" || end.Result.Result == nil {
		t.Fatalf("the ended task has no result: %+v", end.Result)
	}
	var job ingestJob
	if err := json.Unmarshal([]byte(end.Result.Result.Content[0].Text), &job); err != nil {
		t.Fatalf("the task's result is not the import's record: %v", err)
	}
	if job.Created != 3 || job.Status != "done" {
		t.Errorf("result says %d created, status %q; want 3, done", job.Created, job.Status)
	}
	if got := f.children(t); strings.Join(got, ",") != "One,Two,Three" {
		t.Errorf("written: %v", got)
	}
}

// A client that did not declare the extension gets today's answer: a job id
// and get_import_status (FR-014). The tasks/* methods refuse it.
func TestImportWithoutTheExtensionAnswersAsBefore(t *testing.T) {
	f := newTaskFixture(t)
	url := importSource(t, "One", "Two")

	for _, caps := range []string{`{}`, `{"extensions":{"io.modelcontextprotocol/skills":{}}}`} {
		rec := taskCall(t, f.s, f.tok, caps, "tools/call", f.importArgs(url))
		text, isErr := mcpToolText(t, rec)
		if isErr || !strings.Contains(text, `"job_id"`) || strings.Contains(rec.Body.String(), `"resultType":"task"`) {
			t.Fatalf("caps %s: want the job_id answer: %.300s", caps, rec.Body.String())
		}
		var started struct {
			JobID string `json:"job_id"`
		}
		json.Unmarshal([]byte(text), &started)

		// The extension's methods are refused to this client.
		a := readTask(t, taskCall(t, f.s, f.tok, caps, "tasks/get", map[string]any{"taskId": started.JobID}))
		if a.Error == nil || a.Error.Code != rpcMissingClientCapability {
			t.Errorf("caps %s: tasks/get without the extension: %+v", caps, a)
		}

		// The legacy tool reads the same row.
		deadline := time.Now().Add(10 * time.Second)
		for {
			out, err := callTool(t, f.s, &user{ID: f.uid, TokenKind: tokenKindAPI}, "get_import_status", `{"job_id":"`+started.JobID+`"}`)
			if err != nil {
				t.Fatalf("get_import_status: %v", err)
			}
			if strings.Contains(out, `"status":"done"`) {
				break
			}
			if time.Now().After(deadline) {
				t.Fatalf("still not done: %s", out)
			}
			time.Sleep(20 * time.Millisecond)
		}
	}
}

// Another person, and a narrower token of the same person, cannot read or
// cancel the task: both get "not found", the same answer as an unknown id.
func TestTaskBelongsToTheCredentialThatStartedIt(t *testing.T) {
	f := newTaskFixture(t)
	url := importSource(t, "One")
	a := readTask(t, taskCall(t, f.s, f.tok, capsTasks, "tools/call", f.importArgs(url)))
	id := a.Result.TaskID
	if id == "" {
		t.Fatalf("no task: %+v", a)
	}
	f.waitTask(t, f.tok, id)

	for who, tok := range map[string]string{"another person": f.otherTok, "a narrower token": f.narrowedTok} {
		for _, method := range []string{"tasks/get", "tasks/cancel", "tasks/update"} {
			got := readTask(t, taskCall(t, f.s, tok, capsTasks, method, map[string]any{"taskId": id}))
			if got.Error == nil || got.Error.Code != rpcInvalidParams || !strings.Contains(got.Error.Message, "not found") {
				t.Errorf("%s, %s: want not found, got %+v", who, method, got)
			}
		}
		rec := mcpPost(f.s, tok, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_import_status","arguments":{"job_id":"`+id+`"}}}`, nil)
		if text, isErr := mcpToolText(t, rec); !isErr || !strings.Contains(text, "not found") {
			t.Errorf("%s, get_import_status: want not found, got %s", who, text)
		}
	}
	unknown := readTask(t, taskCall(t, f.s, f.tok, capsTasks, "tasks/get", map[string]any{"taskId": "no-such-task"}))
	if unknown.Error == nil || unknown.Error.Code != rpcInvalidParams {
		t.Errorf("unknown id: %+v", unknown)
	}
	// The owner still reads it.
	if own := readTask(t, taskCall(t, f.s, f.tok, capsTasks, "tasks/get", map[string]any{"taskId": id})); own.Error != nil {
		t.Errorf("the owner's own tasks/get failed: %+v", own.Error)
	}
}

// startStoredImport creates an import's task row and runs it in this
// goroutine, as startIngest would in the background. stopAt names the
// record whose insert does something mid-run (a trigger set up by the
// caller), so the test does not race the runner.
func (f *taskFixture) startStoredImport(t *testing.T, u *user, titles ...string) *ingestJob {
	t.Helper()
	job := &ingestJob{ID: newID(), Total: len(titles), Target: "pages under " + f.parent, Started: now()}
	owner := taskOwnerOf(u)
	if err := f.s.createTask(owner, job.ID, "import", importMessage(job), job); err != nil {
		t.Fatal(err)
	}
	items := []ingestItem{}
	for _, ti := range titles {
		items = append(items, ingestItem{title: ti})
	}
	f.s.runIngest(job, owner, f.parent, f.ws, items, nil)
	return job
}

// tokenUser is the user an API token resolves to, as currentUser builds it.
func (f *taskFixture) tokenUser(t *testing.T, tok string) *user {
	t.Helper()
	req := httptest.NewRequest("POST", "/mcp", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	u := f.s.currentUser(req)
	if u == nil {
		t.Fatal("token does not resolve")
	}
	return u
}

// A cancel stops the import at the next record; the records already written
// stay, and the task ends as cancelled.
func TestCancelStopsAnImportAtTheNextRecord(t *testing.T) {
	f := newTaskFixture(t)
	u := f.tokenUser(t, f.tok)
	// The cancel arrives while "Two" is written, as tasks/cancel would from
	// another request: the trigger runs the same UPDATE cancelTask runs.
	if _, err := f.s.db.Exec(`CREATE TRIGGER cancel_mid AFTER INSERT ON pages WHEN NEW.title = 'Two'
		BEGIN UPDATE mcp_tasks SET status = 'cancelled' WHERE status = 'working'; END`); err != nil {
		t.Fatal(err)
	}
	job := f.startStoredImport(t, u, "One", "Two", "Three", "Four")

	if got := f.children(t); strings.Join(got, ",") != "One,Two" {
		t.Errorf("written: %v; want One,Two (the cancel stops at the next record, the rest stays)", got)
	}
	a := readTask(t, taskCall(t, f.s, f.tok, capsTasks, "tasks/get", map[string]any{"taskId": job.ID}))
	if a.Result.Status != taskCancelled {
		t.Fatalf("status %q, want cancelled", a.Result.Status)
	}
	j, _ := f.s.importJob(u, job.ID)
	if j.Status != "cancelled" || j.Created != 2 {
		t.Errorf("the record says %q with %d created; want cancelled with 2", j.Status, j.Created)
	}
}

// tasks/cancel on a running task ends it as cancelled; on an ended task it
// is acknowledged and changes nothing.
func TestTasksCancelMethod(t *testing.T) {
	f := newTaskFixture(t)
	u := f.tokenUser(t, f.tok)
	job := &ingestJob{ID: newID(), Total: 5}
	if err := f.s.createTask(taskOwnerOf(u), job.ID, "import", "", job); err != nil {
		t.Fatal(err)
	}
	ack := readTask(t, taskCall(t, f.s, f.tok, capsTasks, "tasks/cancel", map[string]any{"taskId": job.ID}))
	if ack.Error != nil || ack.Result.ResultType != "complete" {
		t.Fatalf("tasks/cancel: %+v", ack)
	}
	if a := readTask(t, taskCall(t, f.s, f.tok, capsTasks, "tasks/get", map[string]any{"taskId": job.ID})); a.Result.Status != taskCancelled {
		t.Fatalf("after cancel: %q", a.Result.Status)
	}
	// The runner, had it been running, stops at its next record.
	if f.s.progressTask(job.ID, "", job) {
		t.Error("a cancelled task still takes progress")
	}

	done := f.startStoredImport(t, u, "One")
	readTask(t, taskCall(t, f.s, f.tok, capsTasks, "tasks/cancel", map[string]any{"taskId": done.ID}))
	if a := readTask(t, taskCall(t, f.s, f.tok, capsTasks, "tasks/get", map[string]any{"taskId": done.ID})); a.Result.Status != taskCompleted {
		t.Errorf("an ended task changed on cancel: %q", a.Result.Status)
	}
	// tasks/update: acknowledged; an import asks for nothing.
	if a := readTask(t, taskCall(t, f.s, f.tok, capsTasks, "tasks/update", map[string]any{"taskId": done.ID})); a.Error != nil {
		t.Errorf("tasks/update: %+v", a.Error)
	}
	if a := readTask(t, taskCall(t, f.s, f.tok, capsTasks, "tasks/update", map[string]any{"taskId": done.ID,
		"inputResponses": map[string]any{"x": map[string]any{}}})); a.Error == nil || a.Error.Code != rpcInvalidParams {
		t.Errorf("tasks/update with an answer nothing asked for: %+v", a)
	}
}

// Revoking the token stops its import at the next record (a person's way to
// stop an agent), and the task says why.
func TestRevokedTokenStopsItsImport(t *testing.T) {
	f := newTaskFixture(t)
	u := f.tokenUser(t, f.tok)
	if _, err := f.s.db.Exec(fmt.Sprintf(`CREATE TRIGGER revoke_mid AFTER INSERT ON pages WHEN NEW.title = 'Two'
		BEGIN DELETE FROM api_tokens WHERE id = '%s'; END`, u.TokenID)); err != nil {
		t.Fatal(err)
	}
	job := f.startStoredImport(t, u, "One", "Two", "Three")
	if got := f.children(t); strings.Join(got, ",") != "One,Two" {
		t.Errorf("written: %v; want One,Two", got)
	}
	var status, reason string
	f.s.db.QueryRow(`SELECT status, error FROM mcp_tasks WHERE id = ?`, job.ID).Scan(&status, &reason)
	if status != taskFailed || reason != taskRevoked {
		t.Errorf("status %q, reason %q", status, reason)
	}
}

// A restart during an import: the task reads as failed with the reason, not
// as running forever (FR-013, SC-004).
func TestTaskSurvivesARestartAsFailed(t *testing.T) {
	dir := t.TempDir()
	dist := fstest.MapFS{"index.html": {Data: []byte("<html></html>")}}
	s, err := New(dir, dist)
	if err != nil {
		t.Fatal(err)
	}
	uid, _ := signedIn(t, s, "restart@example.test")
	tok := mcpToken(t, s, uid, "write")
	req := httptest.NewRequest("POST", "/mcp", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	u := s.currentUser(req)
	job := &ingestJob{ID: newID(), Total: 100, Created: 40}
	if err := s.createTask(taskOwnerOf(u), job.ID, "import", importMessage(job), job); err != nil {
		t.Fatal(err)
	}
	s.Close()

	s2, err := New(dir, dist)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s2.Close() })
	a := readTask(t, taskCall(t, s2, tok, capsTasks, "tasks/get", map[string]any{"taskId": job.ID}))
	if a.Result.Status != taskFailed || a.Result.Error == nil || a.Result.Error.Message != taskInterrupted {
		t.Fatalf("after a restart: %+v", a.Result)
	}
	out, err := callTool(t, s2, u, "get_import_status", `{"job_id":"`+job.ID+`"}`)
	if err != nil || !strings.Contains(out, `"status":"failed"`) || !strings.Contains(out, taskInterrupted) || !strings.Contains(out, `"created":40`) {
		t.Errorf("get_import_status after a restart: %v %s", err, out)
	}
}

// An ended task is kept for taskKeep, then reads as not found and is deleted.
func TestEndedTaskExpires(t *testing.T) {
	f := newTaskFixture(t)
	u := f.tokenUser(t, f.tok)
	done := f.startStoredImport(t, u, "One")
	past := time.Now().UTC().Add(-time.Minute).Format(time.RFC3339Nano)
	f.s.db.Exec(`UPDATE mcp_tasks SET expires_at = ? WHERE id = ?`, past, done.ID)
	if a := readTask(t, taskCall(t, f.s, f.tok, capsTasks, "tasks/get", map[string]any{"taskId": done.ID})); a.Error == nil {
		t.Errorf("an expired task is still readable: %+v", a.Result)
	}
	f.s.deleteExpiredTasks()
	var n int
	f.s.db.QueryRow(`SELECT COUNT(*) FROM mcp_tasks WHERE id = ?`, done.ID).Scan(&n)
	if n != 0 {
		t.Error("the expired task was not deleted")
	}
}

// The extension's methods are routed on the task: Mcp-Name must name it.
func TestTaskMethodsCheckTheRoutingHeader(t *testing.T) {
	f := newTaskFixture(t)
	body, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": "tasks/get", "params": map[string]any{
		"taskId": "abc", "_meta": map[string]any{mcpMetaProtocolVersion: mcpModernVersion,
			mcpMetaClientCapabilities: json.RawMessage(capsTasks)}}})
	rec := mcpPost(f.s, f.tok, string(body), map[string]string{
		"MCP-Protocol-Version": mcpModernVersion, "Mcp-Method": "tasks/get", "Mcp-Name": "other"})
	if a := readTask(t, rec); rec.Code != http.StatusBadRequest || a.Error == nil || a.Error.Code != rpcHeaderMismatch {
		t.Errorf("a task id the header does not name: %d %s", rec.Code, rec.Body.String())
	}
}

// server/discover declares the extension now that it is built.
func TestDiscoverDeclaresTasks(t *testing.T) {
	f := newTaskFixture(t)
	rec := taskCall(t, f.s, f.tok, `{}`, "server/discover", map[string]any{})
	if !strings.Contains(rec.Body.String(), `"extensions":{"io.modelcontextprotocol/tasks":{}}`) {
		t.Errorf("discover: %s", rec.Body.String())
	}
}
