import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import * as plaidService from '../services/plaid.js';
import { categorizeWithPlaid, cleanMerchantName, PlaidPFC } from '../services/categorizer.js';
import { buildAccountResolver } from '../services/sync-attribution.js';
import { reconcilePendingTransaction } from '../services/pending-reconciliation.js';
import { v4 as uuidv4 } from 'uuid';

import { detectTransactionType } from '../services/transaction-type.js';

const router = Router();

// Per-item cooldown for webhook-triggered syncs.
// Each transactionsSync call costs $0.12 ("Transactions Refresh").
// Plaid can fire multiple SYNC_UPDATES_AVAILABLE webhooks in rapid succession;
// batching them with a 5-minute cooldown means the cursor-based sync picks up
// all accumulated changes in a single call instead of one call per webhook.
const WEBHOOK_SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const lastWebhookSyncByItem = new Map<string, number>();

// Process synced transactions and save to database.
// `itemAccounts` are all local account rows under the Plaid item, used to
// attribute each transaction to the correct card via its Plaid account_id.
// `triggeringAccountId` is the fallback when a transaction's account_id is
// unknown (single-account items, or an account not yet stored locally).
const processSyncedTransactions = async (
  itemAccounts: { id: string; plaid_account_id: string | null }[],
  triggeringAccountId: string,
  syncResult: Awaited<ReturnType<typeof plaidService.syncTransactions>>
) => {
  const resolveAccountId = buildAccountResolver(itemAccounts, triggeringAccountId);

  // Get categories for mapping
  const { data: categories } = await supabase.from('categories').select('id, name');
  const categoryMap = new Map(categories?.map(c => [c.name, c.id]) || []);

  // Get merchant mappings
  const { data: mappings } = await supabase.from('merchant_mappings').select('*');
  const mappingMap = new Map(mappings?.map(m => [m.original_name.toLowerCase(), m]) || []);

  let addedCount = 0;
  let modifiedCount = 0;
  let removedCount = 0;
  let reattributedCount = 0;
  let reconciledCount = 0;

  // Handle added transactions
  for (const tx of syncResult.added) {
    const targetAccountId = resolveAccountId(tx.account_id);

    // Check if already exists (shouldn't happen with sync, but safety check)
    const { data: existing } = await supabase
      .from('transactions')
      .select('id, account_id')
      .eq('plaid_transaction_id', tx.transaction_id)
      .single();

    if (existing) {
      // Re-attribute if a prior sync filed this under the wrong card.
      if (existing.account_id !== targetAccountId) {
        await supabase
          .from('transactions')
          .update({ account_id: targetAccountId })
          .eq('id', existing.id);
        reattributedCount++;
      }
      continue;
    }

    const texts = [tx.merchant_name || '', tx.name || '', (tx as { original_description?: string }).original_description || ''];
    const mapping = mappingMap.get(tx.merchant_name?.toLowerCase() || '');
    const displayName = mapping?.display_name || cleanMerchantName(tx.merchant_name || tx.name);
    const plaidPFC = tx.personal_finance_category as PlaidPFC | undefined;
    const transactionType = detectTransactionType(tx.amount, texts, plaidPFC);

    // Auto-assign category based on type with Plaid-first approach
    let categoryId: string | null = null;
    let needsReview = false;

    if (transactionType === 'expense' || transactionType === 'return') {
      // Priority: merchant mapping > Plaid PFC > pattern matching
      // Returns use same categorization as expenses (e.g., Amazon return → Shopping)
      if (mapping?.default_category_id) {
        categoryId = mapping.default_category_id;
      } else {
        const result = categorizeWithPlaid(
          tx.merchant_name || tx.name,
          (tx as { original_description?: string }).original_description,
          plaidPFC
        );
        categoryId = categoryMap.get(result.categoryName) || null;
        needsReview = result.needsReview;
      }
    } else if (transactionType === 'income') {
      categoryId = categoryMap.get('Income') || null;
    } else if (transactionType === 'investment') {
      categoryId = categoryMap.get('Investment') || null;
    }

    const newTxId = uuidv4();
    await supabase.from('transactions').insert({
      id: newTxId,
      account_id: targetAccountId,
      plaid_transaction_id: tx.transaction_id,
      amount: tx.amount,
      date: tx.date,
      merchant_name: tx.merchant_name || tx.name,
      original_description: (tx as { original_description?: string }).original_description || tx.name,
      merchant_display_name: displayName,
      category_id: categoryId,
      transaction_type: transactionType,
      is_split: false,
      is_recurring: false,
      needs_review: needsReview,
      pending: tx.pending,
      plaid_category: plaidPFC || null,
    });
    addedCount++;

    // Reconcile against a superseded pending auth (carry edits/splits, drop pending).
    if (await reconcilePendingTransaction(newTxId, tx.amount, tx.pending_transaction_id)) {
      reconciledCount++;
    }
  }

  // Handle modified transactions
  for (const tx of syncResult.modified) {
    const texts = [tx.merchant_name || '', tx.name || '', (tx as { original_description?: string }).original_description || ''];
    const newMerchantName = tx.merchant_name || tx.name;
    const transactionType = detectTransactionType(tx.amount, texts);

    // Preserve a user-customized display name (it wins in the UI); only refresh
    // it when it still equals the auto-cleaned form of the prior merchant_name.
    const { data: existing } = await supabase
      .from('transactions')
      .select('merchant_name, merchant_display_name')
      .eq('plaid_transaction_id', tx.transaction_id)
      .single();

    const update: Record<string, unknown> = {
      account_id: resolveAccountId(tx.account_id),
      amount: tx.amount,
      date: tx.date,
      merchant_name: newMerchantName,
      original_description: (tx as { original_description?: string }).original_description || tx.name,
      transaction_type: transactionType,
      pending: tx.pending,
    };

    const userCustomizedDisplayName =
      !!existing?.merchant_display_name &&
      existing.merchant_display_name !== cleanMerchantName(existing.merchant_name);
    if (!userCustomizedDisplayName) {
      update.merchant_display_name = cleanMerchantName(newMerchantName);
    }

    await supabase
      .from('transactions')
      .update(update)
      .eq('plaid_transaction_id', tx.transaction_id);
    modifiedCount++;
  }

  // Handle removed transactions
  for (const tx of syncResult.removed) {
    await supabase
      .from('transactions')
      .delete()
      .eq('plaid_transaction_id', tx.transaction_id);
    removedCount++;
  }

  return { addedCount, modifiedCount, removedCount, reattributedCount, reconciledCount };
};

