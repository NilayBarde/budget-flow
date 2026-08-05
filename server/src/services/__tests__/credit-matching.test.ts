import { describe, it, expect } from 'vitest';
import { matchCreditsToCharges } from '../credit-matching.js';
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
