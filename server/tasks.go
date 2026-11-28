package server

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// Stored tasks (spec 027, US3, plan D6).
//
// Long work an agent starts, an import today, is a row in mcp_tasks from the
// moment it is accepted until 24 hours after it ends. The row is the one
// truth for both eras: get_import_status (the legacy tool) and tasks/get (the
// MCP Tasks extension, mcp_tasks.go) read it, and the runner writes its
// progress into it. Before, the progress lived in a map in memory that kept
// the last 20 jobs, so a restart lost every one of them and a busy instance
// lost the oldest while they were still being polled.

const (
	taskWorking   = "working"
	taskCompleted = "completed"
	taskFailed    = "failed"
	taskCancelled = "cancelled"

	// taskKeep is how long an ended task stays readable.
	taskKeep = 24 * time.Hour
	// taskPollMs is the poll interval suggested to a client. An import
	// writes hundreds of records a second, so a client that polls faster
	// learns nothing new.
	taskPollMs = 2000

	taskInterrupted = "interrupted by a restart"
	taskRevoked     = "stopped: the credential that started it was revoked, can no longer write there, or its account was deactivated"
)

// errTaskNotFound is the answer for a task id that does not exist, has
// expired or belongs to another credential: one answer for all three, so a
// task id says nothing about whose it is.
var errTaskNotFound = errors.New("task not found")

// taskOwner is the credential a task belongs to: the account, the kind of
// credential and the API token or OAuth grant itself (tokenID). Another
// person, or another token of the same person, is another owner. A browser
// session has no token; its tasks are the account's.
//
// The plan (D6) keyed ownership on the token's workspace list, as the
// idempotency cache does. A snapshot of the list fails both ways: a token an
// admin narrowed mid-import could no longer see or cancel its own task, and
// two tokens alike in reach could read each other's (code review, spec 027
// phase D). workspaces is kept with the row as a record of the reach the
// task started with.
type taskOwner struct {
	userID, kind, tokenID, workspaces string
}

func taskOwnerOf(u *user) taskOwner {
	return taskOwner{userID: u.ID, kind: u.TokenKind, tokenID: u.TokenID,
		workspaces: strings.Join(u.TokenWorkspaces, ",")}
}

// storedTask is one row of mcp_tasks as the protocol layers read it.
type storedTask struct {
	ID, Kind, Status, StatusMessage, Error string
	Progress                               json.RawMessage
	Created, Updated, Expires              string
}

