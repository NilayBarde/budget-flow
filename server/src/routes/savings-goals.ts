import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Get all savings goals
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from('savings_goals')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data);
  }),
);

// Create savings goal
router.post(
  '/',
  asyncHandler(async (req, res) => {
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
  }),
);

// Update savings goal
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
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
  }),
);

// Delete savings goal
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { error } = await supabase.from('savings_goals').delete().eq('id', id);

    if (error) throw error;
    res.status(204).send();
  }),
);

export default router;
