import { supabase } from '../db/supabase.js';
import { fetchAllRows } from '../utils/paginate.js';
import { detectTransactionType, isVenmoAccount } from './transaction-type.js';
import type { PlaidPFC } from './categorizer.js';
import {
  findSettlementMatches,
  type SplitCandidate,
  type VenmoTransactionCandidate,
} from './venmo-settlement-matching.js';

export interface UnsettledSplit {
  splitId: string;
  transactionId: string;
  date: string;
  remainingAmount: number;
}

export interface ReconcileVenmoOptions {
  /** Only consider Venmo transactions on or after this date. Default: last 90 days. */
  sinceDate?: string | null;
  /** false reports what would change without writing. */
  apply?: boolean;
}

export interface VenmoSettlementResult {
  venmoTransactionId: string;
  splitIds: string[];
  totalAmount: number;
}

const AMOUNT_TOLERANCE = 0.01;
const DEFAULT_LOOKBACK_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
// Keeps the generated `.in(...)` query URL bounded, same as merchant-mappings' ID_BATCH_SIZE.
const ID_BATCH_SIZE = 200;

/** Runs `query` over `ids` in batches and concatenates the rows. */
const selectInBatches = async <T>(
  ids: string[],
  query: (batch: string[]) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> => {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
    const { data, error } = await query(ids.slice(i, i + ID_BATCH_SIZE));
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
};

interface SplitRow {
  id: string;
  parent_transaction_id: string;
  amount: number;
  is_my_share: boolean;
}

interface TransactionDateRow {
  id: string;
  date: string;
}

/**
 * Unsettled "others owe me" splits, with their derived remaining amount. Read-only against
 * transaction_splits — nothing here writes to a split, ever.
 */
export const loadUnsettledSplits = async (): Promise<UnsettledSplit[]> => {
  const splits = await fetchAllRows<SplitRow>(
    (from, to) =>
      supabase
        .from('transaction_splits')
        .select('id, parent_transaction_id, amount, is_my_share')
        .eq('is_my_share', false)
        .order('id')
        .range(from, to),
    { keyOf: (s) => s.id },
  );
  if (splits.length === 0) return [];

  const parentIds = [...new Set(splits.map((s) => s.parent_transaction_id))];
  const parentRows = await selectInBatches<TransactionDateRow>(parentIds, (ids) =>
    supabase.from('transactions').select('id, date').in('id', ids),
  );
  const datesByTransactionId = new Map(parentRows.map((t) => [t.id, t.date]));

  const splitIds = splits.map((s) => s.id);
  const settlementRows = await selectInBatches<{ split_id: string; amount: number }>(splitIds, (ids) =>
    supabase.from('transaction_split_settlements').select('split_id, amount').in('split_id', ids),
  );
  const settledBySplitId = new Map<string, number>();
  for (const row of settlementRows) {
    settledBySplitId.set(row.split_id, (settledBySplitId.get(row.split_id) ?? 0) + row.amount);
  }

  return splits
    .map((s) => ({
      splitId: s.id,
      transactionId: s.parent_transaction_id,
      date: datesByTransactionId.get(s.parent_transaction_id) ?? '',
      remainingAmount: Math.abs(s.amount) - (settledBySplitId.get(s.id) ?? 0),
    }))
    .filter((s) => s.remainingAmount > AMOUNT_TOLERANCE);
};

interface VenmoCandidateRow {
  id: string;
  amount: number;
  date: string;
  type_manually_set: boolean | null;
}

const loadUnmatchedVenmoTransactions = async (sinceDate: string | null): Promise<VenmoCandidateRow[]> => {
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('id, institution_name, account_name');
  if (accountsError) throw accountsError;
  const venmoAccountIds = ((accounts ?? []) as { id: string; institution_name: string | null; account_name: string | null }[])
    .filter((a) => isVenmoAccount(a.institution_name, a.account_name))
    .map((a) => a.id);
  if (venmoAccountIds.length === 0) return [];

  // The date filter runs in the database, before Supabase's 1000-row page cap applies, and every
  // page is read: filtering after the fact would silently miss rows cut off by the cap.
  return fetchAllRows<VenmoCandidateRow>(
    (from, to) => {
      let query = supabase
        .from('transactions')
        .select('id, amount, date, type_manually_set')
        .in('account_id', venmoAccountIds)
        .eq('is_venmo_settlement', false)
        // id breaks date ties so pages never skip or repeat a row
        .order('date', { ascending: false })
        .order('id')
        .range(from, to);
      if (sinceDate) query = query.gte('date', sinceDate);
      return query;
    },
    { keyOf: (t) => t.id },
  );
};

/**
 * Match unmatched Venmo transactions to unsettled splits and, when apply is true, write the
 * settlement links and retype the matched Venmo transactions as transfers. Never writes to
 * transaction_splits. Safe to re-run: already-settled splits and already-flagged Venmo
 * transactions are excluded from candidates every time.
 */
export const reconcileVenmoSettlements = async ({
  sinceDate = new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * DAY_MS).toISOString().slice(0, 10),
  apply = true,
}: ReconcileVenmoOptions = {}): Promise<VenmoSettlementResult[]> => {
  const [unsettledSplits, venmoRows] = await Promise.all([
    loadUnsettledSplits(),
    loadUnmatchedVenmoTransactions(sinceDate),
  ]);

  const splitCandidates: SplitCandidate[] = unsettledSplits.map((s) => ({
    id: s.splitId,
    date: s.date,
    remainingAmount: s.remainingAmount,
  }));
  const venmoCandidates: VenmoTransactionCandidate[] = venmoRows.map((t) => ({
    id: t.id,
    amount: t.amount,
    date: t.date,
    typeManuallySet: t.type_manually_set,
  }));

  const matches = findSettlementMatches(venmoCandidates, splitCandidates);

  if (apply) {
    for (const match of matches) {
      const rows = match.splitIds.map((splitId) => ({
        split_id: splitId,
        venmo_transaction_id: match.venmoTransactionId,
        amount: match.splitAmounts[splitId],
      }));
      const { error: insertError } = await supabase.from('transaction_split_settlements').insert(rows);
      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from('transactions')
        .update({ transaction_type: 'transfer', is_venmo_settlement: true, category_id: null, needs_review: false })
        .eq('id', match.venmoTransactionId);
      if (updateError) throw updateError;
    }
  }

  return matches.map((m) => ({
    venmoTransactionId: m.venmoTransactionId,
    splitIds: m.splitIds,
    totalAmount: Object.values(m.splitAmounts).reduce((sum, amt) => sum + amt, 0),
  }));
};

