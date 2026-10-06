import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../db/supabase.js';
import { categorizeWithPlaid, cleanMerchantName, type PlaidPFC } from './categorizer.js';
import { detectTransactionType, type TransactionType } from './transaction-type.js';
import { loadManuallyTypedIds, loadMerchantMappings, resolveTransactionType, type MerchantMapping } from './merchant-mappings.js';
import { reconcilePendingTransaction } from './pending-reconciliation.js';
import { reconcileCardPaymentsAfterSync } from './card-payment-reconciliation.js';
import { redactError } from './plaid-errors.js';
import type { SyncResult } from './plaid.js';

// Every way a Plaid sync reaches the database (manual sync, webhook, first link) goes through
// here, so a transaction is typed, categorized and saved the same way whichever path delivered it.

export type PlaidTransaction = SyncResult['added'][number];

// PostgREST error codes this file reacts to.
const NO_ROWS_ERROR = 'PGRST116'; // .single() found nothing, which is how "not stored yet" shows up
const UNIQUE_VIOLATION = '23505'; // the row already exists (plaid_transaction_id is unique)

interface NewRowContext {
  accountId: string;
  accountType?: string | null;
  mapping: MerchantMapping | undefined;
  categoryMap: Map<string, string>;
}

/**
 * The row to insert for a transaction we have not seen before.
 *
 * Category priority for expenses and returns: the user's merchant rule, then Plaid's category.
 * Income and investments get the matching built in category, and a transfer gets none.
 */
export const buildNewTransactionRow = (tx: PlaidTransaction, { accountId, accountType, mapping, categoryMap }: NewRowContext) => {
  const plaidPFC = tx.personal_finance_category as PlaidPFC | undefined;
  const texts = [tx.merchant_name || '', tx.name || '', tx.original_description || ''];
  const transactionType = resolveTransactionType(detectTransactionType(tx.amount, texts, plaidPFC, accountType), mapping);

  let categoryId: string | null = null;
  let needsReview = false;

  if (transactionType === 'expense' || transactionType === 'return') {
    if (mapping?.default_category_id) {
      categoryId = mapping.default_category_id;
    } else {
      const result = categorizeWithPlaid(tx.merchant_name || tx.name, tx.original_description || tx.name, plaidPFC);
      categoryId = (result.categoryName && categoryMap.get(result.categoryName)) || null;
      needsReview = result.needsReview;
    }
  } else if (transactionType === 'income') {
    categoryId = categoryMap.get('Income') || null;
  } else if (transactionType === 'investment') {
    categoryId = categoryMap.get('Investment') || null;
  }

  return {
    account_id: accountId,
    plaid_transaction_id: tx.transaction_id,
    amount: tx.amount,
    date: tx.date,
    merchant_name: tx.merchant_name || tx.name,
    original_description: tx.original_description || tx.name,
    merchant_display_name: mapping?.display_name || cleanMerchantName(tx.merchant_name || tx.name),
    category_id: categoryId,
    transaction_type: transactionType as TransactionType,
    type_manually_set: Boolean(mapping?.default_transaction_type),
    is_split: false,
    is_recurring: false,
    needs_review: needsReview,
    pending: tx.pending,
    plaid_category: plaidPFC || null,
  };
};

interface UpdateContext {
  accountId: string;
  accountType?: string | null;
  mapping: MerchantMapping | undefined;
  /** True when the user set this row's type by hand, so it must not be re-detected. */
  typeLocked: boolean;
  /** The stored row, used to tell whether the user customized its display name. */
  existing: { merchant_name: string; merchant_display_name: string | null } | null;
}

/**
 * The fields to refresh on a transaction Plaid reports as modified. It keeps what the user set:
 * a hand typed type is never overwritten, and a customized display name is left alone.
 */
