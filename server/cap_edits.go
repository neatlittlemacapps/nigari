package server

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// Find-and-replace edits (#13, specs/003-find-replace-edits).
//
// An agent fixing one sentence used to have two choices: rewrite the whole body
// (write_content mode replace), retyping everything it did not mean to change,
// or not fix it. An edit names the passage as the agent read it and the
// passage it should become, and only that changes.
//
// The quote is matched against the page's Markdown — the text get_page returns,
// from the same renderer (renderBlocksMarked) — because that is what the agent
// saw. Only the top-level blocks the match touches are converted back from
// Markdown; every other block keeps its stored JSON byte for byte. Converting
// the whole page would lose what Markdown cannot carry (block ids, which
// comments hang on; colours; column layouts) on every one-word fix.
//
// Anything the server would have to guess is refused, with nothing written: a
// quote that matches twice, or not at all; an edit that touches a block
// Markdown cannot carry; an edit that would silently drop a page mention.
// A find-and-replace that guesses is worse than a full rewrite.
//
// REST (POST /api/pages/{id}/edits) and MCP (write_content mode edit) both call
// editPageContent. The gates stay where every write keeps them: canWriteReq and
// the read-scope refusal in auth for REST, mcpCall's write gates for MCP.

const maxEditsPerRequest = 100

// editBeforeWrite, when set, runs between an edit's read and its write. Tests
// use it to land a concurrent write in exactly that gap; nothing else sets it.
var editBeforeWrite func(pageID string)

type pageEdit struct {
	Old string `json:"old"`
	New string `json:"new"`
	All bool   `json:"all"`
}

type editRequest struct {
	Edits         []pageEdit `json:"edits"`
	AllowRemovals bool       `json:"allowRemovals"`
}

// editError is a refusal. Nothing has been written when one comes back.
type editError struct {
	status  int
	code    string
	msg     string
	edit    int // 0-based index of the failing edit, -1 for the request as a whole
	matches int
	removed []string
	block   string
}

func (e *editError) Error() string { return e.msg }

func (e *editError) data() map[string]any {
	d := map[string]any{}
	if e.edit >= 0 {
		d["edit"] = e.edit
	}
	switch e.code {
	case "edit_no_match", "edit_ambiguous":
		d["matches"] = e.matches
	case "edit_removes_link":
		d["removed"] = e.removed
	case "edit_unsupported_block":
		d["blockType"] = e.block
	}
	return d
}

// quoteForMessage keeps refusals short: an answer that echoes a long quote
// back would carry page text out in an error, unwrapped.
func quoteForMessage(s string) string {
	r := []rune(s)
	if len(r) > 80 {
		return string(r[:80]) + "…"
	}
	return s
}

