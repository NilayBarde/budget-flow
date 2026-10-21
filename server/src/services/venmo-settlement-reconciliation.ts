import { supabase } from '../db/supabase.js';
import { isVenmoAccount } from './transaction-type.js';
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
  const { data: splitRows, error: splitsError } = await supabase
    .from('transaction_splits')
    .select('id, parent_transaction_id, amount, is_my_share')
    .eq('is_my_share', false);
  if (splitsError) throw splitsError;
  const splits = (splitRows ?? []) as SplitRow[];
  if (splits.length === 0) return [];

  const parentIds = [...new Set(splits.map((s) => s.parent_transaction_id))];
  const { data: parentRows, error: parentsError } = await supabase
    .from('transactions')
    .select('id, date')
    .in('id', parentIds);
  if (parentsError) throw parentsError;
  const datesByTransactionId = new Map(((parentRows ?? []) as TransactionDateRow[]).map((t) => [t.id, t.date]));

  const splitIds = splits.map((s) => s.id);
  const { data: settlementRows, error: settlementsError } = await supabase
    .from('transaction_split_settlements')
    .select('split_id, amount')
    .in('split_id', splitIds);
  if (settlementsError) throw settlementsError;
  const settledBySplitId = new Map<string, number>();
  for (const row of (settlementRows ?? []) as { split_id: string; amount: number }[]) {
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

  const { data, error } = await supabase
    .from('transactions')
    .select('id, amount, date, type_manually_set')
    .in('account_id', venmoAccountIds)
    .eq('is_venmo_settlement', false);
  if (error) throw error;
  const rows = (data ?? []) as VenmoCandidateRow[];
  return sinceDate ? rows.filter((t) => t.date >= sinceDate) : rows;
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
