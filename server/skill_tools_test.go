package server

import (
	"regexp"
	"sort"
	"strings"
	"testing"
)

// The skill names tools in prose and tables. A tool renamed or removed in
// mcpTools would leave the skill telling every agent to call something that
// does not exist, which no reader notices until an agent fails at it (spec
// 027, FR-016; the wiki has had the same check, check-wiki.mjs).
//
// So every lowercase identifier the skill writes in backticks must be a tool,
// a parameter of some tool, or one of the few other words listed below. A
// word that is none of these is either a stale tool name or something the
// list has to learn, and the failure says which word.

// skillWordsNotTools are words the skill sets in code type that are neither
// tools nor parameters: argument values and protocol names.
var skillWordsNotTools = map[string]bool{
	"database": true, // the tools' word for a collection, explained as such
	"true":     true, // done: true
	"nigari":   true, // the built-in skill's own name, which a workspace skill points to
}

var skillCodeWord = regexp.MustCompile("`([a-z][a-z0-9_]*)(?:\\(|`)")

func mcpToolsAndParams() (tools, params map[string]bool) {
	tools, params = map[string]bool{}, map[string]bool{}
	for _, t := range mcpTools {
		name, _ := t["name"].(string)
		tools[name] = true
		schema, _ := t["inputSchema"].(map[string]any)
		props, _ := schema["properties"].(map[string]any)
		for p := range props {
			params[p] = true
		}
	}
	return tools, params
}

func TestSkillNamesOnlyToolsThatExist(t *testing.T) {
	s := testServer(t)
	uid, _ := signedIn(t, s, "skill-words@example.test")
	ws := s.firstWorkspaceOf(t, uid)
	s.db.Exec(`UPDATE workspaces SET rules = 'Use the board.' WHERE id = ?`, ws)
	u := &user{ID: uid}
	tools, params := mcpToolsAndParams()

	var texts []string
	for _, d := range s.buildSkill(u, "https://nigari.example", ws) {
		texts = append(texts, d.body)
	}
	for _, sk := range s.mcpSkills(u, "https://nigari.example") {
		for _, f := range sk.files {
			texts = append(texts, f.body)
		}
	}
	seen := map[string]bool{}
	var unknown []string
	for _, text := range texts {
		for _, m := range skillCodeWord.FindAllStringSubmatch(text, -1) {
			w := m[1]
			seen[w] = true
			if !tools[w] && !params[w] && !skillWordsNotTools[w] {
				unknown = append(unknown, w)
			}
		}
	}
	if len(unknown) > 0 {
		sort.Strings(unknown)
		t.Errorf("the skill names %s, which is no tool, no tool parameter and not in skillWordsNotTools", strings.Join(unknown, ", "))
	}
	// The check reads what it should: the core tools are in the text.
	for _, must := range []string{"get_workspace", "working_on", "note", "search"} {
		if !seen[must] {
			t.Errorf("the skill text no longer names %q, or the pattern no longer finds it", must)
		}
	}
}
