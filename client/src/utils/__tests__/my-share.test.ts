import { describe, it, expect } from 'vitest';
import { getMyShareAmount } from '../my-share';

const split = (amount: number, isMyShare: boolean) => ({
  id: 's',
  parent_transaction_id: 'p',
  amount,
  description: '',
  is_my_share: isMyShare,
  created_at: '',
});

describe('getMyShareAmount', () => {
  it('returns the absolute amount for an unsplit transaction', () => {
    expect(getMyShareAmount({ amount: -33, is_split: false, splits: undefined })).toBe(33);
  });

  it('sums only my-share splits', () => {
    expect(
      getMyShareAmount({ amount: 100, is_split: true, splits: [split(40, true), split(60, false)] })
    ).toBe(40);
  });

  it('returns 0 when all splits belong to others (matches server semantics)', () => {
    expect(
      getMyShareAmount({ amount: 100, is_split: true, splits: [split(100, false)] })
    ).toBe(0);
  });

  it('falls back to the full amount when splits are missing or empty', () => {
    expect(getMyShareAmount({ amount: 80, is_split: true, splits: [] })).toBe(80);
    expect(getMyShareAmount({ amount: 80, is_split: true, splits: undefined })).toBe(80);
  });
});
