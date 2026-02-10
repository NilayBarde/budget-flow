import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Get all recurring transactions
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('is_active', true)
      .order('average_amount', { ascending: false });

    if (error) throw error;
    res.json(data);
  }),
);

// Update recurring transaction (e.g., mark as inactive)
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
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
  }),
);

export default router;
