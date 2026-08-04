import type { Transaction } from '../types';

export type TransactionSortOption =
  | 'date_desc'
  | 'date_asc'
  | 'amount_desc'
  | 'amount_asc'
  | 'merchant_asc';

export const SORT_OPTIONS: { value: TransactionSortOption; label: string }[] = [
  { value: 'date_desc', label: 'Date: Newest first' },
  { value: 'date_asc', label: 'Date: Oldest first' },
  { value: 'amount_desc', label: 'Amount: High to low' },
  { value: 'amount_asc', label: 'Amount: Low to high' },
  { value: 'merchant_asc', label: 'Merchant: A to Z' },
];

// Effective amount for display/sorting: for split transactions only the user's
// share counts (matches how header totals are computed)
export const getEffectiveAmount = (t: Transaction): number => {
  if (t.is_split && t.splits?.length) {
    return t.splits
      .filter(s => s.is_my_share)
      .reduce((sum, s) => sum + Math.abs(s.amount), 0);
  }
  return Math.abs(t.amount);
};

const getMerchantLabel = (t: Transaction): string =>
  (t.merchant_display_name || t.merchant_name || '').toLowerCase();

export const sortTransactions = (
  transactions: Transaction[],
  sort: TransactionSortOption
): Transaction[] => {
  const sorted = [...transactions];

  switch (sort) {
    case 'date_asc':
      sorted.sort((a, b) => a.date.localeCompare(b.date));
      break;
    case 'amount_desc':
      sorted.sort(
        (a, b) =>
          getEffectiveAmount(b) - getEffectiveAmount(a) || b.date.localeCompare(a.date)
      );
      break;
    case 'amount_asc':
      sorted.sort(
        (a, b) =>
          getEffectiveAmount(a) - getEffectiveAmount(b) || b.date.localeCompare(a.date)
      );
      break;
    case 'merchant_asc':
      sorted.sort(
        (a, b) =>
          getMerchantLabel(a).localeCompare(getMerchantLabel(b)) ||
          b.date.localeCompare(a.date)
      );
      break;
    case 'date_desc':
    default:
      sorted.sort((a, b) => b.date.localeCompare(a.date));
      break;
  }

  return sorted;
};

// Filter by effective (absolute, split-aware) amount. Bounds are inclusive;
// pass undefined to leave a bound open.
export const filterByAmountRange = (
  transactions: Transaction[],
  min?: number,
  max?: number
): Transaction[] => {
  if (min === undefined && max === undefined) return transactions;

  return transactions.filter(t => {
    const amount = getEffectiveAmount(t);
    if (min !== undefined && amount < min) return false;
    if (max !== undefined && amount > max) return false;
    return true;
  });
};
