import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Get all merchant mappings
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('merchant_mappings')
      .select('*')
      .order('display_name');

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching merchant mappings:', error);
    res.status(500).json({ message: 'Failed to fetch merchant mappings' });
  }
});

// Create merchant mapping
router.post('/', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error creating merchant mapping:', error);
    res.status(500).json({ message: 'Failed to create merchant mapping' });
  }
});

// Delete merchant mapping
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase.from('merchant_mappings').delete().eq('id', id);

    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting merchant mapping:', error);
    res.status(500).json({ message: 'Failed to delete merchant mapping' });
  }
});

export default router;

