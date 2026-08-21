import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { monthStaleTime, adjacentMonths } from '../monthCache';

describe('monthStaleTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 21)); // Aug 21, 2026
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns Infinity for a month closed more than 7 days ago', () => {
    expect(monthStaleTime(6, 2026)).toBe(Infinity); // June 2026
    expect(monthStaleTime(12, 2025)).toBe(Infinity);
  });

  it('returns undefined for the current month', () => {
    expect(monthStaleTime(8, 2026)).toBeUndefined();
  });

  it('returns undefined for a month that closed within the last 7 days', () => {
    vi.setSystemTime(new Date(2026, 7, 5)); // Aug 5: July ended 5 days ago
    expect(monthStaleTime(7, 2026)).toBeUndefined();
  });

  it('returns Infinity for the previous month once 7 days have passed', () => {
    expect(monthStaleTime(7, 2026)).toBe(Infinity); // Aug 21: July ended 21 days ago
  });

  it('returns undefined for future months', () => {
    expect(monthStaleTime(9, 2026)).toBeUndefined();
    expect(monthStaleTime(1, 2027)).toBeUndefined();
  });

  it('returns undefined when month or year is missing', () => {
    expect(monthStaleTime(undefined, 2026)).toBeUndefined();
    expect(monthStaleTime(8, undefined)).toBeUndefined();
    expect(monthStaleTime()).toBeUndefined();
  });
});

describe('adjacentMonths', () => {
  it('returns the previous and next month', () => {
    expect(adjacentMonths(8, 2026)).toEqual([
      { month: 7, year: 2026 },
      { month: 9, year: 2026 },
    ]);
  });

  it('wraps January back to December of the previous year', () => {
    expect(adjacentMonths(1, 2026)).toEqual([
      { month: 12, year: 2025 },
      { month: 2, year: 2026 },
    ]);
  });

  it('wraps December forward to January of the next year', () => {
    expect(adjacentMonths(12, 2026)).toEqual([
      { month: 11, year: 2026 },
      { month: 1, year: 2027 },
    ]);
  });
});