// editPageContent applies the edits in order, each to the result of the one
// before, and writes them all or none. It returns the number of replacements
// per edit.
func (s *Server) editPageContent(u *user, pageID string, req editRequest) ([]int, error) {
	if len(req.Edits) == 0 {
		return nil, &editError{status: 400, code: "edit_empty", edit: -1, msg: "no edits given: pass at least one {old, new}"}
	}
	if len(req.Edits) > maxEditsPerRequest {
		return nil, &editError{status: 400, code: "edit_too_many", edit: -1,
			msg: fmt.Sprintf("too many edits: %d in one request, at most %d", len(req.Edits), maxEditsPerRequest)}
	}
	for i, e := range req.Edits {
		if e.Old == "" {
			return nil, &editError{status: 400, code: "edit_empty_quote", edit: i,
				msg: fmt.Sprintf("edit %d has an empty quote: name the text to replace", i+1)}
		}
	}

	var content, updatedAt string
	var gen int64
	var trashed sql.NullString
	err := s.db.QueryRow(`SELECT content, updated_at, doc_gen, trashed_at FROM pages WHERE id = ?`, pageID).
		Scan(&content, &updatedAt, &gen, &trashed)
	if err == sql.ErrNoRows {
		return nil, &editError{status: 404, code: "", edit: -1, msg: "page not found"}
	}
	if err != nil {
		return nil, err
	}
	if trashed.Valid {
		return nil, &editError{status: 409, code: "", edit: -1, msg: "page is in the trash"}
	}

	var blocks []json.RawMessage
	if strings.TrimSpace(content) != "" {
		if err := json.Unmarshal([]byte(content), &blocks); err != nil {
			return nil, fmt.Errorf("page content is not a block list: %w", err)
		}
	}

	counts := make([]int, len(req.Edits))
	for i, e := range req.Edits {
		next, n, err := applyEdit(blocks, e, i, req.AllowRemovals)
		if err != nil {
			s.nameRemovals(u, err)
			return nil, err
		}
		blocks, counts[i] = next, n
	}
	if editBeforeWrite != nil {
		editBeforeWrite(pageID)
	}

	// The state before the edit goes into the history, whatever the throttle
	// says — two edits a minute apart must not leave the one between them in no
	// revision.
	s.snapshotRevisionNow(pageID, u.ID, u.Name)

	// Written only if nothing else wrote in between: the generation catches an
	// outside write, updated_at an editor's autosave. A quote applied to text
	// the caller never read is the guess this feature exists to avoid.
	res, err := s.db.Exec(`UPDATE pages SET content = ?, updated_at = ?, `+bumpDocGen+`
		WHERE id = ? AND doc_gen = ? AND updated_at = ? AND trashed_at IS NULL`,
		joinBlocks(blocks), now(), pageID, gen, updatedAt)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, &editError{status: 409, code: "edit_stale", edit: -1,
			msg: "the page changed while the edit was being applied: read it again and resend the edit"}
	}
	s.resetYjsDoc(pageID)
	s.reindexPage(pageID)
	s.pagesChanged()
	s.fireWebhook("page.updated", pageID)
	return counts, nil
}

// nameRemovals puts titles into a removal refusal, for the pages the caller may
// read; the rest stay bare ids. applyEdit has no database, so this happens here.
func (s *Server) nameRemovals(u *user, err error) {
	ee, ok := err.(*editError)
	if !ok || ee.code != "edit_removes_link" {
		return
	}
	names := make([]string, len(ee.removed))
	for i, ref := range ee.removed {
		names[i] = ref
		id := strings.TrimPrefix(ref, "/p/")
		var title string
		if s.canRead(u.ID, id) && s.credentialMayEnter(u, s.pageWorkspace(id)) &&
			s.db.QueryRow(`SELECT title FROM pages WHERE id = ?`, id).Scan(&title) == nil && title != "" {
			names[i] = fmt.Sprintf("%q (%s)", title, ref)
		}
	}
	ee.msg = fmt.Sprintf("edit %d would remove a link to %s. If that is intended, resend with allow_removals", ee.edit+1, strings.Join(names, ", "))
}

// joinBlocks writes the block list without re-encoding the blocks: untouched
// blocks go out exactly as they were stored. json.Marshal of RawMessages would
// compact them, which is a change to blocks nobody edited.
func joinBlocks(blocks []json.RawMessage) string {
	var b strings.Builder
	b.WriteByte('[')
	for i, raw := range blocks {
		if i > 0 {
			b.WriteByte(',')
		}
		b.Write(raw)
	}
	b.WriteByte(']')
	return b.String()
}

type blockSpan struct{ start, end int }

// renderWithSpans renders the blocks as get_page does and returns where each
// top-level block's text starts and ends.
func renderWithSpans(blocks []json.RawMessage) (string, []blockSpan, []mdBlock) {
	parsed := make([]mdBlock, len(blocks))
	for i, raw := range blocks {
		json.Unmarshal(raw, &parsed[i])
	}
	var b strings.Builder
	starts := make([]int, len(parsed))
	renderBlocksMarked(&b, parsed, 0, func(i int) { starts[i] = b.Len() })
	text := b.String()
	spans := make([]blockSpan, len(parsed))
	for i := range parsed {
		end := len(text)
		if i+1 < len(parsed) {
			end = starts[i+1]
		}
		spans[i] = blockSpan{starts[i], end}
	}
	return text, spans, parsed
}

