package server

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"unicode"
)

// Skills over MCP (io.modelcontextprotocol/skills; spec 027, US4, plan D8).
//
// The agent skill GET /api/skill hands out as a zip is served here as well,
// file by file, so an agent loads nigari's how-to only when a task calls for
// it. Both doors draw on one generator (skill.go): the built-in skill
// "nigari" is the zip's playbook without its workspace part, and each
// workspace the credential may enter that has rules or database templates
// gets a skill of its own, "nigari-<name>", with those rules, those templates
// and the block to install.
//
// What a client sees depends on its credential (its workspaces, their rules,
// the templates it may read), so every answer is cached privately.
//
// The extension defines no client declaration: a client lists skills after
// it sees the server declare the extension in server/discover. So any
// 2026-07-28 client may call these methods. The legacy era never reaches
// them; the extension is written for 2026-07-28 and later.

const (
	mcpSkillsExtension = "io.modelcontextprotocol/skills"
	// mcpSkillTTLms is how long a client may keep a skill before asking
	// again: an admin's change to the rules reaches agents within it.
	mcpSkillTTLms = 300_000
	skillScheme   = "skill://"
)

// mcpSkill is one skill as MCP serves it: files relative to its root.
type mcpSkill struct {
	name, description string
	files             []skillDoc
}

func (sk mcpSkill) uri(path string) string { return skillScheme + sk.name + "/" + path }

// mcpSkills are the skills this credential is served, the built-in one
// first, then one per workspace in the order the zip lists them.
func (s *Server) mcpSkills(u *user, base string) []mcpSkill {
	out := []mcpSkill{{
		name:        "nigari",
		description: skillDescription,
		files: []skillDoc{
			{"SKILL.md", s.skillMain(base, nil, nil, true)},
			{"reference/tools.md", skillTools()},
			{"reference/block.md", skillBlock(base, nil)},
		},
	}}
	member := s.skillWorkspaces(u.ID)
	// Slugs are counted over every workspace of the account, not only the
	// ones this credential is served: two tokens of one person then never
	// get one name for two workspaces (code review).
	slugs := map[string]int{}
	for _, w := range member {
		slugs[skillSlug(w.Name)]++
	}
	for _, w := range member {
		// The gate the zip uses: membership (skillWorkspaces) and the
		// credential's own reach (FR-017). A workspace closed to agents, or
		// outside a token's list, has no skill here, listed or fetched.
		if !s.credentialMayEnter(u, w.ID) {
			continue
		}
		templates := s.skillTemplates(u.ID, w.ID)
		if strings.TrimSpace(w.Rules) == "" && len(templates) == 0 {
			continue
		}
		name := skillName(w, slugs)
		ws := w
		desc := workspaceSkillDescription(w.ID)
		out = append(out, mcpSkill{
			name:        name,
			description: desc,
			files: []skillDoc{
				{"SKILL.md", workspaceSkillMain(name, desc, ws, templates)},
				{"reference/block.md", skillBlock(base, &ws)},
			},
		})
	}
	return out
}

// skillName is a workspace skill's name under the Agent Skills naming rules:
// lowercase letters, digits and single hyphens, at most 64 characters, and
// equal to the last segment of its skill:// path. Two workspaces of the
// account with the same slug, or one whose name has no letter or digit, are
// told apart by the start of their id. slugs counts the account's slugs.
func skillName(w skillWorkspace, slugs map[string]int) string {
	slug := skillSlug(w.Name)
	id := w.ID
	if len(id) > 8 {
		id = id[:8]
	}
	if slug != "" && slugs[slug] == 1 && slug != "nigari" {
		return "nigari-" + slug
	}
	return strings.ReplaceAll(strings.Trim("nigari-"+slug+"-"+strings.ToLower(id), "-"), "--", "-")
}

// skillSlug is a name's ASCII letters and digits, lowercase, with single
// hyphens between runs, at most 40 characters.
func skillSlug(name string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(name) {
		if r < unicode.MaxASCII && (unicode.IsLetter(r) || unicode.IsDigit(r)) {
			b.WriteRune(r)
			dash = false
		} else if !dash && b.Len() > 0 {
			b.WriteByte('-')
			dash = true
		}
	}
	slug := strings.Trim(b.String(), "-")
	if len(slug) > 40 {
		slug = strings.Trim(slug[:40], "-")
	}
	return slug
}

// workspaceSkillDescription says what a workspace skill is for. It carries
// the workspace's id, not its name: a host shows descriptions to the model to
// choose a skill, outside any frame, and a name is whatever a person typed
// (code review). The name reaches the model inside SKILL.md's untrusted frame,
// and as letters and digits in the skill's own name.
func workspaceSkillDescription(id string) string {
	return "The rules and database templates of one nigari workspace (id " + id +
		"), named in this skill's name. Load it before working in that workspace."
}

// skillTemplate is one database template a workspace skill lists.
type skillTemplate struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	DatabaseID string `json:"database_id"`
	Database   string `json:"database"`
}

