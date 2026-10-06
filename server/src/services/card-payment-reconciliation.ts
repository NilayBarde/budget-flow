import { supabase } from '../db/supabase.js';
import { findCardPaymentCounterparts, type PairingRow } from './card-payment-pairing.js';
import { isCreditCardAccount, type TransactionType } from './transaction-type.js';

const PAGE_SIZE = 1000;
const UPDATE_CHUNK_SIZE = 200;
// Both legs of a payment post within a few days of each other, so a short look back after
// each sync is enough to catch every new pair.
const DEFAULT_LOOKBACK_DAYS = 21;
const DAY_MS = 24 * 60 * 60 * 1000;

interface TransactionRow {
  id: string;
  account_id: string;
  amount: number;
  date: string;
  merchant_name: string | null;
  original_description: string | null;
  transaction_type: TransactionType;
  type_manually_set: boolean | null;
  plaid_category: { primary?: string | null } | null;
}

export interface PairedTransaction {
  id: string;
  account_id: string;
  date: string;
  amount: number;
  merchant_name: string | null;
  previous_type: TransactionType;
}

interface ReconcileOptions {
  /** Only look at transactions on or after this date. null scans all history. */
  sinceDate?: string | null;
  /** false reports what would change without writing. */
  apply?: boolean;
}

const loadTransactions = async (sinceDate: string | null): Promise<TransactionRow[]> => {
  const rows: TransactionRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from('transactions')
      .select('id, account_id, amount, date, merchant_name, original_description, transaction_type, type_manually_set, plaid_category')
      .order('date', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (sinceDate) query = query.gte('date', sinceDate);

    const { data, error } = await query;
    if (error) throw error;
    rows.push(...((data ?? []) as TransactionRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
};

/**
 * Type both legs of every credit card payment as a transfer. See card-payment-pairing for the
 * matching rules. Returns the rows that were (or, when apply is false, would be) retyped.
 */
export const reconcileCardPayments = async ({
  sinceDate = new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * DAY_MS).toISOString().slice(0, 10),
  apply = true,
}: ReconcileOptions = {}): Promise<PairedTransaction[]> => {
  const { data: accounts, error: accountsError } = await supabase.from('accounts').select('id, account_type');
  if (accountsError) throw accountsError;
  const creditAccountIds = new Set(
    (accounts ?? []).filter(a => isCreditCardAccount(a.account_type)).map(a => a.id),
  );

  const transactions = await loadTransactions(sinceDate);
  const pairingRows: PairingRow[] = transactions.map(t => ({
    id: t.id,
    account_id: t.account_id,
    amount: t.amount,
    date: t.date,
    transaction_type: t.transaction_type,
    type_manually_set: t.type_manually_set,
    is_credit_card: creditAccountIds.has(t.account_id),
    plaid_primary: t.plaid_category?.primary ?? null,
    description: [t.merchant_name, t.original_description].filter(Boolean).join(' '),
  }));

  const idsToRetype = new Set(findCardPaymentCounterparts(pairingRows));
  const changed = transactions.filter(t => idsToRetype.has(t.id));

  if (apply) {
    const ids = [...idsToRetype];
    for (let i = 0; i < ids.length; i += UPDATE_CHUNK_SIZE) {
      const { error } = await supabase
        .from('transactions')
        .update({ transaction_type: 'transfer', category_id: null, needs_review: false })
        .in('id', ids.slice(i, i + UPDATE_CHUNK_SIZE));
      if (error) throw error;
    }
  }

  return changed.map(t => ({
    id: t.id,
    account_id: t.account_id,
    date: t.date,
    amount: t.amount,
    merchant_name: t.merchant_name,
    previous_type: t.transaction_type,
  }));
};

/**
 * The call every sync path makes once its transactions are saved. Reconciliation is a cleanup
 * pass, so a failure here must never fail the sync that triggered it.
 */
export const reconcileCardPaymentsAfterSync = async (): Promise<void> => {
  try {
    const changed = await reconcileCardPayments();
    if (changed.length > 0) console.log(`Paired ${changed.length} credit card payment row(s) as transfers`);
  } catch (error) {
    console.error('Card payment reconciliation failed:', error instanceof Error ? error.message : error);
  }
};
