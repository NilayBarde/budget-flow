import { supabase } from '../db/supabase.js';
import type { TransactionType } from './transaction-type.js';

export interface MerchantMapping {
  id: string;
  original_name: string;
  display_name: string;
  default_category_id: string | null;
  default_transaction_type: TransactionType | null;
}

export interface MerchantMappingLookup {
  /**
   * Find the mapping for a transaction. Mappings are stored under
   * `merchant_name || name`, so every candidate name has to be tried — looking up
   * only `merchant_name` misses transactions where Plaid returned no merchant.
   */
  find: (...candidateNames: (string | null | undefined)[]) => MerchantMapping | undefined;
}

export const loadMerchantMappings = async (): Promise<MerchantMappingLookup> => {
  const { data } = await supabase.from('merchant_mappings').select('*');
  const byName = new Map<string, MerchantMapping>(
    data?.map((m) => [m.original_name.toLowerCase(), m as MerchantMapping]) || [],
  );

  return {
    find: (...candidateNames) => {
      for (const name of candidateNames) {
        if (!name) continue;
        const mapping = byName.get(name.toLowerCase());
        if (mapping) return mapping;
      }
      return;
    },
  };
};

/**
 * A type the user previously set for this merchant always wins over pattern detection.
 */
export const resolveTransactionType = (
  detectedType: TransactionType,
  mapping: MerchantMapping | undefined,
): TransactionType => mapping?.default_transaction_type || detectedType;

// Plaid transaction IDs are ~40 chars; batching keeps the generated query URL from
// growing unbounded on large historical syncs.
const ID_BATCH_SIZE = 200;

/**
 * Plaid transaction IDs whose type the user set by hand. Callers use this to update
 * a transaction's amount/date/pending without reverting a manual type correction.
 */
export const loadManuallyTypedIds = async (
  transactions: { transaction_id: string }[],
): Promise<Set<string>> => {
  const manuallyTypedIds = new Set<string>();

  for (let i = 0; i < transactions.length; i += ID_BATCH_SIZE) {
    const ids = transactions.slice(i, i + ID_BATCH_SIZE).map((tx) => tx.transaction_id);
    const { data } = await supabase
      .from('transactions')
      .select('plaid_transaction_id, type_manually_set')
      .in('plaid_transaction_id', ids);

    for (const row of data || []) {
      if (row.type_manually_set) manuallyTypedIds.add(row.plaid_transaction_id);
    }
  }

  return manuallyTypedIds;
};
