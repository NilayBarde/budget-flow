import { describe, it, expect } from 'vitest';
import {
  matchCreditsByPosting,
  matchCreditsToCharges,
  resolveCreditOffsets,
  type PostingTxn,
} from '../credit-matching.js';
import type { DetectedSeries } from '../recurring-detection.js';

const series = (merchant: string, averageAmount: number, frequency: 'weekly' | 'monthly' | 'yearly' = 'monthly'): DetectedSeries => ({
  merchant,
  frequency,
  averageAmount,
  lastSeen: '2026-08-01',
  isActive: true,
});

describe('matchCreditsToCharges', () => {
  it('matches by shared significant name token', () => {
    const matches = matchCreditsToCharges(
      [series('Walmart+', 14.1), series('Spotify', 10.99)],
      [series('Platinum Walmart+ Credit', 14.1)]
    );
    expect(matches.get('Walmart+')?.merchant).toBe('Platinum Walmart+ Credit');
    expect(matches.has('Spotify')).toBe(false);
  });

  it('ignores generic tokens like credit/platinum/amex', () => {
    const matches = matchCreditsToCharges(
      [series('Clear', 209, 'yearly')],
      [series('Amex Clear Plus Credit', 209, 'yearly')]
    );
    expect(matches.get('Clear')?.merchant).toBe('Amex Clear Plus Credit');
  });

  it('matches identical mapped names (charge Dunkin, credit Dunkin)', () => {
    const matches = matchCreditsToCharges([series("Dunkin'", 7)], [series("Dunkin'", 7)]);
    expect(matches.get("Dunkin'")?.merchant).toBe("Dunkin'");
  });

  it('rejects credits much larger than the charge', () => {
    const matches = matchCreditsToCharges(
      [series('Walmart+', 14.1)],
      [series('Walmart Grocery Refund Credit', 180)]
    );
    expect(matches.size).toBe(0);
  });

  it('requires matching cadence', () => {
    const matches = matchCreditsToCharges(
      [series('Clear', 209, 'yearly')],
      [series('Clear Credit', 209, 'monthly')]
    );
    expect(matches.size).toBe(0);
  });

  it('pairs each credit to at most one charge (best token overlap first)', () => {
    const matches = matchCreditsToCharges(
      [series('Uber One', 5.49), series('Uber', 24.9)],
      [series('Uber Credit', 5.49)]
    );
    // Amount proximity should break the token tie toward Uber One
    expect(matches.get('Uber One')?.merchant).toBe('Uber Credit');
    expect(matches.has('Uber')).toBe(false);
  });

  it('exposes the monthly-equivalent credit amount', () => {
    const matches = matchCreditsToCharges(
      [series('Clear', 209, 'yearly')],
      [series('Amex Clear Plus Credit', 209, 'yearly')]
    );
    expect(matches.get('Clear')?.monthlyAmount).toBeCloseTo(209 / 12, 2);
  });
});

