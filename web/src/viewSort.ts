import { compare } from './format';
import type { Sort } from './types';

// How a view's sort orders its rows. Every view type sorts with this (applyView
// in CollectionView.tsx), and the board's drop marker (dropIndex in
// boardDrag.ts) places a dragged card with it, so the marker and the sorted
// result cannot disagree (spec 012, research R7).

/** The comparator a view's sort orders rows with. Ties, and a view without a
 *  sort, keep the rows' own order: Array.sort is stable. */
export function sortComparator<T extends { props: Record<string, unknown> }>(sort: Sort | null | undefined) {
  return (a: T, b: T): number => {
    if (!sort) return 0;
    const av = a.props[sort.property];
    const bv = b.props[sort.property];
    const as = Array.isArray(av) ? av.join(',') : String(av ?? '');
    const bs = Array.isArray(bv) ? bv.join(',') : String(bv ?? '');
    const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : compare(as, bs);
    return sort.dir === 'desc' ? -cmp : cmp;
  };
}