export const buildTransactionUpdate = (tx: PlaidTransaction, { accountId, accountType, mapping, typeLocked, existing }: UpdateContext) => {
  const plaidPFC = tx.personal_finance_category as PlaidPFC | undefined;
  const texts = [tx.merchant_name || '', tx.name || '', tx.original_description || ''];
  const merchantName = tx.merchant_name || tx.name;

  const update: Record<string, unknown> = {
    account_id: accountId,
    amount: tx.amount,
    date: tx.date,
    merchant_name: merchantName,
    original_description: tx.original_description || tx.name,
    pending: tx.pending,
  };

  if (!typeLocked) {
    update.transaction_type = resolveTransactionType(detectTransactionType(tx.amount, texts, plaidPFC, accountType), mapping);
  }

  // merchant_display_name is user editable and wins in the UI, so only refresh it while it still
  // equals the auto cleaned form of the stored merchant name (that is, untouched).
  const userCustomizedDisplayName =
    !!existing?.merchant_display_name && existing.merchant_display_name !== cleanMerchantName(existing.merchant_name);
  if (!userCustomizedDisplayName) {
    update.merchant_display_name = mapping?.display_name || cleanMerchantName(merchantName);
  }

  return update;
};

/**
 * A successful sync proves the item is authenticated and healthy. The Plaid cursor belongs to the
 * item, so it is saved on every account under it to keep them in step. The history flag only ever
 * flips on, never back off.
 */
const recordSuccessfulSync = async (plaidItemId: string, nextCursor: string, historicalComplete: boolean) => {
  const { error } = await supabase
    .from('accounts')
    .update({
      plaid_cursor: nextCursor,
      last_synced_at: new Date().toISOString(),
      needs_reauth: false,
      reauth_detected_at: null,
    })
    .eq('plaid_item_id', plaidItemId);
  if (error) throw error;

  if (historicalComplete) {
    const { error: historyError } = await supabase
      .from('accounts')
      .update({ historical_sync_complete: true })
      .eq('plaid_item_id', plaidItemId);
    if (historyError) throw historyError;
  }
};

export interface SyncCounts {
  added: number;
  modified: number;
  removed: number;
  /** Already stored, but filed under the wrong account and moved. */
  reattributed: number;
  /** New posted rows that replaced a pending one. */
  reconciled: number;
  /** Transactions whose Plaid account could not be matched to one of ours. */
  skipped: number;
}

interface ApplySyncOptions {
  plaidItemId: string;
  syncResult: SyncResult;
  /** Maps a Plaid account id to our account row id. Returning undefined skips the transaction. */
  resolveAccountId: (plaidAccountId: string) => string | undefined;
  accountTypeById: Map<string, string | null | undefined>;
  /** True once Plaid says the whole history has been delivered. */
  historicalComplete?: boolean;
  /** How far back to pair card payments after the sync. null scans all history (a first link). */
  reconcileSinceDate?: string | null;
}

/**
 * Save everything a Plaid sync returned, then record that the sync succeeded. One failed row does
 * not stop the rest of the batch from saving, but it does stop the cursor from advancing: the
 * function throws before recording success, so the next sync retries from the old cursor (rows
 * already stored are skipped). Without that, a failed insert would be skipped past for good.
 */
