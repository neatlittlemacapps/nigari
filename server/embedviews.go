package server

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"
	"math/big"
	"strings"
)

// A database embedded in a document has views of its own (spec 014). They
// live in the `database` block's `local` prop, inside the document, so they
// travel wherever the document goes (history, duplicate, transfer, backup)
// and changing them never touches the database's own views.
//
// Two shapes of `local` exist and both are read for good (research R2):
//
//   - old (every embed before spec 014): {"viewId": "<database view id>",
//     "views": {"<database view id>": {"filters": [...], "sort": ...}}}, or "".
//     Read as a copy of every database view an embed can show, keeping their
//     ids, with the embed's own filters and sort laid over them.
//   - new: {"v": 2, "viewId": "...", "views": [<view>, ...]}.
//
// No upgrade step rewrites old embeds: the server never reads a document's
// Yjs state, and rewriting pages.content would mean resetting every such
// document's live state, throwing away any edit not yet saved. An old embed
// is written in the new shape the first time a view of it changes.
//
// The browser has the same reader (web/src/embedViews.ts). The two are held
// level by the cases in testdata/embedviews, which both run
// (embedviews_test.go, web/scripts/check-embedviews.mjs).

// embedLocalV2 is the new shape, its fields in the order they are written.
type embedLocalV2 struct {
	V      int              `json:"v"`
	ViewID string           `json:"viewId"`
	Views  []map[string]any `json:"views"`
}

// embedViewType reports whether an embed can show a view of this type: every
// database view type except a form, which collects rows rather than showing
// them, and stays on the database.
func embedViewType(t string) bool {
	return validViewTypes[t] && t != "form"
}

// newEmbedViewID is a view id in the browser's spelling ('v' and seven base-36
// characters, CollectionView's addView), not taken by any id in taken.
func newEmbedViewID(taken map[string]bool) string {
	const digits = "0123456789abcdefghijklmnopqrstuvwxyz"
	for {
		var b strings.Builder
		b.WriteByte('v')
		for i := 0; i < 7; i++ {
			n, err := rand.Int(rand.Reader, big.NewInt(int64(len(digits))))
			if err != nil {
				panic(err)
			}
			b.WriteByte(digits[n.Int64()])
		}
		if id := b.String(); !taken[id] {
			return id
		}
	}
}

// defaultEmbedView is what an embed with nothing to show shows: one table.
func defaultEmbedView(taken map[string]bool) map[string]any {
	return map[string]any{"id": newEmbedViewID(taken), "name": "Table", "type": "table"}
}

// cloneView is a deep copy of a view, so changing the embed's copy can never
// reach the map it was read from (the database's views, in the old shape).
func cloneView(v map[string]any) map[string]any {
	b, err := json.Marshal(v)
	if err != nil {
		return map[string]any{}
	}
	out := map[string]any{}
	_ = json.Unmarshal(b, &out)
	return out
}

// readEmbedLocal reads a block's `local` in either shape, tolerantly: the
// prop is free text anybody (or any agent) can write, and a malformed value
// must cost the embed its views, not the document its rendering. dbViews are
// the database's views, needed for the old shape. The result always has at
// least one view, and viewID is always one of them.
func readEmbedLocal(raw string, dbViews []map[string]any) (string, []map[string]any) {
	var obj map[string]any
	if raw != "" {
		if err := json.Unmarshal([]byte(raw), &obj); err != nil {
			obj = nil
		}
	}
	openID, _ := obj["viewId"].(string)
	var views []map[string]any
	seen := map[string]bool{}
	keep := func(v map[string]any) {
		id, _ := v["id"].(string)
		typ, _ := v["type"].(string)
		if id == "" || seen[id] || !embedViewType(typ) {
			return
		}
		seen[id] = true
		views = append(views, v)
	}
	if ver, _ := obj["v"].(float64); ver == 2 {
		list, _ := obj["views"].([]any)
		for _, item := range list {
			if v, ok := item.(map[string]any); ok {
				keep(v)
			}
		}
	} else {
		own, _ := obj["views"].(map[string]any)
		for _, dv := range dbViews {
			v := cloneView(dv)
			id, _ := v["id"].(string)
			if entry, ok := own[id].(map[string]any); ok {
				// Present keys only: the browser laid them over the view the
				// same way ({...view, ...own}), a missing one kept the view's.
				for _, k := range []string{"filters", "sort"} {
					if val, has := entry[k]; has {
						v[k] = val
					}
				}
			}
			keep(v)
		}
	}
	if len(views) == 0 {
		views = []map[string]any{defaultEmbedView(nil)}
	}
	if !seen[openID] {
		openID, _ = views[0]["id"].(string)
	}
	return openID, views
}

