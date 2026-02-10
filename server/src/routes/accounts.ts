import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import * as plaidService from '../services/plaid.js';
import { categorizeWithPlaid, cleanMerchantName, PlaidPFC } from '../services/categorizer.js';
import { checkAccountBalance, fetchAndUpdateBalance } from '../services/balance-alerts.js';
import { detectTransactionType } from '../services/transaction-type.js';
import { getCategoryIdForType } from '../services/category-lookup.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Get all accounts
router.get('/', async (req, res) => {
  try {
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get the most recent CSV import date for each account
    const { data: lastImports } = await supabase
      .from('csv_imports')
      .select('account_id, created_at')
      .order('created_at', { ascending: false });

    // Build a map of account_id -> most recent import date
    const lastImportMap = new Map<string, string>();
    for (const imp of lastImports || []) {
      if (!lastImportMap.has(imp.account_id)) {
        lastImportMap.set(imp.account_id, imp.created_at);
      }
    }

    // Merge last import dates into accounts
    // Use csv_imports table first, fall back to account's own last_csv_import_at (set by holdings import)
    const accountsWithLastImport = accounts?.map(account => ({
      ...account,
      last_csv_import_at: lastImportMap.get(account.id) || account.last_csv_import_at || null,
    }));

    res.json(accountsWithLastImport);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ message: 'Failed to fetch accounts' });
  }
});

// Create a manual account (for banks that can't be linked via Plaid, e.g., American Express)
router.post('/manual', async (req, res) => {
  try {
    const { institution_name, account_name, account_type, current_balance } = req.body;

    if (!institution_name || !account_name || !account_type) {
      return res.status(400).json({ 
        message: 'institution_name, account_name, and account_type are required' 
      });
    }

    const accountId = uuidv4();
    const manualId = `manual-${accountId}`;

    const account: Record<string, unknown> = {
      id: accountId,
      user_id: 'default-user',
      plaid_item_id: manualId,
      plaid_access_token: 'manual',
      institution_name,
      account_name,
      account_type,
      created_at: new Date().toISOString(),
    };

    if (current_balance !== undefined && current_balance !== null) {
      account.current_balance = parseFloat(current_balance);
    }

    const { data, error } = await supabase
      .from('accounts')
      .insert(account)
      .select()
      .single();

    if (error) throw error;

    console.log(`Created manual account: ${institution_name} - ${account_name}`);
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating manual account:', error);
    res.status(500).json({ message: 'Failed to create manual account' });
  }
});

