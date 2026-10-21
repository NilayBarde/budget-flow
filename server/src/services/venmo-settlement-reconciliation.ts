import { supabase } from '../db/supabase.js';
import { fetchAllRows } from '../utils/paginate.js';
import { detectTransactionType, isVenmoAccount } from './transaction-type.js';
import type { PlaidPFC } from './categorizer.js';
import {
  DEFAULT_WINDOW_DAYS,
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

/** The Venmo transaction does not exist. The route maps this to 404. */
export class VenmoTransactionNotFoundError extends Error {
  constructor() {
    super('Venmo transaction not found');
    this.name = 'VenmoTransactionNotFoundError';
  }
}

/** A link or unlink request that cannot be applied as asked. The route maps this to 400. */
export class VenmoSettlementValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VenmoSettlementValidationError';
  }
}

interface VenmoTransactionRow {
  id: string;
  amount: number;
  is_venmo_settlement: boolean | null;
  merchant_name: string | null;
  original_description: string | null;
  plaid_category: PlaidPFC | null;
}

const VENMO_TRANSACTION_COLUMNS = 'id, amount, is_venmo_settlement, merchant_name, original_description, plaid_category';

const loadVenmoTransaction = async (venmoTransactionId: string): Promise<VenmoTransactionRow> => {
  const { data, error } = await supabase.from('transactions').select(VENMO_TRANSACTION_COLUMNS).eq('id', venmoTransactionId);
  if (error) throw error;
  const txn = (data as VenmoTransactionRow[] | null)?.[0];
  if (!txn) throw new VenmoTransactionNotFoundError();
  return txn;
};

/**
 * Undo a settlement's type flip: re-detect the type as if the match never happened and clear the
 * flag. The match cleared the category and what it was before is not recorded, so the row is
 * flagged for review instead of silently staying uncategorized. Shared by unlink and the orphan
 * heal pass so both reset a payment the same way.
 */
const revertSettlementType = async (txn: VenmoTransactionRow): Promise<void> => {
  const revertedType = detectTransactionType(
    txn.amount,
    [txn.merchant_name ?? '', txn.original_description ?? ''],
    txn.plaid_category,
  );
  const { error } = await supabase
    .from('transactions')
    .update({ transaction_type: revertedType, is_venmo_settlement: false, needs_review: true })
    .eq('id', txn.id);
  if (error) throw error;
};

/**
 * Record a match: flip the payment to a settlement transfer, then insert one settlement row per
 * split. The two writes are not atomic, so the order decides what a failure in between leaves
 * behind. Flip first, and the worst case is a flagged transfer with no rows — inert, and reset by
 * the next pass's orphan heal. Rows first would risk rows settling a split while the payment still
 * counts as income, counting the money twice.
 */
const writeSettlement = async (venmoTransactionId: string, splitAmounts: Record<string, number>): Promise<void> => {
  const { error: updateError } = await supabase
    .from('transactions')
    .update({ transaction_type: 'transfer', is_venmo_settlement: true, category_id: null, needs_review: false })
    .eq('id', venmoTransactionId);
  if (updateError) throw updateError;

  const rows = Object.entries(splitAmounts).map(([splitId, amount]) => ({
    split_id: splitId,
    venmo_transaction_id: venmoTransactionId,
    amount,
  }));
  const { error: insertError } = await supabase.from('transaction_split_settlements').insert(rows);
  if (insertError) throw insertError;
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

const daysAgo = (days: number): string => new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);

/**
 * Unsettled "others owe me" splits, with their derived remaining amount, newest first. Only
 * splits whose parent transaction is on or after `sinceDate` are returned (default: the last
 * DEFAULT_LOOKBACK_DAYS days; null means all history) — an old split was most likely repaid some
 * other way (cash, Zelle) or never meant to be, and should not sit in the pending list forever.
 * Read-only against transaction_splits — nothing here writes to a split, ever.
 */
