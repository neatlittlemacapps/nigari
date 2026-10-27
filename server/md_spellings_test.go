package server

import (
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
