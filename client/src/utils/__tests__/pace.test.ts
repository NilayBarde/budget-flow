import { describe, it, expect } from 'vitest';
import { describePace, PACE_GRACE } from '../pace';

describe('describePace', () => {
  it('is over pace when the projection is more than 5% past the budget, and says by how much', () => {
    // The October 2026 case: $6,766.71 projected against a $5,500 budget.
    const pace = describePace({ projectedTotal: 6766.71, budget: 5500, hasBudget: true });

    expect(pace.onPace).toBe(false);
    expect(pace.difference).toBeCloseTo(1266.71, 2);
    expect(pace.direction).toBe('over');
    expect(pace.against).toBe('budget');
  });

  it('is on pace inside the 5% grace, even though the projection is a little over', () => {
    const pace = describePace({ projectedTotal: 5700, budget: 5500, hasBudget: true });

    expect(pace.onPace).toBe(true);
    expect(pace.direction).toBe('over');
    expect(pace.difference).toBe(200);
  });

  it('is on pace exactly at the grace limit and over just past it', () => {
    expect(describePace({ projectedTotal: 5500 * PACE_GRACE, budget: 5500, hasBudget: true }).onPace).toBe(true);
    expect(describePace({ projectedTotal: 5500 * PACE_GRACE + 0.01, budget: 5500, hasBudget: true }).onPace).toBe(false);
  });

  it('reports how far under the budget a lower projection is', () => {
    const pace = describePace({ projectedTotal: 4800, budget: 5500, hasBudget: true });

    expect(pace.onPace).toBe(true);
    expect(pace.direction).toBe('under');
    expect(pace.difference).toBe(700);
  });

  it('compares against last month when there is no budget, and names it', () => {
    const pace = describePace({ projectedTotal: 3000, budget: 2000, hasBudget: false });

    expect(pace.against).toBe('last month');
    expect(pace.onPace).toBe(false);
    expect(pace.difference).toBe(1000);
  });

  it('marks a projection that is over the budget but inside the grace, so it is not shown as a problem', () => {
    const grace = describePace({ projectedTotal: 5700, budget: 5500, hasBudget: true });

    expect(grace.withinGrace).toBe(true);
    // Well over is not within the grace, and neither is a projection under the budget.
    expect(describePace({ projectedTotal: 6766.71, budget: 5500, hasBudget: true }).withinGrace).toBe(false);
    expect(describePace({ projectedTotal: 4800, budget: 5500, hasBudget: true }).withinGrace).toBe(false);
  });

  it('does not produce NaN from a missing projection or budget', () => {
    for (const input of [
      { projectedTotal: NaN, budget: 5500, hasBudget: true },
      { projectedTotal: 5000, budget: NaN, hasBudget: true },
      { projectedTotal: Infinity, budget: 5500, hasBudget: true },
    ]) {
      const pace = describePace(input);
      expect(pace.difference).toBeNull();
      expect(pace.onPace).toBe(true);
    }
  });

  it('has nothing to compare against when the benchmark is zero', () => {
    const pace = describePace({ projectedTotal: 3000, budget: 0, hasBudget: false });

    expect(pace.onPace).toBe(true);
    expect(pace.difference).toBeNull();
  });
});
