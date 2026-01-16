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
        transaction_type,
        is_split,
        category:categories(id, name, color, icon),
        splits:transaction_splits(amount, is_my_share)
      `)
      .gte('date', startDate)
      .lte('date', endDate);

    if (error) throw error;

    let totalSpent = 0;
    let totalIncome = 0;
    let totalInvested = 0;
    const categoryTotals = new Map<string, { category: CategoryData; amount: number }>();

    transactions?.forEach(t => {
      const transactionType = t.transaction_type || (t.amount > 0 ? 'expense' : 'income');
      
      // Skip transfers - they shouldn't count as spending or income
      if (transactionType === 'transfer') {
        return;
      }
      
      if (transactionType === 'investment') {
        totalInvested += Math.abs(t.amount);
      } else if (transactionType === 'expense') {
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
        
        totalSpent += amountToCount;
        
        const category = t.category as unknown as CategoryData | null;
        if (category && amountToCount > 0) {
          const existing = categoryTotals.get(category.id);
          if (existing) {
            existing.amount += amountToCount;
          } else {
            categoryTotals.set(category.id, { category, amount: amountToCount });
          }
        }
      } else if (transactionType === 'income') {
        totalIncome += Math.abs(t.amount);
      }
    });

    res.json({
      month: Number(month),
      year: Number(year),
      total_spent: totalSpent,
      total_income: totalIncome,
      total_invested: totalInvested,
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
        transaction_type,
        is_split,
        category:categories(id, name, color, icon),
        splits:transaction_splits(amount, is_my_share)
      `)
      .gte('date', startDate)
      .lte('date', endDate);

    if (error) throw error;

    // Initialize monthly totals
    const monthlyTotals: { month: number; spent: number; income: number; invested: number }[] = [];
    for (let i = 1; i <= 12; i++) {
      monthlyTotals.push({ month: i, spent: 0, income: 0, invested: 0 });
    }

    let totalSpent = 0;
    let totalIncome = 0;
    let totalInvested = 0;
    const categoryTotals = new Map<string, { category: CategoryData; amount: number }>();

    transactions?.forEach(t => {
      const month = new Date(t.date).getMonth(); // 0-indexed
      const transactionType = t.transaction_type || (t.amount > 0 ? 'expense' : 'income');
      
      // Skip transfers - they shouldn't count as spending or income
      if (transactionType === 'transfer') {
        return;
      }
      
      if (transactionType === 'investment') {
        const amount = Math.abs(t.amount);
        totalInvested += amount;
        monthlyTotals[month].invested += amount;
      } else if (transactionType === 'expense') {
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
        
        totalSpent += amountToCount;
        monthlyTotals[month].spent += amountToCount;
        
        const category = t.category as unknown as CategoryData | null;
        if (category && amountToCount > 0) {
          const existing = categoryTotals.get(category.id);
          if (existing) {
            existing.amount += amountToCount;
          } else {
            categoryTotals.set(category.id, { category, amount: amountToCount });
          }
        }
      } else if (transactionType === 'income') {
        const amount = Math.abs(t.amount);
        totalIncome += amount;
        monthlyTotals[month].income += amount;
      }
    });

    res.json({
      year: Number(year),
      monthly_totals: monthlyTotals,
      category_totals: Array.from(categoryTotals.values()).sort((a, b) => b.amount - a.amount),
      total_spent: totalSpent,
      total_income: totalIncome,
      total_invested: totalInvested,
    });
  } catch (error) {
    console.error('Error fetching yearly stats:', error);
    res.status(500).json({ message: 'Failed to fetch yearly stats' });
  }
});

export default router;
