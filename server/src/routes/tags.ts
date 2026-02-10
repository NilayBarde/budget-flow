import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Get all tags
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase.from('tags').select('*').order('name');

    if (error) throw error;
    res.json(data);
  }),
);

// Create tag
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, color } = req.body;

    const { data, error } = await supabase
      .from('tags')
      .insert({
        id: uuidv4(),
        name,
        color,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  }),
);

// Update tag
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabase.from('tags').update(updates).eq('id', id).select().single();

    if (error) throw error;
    res.json(data);
  }),
);

// Delete tag
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Remove all transaction associations first
    await supabase.from('transaction_tags').delete().eq('tag_id', id);

    const { error } = await supabase.from('tags').delete().eq('id', id);

    if (error) throw error;
    res.status(204).send();
  }),
);

export default router;