// encodeEmbedLocal writes an embed's views in the new shape.
func encodeEmbedLocal(viewID string, views []map[string]any) string {
	b, err := json.Marshal(embedLocalV2{V: 2, ViewID: viewID, Views: views})
	if err != nil {
		return ""
	}
	return string(b)
}

// findBlock returns the block with this id at any depth of a document's
// blocks (columns and toggles keep theirs under children), or nil.
func findBlock(blocks []any, id string) map[string]any {
	for _, item := range blocks {
		b, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if bid, _ := b["id"].(string); bid == id {
			return b
		}
		if kids, ok := b["children"].([]any); ok {
			if found := findBlock(kids, id); found != nil {
				return found
			}
		}
	}
	return nil
}

// embedBlocks returns every database block of a document that names a
// database, in document order.
func embedBlocks(blocks []any) []map[string]any {
	var out []map[string]any
	for _, item := range blocks {
		b, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if t, _ := b["type"].(string); t == "database" {
			if props, _ := b["props"].(map[string]any); props != nil {
				if c, _ := props["collectionId"].(string); c != "" {
					out = append(out, b)
				}
			}
		}
		if kids, ok := b["children"].([]any); ok {
			out = append(out, embedBlocks(kids)...)
		}
	}
	return out
}

// errNoEmbed is the refusal for an embed id the document does not have.
type errNoEmbed struct{ pageID, embedID string }

func (e errNoEmbed) Error() string {
	return fmt.Sprintf("page %q has no embedded database with id %q — get_page lists a document's embeds", e.pageID, e.embedID)
}

// embedOf finds an embed in the document's stored content: the database it
// shows and its `local`. No gate: callers gate (embedViewOf).
func (s *Server) embedOf(pageID, embedID string) (colID, local string, err error) {
	var content string
	if err := s.db.QueryRow(`SELECT content FROM pages WHERE id = ? AND trashed_at IS NULL`, pageID).Scan(&content); err != nil {
		if err == sql.ErrNoRows {
			return "", "", fmt.Errorf("page %q not found", pageID)
		}
		return "", "", err
	}
	var blocks []any
	_ = json.Unmarshal([]byte(content), &blocks)
	b := findBlock(blocks, embedID)
	if b == nil || b["type"] != "database" {
		return "", "", errNoEmbed{pageID, embedID}
	}
	props, _ := b["props"].(map[string]any)
	colID, _ = props["collectionId"].(string)
	if colID == "" {
		return "", "", errNoEmbed{pageID, embedID}
	}
	local, _ = props["local"].(string)
	return colID, local, nil
}

// embedViewOf is an embed and the database it shows, for an agent: the
// document is read from its stored content (pages.content, which the
// browser's save keeps a few seconds behind the live editor at most), and
// the database must be one the caller may read, through this credential.
// The caller has already gated the document itself.
func (s *Server) embedViewOf(u *user, pageID, embedID string) (colID, local string, err error) {
	colID, local, err = s.embedOf(pageID, embedID)
	if err != nil {
		return "", "", err
	}
	// The same answer for a database that is gone and one the caller may not
	// see: which of the two would tell an outsider it exists.
	if !s.canRead(u.ID, colID) || !s.credentialMayEnter(u, s.pageWorkspace(colID)) {
		return "", "", fmt.Errorf("database not found")
	}
	return colID, local, nil
}

