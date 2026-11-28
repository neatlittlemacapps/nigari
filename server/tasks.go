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
	taskRevoked     = "stopped: the credential that started it was revoked or its account deactivated"
)

// errTaskNotFound is the answer for a task id that does not exist, has
// expired or belongs to another credential: one answer for all three, so a
// task id says nothing about whose it is.
var errTaskNotFound = errors.New("task not found")

// taskOwner is the credential a task belongs to. The fields are the ones the
// gates read, and the ones the idempotency cache keys on (mcpCall): another
// person, or a narrower token of the same person, is another owner.
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
		FROM mcp_tasks WHERE id = ? AND user_id = ? AND token_kind = ? AND token_workspaces = ?`,
		id, o.userID, o.kind, o.workspaces).
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

// progressTask writes a running task's progress. It reports false when the
// task is no longer working (cancelled, or failed by the start-up pass of
// another process on the same file): the runner stops at that record.
func (s *Server) progressTask(id, message string, progress any) bool {
	b, err := json.Marshal(progress)
	if err != nil {
		return false
	}
	res, err := s.db.Exec(`UPDATE mcp_tasks SET status_message = ?, progress = ?, updated_at = ?
		WHERE id = ? AND status = ?`, message, string(b), now(), id, taskWorking)
	if err != nil {
		return false
	}
	n, _ := res.RowsAffected()
	return n == 1
}

// endTask moves a working task to its end state. A task already ended (a
// cancel that came first) keeps the state it reached, as the extension says
// a terminal state does not change; its progress is still brought up to date
// so the count of records written is right.
func (s *Server) endTask(id, status, message, errMsg string, progress any) {
	b, _ := json.Marshal(progress)
	ts := now()
	expires := time.Now().UTC().Add(taskKeep).Format(time.RFC3339Nano)
	res, err := s.db.Exec(`UPDATE mcp_tasks SET status = ?, status_message = ?, error = ?, progress = ?, updated_at = ?, expires_at = ?
		WHERE id = ? AND status = ?`, status, message, errMsg, string(b), ts, expires, id, taskWorking)
	if err == nil {
		if n, _ := res.RowsAffected(); n == 0 {
			s.db.Exec(`UPDATE mcp_tasks SET progress = ?, updated_at = ? WHERE id = ?`, string(b), ts, id)
		}
	}
}

// cancelTask asks a task of this credential to stop. The runner sees it at
// its next record. Cancelling a task that has already ended changes nothing
// and is not an error (the extension: cancellation is cooperative).
func (s *Server) cancelTask(u *user, id string) error {
	if _, err := s.taskFor(u, id); err != nil {
		return err
	}
	expires := time.Now().UTC().Add(taskKeep).Format(time.RFC3339Nano)
	_, err := s.db.Exec(`UPDATE mcp_tasks SET status = ?, status_message = ?, updated_at = ?, expires_at = ?
		WHERE id = ? AND status = ?`, taskCancelled, "cancelled; records already written stay", now(), expires, id, taskWorking)
	return err
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

// credentialAlive reports whether the credential that started a task may
// still act: the account is not deactivated, and its API token or OAuth grant
// still exists. A browser session has no token to revoke; its account is
// what is checked.
func (s *Server) credentialAlive(o taskOwner) bool {
	var disabled int
	if s.db.QueryRow(`SELECT disabled FROM users WHERE id = ?`, o.userID).Scan(&disabled) != nil || disabled != 0 {
		return false
	}
	var one int
	switch o.kind {
	case tokenKindAPI:
		return s.db.QueryRow(`SELECT 1 FROM api_tokens WHERE id = ? AND user_id = ?`, o.tokenID, o.userID).Scan(&one) == nil
	case tokenKindOAuth:
		return s.db.QueryRow(`SELECT 1 FROM oauth_grants WHERE id = ? AND user_id = ?`, o.tokenID, o.userID).Scan(&one) == nil
	}
	return true
}
