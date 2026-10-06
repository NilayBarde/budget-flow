import { categorizeWithPlaid, resolveCategoryId, type PlaidPFC } from './categorizer.js';

export interface BackfillRow {
  id: string;
  merchant_name: string | null;
  transaction_type: string;
  category_id: string | null;
  plaid_category: PlaidPFC | null;
  original_description: string | null;
}

export interface BackfillPlanItem {
  id: string;
  categoryId: string;
  source: 'rule' | 'history' | 'plaid';
}

interface BackfillInput {
  rows: BackfillRow[];
  /** Merchant name (lower case) to the category the user's rule gives it. Rules with no category are left out. */
  ruleCategoryByMerchant: ReadonlyMap<string, string>;
  categoryIdByName: ReadonlyMap<string, string>;
}

// History is only trusted when it is a pattern, not a single data point.
const MIN_HISTORY_ROWS = 2;
const MIN_HISTORY_AGREEMENT = 0.9;

const merchantKey = (name: string | null) => (name ?? '').trim().toLowerCase();

/**
 * Decide a category for every expense or return that has none. The user's own choices outrank Plaid:
 * first the merchant's rule, then what the user has done with that merchant before (when it is consistent),
 * and only then Plaid's category. A row nothing can place is left out, so it stays flagged for review.
 */
export const planCategoryBackfill = ({ rows, ruleCategoryByMerchant, categoryIdByName }: BackfillInput): BackfillPlanItem[] => {
  const isSpending = (r: BackfillRow) => r.transaction_type === 'expense' || r.transaction_type === 'return';

  // Income and Investment belong to rows typed that way; spending is never filed under them.
  const reserved = new Set(
    ['Income', 'Investment'].map(name => categoryIdByName.get(name)).filter((id): id is string => Boolean(id)),
  );

  // History comes from how the merchant's purchases were filed. Refunds are left out: they are the rows most
  // likely to sit in an odd category, and a refund belongs with the purchases it reverses.
  const historyByMerchant = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (r.transaction_type !== 'expense' || !r.category_id || reserved.has(r.category_id)) continue;
    const key = merchantKey(r.merchant_name);
    if (!key) continue; // a blank name is not a merchant, so its rows must not share a history
    const counts = historyByMerchant.get(key) ?? new Map<string, number>();
    counts.set(r.category_id, (counts.get(r.category_id) ?? 0) + 1);
    historyByMerchant.set(key, counts);
  }

  const fromHistory = (key: string): string | null => {
    const counts = historyByMerchant.get(key);
    if (!counts) return null;
    const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
    if (total < MIN_HISTORY_ROWS) return null;
    const [topCategory, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return topCount / total >= MIN_HISTORY_AGREEMENT ? topCategory : null;
  };

  const plan: BackfillPlanItem[] = [];
  for (const r of rows) {
    if (!isSpending(r) || r.category_id) continue;
    const key = merchantKey(r.merchant_name);

    // With no merchant name there is nothing to look a rule or a history up by; only Plaid can place the row.
    if (key) {
      const rule = ruleCategoryByMerchant.get(key);
      if (rule && !reserved.has(rule)) {
        plan.push({ id: r.id, categoryId: rule, source: 'rule' });
        continue;
      }

      const history = fromHistory(key);
      if (history) {
        plan.push({ id: r.id, categoryId: history, source: 'history' });
        continue;
      }
    }

    if (r.plaid_category) {
      const result = categorizeWithPlaid(r.merchant_name ?? '', r.original_description, r.plaid_category);
      const plaidCategory = resolveCategoryId(result.categoryName, categoryIdByName);
      if (plaidCategory && !reserved.has(plaidCategory)) plan.push({ id: r.id, categoryId: plaidCategory, source: 'plaid' });
    }
  }
  return plan;
};