describe('matchCreditsByPosting', () => {
  const PLATINUM = 'Platinum Card';
  const charge = (merchant: string, amount: number, date: string, accountName = PLATINUM): PostingTxn => ({
    merchant,
    amount,
    date,
    transaction_type: 'expense',
    accountName,
  });
  const credit = (merchant: string, amount: number, date: string, accountName = PLATINUM): PostingTxn => ({
    merchant,
    amount,
    date,
    transaction_type: 'return',
    accountName,
  });

  const peacock = series('Peacock', 15.94);
  const nyt = series('New York Times', 8.07);

  // Mirrors the real Amex Platinum digital entertainment credit: posted a
  // day or more after each charge, for the charge amount, under a name that
  // shares no word with the merchant. Its own series never forms because the
  // credits land on irregular days.
  const entertainmentTxns: PostingTxn[] = [
    charge('Peacock', 15.94, '2026-07-21'),
    charge('Peacock', 15.94, '2026-08-21'),
    charge('Peacock', 15.94, '2026-09-21'),
    charge('New York Times', 8, '2026-07-21'),
    charge('New York Times', 8.15, '2026-08-18'),
    charge('New York Times', 8.15, '2026-09-15'),
    credit('Platinum Digital Entertainment Credit', 15.94, '2026-07-22'),
    credit('Platinum Digital Entertainment Credit', 8, '2026-07-22'),
    credit('Platinum Digital Entertainment Credit', 8.15, '2026-08-20'),
    credit('Platinum Digital Entertainment Credit', 15.94, '2026-08-29'),
    credit('Platinum Digital Entertainment Credit', 8.15, '2026-09-16'),
  ];

  it('pairs charges with a differently named credit by amount, account and timing', () => {
    const matches = matchCreditsByPosting([peacock, nyt], entertainmentTxns);

    expect(matches.get('Peacock')).toEqual({
      merchant: 'Platinum Digital Entertainment Credit',
      monthlyAmount: 15.94,
    });
    // Capped at the charge so a $8.15 credit cannot exceed an $8.07 average
    expect(matches.get('New York Times')).toEqual({
      merchant: 'Platinum Digital Entertainment Credit',
      monthlyAmount: 8.07,
    });
  });

  it('still matches when the latest charge has not been credited yet', () => {
    // Peacock's September charge has no credit; July and August do.
    const matches = matchCreditsByPosting([peacock], entertainmentTxns);

    expect(matches.has('Peacock')).toBe(true);
  });

  it('pairs a credit that shares a word with the charge name', () => {
    const matches = matchCreditsByPosting(
      [series('Walmart+', 12.95)],
      [
        charge('Walmart+', 12.95, '2026-07-03'),
        charge('Walmart+', 12.95, '2026-08-03'),
        charge('Walmart+', 12.95, '2026-09-03'),
        credit('Walmart', 12.95, '2026-07-04'),
        credit('Walmart', 12.95, '2026-08-04'),
        credit('Walmart', 12.95, '2026-09-04'),
      ],
    );

    expect(matches.get('Walmart+')).toEqual({ merchant: 'Walmart', monthlyAmount: 12.95 });
  });

  it('ignores credits on a different account', () => {
    const matches = matchCreditsByPosting(
      [peacock],
      entertainmentTxns.map(t =>
        t.transaction_type === 'return' ? { ...t, accountName: 'Gold Card' } : t,
      ),
    );

    expect(matches.size).toBe(0);
  });

  it('needs at least two paired charges', () => {
    const matches = matchCreditsByPosting(
      [peacock],
      [
        charge('Peacock', 15.94, '2026-07-21'),
        charge('Peacock', 15.94, '2026-08-21'),
        charge('Peacock', 15.94, '2026-09-21'),
        credit('Platinum Digital Entertainment Credit', 15.94, '2026-08-22'),
      ],
    );

    expect(matches.size).toBe(0);
  });

  it('ignores credits posted too long after the charge', () => {
    const matches = matchCreditsByPosting(
      [peacock],
      [
        charge('Peacock', 15.94, '2026-07-21'),
        charge('Peacock', 15.94, '2026-08-21'),
        charge('Peacock', 15.94, '2026-09-21'),
        credit('Platinum Digital Entertainment Credit', 15.94, '2026-08-05'),
        credit('Platinum Digital Entertainment Credit', 15.94, '2026-09-05'),
        credit('Platinum Digital Entertainment Credit', 15.94, '2026-10-05'),
      ],
    );

    expect(matches.size).toBe(0);
  });

  it('ignores credits whose amount does not line up with the charge', () => {
    const matches = matchCreditsByPosting(
      [peacock],
      [
        charge('Peacock', 15.94, '2026-07-21'),
        charge('Peacock', 15.94, '2026-08-21'),
        charge('Peacock', 15.94, '2026-09-21'),
        credit('Platinum Digital Entertainment Credit', 5, '2026-07-22'),
        credit('Platinum Digital Entertainment Credit', 5, '2026-08-22'),
        credit('Platinum Digital Entertainment Credit', 5, '2026-09-22'),
      ],
    );

    expect(matches.size).toBe(0);
  });

  it('ignores an unrelated refund that happens to match the amount', () => {
    const matches = matchCreditsByPosting(
      [peacock],
      [
        charge('Peacock', 15.94, '2026-07-21'),
        charge('Peacock', 15.94, '2026-08-21'),
        charge('Peacock', 15.94, '2026-09-21'),
        credit('Zara', 15.94, '2026-07-22'),
        credit('Zara', 15.94, '2026-08-22'),
        credit('Zara', 15.94, '2026-09-22'),
      ],
    );

    expect(matches.size).toBe(0);
  });

  it('uses each credit posting for at most one charge', () => {
    // Two $10 subscriptions, but only one $10 credit per month.
    const a = series('Service A', 10);
    const b = series('Service B', 10);
    const matches = matchCreditsByPosting(
      [a, b],
      [
        charge('Service A', 10, '2026-07-01'),
        charge('Service A', 10, '2026-08-01'),
        charge('Service A', 10, '2026-09-01'),
        charge('Service B', 10, '2026-07-01'),
        charge('Service B', 10, '2026-08-01'),
        charge('Service B', 10, '2026-09-01'),
        credit('Amex Streaming Credit', 10, '2026-07-02'),
        credit('Amex Streaming Credit', 10, '2026-08-02'),
        credit('Amex Streaming Credit', 10, '2026-09-02'),
      ],
    );

    expect(matches.size).toBe(1);
  });

  it('only considers monthly series', () => {
    const yearly = series('Clear', 209, 'yearly');
    const matches = matchCreditsByPosting(
      [yearly],
      [
        charge('Clear', 209, '2025-08-01'),
        charge('Clear', 209, '2026-08-01'),
        credit('Amex Clear Credit', 209, '2025-08-02'),
        credit('Amex Clear Credit', 209, '2026-08-02'),
      ],
    );

    expect(matches.size).toBe(0);
  });
});

