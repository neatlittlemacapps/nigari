package server

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

// largeMarkdownPage is a 5,000-block page of the blocks Markdown already had
// before spec 006 (headings, paragraphs, lists, quotes, code), so the
// benchmark compares the same work before and after the spellings: SC-004
// asks that pages which use none of them convert no slower.
func largeMarkdownPage() string {
	var b strings.Builder
	for i := 0; i < 1000; i++ {
		fmt.Fprintf(&b, "## Section %d\n\nParagraph %d says something **ordinary** with a [link](https://example.com/%d).\n\n", i, i, i)
		fmt.Fprintf(&b, "- item %d\n    - nested %d\n\n> a quote %d\n\n```go\nfmt.Println(%d)\n```\n\n", i, i, i, i)
	}
	return b.String()
}

func BenchmarkMarkdownLargePage(b *testing.B) {
	md := largeMarkdownPage()
	content, err := mdToBlocksJSON(md)
	if err != nil {
		b.Fatal(err)
	}
	b.Run("read", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			mdToBlocks(md)
		}
	})
	b.Run("write", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			blocksToMarkdown([]byte(content))
		}
	})
}

// shape describes blocks compactly for the tables below: the type, the props
// a spelling carries, the plain text, and the children in brackets.
func shape(blocks []*mBlock) string {
	parts := []string{}
	for _, b := range blocks {
		s := b.Type
		for _, k := range []string{"emoji", "url", "count", "widths"} {
			if v, ok := b.Props[k]; ok {
				s += fmt.Sprintf(" %s=%v", k, v)
			}
		}
		if t := plainOf(b.Content); t != "" {
			s += " " + strconvQuote(t)
		}
		if len(b.Children) > 0 {
			s += " [" + shape(b.Children) + "]"
		}
		parts = append(parts, s)
	}
	return strings.Join(parts, "; ")
}

func strconvQuote(s string) string { return "\"" + s + "\"" }

func plainOf(content any) string {
	list, _ := content.([]any)
	var b strings.Builder
	for _, c := range list {
		m, _ := c.(map[string]any)
		if t, ok := m["text"].(string); ok {
			b.WriteString(t)
		}
		if inner, ok := m["content"]; ok {
			b.WriteString(plainOf(inner))
		}
	}
	return b.String()
}

// The scanner (T003): where a container ends, with nesting, with code inside,
// and with no end at all.
func TestContainerEndFindsTheMatchingClose(t *testing.T) {
	lines := strings.Split("<details>\n<details>\ninner\n</details>\n```\n</details>\n```\n</details>\nafter", "\n")
	if got := containerEnd(lines, 0, false); got != 7 {
		t.Errorf("nested details with a close inside code: end at %d, want 7", got)
	}
	if got := containerEnd(strings.Split("<details>\nnever closed", "\n"), 0, false); got != 2 {
		t.Errorf("an unclosed details runs to the end: %d, want 2", got)
	}
	cols := strings.Split(":::: columns\n::: column\na\n:::\n::: column\n::: note\nb\n:::\n:::\n::::\nafter", "\n")
	if got := containerEnd(cols, 0, true); got != 9 {
		t.Errorf("columns with a div nested in a column: end at %d, want 9", got)
	}
}

