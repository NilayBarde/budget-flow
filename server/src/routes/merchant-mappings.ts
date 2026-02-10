import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Get all merchant mappings
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from('merchant_mappings')
      .select('*')
      .order('display_name');

    if (error) throw error;
    res.json(data);
  }),
);

// Create merchant mapping
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { original_name, display_name, default_category_id } = req.body;

    const { data, error } = await supabase
      .from('merchant_mappings')
      .insert({
        id: uuidv4(),
        original_name,
        display_name,
        default_category_id,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  }),
);

// Delete merchant mapping
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { error } = await supabase.from('merchant_mappings').delete().eq('id', id);

    if (error) throw error;
    res.status(204).send();
  }),
);

export default router;
