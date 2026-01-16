import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import * as plaidService from '../services/plaid.js';
import { categorizeTransaction, cleanMerchantName } from '../services/categorizer.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

type TransactionType = 'income' | 'expense' | 'transfer' | 'investment';

// Patterns for transaction type detection (same as accounts.ts)
const TRANSFER_PATTERNS = [
  /card[- ]?payment/i,
  /payment.*thank\s*you/i,
  /autopay/i,
  /credit\s*card\s*payment/i,
  /epayment/i,
  /\btransfer\b/i,
  /bill\s*pay/i,
  /zelle/i,
  /cash\s*app/i,
  /acctverify/i,
];

const INVESTMENT_PATTERNS = [
  /robinhood[- ]?debits?/i,
  /fidelity/i,
  /vanguard/i,
  /schwab/i,
  /coinbase/i,
  /webull/i,
  /acorns/i,
  /betterment/i,
];

const detectTransactionType = (amount: number, texts: string[]): TransactionType => {
  if (texts.some(t => TRANSFER_PATTERNS.some(p => p.test(t)))) return 'transfer';
  if (texts.some(t => INVESTMENT_PATTERNS.some(p => p.test(t)))) return 'investment';
  if (amount < 0) return 'income';
  return 'expense';
};

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
    const transactionType = detectTransactionType(tx.amount, texts);

    // Auto-assign category based on type
    let categoryId: string | null = null;
    if (transactionType === 'expense') {
      const categoryName = categorizeTransaction(tx.merchant_name || tx.name, (tx as { original_description?: string }).original_description);
      categoryId = mapping?.default_category_id || categoryMap.get(categoryName) || null;
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
