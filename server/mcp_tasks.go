package server

import (
	"encoding/json"
	"errors"
	"net/http"
)

// The MCP Tasks extension (io.modelcontextprotocol/tasks, 2026-07-28; spec
// 027, US3).
//
// A client that declares the extension on a request may get a task instead
// of a tool result, and then polls tasks/get until the task ends. The server
// decides which calls become tasks: here, import_url, whose work already ran
// in the background behind a job id. The task IS the import's stored row
// (tasks.go), so tasks/get and the legacy get_import_status read one truth.
//
// A client that did not declare the extension gets exactly today's answers:
// import_url's job_id and get_import_status (FR-014). The extension forbids
// sending it a task, and the tasks/* methods refuse it.

const (
	mcpTasksExtension = "io.modelcontextprotocol/tasks"
	// rpcMissingClientCapability is the revision's code for a request that
	// needs a capability the client did not declare on it.
	rpcMissingClientCapability = -32021
	rpcInternalError           = -32603
)

// mcpDeclaresExtension reports whether this request's client capabilities
// name an extension. Read from each request, never remembered (the revision
// forbids inferring capabilities from earlier requests).
func mcpDeclaresExtension(modern *mcpModernRequest, name string) bool {
	if modern == nil {
		return false
	}
	var caps struct {
		Extensions map[string]json.RawMessage `json:"extensions"`
	}
	json.Unmarshal(modern.Capabilities, &caps)
	_, ok := caps.Extensions[name]
	return ok
}

// taskFields is a task as the extension describes one: its id, its state and
// how often to look again.
func taskFields(t storedTask) map[string]any {
	out := map[string]any{
		"taskId":         t.ID,
		"status":         t.Status,
		"createdAt":      t.Created,
		"lastUpdatedAt":  t.Updated,
		"ttlMs":          taskKeep.Milliseconds(),
		"pollIntervalMs": taskPollMs,
	}
	if t.StatusMessage != "" {
		out["statusMessage"] = t.StatusMessage
	}
	return out
}

// importTaskResult answers import_url with a task for a client that declared
// the extension. out is mcpCall's own answer, which names the job; the task
// is read back from its row, so the handle is one tasks/get resolves. An
// idempotent retry gets the same job, and so the same task.
func (s *Server) importTaskResult(u *user, out string) (map[string]any, bool) {
	var started struct {
		JobID string `json:"job_id"`
	}
	if json.Unmarshal([]byte(out), &started) != nil || started.JobID == "" {
		return nil, false
	}
	t, err := s.taskFor(u, started.JobID)
	if err != nil {
		return nil, false
	}
	res := taskFields(t)
	res["resultType"] = "task"
	return res, true
}

// serveTaskMethod answers tasks/get, tasks/update and tasks/cancel.
func (s *Server) serveTaskMethod(w http.ResponseWriter, r *http.Request, u *user, req rpcRequest, modern *mcpModernRequest) {
	if !mcpDeclaresExtension(modern, mcpTasksExtension) {
		rpcErrorStatus(w, http.StatusBadRequest, req.ID, rpcMissingClientCapability,
			"this method needs the "+mcpTasksExtension+" extension, which the request does not declare",
			map[string]any{"requiredCapabilities": map[string]any{"extensions": map[string]any{mcpTasksExtension: map[string]any{}}}})
		return
	}
	var p struct {
		TaskID         string                     `json:"taskId"`
		InputResponses map[string]json.RawMessage `json:"inputResponses"`
	}
	if json.Unmarshal(req.Params, &p) != nil || p.TaskID == "" {
		rpcErrorStatus(w, http.StatusBadRequest, req.ID, rpcInvalidParams, "taskId is required", nil)
		return
	}
	// The same budget tools/call spends: each of these reads the one writer
	// connection, and a client that ignores pollIntervalMs must not crowd
	// out the import it is polling (code review).
	if !s.mcpRate.allow(u.ID) {
		rpcErrorStatus(w, http.StatusTooManyRequests, req.ID, rpcInternalError, "rate limit exceeded: too many requests, slow down", nil)
		return
	}
	// Unknown, expired and another credential's task get the same answer.
	notFound := func() {
		rpcErrorStatus(w, http.StatusOK, req.ID, rpcInvalidParams, "Failed to retrieve task: Task not found", nil)
	}
	answer := func(res map[string]any) {
		res["resultType"] = "complete"
		res["_meta"] = map[string]any{mcpMetaServerInfo: s.mcpServerInfo(r, false)}
		rpcResult(w, req.ID, res)
	}
	switch req.Method {
	case "tasks/get":
		t, err := s.taskFor(u, p.TaskID)
		if errors.Is(err, errTaskNotFound) {
			notFound()
			return
		}
		if err != nil {
			rpcErrorStatus(w, http.StatusInternalServerError, req.ID, rpcInternalError, err.Error(), nil)
			return
		}
		res := taskFields(t)
		switch t.Status {
		case taskCompleted:
			// The final result inline, as the tool would have answered had it
			// waited: the import's record, counts and errors included.
			j, err := s.importJob(u, t.ID)
			if err != nil {
				notFound()
				return
			}
			res["result"] = textResult(importJobText(j), false)
		case taskFailed:
			res["error"] = map[string]any{"code": rpcInternalError, "message": t.Error}
		}
		answer(res)
	case "tasks/update":
		if _, err := s.taskFor(u, p.TaskID); err != nil {
			notFound()
			return
		}
		// An import asks nothing of its client, so no answer can match an
		// outstanding request.
		if len(p.InputResponses) > 0 {
			rpcErrorStatus(w, http.StatusOK, req.ID, rpcInvalidParams, "this task has no outstanding input request", nil)
			return
		}
		answer(map[string]any{})
	case "tasks/cancel":
		// A cancel stops an import: a write, which a read-only credential
		// may not make (mcpCall's own rule for tools).
		if u.TokenScope == "read" {
			s.insufficientScope(w, r, "this API token is read-only; cancelling a task requires a write token")
			return
		}
		stopped, err := s.cancelTask(u, p.TaskID)
		if err != nil {
			notFound()
			return
		}
		if stopped {
			// In the activity log beside the import it stops, as an agent's.
			s.audit("agent", u.ID, u.Name+" (MCP)", "mcp.tasks_cancel", "", "", p.TaskID)
		}
		answer(map[string]any{})
	}
}

// mcpCallName is the tool a tools/call names.
func mcpCallName(raw json.RawMessage) string {
	var p struct {
		Name string `json:"name"`
	}
	json.Unmarshal(raw, &p)
	return p.Name
}

// mcpResultText is the text of a successful textResult.
func mcpResultText(result map[string]any) (string, bool) {
	if isErr, _ := result["isError"].(bool); isErr {
		return "", false
	}
	content, _ := result["content"].([]map[string]any)
	if len(content) != 1 {
		return "", false
	}
	text, ok := content[0]["text"].(string)
	return text, ok
}

// importJobText is an import's record as an agent reads it. Its errors quote
// the titles of the source's records, text from outside that nobody here
// wrote, so the record is framed as untrusted (.claude/rules/mcp.md). It was
// returned bare before phase D, by get_import_status (code review).
func importJobText(j ingestJob) string {
	b, _ := json.Marshal(j)
	if len(j.Errors) == 0 {
		return string(b)
	}
	return wrapUntrusted(string(b))
}
