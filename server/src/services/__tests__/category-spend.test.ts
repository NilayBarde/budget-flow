import { describe, it, expect } from 'vitest';
import { getMyShareAmount, computeCategorySpend } from '../category-spend.js';

describe('getMyShareAmount', () => {
  it('returns the absolute amount for an unsplit transaction', () => {
    expect(getMyShareAmount({ amount: 42.5, is_split: false })).toBe(42.5);
  });

  it('returns the absolute amount for a negative unsplit amount', () => {
    expect(getMyShareAmount({ amount: -12, is_split: false })).toBe(12);
  });

  it('sums only my-share splits for a split transaction', () => {
    const t = {
      amount: 100,
      is_split: true,
      splits: [
        { amount: 40, is_my_share: true },
        { amount: 60, is_my_share: false },
      ],
    };
    expect(getMyShareAmount(t)).toBe(40);
  });

  it('returns 0 when all splits belong to others', () => {
    const t = {
      amount: 100,
      is_split: true,
      splits: [{ amount: 100, is_my_share: false }],
    };
    expect(getMyShareAmount(t)).toBe(0);
  });

  it('falls back to the full amount when is_split is true but splits are missing', () => {
    expect(getMyShareAmount({ amount: 80, is_split: true, splits: [] })).toBe(80);
    expect(getMyShareAmount({ amount: 80, is_split: true, splits: null })).toBe(80);
  });
});

describe('computeCategorySpend', () => {
  const row = (overrides: Record<string, unknown>) => ({
    category_id: 'cat-1',
    amount: 0,
    transaction_type: 'expense',
    is_split: false,
    splits: null,
    ...overrides,
  });

  it('sums expenses per category', () => {
    const result = computeCategorySpend([
      row({ amount: 10 }),
      row({ amount: 15 }),
      row({ amount: 5, category_id: 'cat-2' }),
    ]);
    expect(result.get('cat-1')).toBe(25);
    expect(result.get('cat-2')).toBe(5);
  });

  it('nets a return processed BEFORE its matching expense (two-pass fix)', () => {
    const result = computeCategorySpend([
      row({ amount: -20, transaction_type: 'return' }),
      row({ amount: 50 }),
    ]);
    expect(result.get('cat-1')).toBe(30);
  });

  it('clamps a category at zero when returns exceed expenses', () => {
    const result = computeCategorySpend([
      row({ amount: 10 }),
      row({ amount: -25, transaction_type: 'return' }),
    ]);
    expect(result.get('cat-1')).toBe(0);
  });

  it('ignores returns for categories with no expenses', () => {
    const result = computeCategorySpend([
      row({ amount: -25, transaction_type: 'return', category_id: 'cat-9' }),
    ]);
    expect(result.has('cat-9')).toBe(false);
  });

  it('counts only my share of split expenses and split returns', () => {
    const result = computeCategorySpend([
      row({
        amount: 100,
        is_split: true,
        splits: [
          { amount: 30, is_my_share: true },
          { amount: 70, is_my_share: false },
        ],
      }),
      row({
        amount: -50,
        transaction_type: 'return',
        is_split: true,
        splits: [
          { amount: 10, is_my_share: true },
          { amount: 40, is_my_share: false },
        ],
      }),
    ]);
    expect(result.get('cat-1')).toBe(20);
  });

  it('skips rows without a category and ignores other transaction types', () => {
    const result = computeCategorySpend([
      row({ amount: 10, category_id: null }),
      row({ amount: 10, transaction_type: 'transfer' }),
      row({ amount: 10, transaction_type: 'income' }),
      row({ amount: 10, transaction_type: 'investment' }),
    ]);
    expect(result.size).toBe(0);
  });

  it('falls back to sign-based type when transaction_type is null', () => {
    const result = computeCategorySpend([
      row({ amount: 10, transaction_type: null }),
    ]);
    expect(result.get('cat-1')).toBe(10);
  });
});
