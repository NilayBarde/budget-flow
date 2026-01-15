import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { v4 as uuidv4 } from 'uuid';
import { categorizeTransaction, cleanMerchantName } from '../services/categorizer.js';

const router = Router();

// Get transactions with filters
router.get('/', async (req, res) => {
  try {
    const { month, year, account_id, category_id, tag_id, search, is_recurring } = req.query;

    let query = supabase
      .from('transactions')
      .select(`
        *,
        account:accounts(*),
        category:categories(*),
        splits:transaction_splits(*)
      `)
      .order('date', { ascending: false });

    // Filter by month and year
    if (month && year) {
      const startDate = new Date(Number(year), Number(month) - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];
      query = query.gte('date', startDate).lte('date', endDate);
    }

    if (account_id) {
      query = query.eq('account_id', account_id);
    }

    if (category_id) {
      query = query.eq('category_id', category_id);
    }

    if (is_recurring === 'true') {
      query = query.eq('is_recurring', true);
    }

    if (search) {
      query = query.or(`merchant_name.ilike.%${search}%,merchant_display_name.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Fetch tags for each transaction
    if (data && data.length > 0) {
      const transactionIds = data.map(t => t.id);
      
      const { data: transactionTags } = await supabase
        .from('transaction_tags')
        .select('transaction_id, tag:tags(*)')
        .in('transaction_id', transactionIds);

      const tagsByTransaction = new Map<string, typeof transactionTags>();
      transactionTags?.forEach(tt => {
        const existing = tagsByTransaction.get(tt.transaction_id) || [];
        existing.push(tt);
        tagsByTransaction.set(tt.transaction_id, existing);
      });

      // Filter by tag if specified
      let filteredData = data;
      if (tag_id) {
        const transactionsWithTag = new Set(
          transactionTags?.filter(tt => tt.tag && (tt.tag as unknown as { id: string }).id === tag_id).map(tt => tt.transaction_id)
        );
        filteredData = data.filter(t => transactionsWithTag.has(t.id));
      }

      // Attach tags to transactions
      filteredData.forEach(t => {
        const tags = tagsByTransaction.get(t.id) || [];
        (t as typeof t & { tags: unknown[] }).tags = tags.map(tt => tt.tag);
      });

      return res.json(filteredData);
    }

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ message: 'Failed to fetch transactions' });
  }
});

// Get single transaction
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        account:accounts(*),
        category:categories(*),
        splits:transaction_splits(*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ message: 'Failed to fetch transaction' });
  }
});

// Create manual transaction
router.post('/', async (req, res) => {
  try {
    const { amount, date, merchant_name, category_id, notes } = req.body;

    const displayName = cleanMerchantName(merchant_name);
    const autoCategoryName = categorizeTransaction(merchant_name);
    
    // Get category ID if not provided
    let finalCategoryId = category_id;
    if (!finalCategoryId) {
      const { data: category } = await supabase
        .from('categories')
        .select('id')
        .eq('name', autoCategoryName)
        .single();
      finalCategoryId = category?.id || null;
    }

    const transaction = {
      id: uuidv4(),
      account_id: null,
      plaid_transaction_id: null,
      amount,
      date,
      merchant_name,
      merchant_display_name: displayName,
      category_id: finalCategoryId,
      is_split: false,
      is_recurring: false,
      notes,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('transactions')
      .insert(transaction)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ message: 'Failed to create transaction' });
  }
});

// Update transaction
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const applyToAll = req.query.applyToAll === 'true';

    // Get the current transaction to know the merchant
    const { data: transaction } = await supabase
      .from('transactions')
      .select('merchant_name, merchant_display_name')
      .eq('id', id)
      .single();

    // If updating category or merchant display name, create/update merchant mapping
    // This ensures the app "learns" your categorization preferences
    if (transaction && (updates.category_id || updates.merchant_display_name)) {
      // Check if a mapping already exists for this merchant
      const { data: existingMapping } = await supabase
        .from('merchant_mappings')
        .select('*')
        .eq('original_name', transaction.merchant_name)
        .single();

      const displayName = updates.merchant_display_name || 
        existingMapping?.display_name || 
        transaction.merchant_display_name || 
        transaction.merchant_name;

      const categoryId = updates.category_id || existingMapping?.default_category_id || null;

      await supabase
        .from('merchant_mappings')
        .upsert({
          id: existingMapping?.id || uuidv4(),
          original_name: transaction.merchant_name,
          display_name: displayName,
          default_category_id: categoryId,
        }, {
          onConflict: 'original_name',
        });

      // If applyToAll is true, update all transactions from the same merchant
      if (applyToAll && transaction.merchant_name) {
        const bulkUpdates: Record<string, unknown> = {};
        if (updates.category_id) bulkUpdates.category_id = updates.category_id;
        if (updates.merchant_display_name) bulkUpdates.merchant_display_name = updates.merchant_display_name;

        if (Object.keys(bulkUpdates).length > 0) {
          await supabase
            .from('transactions')
            .update(bulkUpdates)
            .eq('merchant_name', transaction.merchant_name);
        }
      }
    }

    const { data, error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({ message: 'Failed to update transaction' });
  }
});

// Delete transaction
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Delete splits first
    await supabase.from('transaction_splits').delete().eq('parent_transaction_id', id);
    
    // Delete tags
    await supabase.from('transaction_tags').delete().eq('transaction_id', id);

    const { error } = await supabase.from('transactions').delete().eq('id', id);

    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting transaction:', error);
    res.status(500).json({ message: 'Failed to delete transaction' });
  }
});

// Create splits for a transaction
router.post('/:id/splits', async (req, res) => {
  try {
    const { id } = req.params;
    const { splits } = req.body;

    // Mark transaction as split
    await supabase
      .from('transactions')
      .update({ is_split: true })
      .eq('id', id);

    const splitRecords = splits.map((s: { amount: number; description: string }) => ({
      id: uuidv4(),
      parent_transaction_id: id,
      amount: s.amount,
      description: s.description,
      created_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('transaction_splits')
      .insert(splitRecords)
      .select();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error creating splits:', error);
    res.status(500).json({ message: 'Failed to create splits' });
  }
});

// Delete all splits for a transaction
router.delete('/:id/splits', async (req, res) => {
  try {
    const { id } = req.params;

    await supabase
      .from('transactions')
      .update({ is_split: false })
      .eq('id', id);

    const { error } = await supabase
      .from('transaction_splits')
      .delete()
      .eq('parent_transaction_id', id);

    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting splits:', error);
    res.status(500).json({ message: 'Failed to delete splits' });
  }
});

// Add tag to transaction
router.post('/:id/tags/:tagId', async (req, res) => {
  try {
    const { id, tagId } = req.params;

    const { error } = await supabase
      .from('transaction_tags')
      .insert({ transaction_id: id, tag_id: tagId });

    if (error) throw error;
    res.status(201).send();
  } catch (error) {
    console.error('Error adding tag:', error);
    res.status(500).json({ message: 'Failed to add tag' });
  }
});

// Remove tag from transaction
router.delete('/:id/tags/:tagId', async (req, res) => {
  try {
    const { id, tagId } = req.params;

    const { error } = await supabase
      .from('transaction_tags')
      .delete()
      .eq('transaction_id', id)
      .eq('tag_id', tagId);

    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    console.error('Error removing tag:', error);
    res.status(500).json({ message: 'Failed to remove tag' });
  }
});

export default router;

