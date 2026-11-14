// The one rule for "this field has no value": a row page's muted "Empty"
// (#269) and its *Hide when empty* (spec 015) both use it. A file of its own
// so the cells can import it without pulling rowProperties.ts into the main
// bundle.
export function isUnset(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}
