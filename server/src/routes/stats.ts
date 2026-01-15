import { Router } from 'express';
import { supabase } from '../db/supabase.js';

const router = Router();

interface CategoryData {
  id: string;
  name: string;
  color: string;
  icon: string;
}

// Get monthly stats
router.get('/monthly', async (req, res) => {
  try {
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ message: 'Month and year are required' });
    }

    const startDate = new Date(Number(year), Number(month) - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select(`
        amount,
        category:categories(id, name, color, icon)
      `)
      .gte('date', startDate)
      .lte('date', endDate);

    if (error) throw error;

    let totalSpent = 0;
    let totalIncome = 0;
    const categoryTotals = new Map<string, { category: CategoryData; amount: number }>();

    transactions?.forEach(t => {
      if (t.amount > 0) {
        totalSpent += t.amount;
        
        const category = t.category as unknown as CategoryData | null;
        if (category) {
          const existing = categoryTotals.get(category.id);
          if (existing) {
            existing.amount += t.amount;
          } else {
            categoryTotals.set(category.id, { category, amount: t.amount });
          }
        }
      } else {
        totalIncome += Math.abs(t.amount);
      }
    });

    res.json({
      month: Number(month),
      year: Number(year),
      total_spent: totalSpent,
      total_income: totalIncome,
      by_category: Array.from(categoryTotals.values()).sort((a, b) => b.amount - a.amount),
    });
  } catch (error) {
    console.error('Error fetching monthly stats:', error);
    res.status(500).json({ message: 'Failed to fetch monthly stats' });
  }
});

// Get yearly stats
router.get('/yearly', async (req, res) => {
  try {
    const { year } = req.query;

    if (!year) {
      return res.status(400).json({ message: 'Year is required' });
    }

    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select(`
        amount,
        date,
        category:categories(id, name, color, icon)
      `)
      .gte('date', startDate)
      .lte('date', endDate);

    if (error) throw error;

    // Initialize monthly totals
    const monthlyTotals: { month: number; spent: number; income: number }[] = [];
    for (let i = 1; i <= 12; i++) {
      monthlyTotals.push({ month: i, spent: 0, income: 0 });
    }

    let totalSpent = 0;
    let totalIncome = 0;
    const categoryTotals = new Map<string, { category: CategoryData; amount: number }>();

    transactions?.forEach(t => {
      const month = new Date(t.date).getMonth(); // 0-indexed
      
      if (t.amount > 0) {
        totalSpent += t.amount;
        monthlyTotals[month].spent += t.amount;
        
        const category = t.category as unknown as CategoryData | null;
        if (category) {
          const existing = categoryTotals.get(category.id);
          if (existing) {
            existing.amount += t.amount;
          } else {
            categoryTotals.set(category.id, { category, amount: t.amount });
          }
        }
      } else {
        totalIncome += Math.abs(t.amount);
        monthlyTotals[month].income += Math.abs(t.amount);
      }
    });

    res.json({
      year: Number(year),
      monthly_totals: monthlyTotals,
      category_totals: Array.from(categoryTotals.values()).sort((a, b) => b.amount - a.amount),
      total_spent: totalSpent,
      total_income: totalIncome,
    });
  } catch (error) {
    console.error('Error fetching yearly stats:', error);
    res.status(500).json({ message: 'Failed to fetch yearly stats' });
  }
});

export default router;
