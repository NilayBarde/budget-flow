import { describe, it, expect } from 'vitest';
import { findMissedSplitCandidates } from '../missed-splits';
import type { Transaction } from '../../types';

const tx = (overrides: Partial<Transaction> = {}): Transaction =>
  ({
    id: 't1',
    amount: 150,
    is_split: false,
    split_dismissed: false,
    ...overrides,
  }) as Transaction;

describe('findMissedSplitCandidates', () => {
  it('lists an unsplit expense at or above the threshold', () => {
    expect(findMissedSplitCandidates([tx({ amount: 100 })], 100)).toHaveLength(1);
  });

  it('leaves out an expense below the threshold', () => {
    expect(findMissedSplitCandidates([tx({ amount: 99.99 })], 100)).toHaveLength(0);
  });

  it('leaves out one that is already split', () => {
    expect(findMissedSplitCandidates([tx({ is_split: true })], 100)).toHaveLength(0);
  });

  it('leaves out one the user marked as not to be split', () => {
    expect(findMissedSplitCandidates([tx({ split_dismissed: true })], 100)).toHaveLength(0);
  });

  it('keeps a row that has no dismissal field, as every row did before the column existed', () => {
    const { split_dismissed: _unused, ...legacy } = tx();
    expect(findMissedSplitCandidates([legacy as Transaction], 100)).toHaveLength(1);
  });

  it('dismissing one row does not hide another from the same merchant', () => {
    const rows = [
      tx({ id: 'rent-sep', amount: 2497.49, merchant_name: 'Bilt Housing Payment', split_dismissed: true }),
      tx({ id: 'rent-oct', amount: 2497.49, merchant_name: 'Bilt Housing Payment' }),
    ];
    expect(findMissedSplitCandidates(rows, 100).map(t => t.id)).toEqual(['rent-oct']);
  });

  it('measures the size of a refund by its absolute amount, as the card always has', () => {
    expect(findMissedSplitCandidates([tx({ amount: -150 })], 100)).toHaveLength(1);
  });

  it('sorts the largest first', () => {
    const rows = [tx({ id: 'small', amount: 120 }), tx({ id: 'big', amount: 2400 }), tx({ id: 'mid', amount: 186.5 })];
    expect(findMissedSplitCandidates(rows, 100).map(t => t.id)).toEqual(['big', 'mid', 'small']);
  });
});
