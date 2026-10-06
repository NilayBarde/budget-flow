import { describe, it, expect } from 'vitest';
import { computeCashFlow } from '../cash-flow';

describe('computeCashFlow', () => {
  it('uses actual income for a finished month, not the expected income setting', () => {
    // September 2026: $10,288.84 came in, $4,291.77 spent, $5,247.07 invested.
    const result = computeCashFlow({
      actualIncome: 10288.84,
      expectedIncome: 6885,
      totalSpent: 4291.77,
      totalInvested: 5247.07,
      isCurrentMonth: false,
    });

    expect(result.cashFlow).toBeCloseTo(750, 2);
    expect(result.projectedCashFlow).toBeNull();
  });

  it('uses income received so far for the current month and projects with expected income', () => {
    const result = computeCashFlow({
      actualIncome: 1500,
      expectedIncome: 6885,
      totalSpent: 800,
      totalInvested: 200,
      isCurrentMonth: true,
    });

    expect(result.cashFlow).toBe(500);
    expect(result.projectedCashFlow).toBe(5885);
  });

  it('never projects below what has already come in when income beats the expected setting', () => {
    // $10,000 received against a $6,885 expectation: the projection must not drop under "so far".
    const result = computeCashFlow({
      actualIncome: 10000,
      expectedIncome: 6885,
      totalSpent: 800,
      totalInvested: 200,
      isCurrentMonth: true,
    });

    expect(result.cashFlow).toBe(9000);
    expect(result.projectedCashFlow).toBe(9000);
  });

  it('does not project when no expected income is set', () => {
    const result = computeCashFlow({
      actualIncome: 1500,
      expectedIncome: 0,
      totalSpent: 800,
      totalInvested: 0,
      isCurrentMonth: true,
    });

    expect(result.projectedCashFlow).toBeNull();
  });

  it('goes negative when spending and investing exceed income actually received', () => {
    const result = computeCashFlow({
      actualIncome: 3000,
      expectedIncome: 6885,
      totalSpent: 4000,
      totalInvested: 500,
      isCurrentMonth: false,
    });

    expect(result.cashFlow).toBe(-1500);
  });

  it('handles a month with no data', () => {
    const result = computeCashFlow({
      actualIncome: 0,
      expectedIncome: 0,
      totalSpent: 0,
      totalInvested: 0,
      isCurrentMonth: false,
    });

    expect(result.cashFlow).toBe(0);
    expect(result.projectedCashFlow).toBeNull();
  });
});
