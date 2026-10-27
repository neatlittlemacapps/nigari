# Contract: Markdown spellings

What `get_page` and the export write, and what `write_content`, `create_page` and
the importer read. Both directions, exactly.

| Block (stored type) | Markdown |
| --- | --- |
| `callout` {emoji} | `> [!TIP]` newline `> text` (type from the emoji, see research R3) |
| `toggleListItem` + children | `<details><summary>title</summary>` blank line, children, blank line, `</details>` |
| `divider` | `---` (reads `---`, `***`, `___`, three or more) |
| `toc` | `[[toc]]` |
| `subpages` | `[[subpages]]` |
| `bookmark` {url} | `<url>` (reads `<url>` and `[url](url)`) |
| `columns` {count, widths} | `:::: columns` / `::: {.column width="70%"}` … `:::` per column / `::::` |

Unchanged: everything else, including toggle headings (a heading) and the
embedded collection (`[Collection](/p/<id>)`).
