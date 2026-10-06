import { describe, it, expect } from 'vitest';
import { isCurrentMonth } from '../month';

// Months are 1 based, matching the dashboard and the stats API.
const NOW = new Date(2026, 9, 6); // October 6, 2026

describe('isCurrentMonth', () => {
  it('is true for the month and year of the given date', () => {
    expect(isCurrentMonth(10, 2026, NOW)).toBe(true);
  });

  it('is false for another month in the same year', () => {
    expect(isCurrentMonth(9, 2026, NOW)).toBe(false);
    expect(isCurrentMonth(11, 2026, NOW)).toBe(false);
  });

  it('is false for the same month in another year', () => {
    expect(isCurrentMonth(10, 2025, NOW)).toBe(false);
  });

  it('treats month 1 as January, not 0', () => {
    expect(isCurrentMonth(1, 2026, new Date(2026, 0, 15))).toBe(true);
    expect(isCurrentMonth(0, 2026, new Date(2026, 0, 15))).toBe(false);
  });

  it('defaults to now', () => {
    const now = new Date();
    expect(isCurrentMonth(now.getMonth() + 1, now.getFullYear())).toBe(true);
  });
});