export const loadUnsettledSplits = async (
  sinceDate: string | null = daysAgo(DEFAULT_LOOKBACK_DAYS),
): Promise<UnsettledSplit[]> => {
  const allSplits = await fetchAllRows<SplitRow>(
    (from, to) =>
      supabase
        .from('transaction_splits')
        .select('id, parent_transaction_id, amount, is_my_share')
        .eq('is_my_share', false)
        .order('id')
        .range(from, to),
    { keyOf: (s) => s.id },
  );
  if (allSplits.length === 0) return [];

  const parentIds = [...new Set(allSplits.map((s) => s.parent_transaction_id))];
  const parentRows = await selectInBatches<TransactionDateRow>(parentIds, (ids) => {
    const query = supabase.from('transactions').select('id, date').in('id', ids);
    return sinceDate ? query.gte('date', sinceDate) : query;
  });
  // A parent outside the window is not returned, which drops its splits.
  const datesByTransactionId = new Map(parentRows.map((t) => [t.id, t.date]));
  const splits = allSplits.filter((s) => datesByTransactionId.has(s.parent_transaction_id));
  if (splits.length === 0) return [];

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
      date: datesByTransactionId.get(s.parent_transaction_id)!,
      remainingAmount: Math.abs(s.amount) - (settledBySplitId.get(s.id) ?? 0),
    }))
    .filter((s) => s.remainingAmount > AMOUNT_TOLERANCE)
    // Newest first; split id breaks ties so the order is stable between calls.
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.splitId < b.splitId ? -1 : 1));
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
 * A Venmo transaction flagged as a settlement whose settlement rows are all gone. That happens when
 * the split it settled is deleted ("Remove All Splits", or pending reconciliation recreating a
 * pending row's splits under new ids) — the rows cascade away with the split. Left alone, the
 * payment would stay a transfer settling nothing, and since candidates exclude flagged rows it
 * could never be matched again. Each orphan is reset exactly as an unlink would reset it.
 */
const healOrphanedSettlements = async (): Promise<void> => {
  const flagged = await fetchAllRows<VenmoTransactionRow>(
    (from, to) =>
      supabase
        .from('transactions')
        .select(VENMO_TRANSACTION_COLUMNS)
        .eq('is_venmo_settlement', true)
        .order('id')
        .range(from, to),
    { keyOf: (t) => t.id },
  );
  if (flagged.length === 0) return;

  const linkedRows = await selectInBatches<{ venmo_transaction_id: string }>(
    flagged.map((t) => t.id),
    (ids) => supabase.from('transaction_split_settlements').select('venmo_transaction_id').in('venmo_transaction_id', ids),
  );
  const linkedIds = new Set(linkedRows.map((r) => r.venmo_transaction_id));
  const orphans = flagged.filter((t) => !linkedIds.has(t.id));
  for (const orphan of orphans) await revertSettlementType(orphan);
};

/**
 * Match unmatched Venmo transactions to unsettled splits and, when apply is true, write the
 * settlement links and retype the matched Venmo transactions as transfers. Never writes to
 * transaction_splits. Safe to re-run: already-settled splits and already-flagged Venmo
 * transactions are excluded from candidates every time.
 */
export const reconcileVenmoSettlements = async ({
  sinceDate = daysAgo(DEFAULT_LOOKBACK_DAYS),
  apply = true,
}: ReconcileVenmoOptions = {}): Promise<VenmoSettlementResult[]> => {
  // Reset orphans before loading candidates, so a healed payment can be rematched in this pass.
  // Healing writes, so a dry run skips it.
  if (apply) await healOrphanedSettlements();

  // A Venmo payment can settle a split up to the matcher's window before it, so reach that much
  // further back for splits than for Venmo transactions.
  const splitsSinceDate = sinceDate
    ? new Date(Date.parse(sinceDate) - DEFAULT_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10)
    : null;
  const [unsettledSplits, venmoRows] = await Promise.all([
    loadUnsettledSplits(splitsSinceDate),
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
      await writeSettlement(match.venmoTransactionId, match.splitAmounts);
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
 *
 * This applies matches without review, so it never scans unbounded history: with no sinceDate it
 * uses the default lookback. A full-history backfill goes through reconcileVenmoSettlements with
 * apply: false first, per the spec.
 */
export const reconcileVenmoSettlementsAfterSync = async (options: { sinceDate?: string } = {}): Promise<void> => {
  try {
    const results = await reconcileVenmoSettlements({ sinceDate: options.sinceDate ?? undefined, apply: true });
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
  const txn = await loadVenmoTransaction(venmoTransactionId);
  // One payment settles one set of splits. Linking it again would let a single $50 deposit
  // settle a second $50 split, dropping money it never covered out of the totals.
  if (txn.is_venmo_settlement) {
    throw new VenmoSettlementValidationError('This Venmo transaction already settles a split; unlink it first');
  }
  // Same direction rule reconcileVenmoSettlements enforces: a split is only ever settled by
  // money arriving, never by money sent out. Without this, linking the wrong transaction would
  // flip a real expense to a transfer and silently drop it out of spending totals.
  if (txn.amount >= 0) throw new VenmoSettlementValidationError('Only an incoming Venmo payment can settle a split');

  const { data: splitRows, error: splitsError } = await supabase
    .from('transaction_splits')
    .select('id, amount')
    .in('id', splitIds);
  if (splitsError) throw splitsError;
  const splits = (splitRows ?? []) as { id: string; amount: number }[];
  if (splits.length !== splitIds.length) throw new VenmoSettlementValidationError('One or more splits not found');

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
    if (remaining <= AMOUNT_TOLERANCE) throw new VenmoSettlementValidationError(`Split ${split.id} is already settled`);
    splitAmounts[split.id] = remaining;
    total += remaining;
  }

  if (Math.abs(total - Math.abs(txn.amount)) > AMOUNT_TOLERANCE) {
    throw new VenmoSettlementValidationError("Chosen splits' amount does not match the transaction amount");
  }

  await writeSettlement(venmoTransactionId, splitAmounts);
};

/**
 * Reverts a (manual or automatic) match: deletes its settlement rows and re-detects the
 * transaction's type as if the match had never happened. Never touches transaction_splits.
 * Refuses a transaction that is not a settlement, so it can never re-detect (and overwrite) the
 * type of an unrelated or hand-typed transaction.
 */
export const unlinkVenmoSettlement = async (venmoTransactionId: string): Promise<void> => {
  const txn = await loadVenmoTransaction(venmoTransactionId);
  if (!txn.is_venmo_settlement) {
    throw new VenmoSettlementValidationError('This transaction is not linked to a split settlement');
  }

  // Rows first: if the type revert then fails, the transaction is left flagged with no rows,
  // which the next reconcile pass heals. The other order could leave rows settling a split while
  // the payment counts as income again.
  const { error: deleteError } = await supabase
    .from('transaction_split_settlements')
    .delete()
    .eq('venmo_transaction_id', venmoTransactionId);
  if (deleteError) throw deleteError;

  await revertSettlementType(txn);
};