/**
 * The call the sync pipeline makes once a sync's transactions are saved. Reconciliation is a
 * cleanup pass, so a failure here must never fail the sync that triggered it.
 */
export const reconcileVenmoSettlementsAfterSync = async (
  options: Pick<ReconcileVenmoOptions, 'sinceDate'> = {},
): Promise<void> => {
  try {
    const results = await reconcileVenmoSettlements({ ...options, apply: true });
    if (results.length > 0) console.log(`Matched ${results.length} Venmo settlement(s)`);
  } catch (error) {
    console.error('Venmo settlement reconciliation failed:', error instanceof Error ? error.message : error);
  }
};

/**
 * Manual override for a match the auto-matcher missed. Validates the chosen splits sum to the
 * transaction's amount and aren't already settled, exactly like the auto-matcher would, then
 * writes the same settlement rows and type flip reconcileVenmoSettlements applies.
 */
export const linkVenmoSettlement = async (venmoTransactionId: string, splitIds: string[]): Promise<void> => {
  const { data: txnData, error: txnError } = await supabase
    .from('transactions')
    .select('id, amount')
    .eq('id', venmoTransactionId);
  if (txnError) throw txnError;
  const txn = (txnData as { id: string; amount: number }[] | null)?.[0];
  if (!txn) throw new Error('Venmo transaction not found');
  // Same direction rule reconcileVenmoSettlements enforces: a split is only ever settled by
  // money arriving, never by money sent out. Without this, linking the wrong transaction would
  // flip a real expense to a transfer and silently drop it out of spending totals.
  if (txn.amount >= 0) throw new Error('Only an incoming Venmo payment can settle a split');

  const { data: splitRows, error: splitsError } = await supabase
    .from('transaction_splits')
    .select('id, amount')
    .in('id', splitIds);
  if (splitsError) throw splitsError;
  const splits = (splitRows ?? []) as { id: string; amount: number }[];
  if (splits.length !== splitIds.length) throw new Error('One or more splits not found');

  const { data: settlementRows, error: settlementsError } = await supabase
    .from('transaction_split_settlements')
    .select('split_id, amount')
    .in('split_id', splitIds);
  if (settlementsError) throw settlementsError;
  const settledBySplitId = new Map<string, number>();
  for (const row of (settlementRows ?? []) as { split_id: string; amount: number }[]) {
    settledBySplitId.set(row.split_id, (settledBySplitId.get(row.split_id) ?? 0) + row.amount);
  }

  const splitAmounts: Record<string, number> = {};
  let total = 0;
  for (const split of splits) {
    const remaining = Math.abs(split.amount) - (settledBySplitId.get(split.id) ?? 0);
    if (remaining <= AMOUNT_TOLERANCE) throw new Error(`Split ${split.id} is already settled`);
    splitAmounts[split.id] = remaining;
    total += remaining;
  }

  if (Math.abs(total - Math.abs(txn.amount)) > AMOUNT_TOLERANCE) {
    throw new Error("Chosen splits' amount does not match the transaction amount");
  }

  const rows = splitIds.map((splitId) => ({
    split_id: splitId,
    venmo_transaction_id: venmoTransactionId,
    amount: splitAmounts[splitId],
  }));
  const { error: insertError } = await supabase.from('transaction_split_settlements').insert(rows);
  if (insertError) throw insertError;

  const { error: updateError } = await supabase
    .from('transactions')
    .update({ transaction_type: 'transfer', is_venmo_settlement: true, category_id: null, needs_review: false })
    .eq('id', venmoTransactionId);
  if (updateError) throw updateError;
};

/**
 * Reverts a (manual or automatic) match: deletes its settlement rows and re-detects the
 * transaction's type as if the match had never happened. Never touches transaction_splits.
 */
export const unlinkVenmoSettlement = async (venmoTransactionId: string): Promise<void> => {
  const { error: deleteError } = await supabase
    .from('transaction_split_settlements')
    .delete()
    .eq('venmo_transaction_id', venmoTransactionId);
  if (deleteError) throw deleteError;

  const { data: txnData, error: txnError } = await supabase
    .from('transactions')
    .select('id, amount, merchant_name, original_description, plaid_category')
    .eq('id', venmoTransactionId);
  if (txnError) throw txnError;
  const txn = (txnData as
    | { id: string; amount: number; merchant_name: string | null; original_description: string | null; plaid_category: PlaidPFC | null }[]
    | null)?.[0];
  if (!txn) throw new Error('Venmo transaction not found');

  const revertedType = detectTransactionType(
    txn.amount,
    [txn.merchant_name ?? '', txn.original_description ?? ''],
    txn.plaid_category,
  );

  const { error: updateError } = await supabase
    .from('transactions')
    .update({ transaction_type: revertedType, is_venmo_settlement: false })
    .eq('id', venmoTransactionId);
  if (updateError) throw updateError;
};