// Sync transactions for an account using Plaid's /transactions/sync (recommended)
router.post('/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;
    const { use_legacy } = req.query; // Optional: use old /transactions/get method

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .single();

    if (accountError || !account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Use new /transactions/sync method (recommended by Plaid)
    console.log(`Syncing transactions for account ${id} using /transactions/sync...`);
    console.log(`Current cursor: ${account.plaid_cursor ? 'exists' : 'none (initial sync)'}`);

    const syncResult = await plaidService.syncTransactions(
      account.plaid_access_token,
      account.plaid_cursor
    );

    // Get categories for mapping
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name');

    const categoryMap = new Map(categories?.map(c => [c.name, c.id]) || []);

    // Get merchant mappings
    const { data: mappings } = await supabase
      .from('merchant_mappings')
      .select('*');

    const mappingMap = new Map(mappings?.map(m => [m.original_name.toLowerCase(), m]) || []);

    let addedCount = 0;
    let modifiedCount = 0;
    let removedCount = 0;

    // Handle added transactions
    for (const tx of syncResult.added) {
      // Check if already exists
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
      
      // Detect transaction type with Plaid PFC
      const transactionType = detectTransactionType(tx.amount, texts, plaidPFC);

      // Auto-assign category only for expenses and returns
      // Income, investment, and transfer types don't need categories - the type is sufficient
      let categoryId: string | null = null;
      let needsReview = false;
      
      if (transactionType === 'expense' || transactionType === 'return') {
        // Returns use the same categorization as expenses (e.g., Amazon return → Shopping)
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
      }

      await supabase.from('transactions').insert({
        id: uuidv4(),
        account_id: id,
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
      const plaidPFC = tx.personal_finance_category as PlaidPFC | undefined;
      
      const transactionType = detectTransactionType(tx.amount, texts, plaidPFC);

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

    // Update the cursor and historical sync status
    const historicalComplete = syncResult.transactionsUpdateStatus === 'HISTORICAL_UPDATE_COMPLETE';
    await supabase
      .from('accounts')
      .update({ 
        plaid_cursor: syncResult.nextCursor,
        historical_sync_complete: historicalComplete || account.historical_sync_complete
      })
      .eq('id', id);

    console.log(`Sync complete: +${addedCount} added, ~${modifiedCount} modified, -${removedCount} removed`);
    console.log(`Historical sync status: ${syncResult.transactionsUpdateStatus || 'unknown'}`);

    // Check balance and send alert if threshold exceeded
    console.log('Starting balance check...');
    let balanceAlertSent = false;
    try {
      balanceAlertSent = await checkAccountBalance(id);
      console.log(`Balance check complete, alert sent: ${balanceAlertSent}`);
    } catch (balanceError) {
      console.error('Error checking balance after sync:', balanceError);
      // Don't fail the sync request if balance check fails
    }

    res.json({ 
      added: addedCount, 
      modified: modifiedCount, 
      removed: removedCount,
      cursor_updated: true,
      transactions_update_status: syncResult.transactionsUpdateStatus,
      historical_complete: historicalComplete || account.historical_sync_complete,
      balance_alert_sent: balanceAlertSent
    });
  } catch (error) {
    console.error('Error syncing account:', error);
    res.status(500).json({ message: 'Failed to sync account' });
  }
});

// Update webhook URL on an existing account (doesn't use up an Item!)
router.post('/:id/update-webhook', async (req, res) => {
  try {
    const { id } = req.params;
    const webhookUrl = process.env.PLAID_WEBHOOK_URL;

    if (!webhookUrl) {
      return res.status(400).json({ message: 'PLAID_WEBHOOK_URL not configured' });
    }

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('plaid_access_token')
      .eq('id', id)
      .single();

    if (accountError || !account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    await plaidService.updateWebhook(account.plaid_access_token, webhookUrl);

    res.json({ message: 'Webhook updated', webhook_url: webhookUrl });
  } catch (error) {
    console.error('Error updating webhook:', error);
    res.status(500).json({ message: 'Failed to update webhook' });
  }
});

// Delete an account (also removes from Plaid to keep things clean)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the access token to remove from Plaid
    const { data: account } = await supabase
      .from('accounts')
      .select('plaid_access_token')
      .eq('id', id)
      .single();

    // Remove from Plaid (optional - helps keep Plaid dashboard clean)
    if (account?.plaid_access_token) {
      try {
        await plaidService.removeItem(account.plaid_access_token);
      } catch (plaidError) {
        console.warn('Could not remove item from Plaid:', plaidError);
        // Continue with local deletion even if Plaid removal fails
      }
    }

    // Delete all transactions for this account first
    await supabase.from('transactions').delete().eq('account_id', id);

    const { error } = await supabase.from('accounts').delete().eq('id', id);

    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ message: 'Failed to delete account' });
  }
});

