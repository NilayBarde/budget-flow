import { describe, it, expect } from 'vitest';
import { planCategoryBackfill, type BackfillRow } from '../category-backfill.js';

const categoryIdByName = new Map([
  ['Dining', 'cat-dining'],
  ['Groceries', 'cat-groceries'],
  ['Transportation', 'cat-transport'],
  ['Shopping', 'cat-shopping'],
  ['Subscriptions', 'cat-subs'],
  ['Income', 'cat-income'],
  ['Investment', 'cat-invest'],
]);

let nextId = 0;
const row = (overrides: Partial<BackfillRow> = {}): BackfillRow => ({
  id: `r${++nextId}`,
  merchant_name: 'Uber',
  transaction_type: 'expense',
  category_id: null,
  plaid_category: null,
  original_description: null,
  ...overrides,
});

const plan = (rows: BackfillRow[], rules: [string, string][] = []) =>
  planCategoryBackfill({ rows, ruleCategoryByMerchant: new Map(rules), categoryIdByName });

describe('planCategoryBackfill', () => {
  it('uses the category from the merchant\'s rule first', () => {
    const blank = row({ merchant_name: 'Uber' });
    // Even when the merchant\'s history and Plaid both say otherwise.
    const history = [row({ merchant_name: 'Uber', category_id: 'cat-dining' }), row({ merchant_name: 'Uber', category_id: 'cat-dining' })];
    const blankWithPlaid = row({
      merchant_name: 'Uber',
      plaid_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_RESTAURANT' },
    });

    const result = plan([blank, blankWithPlaid, ...history], [['uber', 'cat-transport']]);

    expect(result).toEqual([
      { id: blank.id, categoryId: 'cat-transport', source: 'rule' },
      { id: blankWithPlaid.id, categoryId: 'cat-transport', source: 'rule' },
    ]);
  });

  it('matches a rule regardless of the merchant name\'s letter case', () => {
    const blank = row({ merchant_name: 'UBER' });

    expect(plan([blank], [['uber', 'cat-transport']])[0]).toMatchObject({ categoryId: 'cat-transport', source: 'rule' });
  });

  it('then follows the merchant\'s own history when it is consistent', () => {
    const blank = row({ merchant_name: 'Trader Joe\'s' });
    const history = Array.from({ length: 5 }, () => row({ merchant_name: 'Trader Joe\'s', category_id: 'cat-groceries' }));

    expect(plan([blank, ...history])).toEqual([{ id: blank.id, categoryId: 'cat-groceries', source: 'history' }]);
  });

  it('does not trust a history of one transaction, or one that is mixed', () => {
    const lone = row({ merchant_name: 'Zara' });
    const loneHistory = row({ merchant_name: 'Zara', category_id: 'cat-shopping' });
    const mixed = row({ merchant_name: 'Apple' });
    const mixedHistory = [
      row({ merchant_name: 'Apple', category_id: 'cat-subs' }),
      row({ merchant_name: 'Apple', category_id: 'cat-shopping' }),
    ];

    expect(plan([lone, loneHistory, mixed, ...mixedHistory])).toEqual([]);
  });

  it('takes a mostly consistent history when the rest are rare exceptions', () => {
    const blank = row({ merchant_name: 'Uber Eats' });
    const history = [
      ...Array.from({ length: 19 }, () => row({ merchant_name: 'Uber Eats', category_id: 'cat-dining' })),
      row({ merchant_name: 'Uber Eats', category_id: 'cat-transport' }),
    ];

    expect(plan([blank, ...history])[0]).toMatchObject({ categoryId: 'cat-dining', source: 'history' });
  });

  it('falls back to Plaid\'s category last, using the user\'s own names', () => {
    const blank = row({
      merchant_name: 'Corner Bistro',
      plaid_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_RESTAURANT' },
    });

    expect(plan([blank])).toEqual([{ id: blank.id, categoryId: 'cat-dining', source: 'plaid' }]);
  });

  it('uses the broader category for Coffee and Bars when the user has no such category', () => {
    const blank = row({
      merchant_name: 'Blue Bottle',
      plaid_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' },
    });

    expect(plan([blank])[0]).toMatchObject({ categoryId: 'cat-dining', source: 'plaid' });
  });

  it('leaves a row alone when nothing says what it is', () => {
    expect(plan([row({ merchant_name: 'Mystery Vendor' })])).toEqual([]);
    // Plaid\'s catch all is "I do not know", so it stays for review.
    expect(
      plan([row({ merchant_name: 'Other Thing', plaid_category: { primary: 'OTHER', detailed: 'OTHER_OTHER' } })]),
    ).toEqual([]);
  });

  it('only fills expenses and returns that have no category', () => {
    const categorized = row({ merchant_name: 'Uber', category_id: 'cat-dining' });
    const income = row({ merchant_name: 'Uber', transaction_type: 'income' });
    const transfer = row({ merchant_name: 'Uber', transaction_type: 'transfer' });
    const aReturn = row({ merchant_name: 'Uber', transaction_type: 'return' });

    const result = plan([categorized, income, transfer, aReturn], [['uber', 'cat-transport']]);

    expect(result.map(r => r.id)).toEqual([aReturn.id]);
  });

  it('never files spending under Income or Investment, whatever the history or a rule says', () => {
    // Real case: the only categorized Zara rows were refunds someone put under Income, so five Zara purchases
    // would have been filed as Income.
    const purchase = row({ merchant_name: 'Zara' });
    const refunds = [
      row({ merchant_name: 'Zara', transaction_type: 'return', category_id: 'cat-income' }),
      row({ merchant_name: 'Zara', transaction_type: 'return', category_id: 'cat-income' }),
    ];
    const ruled = row({ merchant_name: 'Payroll Thing' });

    expect(plan([purchase, ...refunds, ruled], [['payroll thing', 'cat-income']])).toEqual([]);
  });

  it('decides from what the merchant\'s purchases were filed under, and applies it to its refunds too', () => {
    const blankRefund = row({ merchant_name: 'Zara', transaction_type: 'return' });
    const purchases = [
      row({ merchant_name: 'Zara', category_id: 'cat-shopping' }),
      row({ merchant_name: 'Zara', category_id: 'cat-shopping' }),
    ];

    expect(plan([blankRefund, ...purchases])).toEqual([{ id: blankRefund.id, categoryId: 'cat-shopping', source: 'history' }]);
  });

  it('does not let a merchant\'s refunds decide where its purchases go', () => {
    const purchase = row({ merchant_name: 'Apple' });
    const refunds = [
      row({ merchant_name: 'Apple', transaction_type: 'return', category_id: 'cat-shopping' }),
      row({ merchant_name: 'Apple', transaction_type: 'return', category_id: 'cat-shopping' }),
    ];

    expect(plan([purchase, ...refunds])).toEqual([]);
  });

  it('ignores a rule that points at no category', () => {
    const blank = row({ merchant_name: 'Uber' });

    expect(plan([blank], [])).toEqual([]);
  });
});
