package server

import (
	"context"
	"errors"
	"time"
)

// readLimit bounds an analytical read: a database's rows (REST and MCP
// query_rows) and the rollups and backrelations computed for them. A var, not
// a const, only so a test can shorten it.
//
// Why a limit at all: these reads used to share the writer's one connection,
// so a read that ran for a minute stopped every request behind it — the
// editor's saves, the sidebar, every agent. They now run on the read pool
// (openReadDB, #82), so writes no longer wait for them, but the pool is small:
// a few runaway reads would still block every other chart and table. Five
// seconds is far above anything the storage budgets allow (spec 002,
// research P3), so a read that hits it is broken or far too broad, and the
// caller is better served by "narrow it" than by a spinner.
//
// Writes are not bounded here: busy_timeout(5000) already covers them, and a
// write cut off halfway would be worse than a slow one.
var readLimit = 5 * time.Second

// errQueryTimeout is what a read that hit readLimit returns. Its text is the
// sentence both REST (503 query_timeout) and MCP (a tool error) show, so an
// agent and a person read the same advice (contracts/limits.md).
var errQueryTimeout = errors.New("The query took longer than 5 seconds and was stopped. Narrow the filter or ask for fewer rows.")

// withReadLimit derives the deadline for one analytical read from the
// request's own context, so a client that hangs up also stops its query.
func withReadLimit(parent context.Context) (context.Context, context.CancelFunc) {
	if parent == nil {
		parent = context.Background()
	}
	return context.WithTimeout(parent, readLimit)
}

// readErr turns a failure under a read deadline into errQueryTimeout when the
// deadline is what caused it. The driver reports an interrupted statement as
// its own error ("interrupted"), not as context.DeadlineExceeded, so the
// context is asked, not the error.
func readErr(ctx context.Context, err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return errQueryTimeout
	}
	return err
}