// Refresh accounts from Plaid - fetches any missing accounts from an existing Plaid Item
// This is useful when the original link only stored one account but Plaid has multiple
router.post('/:id/refresh-accounts', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the existing account to get the access token
    const { data: existingAccount, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .single();

    if (accountError || !existingAccount) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Check if it's a manual account
    if (existingAccount.plaid_access_token === 'manual') {
      return res.status(400).json({ message: 'Cannot refresh accounts for manual accounts' });
    }

    // Fetch all accounts from Plaid
    const plaidData = await plaidService.getAccounts(existingAccount.plaid_access_token);
    
    if (!plaidData.accounts || plaidData.accounts.length === 0) {
      return res.status(400).json({ message: 'No accounts found in Plaid' });
    }

    console.log(`Found ${plaidData.accounts.length} accounts from Plaid for ${existingAccount.institution_name}`);

    // Get all existing accounts for this Plaid Item
    const { data: existingAccounts } = await supabase
      .from('accounts')
      .select('plaid_account_id')
      .eq('plaid_item_id', existingAccount.plaid_item_id);

    const existingPlaidAccountIds = new Set(
      existingAccounts?.map(a => a.plaid_account_id).filter(Boolean) || []
    );

    // Also check by account name as fallback for older accounts without plaid_account_id
    const { data: existingByName } = await supabase
      .from('accounts')
      .select('account_name')
      .eq('plaid_item_id', existingAccount.plaid_item_id);

    const existingNames = new Set(
      existingByName?.map(a => a.account_name) || []
    );

    const newAccounts: Array<{ id: string; name: string; type: string }> = [];
    const updatedAccounts: string[] = [];

    for (const plaidAccount of plaidData.accounts) {
      const alreadyExists = existingPlaidAccountIds.has(plaidAccount.account_id) ||
                           existingNames.has(plaidAccount.name);

      if (alreadyExists) {
        // Update existing account with plaid_account_id and balance if missing
        const { data: existing } = await supabase
          .from('accounts')
          .select('id, plaid_account_id')
          .eq('plaid_item_id', existingAccount.plaid_item_id)
          .or(`plaid_account_id.eq.${plaidAccount.account_id},account_name.eq.${plaidAccount.name}`)
          .single();

        if (existing && !existing.plaid_account_id) {
          await supabase
            .from('accounts')
            .update({ 
              plaid_account_id: plaidAccount.account_id,
              current_balance: plaidAccount.balances?.current ?? null,
              account_type: plaidAccount.subtype || plaidAccount.type || existing.plaid_account_id,
            })
            .eq('id', existing.id);
          updatedAccounts.push(plaidAccount.name);
        }
        continue;
      }

      // Create new account
      const accountId = uuidv4();
      const account = {
        id: accountId,
        user_id: existingAccount.user_id,
        plaid_item_id: existingAccount.plaid_item_id,
        plaid_access_token: existingAccount.plaid_access_token,
        plaid_account_id: plaidAccount.account_id,
        institution_name: existingAccount.institution_name,
        account_name: plaidAccount.name || 'Account',
        account_type: plaidAccount.subtype || plaidAccount.type || 'unknown',
        current_balance: plaidAccount.balances?.current ?? null,
        created_at: new Date().toISOString(),
      };

      const { error: insertError } = await supabase
        .from('accounts')
        .insert(account);

      if (insertError) {
        console.error(`Failed to create account ${plaidAccount.name}:`, insertError);
        continue;
      }

      console.log(`Created new account: ${existingAccount.institution_name} - ${plaidAccount.name} (${plaidAccount.subtype || plaidAccount.type})`);
      newAccounts.push({ 
        id: accountId, 
        name: plaidAccount.name, 
        type: plaidAccount.subtype || plaidAccount.type || 'unknown'
      });
    }

    res.json({
      message: `Found ${plaidData.accounts.length} accounts in Plaid`,
      created: newAccounts,
      updated: updatedAccounts,
      total_new: newAccounts.length,
      total_updated: updatedAccounts.length,
    });
  } catch (error) {
    console.error('Error refreshing accounts:', error);
    res.status(500).json({ message: 'Failed to refresh accounts from Plaid' });
  }
});

// Update an account (balance threshold, etc.)
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { balance_threshold } = req.body;

    // Build update object with only allowed fields
    const updates: Record<string, unknown> = {};
    
    // Allow setting balance_threshold to null (to disable) or a number
    if (balance_threshold !== undefined) {
      updates.balance_threshold = balance_threshold;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    const { data, error } = await supabase
      .from('accounts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ message: 'Account not found' });
    }

    console.log(`Updated account ${id}: balance_threshold=${balance_threshold}`);
    res.json(data);
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({ message: 'Failed to update account' });
  }
});

