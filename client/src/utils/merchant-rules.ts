import type { MerchantRule } from '../types';

export interface RuleDescription {
  /** The category the rule gives, or null when it leaves the category to Plaid. */
  category: string | null;
  /** The type the rule gives, or null when it leaves the type to detection. */
  type: string | null;
  /** The name shown for the merchant, when it differs from the bank's name for it. */
  renamedTo: string | null;
  /** The rule only renames the merchant: it decides neither the category nor the type. */
  decidesNothing: boolean;
}

const UNKNOWN_CATEGORY = 'Unknown category';

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const describeRule = (rule: MerchantRule, categoryNameById: ReadonlyMap<string, string>): RuleDescription => {
  const category = rule.default_category_id ? categoryNameById.get(rule.default_category_id) ?? UNKNOWN_CATEGORY : null;
  const type = rule.default_transaction_type ? capitalize(rule.default_transaction_type) : null;
  const renamedTo = rule.display_name.trim().toLowerCase() === rule.original_name.trim().toLowerCase() ? null : rule.display_name;

  return { category, type, renamedTo, decidesNothing: !category && !type };
};

/**
 * The rules whose merchant name, shown name or category contain the search text (ignoring case), sorted by
 * merchant name. An empty search returns them all.
 */
export const searchMerchantRules = (
  rules: MerchantRule[],
  query: string,
  categoryNameById: ReadonlyMap<string, string>,
): MerchantRule[] => {
  const needle = query.trim().toLowerCase();
  const sorted = [...rules].sort((a, b) => a.original_name.localeCompare(b.original_name, undefined, { sensitivity: 'base' }));
  if (!needle) return sorted;

  return sorted.filter(rule => {
    const category = rule.default_category_id ? categoryNameById.get(rule.default_category_id) ?? '' : '';
    return [rule.original_name, rule.display_name, category].some(text => text.toLowerCase().includes(needle));
  });
};
