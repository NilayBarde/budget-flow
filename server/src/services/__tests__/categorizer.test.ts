import { describe, it, expect } from 'vitest';
import {
  categorizeWithPlaid,
  resolveCategoryId,
  PLAID_PFC_MAP,
  KNOWN_CATEGORY_NAMES,
} from '../categorizer.js';
import { PLAID_PFC_TAXONOMY, PLAID_PFC_OBSERVED_EXTRAS } from './fixtures/plaid-pfc-taxonomy.js';

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

// The categories Plaid describes as money coming in or moving between accounts are typed as income or
// transfer before any category is chosen, so the spending map does not need them.
const NOT_SPENDING_PRIMARIES = new Set(['INCOME', 'TRANSFER_IN', 'TRANSFER_OUT']);
const spendingTaxonomy = PLAID_PFC_TAXONOMY.filter(([primary]) => !NOT_SPENDING_PRIMARIES.has(primary));
const everyKnownDetail = new Set([...PLAID_PFC_TAXONOMY, ...PLAID_PFC_OBSERVED_EXTRAS].map(([, detailed]) => detailed));

describe('the Plaid category map', () => {
  it('only names categories Plaid really sends', () => {
    // The map once held FOOD_AND_DRINK_BAR, MEDICAL_DOCTOR and FOOD_AND_DRINK_RESTAURANTS, none of which
    // exist, so those rows silently fell through to a broader category.
    const invented = Object.keys(PLAID_PFC_MAP).filter(key => !everyKnownDetail.has(key));

    expect(invented).toEqual([]);
  });

  it('only points at categories that exist', () => {
    const unknown = Object.values(PLAID_PFC_MAP).filter(name => !KNOWN_CATEGORY_NAMES.includes(name));

    expect(unknown).toEqual([]);
  });

  it('covers every spending category in Plaid\'s list, so none falls through by accident', () => {
    const missing = spendingTaxonomy.map(([, detailed]) => detailed).filter(detailed => !(detailed in PLAID_PFC_MAP));

    expect(missing).toEqual([]);
  });

  it.each(spendingTaxonomy)('gives %s a category when it is %s', (primary, detailed) => {
    const result = categorizeWithPlaid('Some Merchant', null, { primary, detailed });

    expect(result.categoryName).not.toBeNull();
    expect(KNOWN_CATEGORY_NAMES).toContain(result.categoryName);
    expect(result.needsReview).toBe(false);
  });

  it('follows the categories this user keeps for Plaid\'s buckets', () => {
    const categoryFor = (primary: string, detailed: string) => categorizeWithPlaid('M', null, { primary, detailed }).categoryName;

    // Overrides the user made again and again: 27 of 28, 19 of 26, 17 of 17 and 9 of 9 rows.
    expect(categoryFor('FOOD_AND_DRINK', 'FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR')).toBe('Bars');
    expect(categoryFor('FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE')).toBe('Coffee');
    expect(categoryFor('ENTERTAINMENT', 'ENTERTAINMENT_MUSIC_AND_AUDIO')).toBe('Subscriptions');
    expect(categoryFor('PERSONAL_CARE', 'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS')).toBe('Healthcare');
    // Ordinary cases stay where they were.
    expect(categoryFor('FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANT')).toBe('Dining');
    expect(categoryFor('FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES')).toBe('Groceries');
    expect(categoryFor('RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT')).toBe('Housing');
    expect(categoryFor('TRANSPORTATION', 'TRANSPORTATION_TAXIS_AND_RIDE_SHARES')).toBe('Transportation');
    expect(categoryFor('MEDICAL', 'MEDICAL_PRIMARY_CARE')).toBe('Healthcare');
  });

  it('files home repairs with the rest of home improvement, not under rent', () => {
    const categoryFor = (detailed: string) => categorizeWithPlaid('M', null, { primary: 'HOME_IMPROVEMENT', detailed }).categoryName;

    expect(categoryFor('HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE')).toBe('Shopping');
    expect(categoryFor('HOME_IMPROVEMENT_SECURITY')).toBe('Shopping');
    expect(categoryFor('HOME_IMPROVEMENT_FURNITURE')).toBe('Shopping');
  });

  it('falls back to the broad category for a detail Plaid adds later', () => {
    const result = categorizeWithPlaid('M', null, { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_SOMETHING_NEW' });

    expect(result.categoryName).toBe('Dining');
  });

  it.each([
    ['GENERAL_SERVICES', 'GENERAL_SERVICES_SOMETHING_NEW', 'Other'],
    ['HOME_IMPROVEMENT', 'HOME_IMPROVEMENT_SOMETHING_NEW', 'Shopping'],
    ['GOVERNMENT_AND_NON_PROFIT', 'GOVERNMENT_AND_NON_PROFIT_SOMETHING_NEW', 'Other'],
    ['BANK_FEES', 'BANK_FEES_SOMETHING_NEW', 'Other'],
    ['LOAN_PAYMENTS', 'LOAN_PAYMENTS_CASH_ADVANCES', 'Other'],
  ])('does not leave a new %s detail blank (%s)', (primary, detailed, expected) => {
    // These primaries had no fallback at all, so every row under them landed uncategorized.
    expect(categorizeWithPlaid('M', null, { primary, detailed }).categoryName).toBe(expected);
  });

  it('leaves Plaid\'s catch all for review, since it means Plaid does not know', () => {
    const result = categorizeWithPlaid('M', null, { primary: 'OTHER', detailed: 'OTHER_OTHER' });

    expect(result).toEqual({ categoryName: null, needsReview: true, source: 'none' });
  });

  it('leaves a transaction with no Plaid category for review', () => {
    expect(categorizeWithPlaid('M', null, null)).toEqual({ categoryName: null, needsReview: true, source: 'none' });
  });
});

describe('resolveCategoryId', () => {
  const ids = (names: string[]) => new Map(names.map(name => [name, `id-${name}`]));

  it('returns the id of the named category', () => {
    expect(resolveCategoryId('Bars', ids(['Dining', 'Bars']))).toBe('id-Bars');
  });

  it('uses the broader category when this user has no Bars or Coffee category', () => {
    const withoutCustom = ids(['Dining', 'Groceries']);

    expect(resolveCategoryId('Bars', withoutCustom)).toBe('id-Dining');
    expect(resolveCategoryId('Coffee', withoutCustom)).toBe('id-Dining');
  });

  it('returns null for a name that does not exist and has no fallback, or for no name', () => {
    expect(resolveCategoryId('Nonexistent', ids(['Dining']))).toBeNull();
    expect(resolveCategoryId(null, ids(['Dining']))).toBeNull();
  });
});
