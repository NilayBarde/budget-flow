import { Router } from 'express';
import { supabase } from '../db/supabase.js';

const router = Router();

// Get all recurring transactions
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('is_active', true)
      .order('average_amount', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching recurring transactions:', error);
    res.status(500).json({ message: 'Failed to fetch recurring transactions' });
  }
});

// Update recurring transaction (e.g., mark as inactive)
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabase
      .from('recurring_transactions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error updating recurring transaction:', error);
    res.status(500).json({ message: 'Failed to update recurring transaction' });
  }
});

export default router;
