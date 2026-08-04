import type { Transaction } from '../types';

// The universal "my share" rule, mirroring the server's category-spend
// service: for a split transaction only is_my_share splits count toward
// my spending, including when that sum is zero.
export const getMyShareAmount = (
  t: Pick<Transaction, 'amount' | 'is_split' | 'splits'>,
): number => {
  if (t.is_split && t.splits && t.splits.length > 0) {
    return t.splits
      .filter(s => s.is_my_share)
      .reduce((sum, s) => sum + Math.abs(s.amount), 0);
  }
  return Math.abs(t.amount);
};
