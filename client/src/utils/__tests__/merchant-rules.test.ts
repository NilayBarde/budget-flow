import { describe, it, expect } from 'vitest';
import { describeRule, searchMerchantRules } from '../merchant-rules';
import type { MerchantRule } from '../../types';

const rule = (overrides: Partial<MerchantRule> = {}): MerchantRule => ({
  id: 'r1',
  original_name: 'Uber',
  display_name: 'Uber',
  default_category_id: 'cat-transport',
  default_transaction_type: null,
  ...overrides,
});

const categoryNameById = new Map([
  ['cat-transport', 'Transportation'],
  ['cat-dining', 'Dining'],
]);

describe('describeRule', () => {
  it('names the category and type the rule decides', () => {
    expect(describeRule(rule({ default_transaction_type: 'expense' }), categoryNameById)).toMatchObject({
      category: 'Transportation',
      type: 'Expense',
    });
  });

  it('says there is no category or type when the rule leaves them to Plaid', () => {
    expect(describeRule(rule({ default_category_id: null }), categoryNameById)).toMatchObject({ category: null, type: null });
  });

  it('shows the category as unknown when it points at one that no longer exists', () => {
    expect(describeRule(rule({ default_category_id: 'cat-gone' }), categoryNameById).category).toBe('Unknown category');
  });

  it('only calls it a rename when the name shown differs from the bank\'s name', () => {
    expect(describeRule(rule({ display_name: 'Uber' }), categoryNameById).renamedTo).toBeNull();
    expect(describeRule(rule({ display_name: 'UBER' }), categoryNameById).renamedTo).toBeNull();
    expect(describeRule(rule({ original_name: 'Uber Trip Help.uber.com', display_name: 'Uber' }), categoryNameById).renamedTo).toBe('Uber');
  });

  it('marks a rule that only renames a merchant, since it decides nothing about category or type', () => {
    const rename = rule({ original_name: 'AMZN Mktp', display_name: 'Amazon', default_category_id: null });

    expect(describeRule(rename, categoryNameById).decidesNothing).toBe(true);
    expect(describeRule(rule(), categoryNameById).decidesNothing).toBe(false);
    expect(describeRule(rule({ default_category_id: null, default_transaction_type: 'transfer' }), categoryNameById).decidesNothing).toBe(false);
  });
});

describe('searchMerchantRules', () => {
  const rules = [
    rule({ id: 'a', original_name: 'Uber', display_name: 'Uber', default_category_id: 'cat-transport' }),
    rule({ id: 'b', original_name: 'Uber Eats', display_name: 'Uber Eats', default_category_id: 'cat-dining' }),
    rule({ id: 'c', original_name: 'AMZN Mktp US', display_name: 'Amazon', default_category_id: null }),
  ];

  it('returns every rule, sorted by name, for an empty search', () => {
    expect(searchMerchantRules(rules, '', categoryNameById).map(r => r.id)).toEqual(['c', 'a', 'b']);
    expect(searchMerchantRules(rules, '   ', categoryNameById)).toHaveLength(3);
  });

  it('matches the merchant name, the name shown, or the category, ignoring case', () => {
    expect(searchMerchantRules(rules, 'uber', categoryNameById).map(r => r.id)).toEqual(['a', 'b']);
    expect(searchMerchantRules(rules, 'AMAZON', categoryNameById).map(r => r.id)).toEqual(['c']);
    expect(searchMerchantRules(rules, 'dining', categoryNameById).map(r => r.id)).toEqual(['b']);
  });

  it('returns nothing when nothing matches', () => {
    expect(searchMerchantRules(rules, 'zzz', categoryNameById)).toEqual([]);
  });

  it('does not change the list it was given', () => {
    const copy = [...rules];

    searchMerchantRules(rules, '', categoryNameById);

    expect(rules).toEqual(copy);
  });
});
