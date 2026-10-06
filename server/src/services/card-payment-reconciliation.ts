import { supabase } from '../db/supabase.js';
import { findCardPaymentCounterparts, type PairingRow } from './card-payment-pairing.js';
import type { PlaidPFC } from './categorizer.js';
import { detectTransactionType, isCashAccount, isCreditCardAccount, type TransactionType } from './transaction-type.js';

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

export interface ReconcileOptions {
  /** Only look at transactions on or after this date. null scans all history. */
  sinceDate?: string | null;
  /** false reports what would change without writing. */
  apply?: boolean;
}

const toPaired = (t: TransactionRow): PairedTransaction => ({
  id: t.id,
  account_id: t.account_id,
  date: t.date,
  amount: t.amount,
  merchant_name: t.merchant_name,
  previous_type: t.transaction_type,
});

const loadTransactions = async (
  sinceDate: string | null,
  transactionType?: TransactionType,
): Promise<TransactionRow[]> => {
  // Keyed by id so a row returned twice across pages is only counted once.
  const rows = new Map<string, TransactionRow>();
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from('transactions')
      .select('id, account_id, amount, date, merchant_name, original_description, transaction_type, type_manually_set, plaid_category')
      // id breaks date ties so pages never skip or repeat a row
      .order('date', { ascending: false })
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (sinceDate) query = query.gte('date', sinceDate);
    if (transactionType) query = query.eq('transaction_type', transactionType);

    const { data, error } = await query;
    if (error) throw error;
    for (const row of (data ?? []) as TransactionRow[]) rows.set(row.id, row);
    if (!data || data.length < PAGE_SIZE) break;
  }
  return [...rows.values()];
};

/**
 * Save rows as transfers with no category. The update re-checks at write time, so a row the user
 * typed in the meantime is never overwritten. `onlyIfCurrently` limits the write to rows that
 * still have that type; without it, rows that became a transfer or an investment are skipped.
 */
const retypeAsTransfers = async (ids: string[], onlyIfCurrently?: TransactionType): Promise<void> => {
  for (let i = 0; i < ids.length; i += UPDATE_CHUNK_SIZE) {
    const guarded = supabase
      .from('transactions')
      .update({ transaction_type: 'transfer', category_id: null, needs_review: false })
      .in('id', ids.slice(i, i + UPDATE_CHUNK_SIZE))
      .or('type_manually_set.is.null,type_manually_set.eq.false');
    const { error } = await (onlyIfCurrently
      ? guarded.eq('transaction_type', onlyIfCurrently)
      : guarded.neq('transaction_type', 'transfer').neq('transaction_type', 'investment'));
    if (error) throw error;
  }
};

/**
 * Type both legs of every credit card payment as a transfer. See card-payment-pairing for the
 * matching rules. Returns the rows that were (or, when apply is false, would be) retyped.
 */
export const reconcileCardPayments = async ({
  sinceDate = new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * DAY_MS).toISOString().slice(0, 10),
  apply = true,
}: ReconcileOptions = {}): Promise<PairedTransaction[]> => {
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('id, account_type, institution_name, account_name');
  if (accountsError) throw accountsError;
  const accountsById = new Map((accounts ?? []).map(a => [a.id, a]));

  const transactions = await loadTransactions(sinceDate);
  const pairingRows: PairingRow[] = transactions.map(t => {
    const account = accountsById.get(t.account_id);
    return {
      id: t.id,
      account_id: t.account_id,
      amount: t.amount,
      date: t.date,
      transaction_type: t.transaction_type,
      type_manually_set: t.type_manually_set,
      is_credit_card: isCreditCardAccount(account?.account_type),
      is_cash_account: isCashAccount(account?.account_type),
      plaid_primary: t.plaid_category?.primary ?? null,
      description: [t.merchant_name, t.original_description].filter(Boolean).join(' '),
      account_label: [account?.institution_name, account?.account_name].filter(Boolean).join(' '),
    };
  });

  const idsToRetype = new Set(findCardPaymentCounterparts(pairingRows));
  const changed = transactions.filter(t => idsToRetype.has(t.id));

  if (apply) await retypeAsTransfers([...idsToRetype]);

  return changed.map(toPaired);
};

/**
 * Backfill for history typed before the detector learned to read card bill wording. Plaid
 * shortens "Robinhood Ccb - Payment" to the merchant "Robinhood" and labels it a brokerage
 * transfer, so these were stored as investments. Only rows typed as investments are revisited,
 * and only when the raw bank text now reads as a transfer; real contributions
 * ("Robinhood - Debits") still detect as investments and are left alone.
 */
export const retypeInvestmentsReadingAsCardBills = async ({
  apply = true,
}: Pick<ReconcileOptions, 'apply'> = {}): Promise<PairedTransaction[]> => {
  const investments = await loadTransactions(null, 'investment');
  const cardBills = investments.filter(
    t =>
      !t.type_manually_set &&
      detectTransactionType(t.amount, [t.merchant_name ?? '', t.original_description ?? ''], t.plaid_category as PlaidPFC | null) ===
        'transfer',
  );

  if (apply) await retypeAsTransfers(cardBills.map(t => t.id), 'investment');

  return cardBills.map(toPaired);
};

/**
 * The call every sync path makes once its transactions are saved. Reconciliation is a cleanup
 * pass, so a failure here must never fail the sync that triggered it. Pass sinceDate: null after
 * a first link, which imports a long history.
 */
export const reconcileCardPaymentsAfterSync = async (options: Pick<ReconcileOptions, 'sinceDate'> = {}): Promise<void> => {
  try {
    const changed = await reconcileCardPayments(options);
    if (changed.length > 0) console.log(`Paired ${changed.length} credit card payment row(s) as transfers`);
  } catch (error) {
    console.error('Card payment reconciliation failed:', error instanceof Error ? error.message : error);
  }
};