// Every spelling an agent can write (US1, contracts/spellings.md), and every
// edge case the spec names. A wrong reading here is a block nobody asked for.
func TestEverySpellingBecomesItsBlock(t *testing.T) {
	for _, c := range []struct{ name, md, want string }{
		{"warning callout", "> [!WARNING]\n> Mind the gap", `callout emoji=⚠️ "Mind the gap"`},
		{"alert in lower case, two lines", "> [!note]\n> one\n> two", `callout emoji=ℹ️ "one two"`},
		{"an emoji without an alert of its own", "> [!TIP]\n> ✅ Done", `callout emoji=✅ "Done"`},
		{"the type's own emoji in the text stays text", "> [!TIP]\n> 💡 idea", `callout emoji=💡 "💡 idea"`},
		{"an unknown alert stays a quote", "> [!FOO]", `quote "[!FOO]"`},
		{"an older export's callout", "> ⚠️ careful", `callout emoji=⚠️ "careful"`},
		{"a plain quote", "> said once", `quote "said once"`},
		{"divider ---", "---", "divider"},
		{"divider ***", "***", "divider"},
		{"divider ___", "_____", "divider"},
		{"--- under a paragraph is a divider", "text\n---", `paragraph "text"; divider`},
		{"table of contents", "[[toc]]", "toc"},
		{"sub-pages", "[[SubPages]]", "subpages"},
		{"[[toc]] in a sentence is text", "see [[toc]] above", `paragraph "see [[toc]] above"`},
		{"an autolink is a bookmark", "<https://example.com/a>", "bookmark url=https://example.com/a"},
		{"a link labelled with its address", "[https://example.com](https://example.com)", "bookmark url=https://example.com"},
		{"a bare address stays a link", "https://example.com", `paragraph "https://example.com"`},
		{"a labelled link stays a link", "[home](https://example.com)", `paragraph "home"`},
		{"a toggle", "<details><summary>Raw notes</summary>\n\n- one\n- two\n\n</details>", `toggleListItem "Raw notes" [bulletListItem "one"; bulletListItem "two"]`},
		{"summary on its own line", "<details>\n<summary>T</summary>\n\nbody\n</details>", `toggleListItem "T" [paragraph "body"]`},
		{"no summary", "<details>\nbody\n</details>", `toggleListItem [paragraph "body"]`},
		{"an unclosed toggle takes the rest", "<details><summary>T</summary>\nbody\nmore", `toggleListItem "T" [paragraph "body"; paragraph "more"]`},
		{"a toggle in a toggle", "<details><summary>A</summary>\n<details><summary>B</summary>\nx\n</details>\n</details>\ny", `toggleListItem "A" [toggleListItem "B" [paragraph "x"]]; paragraph "y"`},
		{"two columns", ":::: columns\n::: column\nLeft\n:::\n::: column\nRight\nmore\n:::\n::::", `columns count=2 [paragraph "Left"; paragraph "Right" [paragraph "more"]]`},
		{"widths", ":::: columns\n::: {.column width=\"70%\"}\nA\n:::\n::: {.column width=\"30%\"}\nB\n:::\n::::", `columns count=2 widths=70,30 [paragraph "A"; paragraph "B"]`},
		{"one width missing means equal", ":::: columns\n::: {.column width=\"70%\"}\nA\n:::\n::: column\nB\n:::\n::::", `columns count=2 [paragraph "A"; paragraph "B"]`},
		{"widths out of range mean equal", ":::: columns\n::: {.column width=\"99%\"}\nA\n:::\n::: {.column width=\"1%\"}\nB\n:::\n::::", `columns count=2 [paragraph "A"; paragraph "B"]`},
		{"one column is no layout", ":::: columns\n::: column\nonly\n:::\n::::", `paragraph "only"`},
		{"four columns keep everything in three", ":::: columns\n::: column\na\n:::\n::: column\nb\n:::\n::: column\nc\n:::\n::: column\nd\n:::\n::::", `columns count=3 [paragraph "a"; paragraph "b"; paragraph "c" [paragraph "d"]]`},
		{"a toggle inside a column", ":::: columns\n::: column\n<details><summary>T</summary>\nx\n</details>\n:::\n::: column\ny\n:::\n::::", `columns count=2 [toggleListItem "T" [paragraph "x"]; paragraph "y"]`},
		{"code keeps every spelling literal", "```\n[[toc]]\n<details>\n:::: columns\n---\n```", "codeBlock \"[[toc]]\n<details>\n:::: columns\n---\""},
		{"other fenced divs are left alone", "::: note\ntext\n:::", `paragraph "::: note"; paragraph "text"; paragraph ":::"`},
	} {
		if got := shape(mdToBlocks(c.md)); got != c.want {
			t.Errorf("%s:\n   got %s\n  want %s", c.name, got, c.want)
		}
	}
}

// everyBlockPage is a body with every block type Markdown now spells, stored
// the way the editor stores it (ids, default props, text runs).
func everyBlockPage() string {
	txt := func(s string) string { return `[{"type":"text","text":"` + s + `","styles":{}}]` }
	blk := func(id, typ, props, content, children string) string {
		if props == "" {
			props = `{"textColor":"default","backgroundColor":"default","textAlignment":"left"}`
		}
		if content == "" {
			content = "[]"
		}
		children = "[" + children + "]"
		return `{"id":"` + id + `","type":"` + typ + `","props":` + props + `,"content":` + content + `,"children":` + children + `}`
	}
	return "[" + strings.Join([]string{
		blk("h", "heading", `{"level":2}`, txt("Plan"), ""),
		blk("p1", "paragraph", "", txt("Intro"), ""),
		blk("c1", "callout", `{"emoji":"⚠️"}`, txt("Mind the gap"), ""),
		blk("c2", "callout", `{"emoji":"✅"}`, txt("Done"), ""),
		blk("c3", "callout", `{"emoji":"💡"}`, txt("Idea"), ""),
		blk("d", "divider", `{}`, "", ""),
		blk("t", "toggleListItem", "", txt("Raw notes"), blk("t1", "paragraph", "", txt("one"), "")+","+blk("t2", "bulletListItem", "", txt("two"), "")),
		blk("toc", "toc", `{}`, "", ""),
		blk("sp", "subpages", `{}`, "", ""),
		blk("bm", "bookmark", `{"url":"https://example.com/x"}`, "", ""),
		blk("col", "columns", `{"count":2,"widths":"70,30"}`, "",
			blk("l", "paragraph", "", txt("Left"), blk("l2", "paragraph", "", txt("more"), ""))+","+blk("r", "bulletListItem", "", txt("Right"), "")),
		blk("q", "quote", "", txt("Said"), ""),
		blk("e", "paragraph", "", txt("End"), ""),
	}, ",") + "]"
}

