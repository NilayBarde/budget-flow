import { getMyShareAmount } from './my-share';
import type { Transaction, TransactionType } from '../types';

export interface TransactionTotals {
  expenses: number;
  returns: number;
  income: number;
  investments: number;
  transfers: number;
}

const EMPTY_TOTALS: TransactionTotals = {
  expenses: 0,
  returns: 0,
  income: 0,
  investments: 0,
  transfers: 0,
};

// Header totals for a set of transactions. Split transactions count only the
// user's share (see my-share.ts); the sign fallback mirrors the server's
// handling of rows without an explicit transaction_type.
export const computeTransactionTotals = (
  transactions: Transaction[] | undefined
): TransactionTotals => {
  if (!transactions) return { ...EMPTY_TOTALS };

  return transactions.reduce(
    (acc, t) => {
      const type = t.transaction_type || (t.amount > 0 ? 'expense' : 'income');
      const amount = getMyShareAmount(t);

      if (type === 'expense') {
        acc.expenses += amount;
      } else if (type === 'return') {
        acc.returns += amount;
      } else if (type === 'income') {
        acc.income += amount;
      } else if (type === 'investment') {
        acc.investments += amount;
      } else if (type === 'transfer') {
        acc.transfers += amount;
      }
      return acc;
    },
    { ...EMPTY_TOTALS }
  );
};

// Type-tab filtering, done client-side on the already-loaded month. Strict
// equality matches the server's .eq('transaction_type', ...) semantics.
export const filterByType = (
  transactions: Transaction[] | undefined,
  typeFilter: TransactionType | 'all'
): Transaction[] | undefined => {
  if (typeFilter === 'all') return transactions;
  return transactions?.filter(t => t.transaction_type === typeFilter);
};