// createTask stores a new working task and returns once it is stored: the
// Tasks extension forbids sending a handle that tasks/get cannot resolve yet.
// Expired rows go first, so the table is pruned whenever it grows.
func (s *Server) createTask(o taskOwner, id, kind, message string, progress any) error {
	s.deleteExpiredTasks()
	b, err := json.Marshal(progress)
	if err != nil {
		return err
	}
	ts := now()
	_, err = s.db.Exec(`INSERT INTO mcp_tasks
		(id, user_id, token_kind, token_id, token_workspaces, kind, status, status_message, progress, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, o.userID, o.kind, o.tokenID, o.workspaces, kind, taskWorking, message, string(b), ts, ts)
	return err
}

// taskFor reads a task for the credential that asks. Somebody else's task,
// and one past its expiry that the cleanup has not removed yet, read as not
// found.
func (s *Server) taskFor(u *user, id string) (storedTask, error) {
	o := taskOwnerOf(u)
	var t storedTask
	var progress string
	err := s.db.QueryRow(`SELECT id, kind, status, status_message, error, progress, created_at, updated_at, expires_at
		FROM mcp_tasks WHERE id = ? AND user_id = ? AND token_kind = ? AND token_id = ?`,
		id, o.userID, o.kind, o.tokenID).
		Scan(&t.ID, &t.Kind, &t.Status, &t.StatusMessage, &t.Error, &progress, &t.Created, &t.Updated, &t.Expires)
	if err == sql.ErrNoRows {
		return storedTask{}, errTaskNotFound
	}
	if err != nil {
		return storedTask{}, err
	}
	if t.Expires != "" && t.Expires < now() {
		return storedTask{}, errTaskNotFound
	}
	t.Progress = json.RawMessage(progress)
	return t, nil
}

// progressTask writes a running task's progress. working is false when the
// task is no longer working (cancelled): the runner stops at that record. A
// write that failed is an error, not a cancel; the runner carries on and
// the next record's write brings the row up to date (code review: a busy
// database once read as a cancel nobody asked for).
func (s *Server) progressTask(id, message string, progress any) (working bool, err error) {
	b, err := json.Marshal(progress)
	if err != nil {
		return true, err
	}
	res, err := s.db.Exec(`UPDATE mcp_tasks SET status_message = ?, progress = ?, updated_at = ?
		WHERE id = ? AND status = ?`, message, string(b), now(), id, taskWorking)
	if err != nil {
		return true, err
	}
	n, err := res.RowsAffected()
	return err != nil || n == 1, err
}

// endTask moves a working task to its end state. A task already ended (a
// cancel that came first) keeps the state it reached, as the extension says
// a terminal state does not change; its progress is still brought up to date
// so the count of records written is right.
//
// One exception: an import that wrote every record completes even when a
// cancel arrived after its last record. Reported as cancelled it carried no
// result, and a client that took it for unfinished would import it again,
// twice over (code review).
func (s *Server) endTask(id, status, message, errMsg string, progress any) {
	b, _ := json.Marshal(progress)
	ts := now()
	expires := time.Now().UTC().Add(taskKeep).Format(time.RFC3339Nano)
	from := []any{taskWorking, taskWorking}
	if status == taskCompleted {
		from = []any{taskWorking, taskCancelled}
	}
	res, err := s.db.Exec(`UPDATE mcp_tasks SET status = ?, status_message = ?, error = ?, progress = ?, updated_at = ?, expires_at = ?
		WHERE id = ? AND status IN (?, ?)`, append([]any{status, message, errMsg, string(b), ts, expires, id}, from...)...)
	if err == nil {
		if n, _ := res.RowsAffected(); n == 0 {
			s.db.Exec(`UPDATE mcp_tasks SET progress = ?, updated_at = ? WHERE id = ?`, string(b), ts, id)
		}
	}
}

// cancelTask asks a task of this credential to stop. The runner sees it at
// its next record. Cancelling a task that has already ended changes nothing
// and is not an error (the extension: cancellation is cooperative); stopped
// reports whether this call stopped it.
func (s *Server) cancelTask(u *user, id string) (stopped bool, err error) {
	if _, err := s.taskFor(u, id); err != nil {
		return false, err
	}
	expires := time.Now().UTC().Add(taskKeep).Format(time.RFC3339Nano)
	res, err := s.db.Exec(`UPDATE mcp_tasks SET status = ?, status_message = ?, updated_at = ?, expires_at = ?
		WHERE id = ? AND status = ?`, taskCancelled, "cancelled; records already written stay", now(), expires, id, taskWorking)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

// failInterruptedTasks is part of the start-up pass. Nothing runs a task
// across a restart, so a row still working was cut off: it reads as failed
// with the reason, instead of as running forever.
func (s *Server) failInterruptedTasks() {
	expires := time.Now().UTC().Add(taskKeep).Format(time.RFC3339Nano)
	s.db.Exec(`UPDATE mcp_tasks SET status = ?, status_message = ?, error = ?, updated_at = ?, expires_at = ?
		WHERE status = ?`, taskFailed, taskInterrupted, taskInterrupted, now(), expires, taskWorking)
}

// deleteExpiredTasks removes ended tasks past their expiry: at start-up, in
// the cleanup pass and whenever a task is created.
func (s *Server) deleteExpiredTasks() {
	s.db.Exec(`DELETE FROM mcp_tasks WHERE status IN (?, ?, ?) AND expires_at < ?`,
		taskCompleted, taskFailed, taskCancelled, now())
}

// credentialNow is the credential that started a task as it stands now: its
// account, and its API token's or OAuth grant's current scope and workspace
// list, built by the functions currentUser uses. nil when the token or grant
// is gone or the account is deactivated. A browser session has no token to
// revoke; its account is what is checked.
func (s *Server) credentialNow(o taskOwner) *user {
	var u *user
	switch o.kind {
	case tokenKindAPI:
		var userID, scope, wsScope string
		if s.db.QueryRow(`SELECT user_id, scope, workspace_scope FROM api_tokens WHERE id = ?`, o.tokenID).
			Scan(&userID, &scope, &wsScope) != nil {
			return nil
		}
		u = s.apiTokenUser(o.tokenID, userID, scope, wsScope)
	case tokenKindOAuth:
		var userID, scope, workspaces string
		if s.db.QueryRow(`SELECT user_id, scope, workspaces FROM oauth_grants WHERE id = ?`, o.tokenID).
			Scan(&userID, &scope, &workspaces) != nil {
			return nil
		}
		u = s.grantUser(o.tokenID, userID, scope, workspaces)
	default:
		u = s.userByID(o.userID)
	}
	if u == nil || u.ID != o.userID || u.Disabled {
		return nil
	}
	return u
}

// mayStillWrite reports whether the credential that started a task may still
// write into a workspace: it exists, it is not read-only, and it may still
// enter the workspace (its own list and the workspace's rule for agents). An
// admin who narrows a token, or closes a workspace to agents, stops an
// import running into it, not only one started afterwards.
//
// The owner is read from the task's row, not remembered by the runner: an
// OAuth refresh moves the row to the new grant (oauthRefresh), and a runner
// holding the old grant's id took the refresh for a revoke (code review).
func (s *Server) mayStillWrite(taskID, workspaceID string) bool {
	var o taskOwner
	if s.db.QueryRow(`SELECT user_id, token_kind, token_id FROM mcp_tasks WHERE id = ?`, taskID).
		Scan(&o.userID, &o.kind, &o.tokenID) != nil {
		return false
	}
	u := s.credentialNow(o)
	return u != nil && u.TokenScope != "read" && s.credentialMayEnter(u, workspaceID)
}
