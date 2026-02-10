import { supabase } from '../db/supabase.js';
import type { TransactionType } from './transaction-type.js';

/** Map of transaction types to their auto-assigned category names. */
const TYPE_CATEGORY_MAP: Partial<Record<TransactionType, string>> = {
  income: 'Income',
  investment: 'Investment',
};

/**
 * Look up the category ID for a given transaction type.
 * Returns the category id if a matching category exists, otherwise null.
 * Only 'income' and 'investment' types have auto-assigned categories.
 */
export const getCategoryIdForType = async (
  type: TransactionType,
): Promise<string | null> => {
  const categoryName = TYPE_CATEGORY_MAP[type];
  if (!categoryName) return null;

  const { data } = await supabase
    .from('categories')
    .select('id')
    .eq('name', categoryName)
    .single();

  return data?.id || null;
};
