import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import * as plaidService from '../services/plaid.js';
import { categorizeWithPlaid, cleanMerchantName, PlaidPFC } from '../services/categorizer.js';
import { checkAccountBalance } from '../services/balance-alerts.js';
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

// Process synced transactions and save to database
const processSyncedTransactions = async (
  accountId: string,
  syncResult: Awaited<ReturnType<typeof plaidService.syncTransactions>>
) => {
  // Get categories for mapping
  const { data: categories } = await supabase.from('categories').select('id, name');
  const categoryMap = new Map(categories?.map(c => [c.name, c.id]) || []);

  // Get merchant mappings
  const { data: mappings } = await supabase.from('merchant_mappings').select('*');
  const mappingMap = new Map(mappings?.map(m => [m.original_name.toLowerCase(), m]) || []);

  let addedCount = 0;
  let modifiedCount = 0;
  let removedCount = 0;

  // Handle added transactions
  for (const tx of syncResult.added) {
    // Check if already exists (shouldn't happen with sync, but safety check)
    const { data: existing } = await supabase
      .from('transactions')
      .select('id')
      .eq('plaid_transaction_id', tx.transaction_id)
      .single();

    if (existing) continue;

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

    await supabase.from('transactions').insert({
      id: uuidv4(),
      account_id: accountId,
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
  }

  // Handle modified transactions
  for (const tx of syncResult.modified) {
    const texts = [tx.merchant_name || '', tx.name || '', (tx as { original_description?: string }).original_description || ''];
    const displayName = cleanMerchantName(tx.merchant_name || tx.name);
    const transactionType = detectTransactionType(tx.amount, texts);

    await supabase
      .from('transactions')
      .update({
        amount: tx.amount,
        date: tx.date,
        merchant_name: tx.merchant_name || tx.name,
        original_description: (tx as { original_description?: string }).original_description || tx.name,
        merchant_display_name: displayName,
        transaction_type: transactionType,
        pending: tx.pending,
      })
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

  return { addedCount, modifiedCount, removedCount };
};

// Plaid webhook endpoint
router.post('/plaid', async (req, res) => {
  try {
    const { webhook_type, webhook_code, item_id, initial_update_complete, historical_update_complete } = req.body;
    
    console.log(`Plaid webhook received: ${webhook_type} - ${webhook_code}`);
    console.log('Webhook body:', JSON.stringify(req.body, null, 2));

    // Handle ITEM webhooks (authentication issues)
    if (webhook_type === 'ITEM') {
      // Find the account by item_id
      const { data: account } = await supabase
        .from('accounts')
        .select('*')
        .eq('plaid_item_id', item_id)
        .single();

      if (account) {
        if (webhook_code === 'ITEM_LOGIN_REQUIRED' || webhook_code === 'ERROR') {
          console.log(`⚠️ Account ${account.id} (${account.institution_name}) requires re-authentication`);
          console.log(`   Webhook code: ${webhook_code}`);
          console.log(`   This is common for American Express accounts due to frequent MFA requirements`);
          // Note: We don't delete the account, but user will need to reconnect
          // Future: Could add a flag to mark account as needing re-auth
        }
      }
    }

    // Handle TRANSACTIONS webhooks
    if (webhook_type === 'TRANSACTIONS') {
      // Find the account by item_id
      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .select('*')
        .eq('plaid_item_id', item_id)
        .single();

      if (accountError || !account) {
        console.error('Account not found for item_id:', item_id);
        return res.status(200).json({ received: true, error: 'Account not found' });
      }

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

          // Process the synced transactions
          const counts = await processSyncedTransactions(account.id, syncResult);
          console.log(`Processed: +${counts.addedCount} added, ~${counts.modifiedCount} modified, -${counts.removedCount} removed`);

          // Update the cursor and historical_sync_complete flag
          await supabase
            .from('accounts')
            .update({
              plaid_cursor: syncResult.nextCursor,
              historical_sync_complete: historical_update_complete || false,
            })
            .eq('id', account.id);

          console.log(`Cursor updated for account ${account.id}`);

          // Check balance and send alert if threshold exceeded
          try {
            const alertSent = await checkAccountBalance(account.id);
            if (alertSent) {
              console.log(`Balance alert sent for account ${account.id}`);
            }
          } catch (balanceError) {
            console.error('Error checking balance after webhook sync:', balanceError);
          }
        }
      } else if (webhook_code === 'INITIAL_UPDATE') {
        console.log(`Initial update received for account ${account.id}`);
        // Trigger a sync to get the initial 30 days of data
        const syncResult = await plaidService.syncTransactions(
          account.plaid_access_token,
          account.plaid_cursor
        );
        const counts = await processSyncedTransactions(account.id, syncResult);
        console.log(`Initial sync: +${counts.addedCount} transactions`);

        await supabase
          .from('accounts')
          .update({ plaid_cursor: syncResult.nextCursor })
          .eq('id', account.id);

        // Check balance on initial update as well
        try {
          const alertSent = await checkAccountBalance(account.id);
          if (alertSent) {
            console.log(`Balance alert sent for account ${account.id}`);
          }
        } catch (balanceError) {
          console.error('Error checking balance after initial sync:', balanceError);
        }
      } else if (webhook_code === 'HISTORICAL_UPDATE') {
        console.log(`Historical update complete for account ${account.id}`);
        // Mark historical sync as complete
        await supabase
          .from('accounts')
          .update({ historical_sync_complete: true })
          .eq('id', account.id);
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