// Plaid webhook endpoint
router.post('/plaid', async (req, res) => {
  try {
    const { webhook_type, webhook_code, item_id, initial_update_complete, historical_update_complete } = req.body;

    console.log(`Plaid webhook received: ${webhook_type} - ${webhook_code}`);
    console.log('Webhook body:', JSON.stringify(req.body, null, 2));

    // Handle ITEM webhooks (authentication issues)
    if (webhook_type === 'ITEM') {
      // These codes mean the user must reconnect the item before it will sync
      // again (common for OAuth banks like American Express, which re-auth often).
      const reauthCodes = ['ITEM_LOGIN_REQUIRED', 'ERROR', 'PENDING_EXPIRATION', 'PENDING_DISCONNECT'];
      if (reauthCodes.includes(webhook_code)) {
        const { data: flagged } = await supabase
          .from('accounts')
          .update({ needs_reauth: true, reauth_detected_at: new Date().toISOString() })
          .eq('plaid_item_id', item_id)
          .select('id, institution_name');
        console.log(`⚠️ Item ${item_id} flagged for re-auth (${webhook_code}) — ${flagged?.length ?? 0} account(s): ${flagged?.map(a => a.institution_name).join(', ') || 'none'}`);
      }
    }

    // Handle TRANSACTIONS webhooks
    if (webhook_type === 'TRANSACTIONS') {
      // An item can have multiple accounts (e.g. an Amex login with two cards).
      // Fetch all of them: one is the representative used for the access token
      // and cursor, while the full list drives per-card attribution.
      const { data: itemAccounts, error: accountError } = await supabase
        .from('accounts')
        .select('*')
        .eq('plaid_item_id', item_id);

      if (accountError || !itemAccounts || itemAccounts.length === 0) {
        console.error('Account not found for item_id:', item_id);
        return res.status(200).json({ received: true, error: 'Account not found' });
      }

      const account = itemAccounts[0];

      if (webhook_code === 'SYNC_UPDATES_AVAILABLE') {
        console.log(`Sync updates available for account ${account.id}`);
        console.log(`  initial_update_complete: ${initial_update_complete}`);
        console.log(`  historical_update_complete: ${historical_update_complete}`);

        // Cooldown: skip if we already synced this item recently.
        // Each transactionsSync call costs $0.12, and Plaid can fire multiple
        // SYNC_UPDATES_AVAILABLE webhooks in quick succession. The cursor-based
        // sync will pick up all accumulated changes on the next call, so
        // skipping intermediate webhooks is safe and saves money.
        const lastSync = lastWebhookSyncByItem.get(item_id);
        if (lastSync && (Date.now() - lastSync) < WEBHOOK_SYNC_COOLDOWN_MS) {
          const minutesLeft = ((WEBHOOK_SYNC_COOLDOWN_MS - (Date.now() - lastSync)) / 60000).toFixed(1);
          console.log(`Skipping webhook sync for item ${item_id} — cooldown active (${minutesLeft}m remaining). Next webhook or manual sync will catch up.`);
        } else {
          // Record sync timestamp
          lastWebhookSyncByItem.set(item_id, Date.now());

          // Sync transactions using the stored cursor
          const syncResult = await plaidService.syncTransactions(
            account.plaid_access_token,
            account.plaid_cursor
          );

          // Process the synced transactions, attributing each to the right card
          const counts = await processSyncedTransactions(itemAccounts, account.id, syncResult);
          console.log(`Processed: +${counts.addedCount} added, ~${counts.modifiedCount} modified, -${counts.removedCount} removed, ⇄${counts.reattributedCount} re-attributed, ⤳${counts.reconciledCount} pending-reconciled`);

          // Update the cursor and historical_sync_complete flag for every
          // account under the item — the cursor is item-level. A successful sync
          // also proves the item is healthy, so stamp last_synced_at and clear
          // any re-auth flag.
          await supabase
            .from('accounts')
            .update({
              plaid_cursor: syncResult.nextCursor,
              historical_sync_complete: historical_update_complete || false,
              last_synced_at: new Date().toISOString(),
              needs_reauth: false,
              reauth_detected_at: null,
            })
            .eq('plaid_item_id', item_id);

          console.log(`Cursor updated for item ${item_id} (${itemAccounts.length} account(s))`);


        }
      } else if (webhook_code === 'INITIAL_UPDATE') {
        console.log(`Initial update received for account ${account.id}`);
        // Trigger a sync to get the initial 30 days of data
        const syncResult = await plaidService.syncTransactions(
          account.plaid_access_token,
          account.plaid_cursor
        );
        const counts = await processSyncedTransactions(itemAccounts, account.id, syncResult);
        console.log(`Initial sync: +${counts.addedCount} transactions`);

        await supabase
          .from('accounts')
          .update({
            plaid_cursor: syncResult.nextCursor,
            last_synced_at: new Date().toISOString(),
            needs_reauth: false,
            reauth_detected_at: null,
          })
          .eq('plaid_item_id', item_id);


      } else if (webhook_code === 'HISTORICAL_UPDATE') {
        console.log(`Historical update complete for item ${item_id}`);
        // Mark historical sync as complete for every account under the item
        await supabase
          .from('accounts')
          .update({ historical_sync_complete: true })
          .eq('plaid_item_id', item_id);
      }
    }

    // Always return 200 to acknowledge receipt
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    // Still return 200 to prevent Plaid from retrying
    res.status(200).json({ received: true, error: 'Processing error' });
  }
});

export default router;
