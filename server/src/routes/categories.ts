import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Get all categories
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: 'Failed to fetch categories' });
  }
});

// Create category
router.post('/', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ message: 'Failed to create category' });
  }
});

// Update category
router.patch('/:id', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ message: 'Failed to update category' });
  }
});

// Delete category
router.delete('/:id', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ message: 'Failed to delete category' });
  }
});

export default router;

