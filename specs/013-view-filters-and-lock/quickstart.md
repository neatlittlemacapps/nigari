# Quickstart: checking spec 013 by hand

Two accounts (A and B) on a throwaway instance, the seeded Tasks database.

1. **Lock** (US2): A opens Settings › Lock views. The lock marker shows. B
   cannot rename a view, add one, move or resize a column. An agent's
   `set_view` is refused with the lock sentence. Rows still edit. A unlocks:
   all of it works again.
2. **Log** (US5): rename a view, change its filter, delete one; the activity
   log shows three entries naming the view. Resize a column: no entry.
3. **Personal** (US1): A filters the table to "Owner is A". B still sees all
   rows. A opens the same view in a second browser: still filtered. The bar
   shows; Reset brings back the shared view; filter again and Save for
   everyone: B now sees it.
4. **Embed** (US1): the same database in a document; filter it there; the
   bar shows inside the embed; Save for everyone writes to the embed.
5. **Quick filters** (US3): add Owner and Status as quick filters; B picks
   Status: Done; only B's view narrows; it survives a reload on B's second
   device.
6. **Lanes** (US4): board, Sub-group: Owner; lanes per person and No value;
   drag a card to another cell: both values change; fold a lane.