// applyEdit applies one edit to the block list and returns the new list and
// the number of replacements.
func applyEdit(blocks []json.RawMessage, e pageEdit, idx int, allowRemovals bool) ([]json.RawMessage, int, error) {
	text, spans, parsed := renderWithSpans(blocks)

	var hits []int
	for from := 0; ; {
		k := strings.Index(text[from:], e.Old)
		if k < 0 {
			break
		}
		hits = append(hits, from+k)
		from += k + len(e.Old)
	}
	switch {
	case len(hits) == 0:
		return nil, 0, &editError{status: 422, code: "edit_no_match", edit: idx, matches: 0,
			msg: fmt.Sprintf("edit %d matched 0 times: %q is not on the page. Read the page again (get_page) and quote it exactly, including Markdown such as **bold**", idx+1, quoteForMessage(e.Old))}
	case len(hits) > 1 && !e.All:
		return nil, 0, &editError{status: 422, code: "edit_ambiguous", edit: idx, matches: len(hits),
			msg: fmt.Sprintf("edit %d matched %d times: quote more of the surrounding text so it matches once, or set all to replace every occurrence", idx+1, len(hits))}
	}

	// Each hit touches a run of top-level blocks. Hits whose runs overlap are
	// one region, converted back together.
	type region struct{ first, last int }
	var regions []region
	var regionHits [][]int
	for _, h := range hits {
		first, last := blocksOverlapping(spans, h, h+len(e.Old))
		if n := len(regions); n > 0 && first <= regions[n-1].last {
			if last > regions[n-1].last {
				regions[n-1].last = last
			}
			regionHits[n-1] = append(regionHits[n-1], h)
			continue
		}
		regions = append(regions, region{first, last})
		regionHits = append(regionHits, []int{h})
	}

	for _, rg := range regions {
		for i := rg.first; i <= rg.last; i++ {
			if why := notEditable(blocks[i], parsed[i]); why != "" {
				return nil, 0, &editError{status: 422, code: "edit_unsupported_block", edit: idx, block: parsed[i].Type,
					msg: fmt.Sprintf("edit %d touches a %s block, which Markdown cannot carry (%s): it would be changed in ways the edit does not ask for. Quote a passage outside it", idx+1, parsed[i].Type, why)}
			}
		}
	}

	// Last region first, so the block indices of the earlier ones stay valid.
	out := blocks
	for ri := len(regions) - 1; ri >= 0; ri-- {
		rg := regions[ri]
		start, end := spans[rg.first].start, spans[rg.last].end
		var nt strings.Builder
		pos := start
		for _, h := range regionHits[ri] {
			nt.WriteString(text[pos:h])
			nt.WriteString(e.New)
			pos = h + len(e.Old)
		}
		nt.WriteString(text[pos:end])

		replacement, err := convertRegion(nt.String(), blocks[rg.first:rg.last+1])
		if err != nil {
			return nil, 0, err
		}
		if !allowRemovals {
			if removed := removedRefs(blocks[rg.first:rg.last+1], replacement); len(removed) > 0 {
				return nil, 0, &editError{status: 422, code: "edit_removes_link", edit: idx, removed: removed,
					msg: fmt.Sprintf("edit %d would remove a link to %s. If that is intended, resend with allow_removals", idx+1, strings.Join(removed, ", "))}
			}
		}
		next := make([]json.RawMessage, 0, len(out)-(rg.last-rg.first+1)+len(replacement))
		next = append(next, out[:rg.first]...)
		next = append(next, replacement...)
		next = append(next, out[rg.last+1:]...)
		out = next
	}
	return out, len(hits), nil
}

// blocksOverlapping returns the first and last top-level block whose text
// overlaps [a, b).
func blocksOverlapping(spans []blockSpan, a, b int) (int, int) {
	first, last := -1, -1
	for i, sp := range spans {
		if sp.end > a && sp.start < b {
			if first < 0 {
				first = i
			}
			last = i
		}
	}
	return first, last
}

