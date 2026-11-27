import type { PropDef } from './types';
import { isImageUrl, isStoredFileUrl, readFiles } from './filesValue';

// Which picture a gallery card shows (spec 028, plan D6). One function, so the
// gallery, its check (scripts/check-cardimage.mjs) and any later card read the
// same decision.
//
// The view's cardImage (checked on the server by checkViewCardImage):
//   absent     Automatic: an image in a Files & media property (schema order),
//              then the cover, the icon, the first image in the content,
//              then the placeholder (FR-002)
//   "cover"    the cover only; "content" the first content image only
//   "none"     no image area at all (FR-004)
//   "prop:<id>" that Files & media or URL property only (FR-003); stored
//              with its prefix because a property's id is made from its
//              name, and a property called "Cover" has the id cover
//              (server/cardimage.go)
// A choice naming a property the database no longer has, or one that can no
// longer hold an image, is Automatic (FR-009): the server keeps such a value
// on a view nobody touched, so the browser must not draw it as empty.

export type CardImageRow = {
  icon: string;
  cover: string;
  props: Record<string, unknown>;
  /** The first image in the row's content, from pages.thumb; '' if none. */
  firstImage?: string;
};

export type CardImage =
  | { kind: 'image'; url: string }
  | { kind: 'gradient'; css: string }
  | { kind: 'icon'; icon: string }
  | { kind: 'placeholder' }
  | { kind: 'none' };

/** The choices a person can pick, for the Settings menu: Files & media and URL
 *  properties, in schema order. */
export function cardImageProps(schema: PropDef[]): PropDef[] {
  return schema.filter((p) => p.type === 'files' || p.type === 'url');
}

/** The stored value that chooses a property. */
export const cardImagePropValue = (id: string): string => PROP_PREFIX + id;
const PROP_PREFIX = 'prop:';

/** What the view's stored choice means against this schema: 'auto' when it is
 *  absent, unknown or stale; otherwise the stored value itself. */
export function cardImageChoice(stored: unknown, schema: PropDef[]): string {
  if (stored === 'cover' || stored === 'content' || stored === 'none') return stored;
  if (typeof stored === 'string' && stored.startsWith(PROP_PREFIX)) {
    const id = stored.slice(PROP_PREFIX.length);
    if (cardImageProps(schema).some((p) => p.id === id)) return stored;
  }
  return 'auto';
}

// An address a card may draw: an upload of this instance or a web address,
// with an image's extension. Nothing else reaches an <img> or a CSS url():
// a value is whatever someone typed into a URL cell.
function drawable(url: string): boolean {
  if (!isImageUrl(url)) return false;
  if (isStoredFileUrl(url.split(/[?#]/)[0])) return true;
  return /^https?:\/\/[^\s"'()\\]+$/i.test(url);
}

function fromProp(row: CardImageRow, p: PropDef): string {
  const v = row.props[p.id];
  if (p.type === 'files') return readFiles(v).find((f) => isImageUrl(f.url))?.url ?? '';
  if (typeof v === 'string' && drawable(v.trim())) return v.trim();
  return '';
}

function fromCover(cover: string): CardImage | null {
  if (!cover) return null;
  if (cover.startsWith('gradient:')) return { kind: 'gradient', css: cover.slice('gradient:'.length) };
  return { kind: 'image', url: cover };
}

// The first content image is an image block's address: it is a picture
// whatever its address ends in (a CDN's "?w=800", an upload with no
// extension), as the notes list draws it. Only where it points is checked.
function fromContent(row: CardImageRow): CardImage | null {
  const u = row.firstImage ?? '';
  if (!u) return null;
  return isStoredFileUrl(u.split(/[?#]/)[0]) || /^https?:\/\/[^\s"'()\\]+$/i.test(u) ? { kind: 'image', url: u } : null;
}

export function cardImageFor(row: CardImageRow, stored: unknown, schema: PropDef[]): CardImage {
  const choice = cardImageChoice(stored, schema);
  const placeholder: CardImage = { kind: 'placeholder' };
  if (choice === 'none') return { kind: 'none' };
  if (choice === 'cover') return fromCover(row.cover) ?? placeholder;
  if (choice === 'content') return fromContent(row) ?? placeholder;
  if (choice !== 'auto') {
    const p = schema.find((d) => cardImagePropValue(d.id) === choice)!;
    const url = fromProp(row, p);
    return url ? { kind: 'image', url } : placeholder;
  }
  for (const p of schema) {
    if (p.type !== 'files') continue;
    const url = fromProp(row, p);
    if (url) return { kind: 'image', url };
  }
  return fromCover(row.cover) ?? (row.icon ? { kind: 'icon', icon: row.icon } : null) ?? fromContent(row) ?? placeholder;
}
