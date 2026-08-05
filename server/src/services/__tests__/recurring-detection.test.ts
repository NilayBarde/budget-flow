import { describe, it, expect } from 'vitest';
import { detectRecurringSeries, type DetectionTxn } from '../recurring-detection.js';

const TODAY = '2026-08-05';

// Build a run of charges: one per interval, ending `endDaysAgo` before TODAY.
const series = (
  merchant: string,
  amount: number,
  intervalDays: number,
  count: number,
  endDaysAgo = 5,
  type = 'expense'
): DetectionTxn[] => {
  const end = new Date('2026-08-05T00:00:00Z');
  const txns: DetectionTxn[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - endDaysAgo - i * intervalDays);
    txns.push({
      merchant: merchant,
      amount,
      date: d.toISOString().slice(0, 10),
      transaction_type: type,
    });
  }
  return txns;
};

describe('detectRecurringSeries', () => {
  it('detects a stable monthly subscription', () => {
    const result = detectRecurringSeries(series('Spotify', 10.99, 30, 8), TODAY);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      merchant: 'Spotify',
      frequency: 'monthly',
      isActive: true,
    });
    expect(result[0].averageAmount).toBeCloseTo(10.99, 2);
  });

  it('detects a weekly series', () => {
    const result = detectRecurringSeries(series('Gym Class', 25, 7, 10), TODAY);
    expect(result[0]).toMatchObject({ frequency: 'weekly', isActive: true });
  });

  it('detects a yearly series from two charges', () => {
    const result = detectRecurringSeries(series('Clear', 209, 365, 2, 40), TODAY);
    expect(result[0]).toMatchObject({ frequency: 'yearly', isActive: true });
  });

  it('marks a stopped series inactive', () => {
    // Monthly charges that ended ~100 days ago
    const result = detectRecurringSeries(series('Hulu', 10.64, 30, 6, 100), TODAY);
    expect(result[0]).toMatchObject({ frequency: 'monthly', isActive: false });
  });

  it('rejects merchants with irregular gaps (shopping, not subscription)', () => {
    const txns: DetectionTxn[] = [
      { merchant: 'Amazon', amount: 20, date: '2026-08-01', transaction_type: 'expense' },
      { merchant: 'Amazon', amount: 35, date: '2026-07-29', transaction_type: 'expense' },
      { merchant: 'Amazon', amount: 12, date: '2026-07-27', transaction_type: 'expense' },
      { merchant: 'Amazon', amount: 90, date: '2026-06-20', transaction_type: 'expense' },
      { merchant: 'Amazon', amount: 15, date: '2026-06-18', transaction_type: 'expense' },
      { merchant: 'Amazon', amount: 44, date: '2026-04-02', transaction_type: 'expense' },
    ];
    expect(detectRecurringSeries(txns, TODAY)).toHaveLength(0);
  });

  it('rejects near-daily merchants like transit taps', () => {
    const result = detectRecurringSeries(series('MTA', 2.9, 2, 40), TODAY);
    expect(result).toHaveLength(0);
  });

  it('ignores non-expense transaction types (payroll is income)', () => {
    const payroll = series('Disney Entertainment Payment', 1513.96, 7, 20, 3, 'income');
    expect(detectRecurringSeries(payroll, TODAY)).toHaveLength(0);
  });

  it('tolerates moderate amount variation (utilities)', () => {
    const txns: DetectionTxn[] = [
      { merchant: 'Con Edison', amount: 91.68, date: '2026-01-05', transaction_type: 'expense' },
      { merchant: 'Con Edison', amount: 119.16, date: '2026-02-01', transaction_type: 'expense' },
      { merchant: 'Con Edison', amount: 129.22, date: '2026-03-08', transaction_type: 'expense' },
      { merchant: 'Con Edison', amount: 78.87, date: '2026-04-08', transaction_type: 'expense' },
      { merchant: 'Con Edison', amount: 94.23, date: '2026-05-19', transaction_type: 'expense' },
      { merchant: 'Con Edison', amount: 90.41, date: '2026-06-05', transaction_type: 'expense' },
    ];
    const result = detectRecurringSeries(txns, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].frequency).toBe('monthly');
  });

  it('rejects weekly-cadence habits with unstable amounts (groceries)', () => {
    const amounts = [12.4, 55.1, 34.55, 8.9, 71.2, 28.0, 44.7, 19.3, 62.5, 33.1];
    const txns: DetectionTxn[] = amounts.map((amount, i) => {
      const d = new Date('2026-08-05T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - 4 - i * 7);
      return { merchant: "Trader Joe's", amount, date: d.toISOString().slice(0, 10), transaction_type: 'expense' };
    });
    expect(detectRecurringSeries(txns, TODAY)).toHaveLength(0);
  });

  it('keeps weekly series with stable amounts', () => {
    const result = detectRecurringSeries(series('Weekly Box', 24.99, 7, 10), TODAY);
    expect(result).toHaveLength(1);
  });

  it('rejects series with too few charges', () => {
    expect(detectRecurringSeries(series('New Thing', 9.99, 30, 2), TODAY)).toHaveLength(0);
  });

  it('uses the median charge as the average amount (outlier-resistant)', () => {
    const txns = [
      ...series('Peacock', 15.94, 30, 5, 35),
      { merchant: 'Peacock', amount: 47.82, date: '2026-08-01', transaction_type: 'expense' }, // 3-month bundle billed once
    ];
    const result = detectRecurringSeries(txns, TODAY);
    expect(result[0].averageAmount).toBeCloseTo(15.94, 2);
  });

  it('detects credit series when given return transactions', () => {
    const credits = series('Platinum Walmart+ Credit', 12.95, 30, 6, 10, 'return');
    const result = detectRecurringSeries(credits, TODAY, 'return');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ frequency: 'monthly', isActive: true });
  });
});
