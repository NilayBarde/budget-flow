import { describe, it, expect } from 'vitest';
import { resolveBudgetTarget } from '../budget-target';
import type { BudgetGoal } from '../../types';

const goal = (limit_amount: number): BudgetGoal => ({ limit_amount }) as BudgetGoal;

describe('resolveBudgetTarget', () => {
  it('uses the monthly budget the user set by hand when there is one', () => {
    expect(resolveBudgetTarget('5600', [goal(100), goal(200)])).toBe(5600);
  });

  it('falls back to the sum of the category limits when no overall budget is set', () => {
    expect(resolveBudgetTarget(undefined, [goal(100), goal(250.5)])).toBe(350.5);
    expect(resolveBudgetTarget(null, [goal(100)])).toBe(100);
    expect(resolveBudgetTarget('', [goal(100)])).toBe(100);
  });

  it('ignores a manual budget that is zero, negative or not a number', () => {
    expect(resolveBudgetTarget('0', [goal(100)])).toBe(100);
    expect(resolveBudgetTarget('-50', [goal(100)])).toBe(100);
    expect(resolveBudgetTarget('abc', [goal(100)])).toBe(100);
  });

  it('is zero when there is neither a manual budget nor any goals', () => {
    expect(resolveBudgetTarget(undefined, [])).toBe(0);
    expect(resolveBudgetTarget(undefined, undefined)).toBe(0);
  });
});
