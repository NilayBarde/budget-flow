import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler } from '../utils/asyncHandler.js';
import { computeCategorySpend, type SpendRow } from '../services/category-spend.js';

const router = Router();

// Get budget goals for a month/year
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ message: 'Month and year are required' });
    }

    // Get budget goals with category info
    const { data: goals, error } = await supabase
      .from('budget_goals')
      .select(`
        *,
        category:categories(*)
      `)
      .eq('month', Number(month))
      .eq('year', Number(year));

    if (error) throw error;

    // Calculate spent amount for each goal
    const startDate = new Date(Number(year), Number(month) - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];

    // Count expenses and returns (returns reduce category spending)
    // Include splits to calculate "my share" for split transactions
    const { data: transactions } = await supabase
      .from('transactions')
      .select(`
        category_id, 
        amount, 
        transaction_type,
        is_split,
        splits:transaction_splits(amount, is_my_share)
      `)
      .gte('date', startDate)
      .lte('date', endDate)
      .in('transaction_type', ['expense', 'return']);

    // Sum by category via the shared service (split-aware, two-pass returns netting)
    const spentByCategory = computeCategorySpend((transactions || []) as SpendRow[]);

    // Attach spent to goals
    const goalsWithSpent = goals?.map((g) => ({
      ...g,
      spent: spentByCategory.get(g.category_id) || 0,
    }));

    res.json(goalsWithSpent);
  }),
);

// Create budget goal
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { category_id, month, year, limit_amount } = req.body;
    const skipExisting = req.query.skipExisting === 'true';

    // Check if goal already exists for this category/month/year
    const { data: existing } = await supabase
      .from('budget_goals')
      .select('id')
      .eq('category_id', category_id)
      .eq('month', month)
      .eq('year', year)
      .single();

    if (existing) {
      // If skipExisting flag is set, just return the existing goal without error
      if (skipExisting) {
        const { data: existingGoal } = await supabase
          .from('budget_goals')
          .select(`*, category:categories(*)`)
          .eq('id', existing.id)
          .single();
        return res.json(existingGoal);
      }
      return res.status(400).json({ message: 'Budget goal already exists for this category and month' });
    }

    const { data, error } = await supabase
      .from('budget_goals')
      .insert({
        id: uuidv4(),
        category_id,
        month,
        year,
        limit_amount,
        created_at: new Date().toISOString(),
      })
      .select(`
        *,
        category:categories(*)
      `)
      .single();

    if (error) throw error;
    res.json(data);
  }),
);

// Update budget goal
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabase
      .from('budget_goals')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        category:categories(*)
      `)
      .single();

    if (error) throw error;
    res.json(data);
  }),
);

// Delete budget goal
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { error } = await supabase.from('budget_goals').delete().eq('id', id);

    if (error) throw error;
    res.status(204).send();
  }),
);

export default router;