// convertRegion turns the edited Markdown of a run of blocks back into blocks,
// handing the old blocks' ids to the new ones in order, so that an edit inside
// one paragraph keeps the paragraph — and the comments anchored to it.
func convertRegion(md string, old []json.RawMessage) ([]json.RawMessage, error) {
	// Blocks that render to nothing (an empty paragraph between two quoted
	// ones) do not come back from the Markdown, so they take no id: otherwise
	// every id after one would land on the wrong block.
	var keep []json.RawMessage
	for _, raw := range old {
		var b mdBlock
		json.Unmarshal(raw, &b)
		var sb strings.Builder
		renderBlocks(&sb, []mdBlock{b}, 0)
		if sb.Len() > 0 {
			keep = append(keep, raw)
		}
	}
	nb := mdToBlocks(md)
	out := make([]json.RawMessage, 0, len(nb))
	for i, b := range nb {
		raw, err := json.Marshal(b)
		if err != nil {
			return nil, err
		}
		if i < len(keep) {
			raw = carryIDs(keep[i], raw)
		}
		out = append(out, raw)
	}
	return out, nil
}

// carryIDs copies the id of the old block, and of its children by position,
// onto the new one.
func carryIDs(oldRaw, newRaw json.RawMessage) json.RawMessage {
	var o, n map[string]any
	if json.Unmarshal(oldRaw, &o) != nil || json.Unmarshal(newRaw, &n) != nil {
		return newRaw
	}
	carryIDsMap(o, n)
	out, err := json.Marshal(n)
	if err != nil {
		return newRaw
	}
	return out
}

func carryIDsMap(o, n map[string]any) {
	if id, ok := o["id"].(string); ok && id != "" {
		n["id"] = id
	}
	oc, _ := o["children"].([]any)
	nc, _ := n["children"].([]any)
	for i := 0; i < len(oc) && i < len(nc); i++ {
		om, ok1 := oc[i].(map[string]any)
		nm, ok2 := nc[i].(map[string]any)
		if ok1 && ok2 {
			carryIDsMap(om, nm)
		}
	}
}

// Props Markdown carries, whatever their value.
var editableProps = map[string]bool{
	"level": true, "checked": true, "language": true, "code": true,
	"url": true, "name": true, "pageId": true, "label": true,
}

// Props whose value is the default: present on most blocks the editor stores,
// and lost harmlessly because the default is what a new block gets.
var defaultProps = map[string]string{
	"textColor": "default", "backgroundColor": "default", "textAlignment": "left",
}

// Inline styles Markdown carries.
var editableStyles = map[string]bool{
	"bold": true, "italic": true, "strike": true, "underline": true, "code": true,
}

// notEditable says why a block cannot go through Markdown and back unchanged,
// or "" when it can. Three tests, all needed: the block's formatting is all
// Markdown can say; rendering it, parsing that and rendering again gives the
// same text; and the parse gives back the same block types. The second alone
// lets a callout through (it renders as a quote and comes back as one).
func notEditable(raw json.RawMessage, blk mdBlock) string {
	switch blk.Type {
	case "columnList", "column", "toc", "subpages", "database":
		return "it is a layout or generated block"
	}
	var v any
	if json.Unmarshal(raw, &v) != nil {
		return "it could not be read"
	}
	if why := unsupportedFormatting(v); why != "" {
		return why
	}
	var b strings.Builder
	renderBlocks(&b, []mdBlock{blk}, 0)
	md := b.String()
	if md == "" {
		// An empty paragraph inside a quoted run. It has no text to keep, and
		// it goes the way the agent's quote went.
		return ""
	}
	back := mdToBlocks(md)
	raws := make([]mdBlock, len(back))
	for i, nb := range back {
		j, _ := json.Marshal(nb)
		json.Unmarshal(j, &raws[i])
	}
	var b2 strings.Builder
	renderBlocks(&b2, raws, 0)
	if b2.String() != md {
		return "its Markdown does not read back the same"
	}
	if len(raws) != 1 || !sameTypes(blk, raws[0]) {
		return "it reads back as a different kind of block"
	}
	return ""
}

