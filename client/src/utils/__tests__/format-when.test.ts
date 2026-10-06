import { describe, it, expect } from 'vitest';
import { formatWhen } from '../format-when';

const NOW = new Date('2026-10-06T12:00:00Z').getTime();
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

describe('formatWhen', () => {
  it('reads a missing timestamp as never', () => {
    expect(formatWhen(null, NOW)).toBe('never');
    expect(formatWhen(undefined, NOW)).toBe('never');
  });

  it('reads the last 24 hours as today', () => {
    expect(formatWhen(daysAgo(0), NOW)).toBe('today');
    expect(formatWhen(daysAgo(0.9), NOW)).toBe('today');
  });

  it('counts whole days', () => {
    expect(formatWhen(daysAgo(1), NOW)).toBe('1 day ago');
    expect(formatWhen(daysAgo(5.5), NOW)).toBe('5 days ago');
  });

  it('reads a time slightly in the future as today', () => {
    expect(formatWhen(new Date(NOW + 60_000).toISOString(), NOW)).toBe('today');
  });
});