export const applySyncResult = async ({
  plaidItemId,
  syncResult,
  resolveAccountId,
  accountTypeById,
  historicalComplete = false,
  reconcileSinceDate,
}: ApplySyncOptions): Promise<SyncCounts> => {
  const { data: categories } = await supabase.from('categories').select('id, name');
  const categoryMap = new Map<string, string>((categories ?? []).map(c => [c.name, c.id]));
  const mappings = await loadMerchantMappings();

  const counts: SyncCounts = { added: 0, modified: 0, removed: 0, reattributed: 0, reconciled: 0, skipped: 0 };
  let failures = 0;
  // Names the transaction and logs only the error code and message, never the row, so a row that
  // keeps failing can be found without writing financial data to the log.
  const fail = (what: string, transactionId: string, error: unknown) => {
    failures++;
    console.error(`Sync could not ${what} (${transactionId}):`, redactError(error));
  };

  for (const tx of syncResult.added) {
    const accountId = resolveAccountId(tx.account_id);
    if (!accountId) {
      counts.skipped++;
      console.warn(`No matching account for transaction with Plaid account_id: ${tx.account_id}`);
      continue;
    }

    const { data: existing, error: lookupError } = await supabase
      .from('transactions')
      .select('id, account_id')
      .eq('plaid_transaction_id', tx.transaction_id)
      .single();

    // .single() reports "no rows" as an error, which is the normal case for a new transaction.
    // Any other error means we could not tell whether the row exists, so inserting could duplicate it.
    if (lookupError && lookupError.code !== NO_ROWS_ERROR) {
      fail('look up a stored transaction', tx.transaction_id, lookupError);
      continue;
    }

    if (existing) {
      // Already stored. If a prior sync filed it under the wrong card, move it, which keeps every
      // user edit (splits, category, notes, display name).
      if (existing.account_id !== accountId) {
        const { error } = await supabase.from('transactions').update({ account_id: accountId }).eq('id', existing.id);
        if (error) fail('move a transaction to the right account', tx.transaction_id, error);
        else counts.reattributed++;
      }

      // An earlier attempt may have stored this row and then stopped before it replaced the pending
      // authorization, which would leave the pending row counting twice. The reconciliation does
      // nothing once the pending row is gone, so running it again is safe.
      if (tx.pending_transaction_id) {
        try {
          if (await reconcilePendingTransaction(existing.id, tx.amount, tx.pending_transaction_id)) counts.reconciled++;
        } catch (error) {
          fail('replace a pending transaction', tx.transaction_id, error);
        }
      }
      continue;
    }

    const row = {
      id: uuidv4(),
      ...buildNewTransactionRow(tx, {
        accountId,
        accountType: accountTypeById.get(accountId),
        mapping: mappings.find(tx.merchant_name, tx.name),
        categoryMap,
      }),
    };
    const { error } = await supabase.from('transactions').insert(row);
    // A duplicate key means another sync (a webhook racing a manual sync) stored this transaction
    // between our check and our insert. It is stored, which is all that matters, and that sync owns
    // the reconciliation, so this is neither a failure nor an addition of ours.
    if (error?.code === UNIQUE_VIOLATION) continue;
    if (error) {
      fail('save a new transaction', tx.transaction_id, error);
      continue;
    }
    counts.added++;

    // A posted transaction can supersede a pending authorization: carry the pending row's edits
    // and splits over and drop it, so a tip adjustment is not counted twice.
    try {
      if (await reconcilePendingTransaction(row.id, tx.amount, tx.pending_transaction_id)) counts.reconciled++;
    } catch (reconcileError) {
      fail('replace a pending transaction', tx.transaction_id, reconcileError);
    }
  }

  // Look up the hand typed flags once, not per transaction.
  const manuallyTypedIds = await loadManuallyTypedIds(syncResult.modified);

  for (const tx of syncResult.modified) {
    const accountId = resolveAccountId(tx.account_id);
    if (!accountId) {
      counts.skipped++;
      continue;
    }

    const { data: existing, error: lookupError } = await supabase
      .from('transactions')
      .select('merchant_name, merchant_display_name')
      .eq('plaid_transaction_id', tx.transaction_id)
      .single();

    // Without the stored row we cannot tell whether the user customized its display name, and
    // refreshing it blind would overwrite their edit. "No rows" is fine: nothing to preserve.
    if (lookupError && lookupError.code !== NO_ROWS_ERROR) {
      fail('look up a stored transaction', tx.transaction_id, lookupError);
      continue;
    }

    const update = buildTransactionUpdate(tx, {
      accountId,
      accountType: accountTypeById.get(accountId),
      mapping: mappings.find(tx.merchant_name, tx.name),
      typeLocked: manuallyTypedIds.has(tx.transaction_id),
      existing,
    });
    const { error } = await supabase.from('transactions').update(update).eq('plaid_transaction_id', tx.transaction_id);
    if (error) fail('update a modified transaction', tx.transaction_id, error);
    else counts.modified++;
  }

  for (const tx of syncResult.removed) {
    const { error } = await supabase.from('transactions').delete().eq('plaid_transaction_id', tx.transaction_id);
    if (error) fail('remove a deleted transaction', tx.transaction_id, error);
    else counts.removed++;
  }

  if (failures > 0) {
    throw new Error(`Failed to save ${failures} transaction(s). The sync cursor was not advanced, so the next sync retries them.`);
  }

  await recordSuccessfulSync(plaidItemId, syncResult.nextCursor, historicalComplete);
  await reconcileCardPaymentsAfterSync(reconcileSinceDate === undefined ? {} : { sinceDate: reconcileSinceDate });

  return counts;
};