func sameTypes(a, b mdBlock) bool {
	if a.Type != b.Type || len(a.Children) != len(b.Children) {
		return false
	}
	for i := range a.Children {
		if !sameTypes(a.Children[i], b.Children[i]) {
			return false
		}
	}
	return true
}

// unsupportedFormatting walks a block and names the first prop or style
// Markdown cannot carry ("" when there is none).
func unsupportedFormatting(v any) string {
	switch t := v.(type) {
	case map[string]any:
		if props, ok := t["props"].(map[string]any); ok {
			for k, val := range props {
				if editableProps[k] {
					continue
				}
				if d, ok := defaultProps[k]; ok && val == d {
					continue
				}
				if val == nil || val == false || val == "" {
					continue
				}
				return "it carries " + k
			}
		}
		if styles, ok := t["styles"].(map[string]any); ok {
			for k, val := range styles {
				if editableStyles[k] || val == false {
					continue
				}
				return "its text carries " + k
			}
		}
		for k, val := range t {
			if k == "props" || k == "styles" {
				continue
			}
			if why := unsupportedFormatting(val); why != "" {
				return why
			}
		}
	case []any:
		for _, val := range t {
			if why := unsupportedFormatting(val); why != "" {
				return why
			}
		}
	}
	return ""
}

// removedRefs lists the pages and databases the old blocks point to and the
// new ones no longer do.
func removedRefs(old, new []json.RawMessage) []string {
	have := map[string]bool{}
	for _, id := range blockRefs(new) {
		have[id] = true
	}
	var out []string
	seen := map[string]bool{}
	for _, id := range blockRefs(old) {
		if !have[id] && !seen[id] {
			seen[id] = true
			out = append(out, "/p/"+id)
		}
	}
	return out
}

func blockRefs(blocks []json.RawMessage) []string {
	ids := extractLinks([]byte(joinBlocks(blocks)))
	for _, raw := range blocks {
		var b mdBlock
		if json.Unmarshal(raw, &b) == nil && b.Type == "database" {
			if id := strProp(b.Props, "collectionId", ""); id != "" {
				ids = append(ids, id)
			}
		}
	}
	return ids
}

// handleEditPage is POST /api/pages/{id}/edits.
func (s *Server) handleEditPage(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.canWriteReq(r, id) {
		httpError(w, 404, "page not found")
		return
	}
	var req editRequest
	if err := decodeJSON(w, r, &req); err != nil {
		httpError(w, 400, "invalid JSON")
		return
	}
	u := requestUser(r)
	counts, err := s.editPageContent(u, id, req)
	if err != nil {
		if ee, ok := err.(*editError); ok {
			if ee.code == "" {
				httpError(w, ee.status, ee.msg)
			} else {
				httpErrorData(w, ee.status, ee.code, ee.msg, ee.data())
			}
			return
		}
		httpError(w, 500, err.Error())
		return
	}
	actor := "human"
	if u.TokenScope != "" {
		actor = "agent"
	}
	s.audit(actor, u.ID, u.Name, "edit_content", id, s.pageWorkspace(id), editSummary(id, counts))
	writeJSON(w, map[string]any{"ok": true, "applied": counts})
}

// editSummary is the answer over MCP and the audit detail: counts, never text.
func editSummary(pageID string, counts []int) string {
	total := 0
	parts := make([]string, len(counts))
	for i, n := range counts {
		total += n
		parts[i] = fmt.Sprint(n)
	}
	noun := "edits"
	if len(counts) == 1 {
		noun = "edit"
	}
	return fmt.Sprintf("Applied %d %s to page %s: %d replacement(s) (%s per edit)", len(counts), noun, pageID, total, strings.Join(parts, ", "))
}
