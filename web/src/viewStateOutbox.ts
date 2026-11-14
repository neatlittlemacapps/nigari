// What a person's own view state still owes the server when the page goes away
// (#594). The sending half: this is in the main bundle, so it is as small as it
// can be. Reading it back is viewStateReplay.ts, loaded only when there is
// something to read.
//
// usePersonalViews keeps a filter or sort edit for 400 ms before it sends it,
// and when the page is leaving it sends what is waiting with `keepalive`. The
// browser does not always finish that request: on a reload straight after an
// edit it never reached the server about half the time (measured: 7 of 14
// reloads in a row, the server's own log showing no request at all). So what
// is waiting is also written to the browser's storage, one note per database,
// and the next open of that database in this browser sends it again. Sending
// the same state twice changes nothing, so the note does not have to know
// whether the first request arrived.
//
// A note is good for a minute (viewStateReplay.ts): it is for the reload or the
// link that follows the edit, and somebody who signs in as another person on
// this browser must not be handed the filter.

/** The storage key of one database's note. The note itself is
 *  {at: <time written>, items: [[scope, state-or-null], …]}, written by
 *  usePersonalViews and read by parseOutbox (viewStateReplay.ts). */
export const outboxKey = (collectionId: string) => 'nigari-view-outbox:' + collectionId;