// Refresh balance for an account from Plaid
router.get('/:id/balance', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, plaid_access_token, account_name')
      .eq('id', id)
      .single();

    if (accountError || !account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Check if it's a manual account
    if (account.plaid_access_token === 'manual') {
      return res.status(400).json({ 
        message: 'Balance refresh not available for manual accounts' 
      });
    }

    // Fetch and update balance from Plaid
    const balance = await fetchAndUpdateBalance(id);

    if (balance === null) {
      return res.status(500).json({ message: 'Failed to fetch balance from Plaid' });
    }

    res.json({ balance, account_name: account.account_name });
  } catch (error) {
    console.error('Error refreshing balance:', error);
    res.status(500).json({ message: 'Failed to refresh balance' });
  }
});

// Reclassify all existing transactions with transaction_type
// This is a one-time migration endpoint
router.post('/reclassify-transactions', async (req, res) => {
  try {
    console.log('Starting transaction reclassification...');
    
    // Get all transactions
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('id, amount, merchant_name, original_description');

    if (error) throw error;

    let reclassified = 0;
    let incomeCount = 0;
    let expenseCount = 0;
    let transferCount = 0;
    let investmentCount = 0;

    for (const tx of transactions || []) {
      // Detect transaction type using both merchant_name and original_description
      // Note: personal_finance_category not available for reclassification (not stored)
      const detectedType = detectTransactionType(
        tx.amount,
        [tx.merchant_name || '', tx.original_description || ''],
      );
      
      
      // Update the transaction
      const { error: updateError } = await supabase
        .from('transactions')
        .update({ transaction_type: detectedType })
        .eq('id', tx.id);

      if (updateError) {
        console.error(`Error updating transaction ${tx.id}:`, updateError);
        continue;
      }

      reclassified++;
      if (detectedType === 'income') incomeCount++;
      else if (detectedType === 'expense') expenseCount++;
      else if (detectedType === 'transfer') transferCount++;
      else if (detectedType === 'investment') investmentCount++;
    }

    res.json({ 
      reclassified, 
      breakdown: {
        income: incomeCount,
        expense: expenseCount,
        transfer: transferCount,
        investment: investmentCount
      }
    });
  } catch (error) {
    console.error('Error reclassifying transactions:', error);
    res.status(500).json({ message: 'Failed to reclassify transactions' });
  }
});

// Assign categories to income and investment transactions
// This updates existing transactions that have transaction_type but no category
router.post('/assign-type-categories', async (req, res) => {
  try {
    console.log('Assigning categories to income/investment transactions...');
    
    const typesToAssign = ['income', 'investment'] as const;
    const results: Record<string, number> = {};
    const categoriesFound: Record<string, boolean> = {};

    for (const type of typesToAssign) {
      const categoryId = await getCategoryIdForType(type);
      categoriesFound[type] = !!categoryId;

      if (categoryId) {
        const { data: updated } = await supabase
          .from('transactions')
          .update({ category_id: categoryId })
          .eq('transaction_type', type)
          .is('category_id', null)
          .select('id');

        results[type] = updated?.length || 0;
      } else {
        results[type] = 0;
      }
    }

    res.json({
      updated: results,
      categories_found: categoriesFound,
    });
  } catch (error) {
    console.error('Error assigning type categories:', error);
    res.status(500).json({ message: 'Failed to assign categories' });
  }
});

