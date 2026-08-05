import { describe, it, expect } from 'vitest';
import { computeTransactionTotals, filterByType } from '../transactionTotals';
import type { Transaction } from '../../types';

const tx = (overrides: Partial<Transaction>): Transaction =>
  ({
    id: 'id',
    amount: 10,
    date: '2026-08-01',
    is_split: false,
    splits: [],
    transaction_type: 'expense',
    ...overrides,
  }) as Transaction;

describe('computeTransactionTotals', () => {
  it('returns zeros for undefined input', () => {
    expect(computeTransactionTotals(undefined)).toEqual({
      expenses: 0,
      returns: 0,
      income: 0,
      investments: 0,
      transfers: 0,
    });
  });

  it('buckets every transaction type', () => {
    const totals = computeTransactionTotals([
      tx({ amount: 100, transaction_type: 'expense' }),
      tx({ amount: 25, transaction_type: 'return' }),
      tx({ amount: 2000, transaction_type: 'income' }),
      tx({ amount: 500, transaction_type: 'investment' }),
      tx({ amount: 300, transaction_type: 'transfer' }),
    ]);
    expect(totals).toEqual({ expenses: 100, returns: 25, income: 2000, investments: 500, transfers: 300 });
  });

  it('counts only my share for split transactions', () => {
    const totals = computeTransactionTotals([
      tx({
        amount: 400,
        is_split: true,
        splits: [
          { id: 's1', parent_transaction_id: 'id', amount: 100, is_my_share: true, description: 'Your portion', created_at: '2026-08-01' },
          { id: 's2', parent_transaction_id: 'id', amount: 300, is_my_share: false, description: 'Others', created_at: '2026-08-01' },
        ],
      }),
    ]);
    expect(totals.expenses).toBe(100);
  });

  it('falls back on amount sign when transaction_type is missing', () => {
    const totals = computeTransactionTotals([
      tx({ amount: 50, transaction_type: undefined }),
      tx({ amount: -75, transaction_type: undefined }),
    ]);
    expect(totals.expenses).toBe(50);
    expect(totals.income).toBe(75);
  });
});

describe('filterByType', () => {
  const list = [
    tx({ id: 'a', transaction_type: 'expense' }),
    tx({ id: 'b', transaction_type: 'income' }),
    tx({ id: 'c', transaction_type: 'expense' }),
  ];

  it("passes everything through for 'all'", () => {
    expect(filterByType(list, 'all')).toBe(list);
  });

  it('filters by strict type equality', () => {
    expect(filterByType(list, 'expense')?.map(t => t.id)).toEqual(['a', 'c']);
    expect(filterByType(list, 'transfer')).toEqual([]);
  });

  it('handles undefined input', () => {
    expect(filterByType(undefined, 'expense')).toBeUndefined();
  });
});
