import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Get all categories
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase.from('categories').select('*').order('name');

    if (error) throw error;
    res.json(data);
  }),
);

// Create category
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, icon, color } = req.body;

    const { data, error } = await supabase
      .from('categories')
      .insert({
        id: uuidv4(),
        name,
        icon,
        color,
        is_default: false,
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  }),
);

// Update category
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabase
      .from('categories')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  }),
);

// Delete category
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if it's a default category
    const { data: category } = await supabase
      .from('categories')
      .select('is_default')
      .eq('id', id)
      .single();

    if (category?.is_default) {
      return res.status(400).json({ message: 'Cannot delete default category' });
    }

    const { error } = await supabase.from('categories').delete().eq('id', id);

    if (error) throw error;
    res.status(204).send();
  }),
);

export default router;
