import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Get budget goals for a month/year
router.get('/', async (req, res) => {
  try {
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

    // Only count expenses (exclude income and transfers)
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
      .eq('transaction_type', 'expense');

    // Sum by category, accounting for splits
    const spentByCategory = new Map<string, number>();
    transactions?.forEach(t => {
      if (t.category_id) {
        // If transaction has splits, only count the "my share" portions
        let amountToCount: number;
        const splits = t.splits as { amount: number; is_my_share: boolean }[] | null;
        if (t.is_split && splits && splits.length > 0) {
          amountToCount = splits
            .filter(s => s.is_my_share)
            .reduce((sum, s) => sum + Math.abs(s.amount), 0);
        } else {
          amountToCount = Math.abs(t.amount);
        }
        
        const current = spentByCategory.get(t.category_id) || 0;
        spentByCategory.set(t.category_id, current + amountToCount);
      }
    });

    // Attach spent to goals
    const goalsWithSpent = goals?.map(g => ({
      ...g,
      spent: spentByCategory.get(g.category_id) || 0,
    }));

    res.json(goalsWithSpent);
  } catch (error) {
    console.error('Error fetching budget goals:', error);
    res.status(500).json({ message: 'Failed to fetch budget goals' });
  }
});

// Create budget goal
router.post('/', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error creating budget goal:', error);
    res.status(500).json({ message: 'Failed to create budget goal' });
  }
});

// Update budget goal
router.patch('/:id', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error updating budget goal:', error);
    res.status(500).json({ message: 'Failed to update budget goal' });
  }
});

// Delete budget goal
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase.from('budget_goals').delete().eq('id', id);

    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting budget goal:', error);
    res.status(500).json({ message: 'Failed to delete budget goal' });
  }
});

export default router;

