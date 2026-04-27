import { describe, it, expect } from 'vitest';
import { computeSpendingVelocity } from '../spending-velocity.js';

describe('computeSpendingVelocity', () => {
  describe('contract', () => {
    it('throws if dailyVariableSpending length does not match daysElapsed', () => {
      expect(() =>
        computeSpendingVelocity({
          daysElapsed: 5,
          daysInMonth: 30,
          spentSoFar: 0,
          recurringSpent: 0,
          expectedFixedCosts: 0,
          lastMonthTotal: 0,
          dailyVariableSpending: [10, 20, 30],
        }),
      ).toThrow(/dailyVariableSpending/);
    });
  });

  describe('empty / boundary cases', () => {
    it('returns zeros early in the month with no spending', () => {
      const result = computeSpendingVelocity({
        daysElapsed: 0,
        daysInMonth: 30,
        spentSoFar: 0,
        recurringSpent: 0,
        expectedFixedCosts: 0,
        lastMonthTotal: 0,
        dailyVariableSpending: [],
      });

      expect(result.projectedTotal).toBe(0);
      expect(result.dailyAverage).toBe(0);
      expect(result.variableSpent).toBe(0);
      expect(result.excludedOutlierAmount).toBe(0);
    });

    it('end of month: no remaining days, projection equals what was spent', () => {
      const dailyVariableSpending = Array(30).fill(100);

      const result = computeSpendingVelocity({
        daysElapsed: 30,
        daysInMonth: 30,
        spentSoFar: 3500,
        recurringSpent: 500,
        expectedFixedCosts: 500,
        lastMonthTotal: 3400,
        dailyVariableSpending,
      });

      expect(result.projectedTotal).toBeCloseTo(3500, 5);
      expect(result.excludedOutlierAmount).toBe(0);
    });
  });

  describe('on-pace projection', () => {
    it('extrapolates variable spending across remaining days', () => {
      const result = computeSpendingVelocity({
        daysElapsed: 10,
        daysInMonth: 30,
        spentSoFar: 1000,
        recurringSpent: 0,
        expectedFixedCosts: 0,
        lastMonthTotal: 3000,
        dailyVariableSpending: Array(10).fill(100),
      });

      expect(result.dailyAverage).toBe(100);
      expect(result.variableSpent).toBe(1000);
      expect(result.projectedTotal).toBeCloseTo(3000, 5);
      expect(result.excludedOutlierAmount).toBe(0);
    });
  });

  describe('no-double-count of expected fixed costs', () => {
    it('does not double-count when full expected fixed has already posted', () => {
      const result = computeSpendingVelocity({
        daysElapsed: 5,
        daysInMonth: 30,
        spentSoFar: 500,
        recurringSpent: 500,
        expectedFixedCosts: 500,
        lastMonthTotal: 500,
        dailyVariableSpending: [0, 0, 0, 0, 0],
      });

      expect(result.projectedTotal).toBeCloseTo(500, 5);
    });

    it('projects only the unpaid portion of expected fixed costs', () => {
      // $300 of $1000 expected fixed has posted; no variable activity.
      // Old (buggy) formula: 1000 + 0 = 1000 ALSO 1000, so this scenario
      // wouldn't expose the bug. Use a case where double-count actually
      // shows up: more recurring posted than expected.
      const result = computeSpendingVelocity({
        daysElapsed: 5,
        daysInMonth: 30,
        spentSoFar: 1500,
        recurringSpent: 1500,
        expectedFixedCosts: 1000,
        lastMonthTotal: 1500,
        dailyVariableSpending: [0, 0, 0, 0, 0],
      });

      // Old formula would have produced 1000 + 0 = 1000, ignoring the
      // $1500 already paid. New formula: 1500 + max(0, 1000-1500) + 0 = 1500.
      expect(result.projectedTotal).toBeCloseTo(1500, 5);
    });

    it('mid-month with partial fixed paid: counts paid + unpaid + variable, no overlap', () => {
      // $300 of $1000 fixed posted; on-pace $50/day variable for 10 days.
      const result = computeSpendingVelocity({
        daysElapsed: 10,
        daysInMonth: 30,
        spentSoFar: 800, // 300 recurring + 500 variable
        recurringSpent: 300,
        expectedFixedCosts: 1000,
        lastMonthTotal: 2400,
        dailyVariableSpending: Array(10).fill(50),
      });

      // 300 + (1000-300) + (500 + 50*20) = 300 + 700 + 1500 = 2500
      expect(result.projectedTotal).toBeCloseTo(2500, 5);
    });
  });

  describe('outlier handling', () => {
    it('trims a clear outlier when daysElapsed >= 7', () => {
      // One $2500 day and nine $50 days. Max ($2500) is > 3x median ($50)
      // and > 2x mean of others ($50), so it qualifies as an outlier.
      const dailyVariableSpending = [2500, 50, 50, 50, 50, 50, 50, 50, 50, 50];

      const result = computeSpendingVelocity({
        daysElapsed: 10,
        daysInMonth: 30,
        spentSoFar: 2950,
        recurringSpent: 0,
        expectedFixedCosts: 0,
        lastMonthTotal: 1500,
        dailyVariableSpending,
      });

      // Behavioral assertions (won't break if exact policy is tweaked):
      const naiveProjection = (2950 / 10) * 30; // $8850
      expect(result.projectedTotal).toBeLessThan(naiveProjection);
      expect(result.projectedTotal).toBeGreaterThanOrEqual(result.spentSoFar);
      expect(result.excludedOutlierAmount).toBe(2500);
    });

    it('does NOT trim when the max day is not a true outlier', () => {
      // $200 max alongside $100 average — within 2x mean and 3x median,
      // so should be kept in the rate.
      const dailyVariableSpending = [200, 80, 90, 110, 100, 95, 105, 100, 90, 110];

      const result = computeSpendingVelocity({
        daysElapsed: 10,
        daysInMonth: 30,
        spentSoFar: 1080,
        recurringSpent: 0,
        expectedFixedCosts: 0,
        lastMonthTotal: 3000,
        dailyVariableSpending,
      });

      // Naive rate is used: 1080/10 * 30 = 3240
      expect(result.projectedTotal).toBeCloseTo(3240, 5);
      expect(result.excludedOutlierAmount).toBe(0);
    });

    it('does NOT trim a single non-zero day on an otherwise empty month', () => {
      // [200, 0, 0, 0, 0, 0, 0, 0, 0, 0]: median and mean of "others" are
      // both 0, so the multiplicative outlier test would technically pass
      // (200 > 0). Trimming would silently produce projectedTotal ≈ 200,
      // which feels semantically wrong — the day wasn't an outlier, it
      // was the only data. Fall back to the naive rate instead.
      const dailyVariableSpending = [200, 0, 0, 0, 0, 0, 0, 0, 0, 0];

      const result = computeSpendingVelocity({
        daysElapsed: 10,
        daysInMonth: 30,
        spentSoFar: 200,
        recurringSpent: 0,
        expectedFixedCosts: 0,
        lastMonthTotal: 500,
        dailyVariableSpending,
      });

      // Naive rate: 200/10 * 30 = 600
      expect(result.projectedTotal).toBeCloseTo(600, 5);
      expect(result.excludedOutlierAmount).toBe(0);
    });

    it('does NOT trim before the min-days threshold', () => {
      // Day 3 of 30, big spike day-1 — not enough samples to tell signal
      // from noise yet, so we extrapolate naively.
      const result = computeSpendingVelocity({
        daysElapsed: 3,
        daysInMonth: 30,
        spentSoFar: 600,
        recurringSpent: 0,
        expectedFixedCosts: 0,
        lastMonthTotal: 2000,
        dailyVariableSpending: [500, 50, 50],
      });

      // 600/3 * 30 = 6000
      expect(result.projectedTotal).toBeCloseTo(6000, 5);
      expect(result.excludedOutlierAmount).toBe(0);
    });
  });

  describe('regression: dashboard projection', () => {
    it('produces a believable projection for the reported scenario', () => {
      // Day 27 of 30, $4237.71 spent, $10.89 of $2596.31 expected fixed
      // posted, $4226.82 variable concentrated in a day-1 outlier (~$2500)
      // plus normal daily activity. The old formula produced ~$7,293.
      // Fix is dominated by the outlier trim (with so little recurring
      // posted, the no-double-count fix is a no-op for THIS scenario —
      // it matters more once recurring posts mid-month).
      const dailyVariableSpending = [
        2500, 50, 30, 40, 80, 60, 70, 100, 50, 60,
        40, 90, 80, 70, 60, 110, 50, 40, 30, 80,
        90, 70, 60, 50, 120, 56.82, 50,
      ];

      const result = computeSpendingVelocity({
        daysElapsed: 27,
        daysInMonth: 30,
        spentSoFar: 4237.71,
        recurringSpent: 10.89,
        expectedFixedCosts: 2596.31,
        lastMonthTotal: 4080,
        dailyVariableSpending,
      });

      expect(result.projectedTotal).toBeLessThan(7000);
      expect(result.projectedTotal).toBeGreaterThanOrEqual(result.spentSoFar);
      expect(result.excludedOutlierAmount).toBe(2500);
    });
  });

  describe('output shape', () => {
    it('passes through metadata fields and renames fixed costs consistently', () => {
      const result = computeSpendingVelocity({
        daysElapsed: 15,
        daysInMonth: 31,
        spentSoFar: 1200,
        recurringSpent: 200,
        expectedFixedCosts: 300,
        lastMonthTotal: 2500,
        dailyVariableSpending: Array(15).fill(66.67),
      });

      expect(result.daysElapsed).toBe(15);
      expect(result.daysInMonth).toBe(31);
      expect(result.spentSoFar).toBe(1200);
      expect(result.recurringSpent).toBe(200);
      expect(result.expectedFixedCosts).toBe(300);
      expect(result.lastMonthTotal).toBe(2500);
      expect(result.variableSpent).toBeCloseTo(15 * 66.67, 5);
      expect(result).toHaveProperty('excludedOutlierAmount');
    });
  });
});
