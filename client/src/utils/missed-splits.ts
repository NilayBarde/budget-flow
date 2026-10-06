import type { Transaction } from '../types';

// Unsplit expenses worth a second look: large enough that they may have been shared, not already
// split, and not marked by the user as something that should stay whole (rent, a solo purchase).
// Largest first.
export const findMissedSplitCandidates = (transactions: Transaction[], threshold: number): Transaction[] =>
  transactions
    .filter(t => !t.is_split && !t.split_dismissed && Math.abs(t.amount) >= threshold)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
