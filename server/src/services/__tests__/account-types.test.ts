import { describe, it, expect } from 'vitest';
import { isHoldingsAccountType, isInvestmentAccountType } from '../account-types.js';

describe('isInvestmentAccountType', () => {
  it('matches investment and retirement account types, ignoring case', () => {
    for (const type of ['investment', 'Brokerage', '401k', '403b', 'IRA', 'roth', 'roth 401k', 'pension', 'stock plan']) {
      expect(isInvestmentAccountType(type)).toBe(true);
    }
  });

  it('does not count an HSA or 529 as an investment for net worth', () => {
    expect(isInvestmentAccountType('hsa')).toBe(false);
    expect(isInvestmentAccountType('529')).toBe(false);
  });

  it('does not match cash or credit accounts', () => {
    for (const type of ['checking', 'savings', 'credit card', 'loan', 'other']) {
      expect(isInvestmentAccountType(type)).toBe(false);
    }
  });

  it('handles a missing type', () => {
    expect(isInvestmentAccountType(undefined)).toBe(false);
    expect(isInvestmentAccountType(null)).toBe(false);
    expect(isInvestmentAccountType('')).toBe(false);
  });
});

describe('isHoldingsAccountType', () => {
  it('includes everything that counts as an investment', () => {
    for (const type of ['investment', 'brokerage', '401k', 'ira', 'roth', 'pension']) {
      expect(isHoldingsAccountType(type)).toBe(true);
    }
  });

  it('also includes an HSA and a 529, which hold invested funds', () => {
    expect(isHoldingsAccountType('hsa')).toBe(true);
    expect(isHoldingsAccountType('529')).toBe(true);
  });

  it('does not match cash or credit accounts', () => {
    for (const type of ['checking', 'savings', 'credit card', '', undefined, null]) {
      expect(isHoldingsAccountType(type)).toBe(false);
    }
  });
});
