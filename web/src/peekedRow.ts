import { createContext, useContext } from 'react';

// The database row open in the peek, and the way to close it (spec 026, D2).
// A table draws that row's Open button as Close and tints the row, so the
// place that opened the peek also closes it (US3). App owns the peek; the
// table sits under Editor, the database block and CollectionView, so a
// context saves threading one id through four files. A database embedded in a
// document opens its rows in the same peek and reads the same answer.

export type PeekedRow = { id: string | null; close: () => void };

export const PeekedRowContext = createContext<PeekedRow>({ id: null, close: () => {} });

export const usePeekedRow = (): PeekedRow => useContext(PeekedRowContext);