// embedState is an embed read for an agent: the database's schema and views,
// and the embed's own views and open view.
type embedState struct {
	colID   string
	schema  []map[string]any
	dbViews []map[string]any
	viewID  string
	views   []map[string]any
}

func (s *Server) loadEmbed(u *user, pageID, embedID string) (*embedState, error) {
	colID, local, err := s.embedViewOf(u, pageID, embedID)
	if err != nil {
		return nil, err
	}
	schema, dbViews, err := s.loadCollection(colID)
	if err != nil {
		return nil, fmt.Errorf("database not found")
	}
	viewID, views := readEmbedLocal(local, dbViews)
	return &embedState{colID: colID, schema: schema, dbViews: dbViews, viewID: viewID, views: views}, nil
}

// writeEmbedViews replaces one embed's `local` in the document, and nothing
// else, the way every write from outside the editor goes: the old state into
// history first, the content with a new document generation (docgen.go), the
// live state reset so open editors reload it, then the side effects.
func (s *Server) writeEmbedViews(u *user, pageID, embedID, viewID string, views []map[string]any) error {
	s.snapshotRevision(pageID, u.ID, u.Name)
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var content string
	if err := tx.QueryRow(`SELECT content FROM pages WHERE id = ? AND trashed_at IS NULL`, pageID).Scan(&content); err != nil {
		return fmt.Errorf("page %q not found", pageID)
	}
	var blocks []any
	if err := json.Unmarshal([]byte(content), &blocks); err != nil {
		return errNoEmbed{pageID, embedID}
	}
	b := findBlock(blocks, embedID)
	if b == nil || b["type"] != "database" {
		return errNoEmbed{pageID, embedID}
	}
	props, _ := b["props"].(map[string]any)
	if props == nil {
		props = map[string]any{}
		b["props"] = props
	}
	props["local"] = encodeEmbedLocal(viewID, views)
	merged, err := json.Marshal(blocks)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`UPDATE pages SET content = ?, updated_at = ?, `+bumpDocGen+` WHERE id = ?`, string(merged), now(), pageID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.resetYjsDoc(pageID)
	s.reindexPage(pageID)
	s.pagesChanged()
	s.fireWebhook("page.updated", pageID)
	return nil
}

// --- The agent's doors (set_view, delete_view, get_collection with embed_id)

// embedChangedNote ends every answer that changed an embed, so an agent never
// believes it changed the database.
const embedChangedNote = " Only this embed changed; the database's own views are as they were."

