import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Get all tags
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .order('name');

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ message: 'Failed to fetch tags' });
  }
});

// Create tag
router.post('/', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error creating tag:', error);
    res.status(500).json({ message: 'Failed to create tag' });
  }
});

// Update tag
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabase
      .from('tags')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error updating tag:', error);
    res.status(500).json({ message: 'Failed to update tag' });
  }
});

// Delete tag
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Remove all transaction associations first
    await supabase.from('transaction_tags').delete().eq('tag_id', id);

    const { error } = await supabase.from('tags').delete().eq('id', id);

    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ message: 'Failed to delete tag' });
  }
});

export default router;

