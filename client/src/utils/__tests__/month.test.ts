import { describe, it, expect } from 'vitest';
import { isCurrentMonth, monthFromSearchParams } from '../month';

describe('monthFromSearchParams', () => {
  const parse = (query: string) => monthFromSearchParams(new URLSearchParams(query));

  it('reads the month of a ?date= link and keeps the date', () => {
    expect(parse('date=2025-02-07')).toEqual({ month: 2, year: 2025, date: '2025-02-07' });
  });

  it('reads ?month=&year=', () => {
    expect(parse('month=6&year=2024')).toEqual({ month: 6, year: 2024 });
  });

  it('prefers the date over month and year', () => {
    expect(parse('date=2025-02-07&month=6&year=2024')).toEqual({ month: 2, year: 2025, date: '2025-02-07' });
  });

  it('is null when there is nothing to read', () => {
    expect(parse('')).toBeNull();
    expect(parse('month=6')).toBeNull();
  });

  it.each([
    'month=13&year=2026',
    'month=0&year=2026',
    'month=abc&year=2026',
    'month=6.5&year=2026',
    'month=6&year=abc',
    'month=6&year=99999',
  ])('rejects the invalid link ?%s', (query) => {
    expect(parse(query)).toBeNull();
  });

  it.each([
    'date=garbage',
    'date=2025-13-01',
    'date=2025-02-31',
    'date=2025-2-7',
  ])('rejects the invalid link ?%s', (query) => {
    expect(parse(query)).toBeNull();
  });

  it('does not fall back to month and year when the date is invalid', () => {
    expect(parse('date=garbage&month=6&year=2024')).toBeNull();
  });
});

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
