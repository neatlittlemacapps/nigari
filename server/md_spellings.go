package server

import (
	"regexp"
	"strconv"
	"strings"
)

// The Markdown spellings of the blocks Markdown has no word for (spec 006,
// #160). Agents read and write pages only as Markdown, and these blocks had no
// spelling at all, so they could not be written, and an agent that read a page
// and wrote it back deleted them: a callout became a quote, a toggle a list
// item, a divider the text "---", and a table of contents, a sub-pages list
// and columns vanished or flattened.
//
// Both directions read this file: mdToBlocks (mdimport.go) and
// renderBlocksMarked (export.go). A spelling written one way and read another
// is exactly the bug this exists to end, and md_spellings_test.go holds the
// two to each other with a round trip over every block type.

// Callouts are GitHub's alerts, "> [!WARNING]": the form agents most often
// already know, and the one GitHub renders. Each alert type has the emoji the
// editor shows for that tone.
var alertEmoji = map[string]string{
	"NOTE": "ℹ️", "TIP": "💡", "IMPORTANT": "📌", "WARNING": "⚠️", "CAUTION": "❗",
}

// emojiAlert is the other way, for every emoji the editor offers. ✅ and 🔥
// have no alert of their own: they travel as TIP and WARNING, and the emoji
// rides as the first character of the text so it comes back exactly.
var emojiAlert = map[string]string{
	"ℹ️": "NOTE", "💡": "TIP", "📌": "IMPORTANT", "⚠️": "WARNING", "❗": "CAUTION",
	"✅": "TIP", "🔥": "WARNING",
}

// calloutEmojis in the order the editor cycles them (blocks.tsx). Longest
// first would matter if one were a prefix of another; none is.
var calloutEmojis = []string{"💡", "⚠️", "❗", "✅", "📌", "🔥", "ℹ️"}

var (
	alertRe   = regexp.MustCompile(`(?i)^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$`)
	dividerRe = regexp.MustCompile(`^(?:-{3,}|\*{3,}|_{3,})$`)
	// <url> alone on a line: CommonMark's autolink, a bookmark here.
	autolinkRe = regexp.MustCompile(`^<(https?://[^\s<>]+)>$`)

	detailsOpenRe  = regexp.MustCompile(`(?i)^<details(?:\s[^>]*)?>\s*(.*)$`)
	detailsCloseRe = regexp.MustCompile(`(?i)^</details>\s*$`)
	summaryRe      = regexp.MustCompile(`(?is)^<summary>(.*?)</summary>\s*(.*)$`)

	// Pandoc's fenced divs: ":::: columns", "::: column" or
	// "::: {.column width="70%"}", and ":::" alone to close. The number of
	// colons is free in pandoc; nesting is tracked by depth, not by count.
	divOpenRe    = regexp.MustCompile(`^:{3,}\s*(\S.*)$`)
	divCloseRe   = regexp.MustCompile(`^:{3,}\s*$`)
	columnsWord  = regexp.MustCompile(`^(?:columns|\{\s*\.columns\b[^}]*\})$`)
	columnWord   = regexp.MustCompile(`^(?:column|\{\s*\.column\b([^}]*)\})$`)
	columnWidth  = regexp.MustCompile(`width\s*=\s*"?\s*([0-9.]+)\s*%?\s*"?`)
	tocToken     = "[[toc]]"
	subpageToken = "[[subpages]]"
)

// isFenceLine reports whether a trimmed line opens or closes a code fence.
// The scanner below uses it to step over code, where every spelling here is
// literal text (FR-004).
func isFenceLine(trimmed string) bool {
	return fenceOpenRe.MatchString(trimmed)
}

// containerEnd finds the line that closes the container opened at lines[open]:
// the matching </details> for a toggle, the matching bare ":::" for a fenced
// div. Containers of either kind may nest, and fenced code inside is skipped
// whole. With no closing line the container runs to the end of the text, the
// way an editor shows an unclosed one, and len(lines) comes back.
func containerEnd(lines []string, open int, div bool) int {
	depth := 1
	for i := open + 1; i < len(lines); i++ {
		t := strings.TrimSpace(lines[i])
		if isFenceLine(t) {
			for i++; i < len(lines) && !fenceCloseRe.MatchString(strings.TrimSpace(lines[i])); i++ {
			}
			continue
		}
		if div {
			if divCloseRe.MatchString(t) {
				depth--
			} else if divOpenRe.MatchString(t) {
				depth++
			}
		} else {
			if detailsCloseRe.MatchString(t) {
				depth--
			} else if detailsOpenRe.MatchString(t) {
				depth++
			}
		}
		if depth == 0 {
			return i
		}
	}
	return len(lines)
}

// columnSections cuts the inside of a ":::: columns" div into its
// "::: column" sections, each with the width it names (0 for none). Lines
// outside any section (stray text between them) join the section before, or
// the first one, so nothing is dropped.
func columnSections(lines []string) (sections [][]string, widths []float64) {
	for i := 0; i < len(lines); i++ {
		t := strings.TrimSpace(lines[i])
		if m := divOpenRe.FindStringSubmatch(t); m != nil {
			if cm := columnWord.FindStringSubmatch(strings.TrimSpace(m[1])); cm != nil {
				end := containerEnd(lines, i, true)
				stop := end
				if stop > len(lines) {
					stop = len(lines)
				}
				sections = append(sections, lines[i+1:stop])
				w := 0.0
				if wm := columnWidth.FindStringSubmatch(cm[1]); wm != nil {
					w, _ = strconv.ParseFloat(wm[1], 64)
				}
				widths = append(widths, w)
				i = end
				continue
			}
		}
		if t == "" {
			continue
		}
		if len(sections) == 0 {
			sections = append(sections, nil)
			widths = append(widths, 0)
		}
		last := len(sections) - 1
		sections[last] = append(sections[last], lines[i])
	}
	return sections, widths
}

// columnsWidthsProp is the stored "70,30" for the widths a document named, or
// "" when any is missing or out of the editor's range: equal columns are the
// safe answer where a guess is not (the rule columnsStyle reads them with).
func columnsWidthsProp(widths []float64) string {
	parts := make([]string, len(widths))
	for i, w := range widths {
		if !(w >= 5 && w <= 95) {
			return ""
		}
		parts[i] = strconv.FormatFloat(w, 'f', -1, 64)
	}
	return strings.Join(parts, ",")
}

// leadingCalloutEmoji splits a callout emoji off the front of a text, or
// returns "" and the text unchanged.
func leadingCalloutEmoji(text string) (emoji, rest string) {
	for _, e := range calloutEmojis {
		if strings.HasPrefix(text, e+" ") {
			return e, strings.TrimPrefix(text, e+" ")
		}
		// The variation selector is optional in the wild: "⚠" as well as "⚠️".
		if bare := strings.TrimSuffix(e, "️"); bare != e && strings.HasPrefix(text, bare+" ") {
			return e, strings.TrimPrefix(text, bare+" ")
		}
	}
	return "", text
}