func storedShape(t *testing.T, content string) string {
	t.Helper()
	var blocks []*mBlock
	if err := json.Unmarshal([]byte(content), &blocks); err != nil {
		t.Fatal(err)
	}
	return shape(blocks)
}

// SC-002: a page with every block type goes out as Markdown and comes back
// with the same blocks, and the Markdown it comes back as is the Markdown it
// went out as.
func TestEveryBlockSurvivesMarkdownAndBack(t *testing.T) {
	page := everyBlockPage()
	md := blocksToMarkdown([]byte(page))
	back, _ := mdToBlocksJSON(md)
	if got, want := storedShape(t, back), storedShape(t, page); got != want {
		t.Errorf("blocks changed on the way back:\n   got %s\n  want %s\nMarkdown:\n%s", got, want, md)
	}
	if again := blocksToMarkdown([]byte(back)); again != md {
		t.Errorf("Markdown changed on the second pass:\n%s\n--- was ---\n%s", again, md)
	}
}

// SC-003 and FR-006, through the agent's doors: get_page's Markdown written
// back with write_content changes no block, and a find-and-replace edit
// inside a callout or beside the columns is accepted and keeps the rest.
func TestAnAgentsReadAndWriteKeepsEveryBlock(t *testing.T) {
	s := testServer(t)
	uid, _ := signedIn(t, s, "md@example.test")
	ws := s.firstWorkspaceOf(t, uid)
	page := s.makePage(t, ws, uid, "", "Every block", `{}`)
	if _, err := s.db.Exec(`UPDATE pages SET content = ? WHERE id = ?`, everyBlockPage(), page); err != nil {
		t.Fatal(err)
	}
	agent := &user{ID: uid, Name: "Agent", TokenKind: tokenKindAPI, TokenScope: "write"}
	content := func() string {
		var c string
		s.db.QueryRow(`SELECT content FROM pages WHERE id = ?`, page).Scan(&c)
		return c
	}
	want := storedShape(t, content())

	md := blocksToMarkdown([]byte(content()))
	args, _ := json.Marshal(map[string]any{"page_id": page, "markdown": md, "mode": "replace"})
	if out, err := callTool(t, s, agent, "write_content", string(args)); err != nil {
		t.Fatalf("write back: %v %s", err, out)
	}
	if got := storedShape(t, content()); got != want {
		t.Errorf("a read-and-write-back changed the page:\n   got %s\n  want %s", got, want)
	}

	for _, e := range []struct{ old, new, gone string }{
		{"Mind the gap", "Mind the step", "Mind the gap"},
		{"Intro", "Introduction", `paragraph "Intro"`},
	} {
		args, _ := json.Marshal(map[string]any{"page_id": page, "mode": "edit", "edits": []map[string]string{{"old": e.old, "new": e.new}}})
		if out, err := callTool(t, s, agent, "write_content", string(args)); err != nil {
			t.Fatalf("edit %q: %v %s", e.old, err, out)
		}
		want = strings.Replace(want, e.old, e.new, 1)
		if got := storedShape(t, content()); got != want {
			t.Errorf("edit %q changed more than the passage:\n   got %s\n  want %s", e.old, got, want)
		}
	}
}

// US1 through the agent's doors: create_page and write_content's append take
// the spellings too.
func TestAnAgentWritesTheSlashMenuBlocks(t *testing.T) {
	s := testServer(t)
	uid, _ := signedIn(t, s, "md2@example.test")
	agent := &user{ID: uid, Name: "Agent", TokenKind: tokenKindAPI, TokenScope: "write"}
	md := "> [!WARNING]\n> Mind the gap\n\n---\n\n<details><summary>Raw</summary>\n\nx\n\n</details>\n\n[[toc]]\n\n:::: columns\n::: column\nL\n:::\n::: column\nR\n:::\n::::"
	args, _ := json.Marshal(map[string]any{"title": "Written", "markdown": md})
	if out, err := callTool(t, s, agent, "create_page", string(args)); err != nil {
		t.Fatalf("create_page: %v %s", err, out)
	}
	var id, content string
	s.db.QueryRow(`SELECT id, content FROM pages WHERE title = 'Written'`).Scan(&id, &content)
	want := `callout emoji=⚠️ "Mind the gap"; divider; toggleListItem "Raw" [paragraph "x"]; toc; columns count=2 [paragraph "L"; paragraph "R"]`
	if got := storedShape(t, content); got != want {
		t.Errorf("create_page made:\n   got %s\n  want %s", got, want)
	}
	args, _ = json.Marshal(map[string]any{"page_id": id, "markdown": "[[subpages]]\n\n<https://example.com>", "mode": "append"})
	if out, err := callTool(t, s, agent, "write_content", string(args)); err != nil {
		t.Fatalf("append: %v %s", err, out)
	}
	s.db.QueryRow(`SELECT content FROM pages WHERE id = ?`, id).Scan(&content)
	if got := storedShape(t, content); !strings.HasSuffix(got, "; subpages; bookmark url=https://example.com") {
		t.Errorf("append made: %s", got)
	}
}
