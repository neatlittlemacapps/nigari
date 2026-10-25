package server

import (
	"strings"
	"testing"
)

// The "Full width" switch is a page prop, so the same request that saves any
// other property saves it, and a shared page honours it for readers.
func TestFullWidthPageIsHonouredOnPublicPage(t *testing.T) {
	s, token, _ := shareFixture(t)
	base := "/public/" + token

	if body := publicRequest(s, "GET", base, "", nil).Body.String(); strings.Contains(body, `class="public-doc public-wide"`) {
		t.Fatal("a page nobody widened is rendered wide")
	}

	s.db.Exec(`UPDATE pages SET props='{"_fullWidth":true}' WHERE id='shared-page'`)
	body := publicRequest(s, "GET", base, "", nil).Body.String()
	if !strings.Contains(body, `<main class="public-doc public-wide"`) {
		t.Fatal("full width page is not wide on its public link")
	}

	s.db.Exec(`UPDATE pages SET props='{"_fullWidth":false}' WHERE id='shared-page'`)
	if body := publicRequest(s, "GET", base, "", nil).Body.String(); strings.Contains(body, `<main class="public-doc public-wide"`) {
		t.Fatal("switching it back left the page wide")
	}
}

func TestPageIsFullWidth(t *testing.T) {
	for raw, want := range map[string]bool{
		``: false, `{}`: false, `not json`: false,
		`{"_fullWidth":true}`: true, `{"_fullWidth":false}`: false,
		`{"_fullWidth":"true"}`: false, `{"p1":"x","_fullWidth":true}`: true,
	} {
		if got := pageIsFullWidth([]byte(raw)); got != want {
			t.Errorf("%q: got %v want %v", raw, got, want)
		}
	}
}