// skillTemplates are the database templates of a workspace this person may
// read. Drained before canRead runs (one writer connection).
func (s *Server) skillTemplates(userID, wsID string) []skillTemplate {
	// idx_pages_db_templates (step 7) answers the first three conditions. A
	// template's parent is not its database (addDatabaseTemplate), so a
	// trashed database leaves its templates live: the join drops them, as
	// listDatabaseTemplates' callers do with isLiveCollection (code review).
	// The database must be in the same workspace: a template left behind by a
	// database moved elsewhere (#1137) would otherwise name a database in a
	// workspace this credential may not enter (security review).
	rows, err := s.db.Query(`SELECT t.id, t.title, t.template_of, c.title
		FROM pages t JOIN pages c ON c.id = t.template_of AND c.trashed_at IS NULL AND c.workspace_id = t.workspace_id
		WHERE t.workspace_id = ? AND t.is_template = 1 AND t.template_of != '' AND t.trashed_at IS NULL
		ORDER BY c.title, t.title`, wsID)
	if err != nil {
		return nil
	}
	var all []skillTemplate
	for rows.Next() {
		var t skillTemplate
		if rows.Scan(&t.ID, &t.Title, &t.DatabaseID, &t.Database) == nil {
			all = append(all, t)
		}
	}
	rows.Close()
	out := []skillTemplate{}
	for _, t := range all {
		if s.canRead(userID, t.ID) && s.canRead(userID, t.DatabaseID) {
			out = append(out, t)
		}
	}
	return out
}

// workspaceSkillMain is a workspace skill's SKILL.md. The workspace's name and
// its templates' titles are people's text, so they travel inside the
// untrusted frame; the rules travel in the frame that says to follow them,
// because their admin wrote them for exactly that (wrapWorkspaceRules).
func workspaceSkillMain(name, description string, w skillWorkspace, templates []skillTemplate) string {
	var b strings.Builder
	quoted, _ := json.Marshal(description)
	fmt.Fprintf(&b, "---\nname: %s\ndescription: %s\n---\n\n", name, quoted)
	fmt.Fprintf(&b, "# A nigari workspace\n\nWorkspace id: `%s`. Load the `nigari` skill too: it says how to work with\nnigari at all; this one says what is particular to this workspace.\n\n", w.ID)
	named, _ := json.Marshal(map[string]any{"workspace": w.Name, "database_templates": templates})
	b.WriteString("## Its name and its database templates\n\n")
	b.WriteString(wrapUntrusted(string(named)))
	b.WriteString("\n\nStart a row from a template with `create_page` and its `template_id`.\n\n## Its rules\n")
	if rules := strings.TrimSpace(w.Rules); rules != "" {
		b.WriteString(wrapWorkspaceRules(rules))
		b.WriteString("\n\nThey change, and this skill is a snapshot: `get_workspace(workspace_id)` returns\nthe live ones and outranks this file.\n")
	} else {
		b.WriteString("\nNone are written yet. If you notice conventions while working here, offer to\ndraft some: `propose_workspace_rules` leaves a proposal for an admin to apply.\n")
	}
	b.WriteString("\n## Before you work here\n\nInstall the block in `reference/block.md` into the repository's `CLAUDE.md` or\n`AGENTS.md`, as the `nigari` skill explains.\n")
	return b.String()
}

// skillEntry is a skill as skills/list and skills/get describe it: where its
// SKILL.md is, its frontmatter, and every file with its digest and size,
// computed from the bytes resources/read serves.
func skillEntry(sk mcpSkill) map[string]any {
	files := make([]map[string]any, 0, len(sk.files))
	for _, f := range sk.files {
		sum := sha256.Sum256([]byte(f.body))
		files = append(files, map[string]any{
			"uri": sk.uri(f.name), "digest": "sha256:" + hex.EncodeToString(sum[:]), "size": len(f.body),
		})
	}
	return map[string]any{
		"uri":         sk.uri("SKILL.md"),
		"frontmatter": map[string]any{"name": sk.name, "description": sk.description},
		"resources":   files,
	}
}

// serveSkillMethod answers skills/list, skills/get, resources/list and
// resources/read.
func (s *Server) serveSkillMethod(w http.ResponseWriter, r *http.Request, u *user, req rpcRequest) {
	// The budget tools/call and tasks/* spend: every call rebuilds the
	// skills from the database (code review).
	if !s.mcpRate.allow(u.ID) {
		rpcErrorStatus(w, http.StatusTooManyRequests, req.ID, rpcInternalError, "rate limit exceeded: too many requests, slow down", nil)
		return
	}
	var p struct {
		URI string `json:"uri"`
	}
	json.Unmarshal(req.Params, &p)
	answer := func(res map[string]any) {
		res["ttlMs"] = mcpSkillTTLms
		// Per credential: the list and the files depend on its workspaces.
		res["cacheScope"] = "private"
		s.rpcResultModern(w, r, req.ID, res)
	}
	skills := s.mcpSkills(u, s.publicShareBase(r))
	switch req.Method {
	case "skills/list":
		entries := make([]map[string]any, 0, len(skills))
		for _, sk := range skills {
			entries = append(entries, skillEntry(sk))
		}
		answer(map[string]any{"skills": entries})
	case "skills/get":
		for _, sk := range skills {
			if p.URI == sk.uri("SKILL.md") {
				answer(map[string]any{"skill": skillEntry(sk)})
				return
			}
		}
		// A skill of a workspace this credential may not enter reads exactly
		// like one that does not exist.
		rpcErrorStatus(w, http.StatusOK, req.ID, rpcInvalidParams, "No skill is served at "+p.URI, nil)
	case "resources/list":
		// Declared because the extension requires the resources capability.
		// Skill files are found through skills/list, not here, and nigari
		// serves no other resource yet.
		answer(map[string]any{"resources": []any{}})
	case "resources/read":
		for _, sk := range skills {
			for _, f := range sk.files {
				if p.URI == sk.uri(f.name) {
					answer(map[string]any{"contents": []map[string]any{{
						"uri": p.URI, "mimeType": "text/markdown", "text": f.body,
					}}})
					return
				}
			}
		}
		rpcErrorStatus(w, http.StatusOK, req.ID, rpcInvalidParams, "No resource is served at "+p.URI, nil)
	}
}