describe('resolveCreditOffsets', () => {
  const ACCOUNT = 'Platinum Card';
  const walmartPlus = series('Walmart+', 12.95);
  const walmartCredit = series('Walmart', 12.95);
  const walmartTxns: PostingTxn[] = [
    ...['2026-07-03', '2026-08-03', '2026-09-03'].map(date => ({
      merchant: 'Walmart+',
      amount: 12.95,
      date,
      transaction_type: 'expense',
      accountName: ACCOUNT,
    })),
    ...['2026-07-04', '2026-08-04', '2026-09-04'].map(date => ({
      merchant: 'Walmart',
      amount: 12.95,
      date,
      transaction_type: 'return',
      accountName: ACCOUNT,
    })),
  ];

  it('prefers a posting match over the name match for the same credit', () => {
    const { offsets } = resolveCreditOffsets({
      charges: [walmartPlus],
      deletedCharges: [],
      credits: [walmartCredit],
      txns: walmartTxns,
    });

    expect(offsets.get('Walmart+')).toEqual({ merchant: 'Walmart', monthlyAmount: 12.95 });
  });

  it('keeps a deleted charge\'s credit marked as matched so it is not counted as free standing', () => {
    const { offsets, matchedCreditNames } = resolveCreditOffsets({
      charges: [],
      deletedCharges: [walmartPlus],
      credits: [walmartCredit],
      txns: walmartTxns,
    });

    expect(offsets.size).toBe(0);
    expect(matchedCreditNames.has('Walmart')).toBe(true);
  });

  it('does not let a deleted charge take a credit from a visible one', () => {
    // A deleted "Walmart" grocery series shares the credit's name; the live
    // Walmart+ subscription must still get it.
    const deletedWalmart = series('Walmart', 14.1);
    const { offsets } = resolveCreditOffsets({
      charges: [walmartPlus],
      deletedCharges: [deletedWalmart],
      credits: [walmartCredit],
      txns: walmartTxns,
    });

    expect(offsets.get('Walmart+')?.merchant).toBe('Walmart');
    expect(offsets.has('Walmart')).toBe(false);
  });

  it('reports every claimed credit name, visible and deleted', () => {
    const { matchedCreditNames } = resolveCreditOffsets({
      charges: [series('Dunkin\'', 7)],
      deletedCharges: [walmartPlus],
      credits: [series('Dunkin\'', 7), walmartCredit],
      txns: walmartTxns,
    });

    expect([...matchedCreditNames].sort()).toEqual(['Dunkin\'', 'Walmart']);
  });
});
