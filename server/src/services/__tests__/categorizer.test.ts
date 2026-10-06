import { describe, it, expect } from 'vitest';
import { categorizeWithPlaid } from '../categorizer.js';

describe('categorizeWithPlaid', () => {
  it('files a betting site cashout under Entertainment even when Plaid calls it income', () => {
    // Real row: "Fliff Credit via Nuv", tagged INCOME_CONTRACTOR. The type rule makes it a return;
    // the category has to match so it nets against the deposits instead of landing under Income.
    const result = categorizeWithPlaid('Fliff Credit via Nuv', 'Fliff Credit via Nuv', {
      primary: 'INCOME',
      detailed: 'INCOME_CONTRACTOR',
    });

    expect(result).toEqual({ categoryName: 'Entertainment', needsReview: false, source: 'plaid' });
  });

  it('leaves ordinary income under Income', () => {
    const result = categorizeWithPlaid('GreenLight Workf', 'GreenLight Workf', {
      primary: 'INCOME',
      detailed: 'INCOME_SALARY',
    });

    expect(result.categoryName).toBe('Income');
  });

  it('still uses the merchant text when the original description is missing', () => {
    const result = categorizeWithPlaid('DraftKings', null, { primary: 'INCOME' });

    expect(result.categoryName).toBe('Entertainment');
  });
});
