import { describe, it, expect } from 'vitest';
import {
  getEffectiveAmount,
  sortTransactions,
  filterByAmountRange,
} from '../transactionSort';
import type { Transaction, TransactionSplit } from '../../types';

const makeTransaction = (overrides: Partial<Transaction>): Transaction => ({
  id: 'tx-1',
  account_id: 'acc-1',
  plaid_transaction_id: null,
  amount: 10,
  date: '2026-08-01',
  merchant_name: 'Merchant',
  original_description: null,
  merchant_display_name: null,
  category_id: null,
  transaction_type: 'expense',
  is_split: false,
  parent_transaction_id: null,
  is_recurring: false,
  needs_review: false,
  pending: false,
  plaid_category: null,
  notes: null,
  created_at: '2026-08-01T00:00:00Z',
  ...overrides,
});

const makeSplit = (overrides: Partial<TransactionSplit>): TransactionSplit => ({
  id: 'split-1',
  parent_transaction_id: 'tx-1',
  amount: 5,
  description: '',
  is_my_share: true,
  created_at: '2026-08-01T00:00:00Z',
  ...overrides,
});

describe('getEffectiveAmount', () => {
  it('returns absolute amount for regular transactions', () => {
    expect(getEffectiveAmount(makeTransaction({ amount: -42.5 }))).toBe(42.5);
    expect(getEffectiveAmount(makeTransaction({ amount: 42.5 }))).toBe(42.5);
  });

  it('sums only my-share splits for split transactions', () => {
    const tx = makeTransaction({
      amount: 100,
      is_split: true,
      splits: [
        makeSplit({ id: 's1', amount: 30, is_my_share: true }),
        makeSplit({ id: 's2', amount: 70, is_my_share: false }),
      ],
    });
    expect(getEffectiveAmount(tx)).toBe(30);
  });

  it('falls back to absolute amount when split flag is set but splits are empty', () => {
    const tx = makeTransaction({ amount: 80, is_split: true, splits: [] });
    expect(getEffectiveAmount(tx)).toBe(80);
  });
});

describe('sortTransactions', () => {
  const transactions = [
    makeTransaction({ id: 'a', amount: 20, date: '2026-08-03', merchant_name: 'Costco' }),
    makeTransaction({ id: 'b', amount: -500, date: '2026-08-01', merchant_name: 'Amazon' }),
    makeTransaction({ id: 'c', amount: 5, date: '2026-08-10', merchant_name: 'Zara' }),
  ];

  it('sorts by amount high to low using absolute values', () => {
    const result = sortTransactions(transactions, 'amount_desc');
    expect(result.map(t => t.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by amount low to high', () => {
    const result = sortTransactions(transactions, 'amount_asc');
    expect(result.map(t => t.id)).toEqual(['c', 'a', 'b']);
  });

  it('sorts by date newest first', () => {
    const result = sortTransactions(transactions, 'date_desc');
    expect(result.map(t => t.id)).toEqual(['c', 'a', 'b']);
  });

  it('sorts by date oldest first', () => {
    const result = sortTransactions(transactions, 'date_asc');
    expect(result.map(t => t.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by merchant name alphabetically, preferring display name', () => {
    const withDisplay = [
      makeTransaction({ id: 'a', merchant_name: 'AAA Raw', merchant_display_name: 'Zebra' }),
      makeTransaction({ id: 'b', merchant_name: 'Bravo' }),
    ];
    const result = sortTransactions(withDisplay, 'merchant_asc');
    expect(result.map(t => t.id)).toEqual(['b', 'a']);
  });

  it('uses my-share amount for split transactions when sorting by amount', () => {
    const withSplit = [
      makeTransaction({ id: 'big', amount: 50 }),
      makeTransaction({
        id: 'split',
        amount: 200,
        is_split: true,
        splits: [
          makeSplit({ id: 's1', amount: 10, is_my_share: true }),
          makeSplit({ id: 's2', amount: 190, is_my_share: false }),
        ],
      }),
    ];
    const result = sortTransactions(withSplit, 'amount_desc');
    expect(result.map(t => t.id)).toEqual(['big', 'split']);
  });

  it('does not mutate the input array', () => {
    const input = [...transactions];
    sortTransactions(input, 'amount_desc');
    expect(input.map(t => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('breaks amount ties by most recent date', () => {
    const tied = [
      makeTransaction({ id: 'old', amount: 10, date: '2026-08-01' }),
      makeTransaction({ id: 'new', amount: 10, date: '2026-08-09' }),
    ];
    const result = sortTransactions(tied, 'amount_desc');
    expect(result.map(t => t.id)).toEqual(['new', 'old']);
  });
});

describe('filterByAmountRange', () => {
  const transactions = [
    makeTransaction({ id: 'small', amount: 5 }),
    makeTransaction({ id: 'mid', amount: -50 }),
    makeTransaction({ id: 'large', amount: 500 }),
  ];

  it('returns all transactions when no bounds are set', () => {
    expect(filterByAmountRange(transactions)).toEqual(transactions);
  });

  it('filters by minimum amount using absolute values', () => {
    const result = filterByAmountRange(transactions, 50);
    expect(result.map(t => t.id)).toEqual(['mid', 'large']);
  });

  it('filters by maximum amount', () => {
    const result = filterByAmountRange(transactions, undefined, 50);
    expect(result.map(t => t.id)).toEqual(['small', 'mid']);
  });

  it('filters by both bounds inclusively', () => {
    const result = filterByAmountRange(transactions, 5, 50);
    expect(result.map(t => t.id)).toEqual(['small', 'mid']);
  });

  it('uses my-share amount for split transactions', () => {
    const withSplit = [
      makeTransaction({
        id: 'split',
        amount: 200,
        is_split: true,
        splits: [
          makeSplit({ id: 's1', amount: 10, is_my_share: true }),
          makeSplit({ id: 's2', amount: 190, is_my_share: false }),
        ],
      }),
    ];
    expect(filterByAmountRange(withSplit, 100).map(t => t.id)).toEqual([]);
    expect(filterByAmountRange(withSplit, undefined, 20).map(t => t.id)).toEqual(['split']);
  });
});
