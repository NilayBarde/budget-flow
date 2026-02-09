import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Get all savings goals
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('savings_goals')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching savings goals:', error);
    res.status(500).json({ message: 'Failed to fetch savings goals' });
  }
});

// Create savings goal
router.post('/', async (req, res) => {
  try {
    const { name, target_amount, current_amount, monthly_contribution, icon, color, deadline } = req.body;

    if (!name || !target_amount) {
      return res.status(400).json({ message: 'Name and target amount are required' });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('savings_goals')
      .insert({
        id: uuidv4(),
        name,
        target_amount,
        current_amount: current_amount ?? 0,
        monthly_contribution: monthly_contribution ?? 0,
        icon: icon ?? 'piggy-bank',
        color: color ?? '#6366f1',
        deadline: deadline ?? null,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating savings goal:', error);
    res.status(500).json({ message: 'Failed to create savings goal' });
  }
});

// Update savings goal
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body, updated_at: new Date().toISOString() };

    const { data, error } = await supabase
      .from('savings_goals')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error updating savings goal:', error);
    res.status(500).json({ message: 'Failed to update savings goal' });
  }
});

// Delete savings goal
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('savings_goals')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting savings goal:', error);
    res.status(500).json({ message: 'Failed to delete savings goal' });
  }
});

export default router;
