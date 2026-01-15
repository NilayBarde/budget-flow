import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import * as plaidService from '../services/plaid.js';
import { categorizeTransaction, cleanMerchantName } from '../services/categorizer.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Get all accounts
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ message: 'Failed to fetch accounts' });
  }
});

// Sync transactions for an account
router.post('/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .single();

    if (accountError || !account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Get transactions from Plaid (last 30 days)
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const plaidData = await plaidService.getTransactions(
      account.plaid_access_token,
      startDate,
      endDate
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

    let syncedCount = 0;

    for (const tx of plaidData.transactions) {
      // Check if transaction already exists
      const { data: existing } = await supabase
        .from('transactions')
        .select('id')
        .eq('plaid_transaction_id', tx.transaction_id)
        .single();

      if (existing) continue;

      // Apply merchant mapping if exists
      const mapping = mappingMap.get(tx.merchant_name?.toLowerCase() || '');
      const displayName = mapping?.display_name || cleanMerchantName(tx.merchant_name || tx.name);
      
      // Categorize transaction
      const categoryName = categorizeTransaction(tx.merchant_name || tx.name);
      const categoryId = mapping?.default_category_id || categoryMap.get(categoryName) || null;

      await supabase.from('transactions').insert({
        id: uuidv4(),
        account_id: id,
        plaid_transaction_id: tx.transaction_id,
        amount: tx.amount,
        date: tx.date,
        merchant_name: tx.merchant_name || tx.name,
        merchant_display_name: displayName,
        category_id: categoryId,
        is_split: false,
        is_recurring: false,
      });

      syncedCount++;
    }

    res.json({ synced: syncedCount });
  } catch (error) {
    console.error('Error syncing account:', error);
    res.status(500).json({ message: 'Failed to sync account' });
  }
});

// Delete an account
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

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

export default router;