// Clear categories for transfer transactions (transfers shouldn't have expense categories)
router.post('/clear-transfer-categories', async (req, res) => {
  try {
    console.log('Clearing categories for transfer transactions...');
    
    const { data: result, error } = await supabase
      .from('transactions')
      .update({ category_id: null })
      .eq('transaction_type', 'transfer')
      .not('category_id', 'is', null)
      .select('id');
    
    if (error) throw error;
    
    const clearedCount = result?.length || 0;
    
    res.json({
      cleared: clearedCount,
      message: `Cleared categories for ${clearedCount} transfer transactions`
    });
  } catch (error) {
    console.error('Error clearing transfer categories:', error);
    res.status(500).json({ message: 'Failed to clear transfer categories' });
  }
});

/**
 * Recategorize all existing transactions using the new Plaid-first approach
 * This preserves user corrections (merchant mappings) and re-applies categorization
 * to transactions that weren't manually categorized
 * 
 * Options:
 * - skip_manual: if true (default), skip transactions that have merchant mappings
 * - force: if true, recategorize ALL transactions including those with existing categories
 */
router.post('/recategorize-all', async (req, res) => {
  try {
    const { skip_manual = true, force = false } = req.body;
    
    console.log('Starting full recategorization...');
    console.log(`  skip_manual: ${skip_manual}, force: ${force}`);
    
    // Get categories for mapping
    const { data: categories } = await supabase.from('categories').select('id, name');
    const categoryMap = new Map(categories?.map(c => [c.name, c.id]) || []);
    const categoryNameById = new Map(categories?.map(c => [c.id, c.name]) || []);
    
    // Get merchant mappings (user's corrections)
    const { data: mappings } = await supabase.from('merchant_mappings').select('*');
    const mappingMap = new Map(mappings?.map(m => [m.original_name.toLowerCase(), m]) || []);
    
    // Get all expense transactions
    let query = supabase
      .from('transactions')
      .select('id, merchant_name, original_description, plaid_category, category_id, transaction_type')
      .eq('transaction_type', 'expense');
    
    // If not forcing, only get transactions that need review or have no category
    if (!force) {
      query = query.or('needs_review.eq.true,category_id.is.null');
    }
    
    const { data: transactions, error } = await query;
    
    if (error) throw error;
    
    let recategorized = 0;
    let skipped = 0;
    let markedForReview = 0;
    const categoryBreakdown: Record<string, number> = {};
    
    for (const tx of transactions || []) {
      // Skip if merchant has a mapping (user correction) and skip_manual is true
      const mapping = mappingMap.get((tx.merchant_name || '').toLowerCase());
      if (skip_manual && mapping?.default_category_id) {
        skipped++;
        continue;
      }
      
      // Use merchant mapping if available
      let categoryId: string | null = null;
      let needsReview = false;
      
      if (mapping?.default_category_id) {
        categoryId = mapping.default_category_id;
      } else {
        // Use Plaid-first categorization
        const plaidPFC = tx.plaid_category as PlaidPFC | null;
        const result = categorizeWithPlaid(
          tx.merchant_name || '',
          tx.original_description,
          plaidPFC
        );
        
        categoryId = categoryMap.get(result.categoryName) || null;
        needsReview = result.needsReview;
      }
      
      // Update the transaction
      const { error: updateError } = await supabase
        .from('transactions')
        .update({ 
          category_id: categoryId,
          needs_review: needsReview
        })
        .eq('id', tx.id);
      
      if (updateError) {
        console.error(`Error updating transaction ${tx.id}:`, updateError);
        continue;
      }
      
      recategorized++;
      if (needsReview) markedForReview++;
      
      // Track category breakdown
      const categoryName = categoryId ? (categoryNameById.get(categoryId) || 'Unknown') : 'Uncategorized';
      categoryBreakdown[categoryName] = (categoryBreakdown[categoryName] || 0) + 1;
    }
    
    console.log(`Recategorization complete: ${recategorized} transactions updated, ${skipped} skipped, ${markedForReview} marked for review`);
    
    res.json({
      recategorized,
      skipped,
      markedForReview,
      categoryBreakdown
    });
  } catch (error) {
    console.error('Error recategorizing transactions:', error);
    res.status(500).json({ message: 'Failed to recategorize transactions' });
  }
});

export default router;

