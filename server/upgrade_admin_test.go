package server

import (
	"database/sql"
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

// Spec 008, US7: the admin's maintenance view reads the upgrade state from
// GET /api/admin/info (contracts/rest.md). A new instance is at the newest
// step, step 1 ran a moment ago, and there is no copy: a new file is not an
// upgrade. The gate is the route's own (admins only), so a member is refused.
func TestAdminInfoShowsUpgradeState(t *testing.T) {
	s := testServer(t)
	_, admin := signedIn(t, s, "admin@example.test")
	_, member := signedIn(t, s, "member@example.test")

	get := func(cookie string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/api/admin/info", nil)
		req.Header.Set("Cookie", cookie)
		s.ServeHTTP(rec, req)
		return rec
	}
	if rec := get(member); rec.Code != 403 {
		t.Fatalf("a member got %d from admin/info, want 403", rec.Code)
	}
	rec := get(admin)
	if rec.Code != 200 {
		t.Fatalf("admin/info: %d %s", rec.Code, rec.Body)
	}
	var info struct {
		Upgrade struct {
			Step   int64         `json:"step"`
			Newest int64         `json:"newest"`
			LastAt string        `json:"lastAt"`
			Copies []upgradeCopy `json:"copies"`
		} `json:"upgrade"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &info); err != nil {
		t.Fatal(err)
	}
	u := info.Upgrade
	if u.Step != NewestStep() || u.Newest != NewestStep() {
		t.Fatalf("step %d, newest %d; want both %d", u.Step, u.Newest, NewestStep())
	}
	at, err := time.Parse(time.RFC3339, u.LastAt)
	if err != nil || time.Since(at) > time.Minute || time.Since(at) < -time.Minute {
		t.Fatalf("lastAt %q is not the start a moment ago (%v)", u.LastAt, err)
	}
	if u.Copies == nil || len(u.Copies) != 0 {
		t.Fatalf("copies %v, want an empty list (not null) for a new instance", u.Copies)
	}
}

// Copies are listed newest first and at most keepCopies of them, as the
// pruning leaves them, each with its size and time. Four upgrades take four
// copies; the oldest is pruned and the view shows the other three.
func TestUpgradeStateListsCopiesNewestFirst(t *testing.T) {
	path := copyFixture(t, "step-0.db")
	for _, steps := range [][]int64{nil, {2}, {2, 3}, {2, 3, 4}} {
		if _, err := upgradeWith(path, testSteps(steps...)); err != nil {
			t.Fatal(err)
		}
	}
	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	u := upgradeState(db, path)
	if u["step"] != int64(4) || u["lastAt"] == "" {
		t.Fatalf("step %v lastAt %v, want 4 and a time", u["step"], u["lastAt"])
	}
	copies := u["copies"].([]upgradeCopy)
	var names []string
	for _, c := range copies {
		names = append(names, c.Name)
		if c.Size == 0 || c.TakenAt == "" {
			t.Fatalf("copy %+v has no size or time", c)
		}
	}
	base := filepath.Base(path)
	want := []string{base + ".before-step-4", base + ".before-step-3", base + ".before-step-2"}
	if len(names) != 3 || names[0] != want[0] || names[1] != want[1] || names[2] != want[2] {
		t.Fatalf("copies %v, want %v", names, want)
	}
}