// mcpGetEmbed answers get_collection with embed_id: the database's schema
// with the embed's views and open view.
func (s *Server) mcpGetEmbed(u *user, pageID, embedID string) (string, error) {
	e, err := s.loadEmbed(u, pageID, embedID)
	if err != nil {
		return "", err
	}
	b, err := json.Marshal(map[string]any{
		"page_id": pageID, "embed_id": embedID, "database_id": e.colID,
		"schema": e.schema, "views": e.views, "open_view": e.viewID,
	})
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// mcpCreateEmbedView adds a view to an embed: a new one of a type, or a copy
// of one of the database's views (copyOf), which spec then changes. The view
// is checked by applyViewSpec against the database's schema, the rules a
// database view gets, so an agent cannot store in an embed what set_view
// would refuse on the database.
func (s *Server) mcpCreateEmbedView(u *user, pageID, embedID, copyOf string, spec viewSpec) (string, error) {
	e, err := s.loadEmbed(u, pageID, embedID)
	if err != nil {
		return "", err
	}
	taken := map[string]bool{}
	for _, v := range append(append([]map[string]any{}, e.views...), e.dbViews...) {
		if id, _ := v["id"].(string); id != "" {
			taken[id] = true
		}
	}
	var view map[string]any
	if copyOf != "" {
		for _, dv := range e.dbViews {
			if id, _ := dv["id"].(string); id == copyOf {
				view = cloneView(dv)
			}
		}
		if view == nil {
			return "", fmt.Errorf("copy_of %q is not a view of database %q — get_collection on the database lists its views", copyOf, e.colID)
		}
		if t, _ := view["type"].(string); !embedViewType(t) {
			return "", fmt.Errorf("view %q is a form: a form collects rows and stays on the database, a document cannot show it", copyOf)
		}
		if spec.Type != "" && spec.Type != view["type"] {
			return "", fmt.Errorf("a copy keeps its view's type (%v) — leave type out, or create a new view without copy_of", view["type"])
		}
		view["id"] = newEmbedViewID(taken)
	} else {
		if spec.Type == "form" {
			return "", fmt.Errorf("a form cannot be shown in a document: it collects rows and stays on the database")
		}
		if !embedViewType(spec.Type) {
			return "", fmt.Errorf("unknown view type %q — use table, board, gallery, calendar, timeline, list or chart", spec.Type)
		}
		if strings.TrimSpace(spec.Name) == "" {
			spec.Name = strings.ToUpper(spec.Type[:1]) + spec.Type[1:]
		}
		view = map[string]any{"id": newEmbedViewID(taken), "type": spec.Type}
	}
	spec.Type = ""
	if err := applyViewSpec(view, spec, e.schema); err != nil {
		return "", err
	}
	views := append(e.views, view)
	if err := s.writeEmbedViews(u, pageID, embedID, e.viewID, views); err != nil {
		return "", err
	}
	return fmt.Sprintf("Created %v view %q (id %s) in embed %s.%s", view["type"], view["name"], view["id"], embedID, embedChangedNote), nil
}

// mcpUpdateEmbedView changes one of an embed's views, merging like
// mcpUpdateView: what is not mentioned stays.
func (s *Server) mcpUpdateEmbedView(u *user, pageID, embedID, viewID string, spec viewSpec) (string, error) {
	if spec.Type != "" {
		return "", fmt.Errorf("a view's type cannot be changed — delete it and create the new one")
	}
	e, err := s.loadEmbed(u, pageID, embedID)
	if err != nil {
		return "", err
	}
	for _, v := range e.views {
		if id, _ := v["id"].(string); id != viewID {
			continue
		}
		if err := applyViewSpec(v, spec, e.schema); err != nil {
			return "", err
		}
		if err := s.writeEmbedViews(u, pageID, embedID, e.viewID, e.views); err != nil {
			return "", err
		}
		return fmt.Sprintf("Updated view %q (id %s) in embed %s.%s", v["name"], viewID, embedID, embedChangedNote), nil
	}
	return "", fmt.Errorf("view %q is not a view of embed %s — get_collection with embed_id lists them", viewID, embedID)
}

// mcpDeleteEmbedView removes one of an embed's views. The last one stays: an
// embed with nothing to show would draw an empty frame in the document.
func (s *Server) mcpDeleteEmbedView(u *user, pageID, embedID, viewID string) (string, error) {
	e, err := s.loadEmbed(u, pageID, embedID)
	if err != nil {
		return "", err
	}
	keep := []map[string]any{}
	found := false
	for _, v := range e.views {
		if id, _ := v["id"].(string); id == viewID {
			found = true
			continue
		}
		keep = append(keep, v)
	}
	if !found {
		return "", fmt.Errorf("view %q is not a view of embed %s — get_collection with embed_id lists them", viewID, embedID)
	}
	if len(keep) == 0 {
		return "", fmt.Errorf("an embed keeps at least one view — add another before deleting this one")
	}
	open := e.viewID
	if open == viewID {
		open, _ = keep[0]["id"].(string)
	}
	if err := s.writeEmbedViews(u, pageID, embedID, open, keep); err != nil {
		return "", err
	}
	return fmt.Sprintf("Deleted view %s from embed %s.%s", viewID, embedID, embedChangedNote), nil
}

// embedListing is what get_page adds after a document's Markdown: its embeds,
// so an agent has the embed ids the Markdown does not carry (cap_edits.go
// matches edits against that Markdown, which is why the ids stay out of it).
// An embed of a database the caller may not read is listed without its
// title or views: that it is there is in the document, what it shows is not
// the caller's to see. The caller wraps the result (wrapUntrusted): view and
// database names are text people wrote.
func (s *Server) embedListing(u *user, content []byte) string {
	var blocks []any
	if err := json.Unmarshal(content, &blocks); err != nil {
		return ""
	}
	embeds := embedBlocks(blocks)
	if len(embeds) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("\n\nEmbedded databases (use embed_id with get_collection, set_view and delete_view):")
	for _, eb := range embeds {
		id, _ := eb["id"].(string)
		props, _ := eb["props"].(map[string]any)
		colID, _ := props["collectionId"].(string)
		local, _ := props["local"].(string)
		var title string
		readable := s.canRead(u.ID, colID) && s.credentialMayEnter(u, s.pageWorkspace(colID))
		var dbViews []map[string]any
		if readable {
			if err := s.db.QueryRow(`SELECT title FROM pages WHERE id = ? AND trashed_at IS NULL`, colID).Scan(&title); err != nil {
				readable = false
			}
		}
		if readable {
			var err error
			if _, dbViews, err = s.loadCollection(colID); err != nil {
				readable = false
			}
		}
		if !readable {
			fmt.Fprintf(&b, "\n- embed_id %s: a database you cannot read", id)
			continue
		}
		open, views := readEmbedLocal(local, dbViews)
		names := make([]string, 0, len(views))
		for _, v := range views {
			n := fmt.Sprintf("%q (%v, id %v", v["name"], v["type"], v["id"])
			if v["id"] == open {
				n += ", open"
			}
			names = append(names, n+")")
		}
		fmt.Fprintf(&b, "\n- embed_id %s: database %q (%s), views: %s", id, title, colID, strings.Join(names, ", "))
	}
	return b.String()
}

// --- Rows made in an embed's view (create_page, create_rows with embed) ----

// embedRef names an embed: the document and the block's id.
type embedRef struct {
	PageID  string `json:"page_id"`
	EmbedID string `json:"embed_id"`
}

// embedViewFilters reads the filters of one of an embed's views, for a row
// made in it by an agent. The document is gated here, not by mcpCall: it is
// named inside an argument, not as page_id. colID is the database the row
// goes into; an embed of another database is refused like a view of one.
func (s *Server) embedViewFilters(u *user, ref *embedRef, colID, viewID string) ([]rowFilter, error) {
	if ref.PageID == "" || ref.EmbedID == "" {
		return nil, fmt.Errorf("embed needs page_id (the document) and embed_id (get_page lists a document's embeds)")
	}
	if viewID == "" {
		return nil, fmt.Errorf("embed needs view_id: the embed's view the row is made in")
	}
	if !s.canRead(u.ID, ref.PageID) || !s.credentialMayEnter(u, s.pageWorkspace(ref.PageID)) {
		return nil, fmt.Errorf("page %q not found", ref.PageID)
	}
	e, err := s.loadEmbed(u, ref.PageID, ref.EmbedID)
	if err != nil {
		return nil, err
	}
	if e.colID != colID {
		return nil, fmt.Errorf("embed %s shows database %q, not %q — the row goes into the database the embed shows", ref.EmbedID, e.colID, colID)
	}
	for _, v := range e.views {
		if id, _ := v["id"].(string); id == viewID {
			return viewFilterList(v), nil
		}
	}
	return nil, fmt.Errorf("view %q is not a view of embed %s — get_collection with embed_id lists them", viewID, ref.EmbedID)
}

// viewFilterList reads a view's stored filters as rowFilters.
func viewFilterList(v map[string]any) []rowFilter {
	raw, _ := json.Marshal(v["filters"])
	var fs []filterJSON
	_ = json.Unmarshal(raw, &fs)
	var out []rowFilter
	for _, f := range fs {
		if f.Property != "" {
			out = append(out, f.rowFilter())
		}
	}
	return out
}
