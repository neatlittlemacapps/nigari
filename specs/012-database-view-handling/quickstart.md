# Quickstart: checking spec 012 by hand

Build and start a throwaway instance (`AGENTS.md`, Commands), sign in, and
open the seeded Tasks database.

1. **Text** (US1): the table's cells read at the same size as a paragraph;
   headers one step smaller. Light and dark, desktop and phone width.
2. **Columns** (US2): drag the Status header left of Effort; a line marks the
   gap; release. Reload: still there. Open a second table view: unchanged.
   Open the Status header's menu with Enter, choose Move left: it moves, focus
   stays. Drag a header's edge: it resizes, not moves.
3. **Board** (US3): on the board, drag a card to another column; a gap shows
   where it lands; release; it is there. Turn on reduced motion: no
   animation. Repeat with a finger on a phone.
4. **Settings** (US4): the toolbar has Settings (sliders) before New, no
   Properties or ⋯. Open it: View settings with the values on the right,
   Move left/right and Remove view last in red, Database settings with Edit
   properties. Escape: closed, focus on Settings. On a phone: a bottom sheet.
   Each thing the old buttons did is there.
5. **Document** (US5): put the database in a document. The toolbar's buttons
   are invisible until the pointer is over it or Tab reaches it; nothing
   moves when they appear; with a filter on, "Filtered" shows at rest. On a
   phone the buttons always show. No Settings button in the document.
6. **Agent**: `set_view` with `column_order: ["status","effort"]` on the table
   view; the interface shows that order; `get_collection` returns `colOrder`.
