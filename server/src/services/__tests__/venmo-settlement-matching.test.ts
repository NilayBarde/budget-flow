import { describe, it, expect } from 'vitest';
import { findSettlementMatches, type SplitCandidate, type VenmoTransactionCandidate } from '../venmo-settlement-matching.js';

let counter = 0;
const split = (overrides: Partial<SplitCandidate> = {}): SplitCandidate => ({
  id: `split${++counter}`,
  date: '2026-08-01',
  remainingAmount: 25,
  ...overrides,
});
const venmo = (overrides: Partial<VenmoTransactionCandidate> = {}): VenmoTransactionCandidate => ({
  id: `v${++counter}`,
  amount: -25, // money in
  date: '2026-08-03',
  typeManuallySet: false,
  ...overrides,
});

describe('findSettlementMatches', () => {
  it('matches a single Venmo deposit to one unsettled split of the same amount', () => {
    const s = split({ remainingAmount: 25 });
    const v = venmo({ amount: -25 });
    expect(findSettlementMatches([v], [s])).toEqual([
      { venmoTransactionId: v.id, splitIds: [s.id], splitAmounts: { [s.id]: 25 } },
    ]);
  });

  it('does not match a Venmo send (positive amount, money out)', () => {
    const s = split({ remainingAmount: 25 });
    const v = venmo({ amount: 25 });
    expect(findSettlementMatches([v], [s])).toEqual([]);
  });

  it('does not match a transaction whose type was manually set', () => {
    const s = split({ remainingAmount: 25 });
    const v = venmo({ amount: -25, typeManuallySet: true });
    expect(findSettlementMatches([v], [s])).toEqual([]);
  });

  it('does not match a split outside the lookback window', () => {
    const s = split({ remainingAmount: 25, date: '2026-07-01' });
    const v = venmo({ amount: -25, date: '2026-08-03' }); // 33 days later, default window is 21
    expect(findSettlementMatches([v], [s])).toEqual([]);
  });

  it('matches within a custom window', () => {
    const s = split({ remainingAmount: 25, date: '2026-07-01' });
    const v = venmo({ amount: -25, date: '2026-08-03' });
    expect(findSettlementMatches([v], [s], 40)).toEqual([
      { venmoTransactionId: v.id, splitIds: [s.id], splitAmounts: { [s.id]: 25 } },
    ]);
  });

  it('sum-matches two unsettled splits to one Venmo deposit covering both', () => {
    const s1 = split({ remainingAmount: 12.5 });
    const s2 = split({ remainingAmount: 17.5 });
    const v = venmo({ amount: -30 });
    const [match] = findSettlementMatches([v], [s1, s2]);
    expect(match.venmoTransactionId).toBe(v.id);
    expect(match.splitIds.sort()).toEqual([s1.id, s2.id].sort());
    expect(match.splitAmounts).toEqual({ [s1.id]: 12.5, [s2.id]: 17.5 });
  });

  it('skips an ambiguous sum-match rather than guessing', () => {
    // Two different pairs both sum to 30: either is equally valid, so neither is picked.
    const s1 = split({ remainingAmount: 10 });
    const s2 = split({ remainingAmount: 20 });
    const s3 = split({ remainingAmount: 15 });
    const s4 = split({ remainingAmount: 15 });
    const v = venmo({ amount: -30 });
    expect(findSettlementMatches([v], [s1, s2, s3, s4])).toEqual([]);
  });

  it('skips an ambiguous 1:1 match rather than guessing which split it was', () => {
    // Two unrelated splits (two different dinners/friends) happen to owe the same amount.
    // Picking either one would silently settle the wrong split, so neither is picked.
    const s1 = split({ remainingAmount: 25 });
    const s2 = split({ remainingAmount: 25 });
    const v = venmo({ amount: -25 });
    expect(findSettlementMatches([v], [s1, s2])).toEqual([]);
  });

  it('never reuses a split across two different Venmo transactions', () => {
    const s = split({ remainingAmount: 25 });
    const v1 = venmo({ amount: -25, date: '2026-08-03' });
    const v2 = venmo({ amount: -25, date: '2026-08-04' });
    const matches = findSettlementMatches([v1, v2], [s]);
    expect(matches).toHaveLength(1);
    expect(matches[0].venmoTransactionId).toBe(v1.id);
  });

  it('returns no match when no combination of splits sums to the amount', () => {
    const s = split({ remainingAmount: 10 });
    const v = venmo({ amount: -25 });
    expect(findSettlementMatches([v], [s])).toEqual([]);
  });
});
