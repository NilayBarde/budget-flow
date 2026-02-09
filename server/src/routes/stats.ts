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
      } else if (transactionType === 'return') {
        // Returns reduce spending in their category (amount is negative in DB)
        const returnAmount = Math.abs(t.amount);
        totalSpent -= returnAmount; // Reduce total spent
        
        const category = t.category as unknown as CategoryData | null;
        if (category) {
          const existing = categoryTotals.get(category.id);
          if (existing) {
            existing.amount = Math.max(0, existing.amount - returnAmount);
          }
          // If category doesn't exist yet, the return just won't reduce anything
        }
      } else if (transactionType === 'income') {
        const incomeAmount = Math.abs(t.amount);
        totalIncome += incomeAmount;
      }
    });

    // Ensure totalSpent doesn't go negative
    totalSpent = Math.max(0, totalSpent);

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
      } else if (transactionType === 'return') {
        // Returns reduce spending in their category (amount is negative in DB)
        const returnAmount = Math.abs(t.amount);
        totalSpent -= returnAmount;
        monthlyTotals[month].spent = Math.max(0, monthlyTotals[month].spent - returnAmount);
        
        const category = t.category as unknown as CategoryData | null;
        if (category) {
          const existing = categoryTotals.get(category.id);
          if (existing) {
            existing.amount = Math.max(0, existing.amount - returnAmount);
          }
        }
      } else if (transactionType === 'income') {
        const incomeAmount = Math.abs(t.amount);
        totalIncome += incomeAmount;
        monthlyTotals[month].income += incomeAmount;
      }
    });

    // Ensure totalSpent doesn't go negative
    totalSpent = Math.max(0, totalSpent);

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

// Helper: compute the expense amount for a transaction, respecting splits
const getExpenseAmount = (t: {
  amount: number;
  is_split: boolean;
  splits: unknown;
}): number => {
  const splits = t.splits as { amount: number; is_my_share: boolean }[] | null;
  if (t.is_split && splits && splits.length > 0) {
    return splits
      .filter(s => s.is_my_share)
      .reduce((sum, s) => sum + Math.abs(s.amount), 0);
  }
  return Math.abs(t.amount);
};

// Get spending insights (trends, merchants, velocity, daily breakdown)
router.get('/insights', async (req, res) => {
  try {
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-indexed
    const currentYear = now.getFullYear();
    const today = now.getDate();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

    // Build date range for last 6 months (inclusive of current month)
    const months: { month: number; year: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      let m = currentMonth - i;
      let y = currentYear;
      while (m < 1) { m += 12; y -= 1; }
      months.push({ month: m, year: y });
    }

    const sixMonthsAgoStart = new Date(months[0].year, months[0].month - 1, 1)
      .toISOString().split('T')[0];
    const currentMonthEnd = new Date(currentYear, currentMonth, 0)
      .toISOString().split('T')[0];

    // ── Query active monthly recurring charges ────────────────────────
    const { data: recurringCharges } = await supabase
      .from('recurring_transactions')
      .select('merchant_display_name, average_amount')
      .eq('is_active', true)
      .eq('frequency', 'monthly');

    const recurringMerchants = new Set(
      (recurringCharges || []).map(r => r.merchant_display_name)
    );
    const expectedFixedCosts = (recurringCharges || [])
      .reduce((sum, r) => sum + r.average_amount, 0);

    // Single query for all 6 months of transactions
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select(`
        amount,
        date,
        transaction_type,
        is_split,
        merchant_name,
        merchant_display_name,
        category:categories(id, name, color, icon),
        splits:transaction_splits(amount, is_my_share)
      `)
      .gte('date', sixMonthsAgoStart)
      .lte('date', currentMonthEnd);

    if (error) throw error;

    // ── Category Trends (per-category, per-month) ──────────────────────
    // Map<categoryId, { category, months: Map<"YYYY-MM", amount> }>
    const categoryMonthMap = new Map<string, {
      category: CategoryData;
      months: Map<string, number>;
    }>();

    // ── Top Merchants ──────────────────────────────────────────────────
    const merchantMap = new Map<string, {
      merchantName: string;
      totalSpent: number;
      transactionCount: number;
      lastDate: string;
    }>();

    // ── Daily Spending (current month only) ────────────────────────────
    const dailySpending = new Map<number, number>(); // day -> amount
    for (let d = 1; d <= daysInMonth; d++) {
      dailySpending.set(d, 0);
    }

    // ── Month-over-Month totals ────────────────────────────────────────
    const currentMonthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    const prevMonth = months[months.length - 2]; // second to last
    const prevMonthKey = `${prevMonth.year}-${String(prevMonth.month).padStart(2, '0')}`;
    const momTotals: Record<string, { spent: number; income: number }> = {
      [currentMonthKey]: { spent: 0, income: 0 },
      [prevMonthKey]: { spent: 0, income: 0 },
    };

    // ── Spending velocity (current month) ──────────────────────────────
    let currentMonthSpent = 0;
    let currentMonthRecurringSpent = 0;
    let prevMonthTotalSpent = 0;

    // ── Process all transactions ───────────────────────────────────────
    transactions?.forEach(t => {
      const transactionType = t.transaction_type || (t.amount > 0 ? 'expense' : 'income');
      if (transactionType === 'transfer') return;

      const txDate = new Date(t.date);
      const txMonth = txDate.getMonth() + 1;
      const txYear = txDate.getFullYear();
      const monthKey = `${txYear}-${String(txMonth).padStart(2, '0')}`;

      if (transactionType === 'expense') {
        const amountToCount = getExpenseAmount(t);

        // Category trends
        const category = t.category as unknown as CategoryData | null;
        if (category && amountToCount > 0) {
          let entry = categoryMonthMap.get(category.id);
          if (!entry) {
            entry = { category, months: new Map() };
            categoryMonthMap.set(category.id, entry);
          }
          entry.months.set(monthKey, (entry.months.get(monthKey) || 0) + amountToCount);
        }

        // Top merchants (all 6 months aggregated)
        const merchant = t.merchant_display_name || t.merchant_name;
        if (merchant && amountToCount > 0) {
          const existing = merchantMap.get(merchant);
          if (existing) {
            existing.totalSpent += amountToCount;
            existing.transactionCount += 1;
            if (t.date > existing.lastDate) existing.lastDate = t.date;
          } else {
            merchantMap.set(merchant, {
              merchantName: merchant,
              totalSpent: amountToCount,
              transactionCount: 1,
              lastDate: t.date,
            });
          }
        }

        // Daily spending (current month only)
        if (txMonth === currentMonth && txYear === currentYear) {
          const day = txDate.getDate();
          dailySpending.set(day, (dailySpending.get(day) || 0) + amountToCount);
          currentMonthSpent += amountToCount;

          // Track recurring vs variable for velocity
          const merchantName = t.merchant_display_name || t.merchant_name;
          if (merchantName && recurringMerchants.has(merchantName)) {
            currentMonthRecurringSpent += amountToCount;
          }
        }

        // Month-over-month
        if (monthKey === currentMonthKey) {
          momTotals[currentMonthKey].spent += amountToCount;
        } else if (monthKey === prevMonthKey) {
          momTotals[prevMonthKey].spent += amountToCount;
          prevMonthTotalSpent += amountToCount;
        }
      } else if (transactionType === 'return') {
        // Returns also respect splits (only subtract my share)
        const returnAmount = getExpenseAmount(t);

        // Category trends: reduce
        const category = t.category as unknown as CategoryData | null;
        if (category) {
          const entry = categoryMonthMap.get(category.id);
          if (entry) {
            const current = entry.months.get(monthKey) || 0;
            entry.months.set(monthKey, Math.max(0, current - returnAmount));
          }
        }

        // Top merchants: subtract returns from merchant totals
        const merchant = t.merchant_display_name || t.merchant_name;
        if (merchant && returnAmount > 0) {
          const existing = merchantMap.get(merchant);
          if (existing) {
            existing.totalSpent = Math.max(0, existing.totalSpent - returnAmount);
          }
        }

        // Daily spending (current month)
        if (txMonth === currentMonth && txYear === currentYear) {
          const day = txDate.getDate();
          dailySpending.set(day, Math.max(0, (dailySpending.get(day) || 0) - returnAmount));
          currentMonthSpent = Math.max(0, currentMonthSpent - returnAmount);
        }

        // Month-over-month
        if (monthKey === currentMonthKey) {
          momTotals[currentMonthKey].spent = Math.max(0, momTotals[currentMonthKey].spent - returnAmount);
        } else if (monthKey === prevMonthKey) {
          momTotals[prevMonthKey].spent = Math.max(0, momTotals[prevMonthKey].spent - returnAmount);
          prevMonthTotalSpent = Math.max(0, prevMonthTotalSpent - returnAmount);
        }
      } else if (transactionType === 'income') {
        const incomeAmount = Math.abs(t.amount);
        if (monthKey === currentMonthKey) {
          momTotals[currentMonthKey].income += incomeAmount;
        } else if (monthKey === prevMonthKey) {
          momTotals[prevMonthKey].income += incomeAmount;
        }
      }
    });

    // ── Build category trends response ─────────────────────────────────
    const monthKeys = months.map(m => `${m.year}-${String(m.month).padStart(2, '0')}`);

    // Rank categories by total 6-month spend, take top 8
    const categoryEntries = Array.from(categoryMonthMap.entries())
      .map(([id, entry]) => {
        const totalSpend = Array.from(entry.months.values()).reduce((a, b) => a + b, 0);
        return { id, ...entry, totalSpend };
      })
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 8);

    const categoryTrends = categoryEntries.map(entry => ({
      categoryId: entry.id,
      categoryName: entry.category.name,
      categoryColor: entry.category.color,
      months: monthKeys.map((key, idx) => ({
        month: months[idx].month,
        year: months[idx].year,
        amount: entry.months.get(key) || 0,
      })),
    }));

    // ── Build top categories response ────────────────────────────────
    const topCategories = categoryEntries.map(entry => ({
      categoryId: entry.id,
      categoryName: entry.category.name,
      categoryColor: entry.category.color,
      totalSpent: entry.totalSpend,
      transactionCount: 0, // will be filled below
    }));

    // Count transactions per category (expenses only, using my-share amounts)
    const categoryCounts = new Map<string, number>();
    transactions?.forEach(t => {
      const txType = t.transaction_type || (t.amount > 0 ? 'expense' : 'income');
      if (txType !== 'expense') return;
      const category = t.category as unknown as CategoryData | null;
      if (category) {
        categoryCounts.set(category.id, (categoryCounts.get(category.id) || 0) + 1);
      }
    });
    for (const cat of topCategories) {
      cat.transactionCount = categoryCounts.get(cat.categoryId) || 0;
    }

    // ── Build top merchants response ───────────────────────────────────
    const topMerchants = Array.from(merchantMap.values())
      .filter(m => m.totalSpent > 0) // Exclude fully-returned merchants
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10)
      .map(m => ({
        ...m,
        avgTransaction: m.transactionCount > 0 ? m.totalSpent / m.transactionCount : 0,
      }));

    // ── Build daily spending response ──────────────────────────────────
    const dailySpendingArr = Array.from(dailySpending.entries())
      .sort(([a], [b]) => a - b)
      .map(([day, amount]) => ({ day, amount }));

    // ── Build spending velocity ────────────────────────────────────────
    const variableSpent = Math.max(0, currentMonthSpent - currentMonthRecurringSpent);
    const projectedVariable = today > 0 ? (variableSpent / today) * daysInMonth : 0;
    const projectedTotal = expectedFixedCosts + projectedVariable;
    const dailyAverage = today > 0 ? variableSpent / today : 0;

    const spendingVelocity = {
      daysElapsed: today,
      daysInMonth,
      spentSoFar: currentMonthSpent,
      projectedTotal,
      lastMonthTotal: prevMonthTotalSpent,
      dailyAverage,
      fixedCosts: expectedFixedCosts,
      recurringSpent: currentMonthRecurringSpent,
      variableSpent,
    };

    // ── Build month-over-month ─────────────────────────────────────────
    const currentMom = momTotals[currentMonthKey];
    const prevMom = momTotals[prevMonthKey];
    const spentChangePercent = prevMom.spent > 0
      ? ((currentMom.spent - prevMom.spent) / prevMom.spent) * 100
      : 0;
    const incomeChangePercent = prevMom.income > 0
      ? ((currentMom.income - prevMom.income) / prevMom.income) * 100
      : 0;

    const monthOverMonth = {
      currentMonth: {
        month: currentMonth,
        year: currentYear,
        spent: currentMom.spent,
        income: currentMom.income,
        net: currentMom.income - currentMom.spent,
      },
      previousMonth: {
        month: prevMonth.month,
        year: prevMonth.year,
        spent: prevMom.spent,
        income: prevMom.income,
        net: prevMom.income - prevMom.spent,
      },
      spentChangePercent,
      incomeChangePercent,
    };

    res.json({
      categoryTrends,
      topCategories,
      topMerchants,
      spendingVelocity,
      dailySpending: dailySpendingArr,
      monthOverMonth,
    });
  } catch (error) {
    console.error('Error fetching insights:', error);
    res.status(500).json({ message: 'Failed to fetch insights' });
  }
});

// Estimated monthly income — average of the last 3 complete months of income
router.get('/estimated-income', async (req, res) => {
  try {
    const now = new Date();
    // Go back 3 full months from the 1st of the current month
    const endDate = new Date(now.getFullYear(), now.getMonth(), 1); // 1st of current month
    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - 3); // 3 months back

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('amount, date, transaction_type')
      .eq('transaction_type', 'income')
      .gte('date', startDate.toISOString().split('T')[0])
      .lt('date', endDate.toISOString().split('T')[0]);

    if (error) throw error;

    // Bucket income by month
    const monthlyIncome = new Map<string, number>();
    for (const t of transactions || []) {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      monthlyIncome.set(key, (monthlyIncome.get(key) || 0) + Math.abs(t.amount));
    }

    const monthValues = Array.from(monthlyIncome.values());
    const monthsWithData = monthValues.length;
    const totalIncome = monthValues.reduce((s, v) => s + v, 0);
    const average = monthsWithData > 0 ? totalIncome / monthsWithData : 0;

    res.json({
      estimated_monthly_income: Math.round(average * 100) / 100,
      months_sampled: monthsWithData,
      monthly_breakdown: Object.fromEntries(monthlyIncome),
    });
  } catch (error) {
    console.error('Error estimating income:', error);
    res.status(500).json({ message: 'Failed to estimate income' });
  }
});

export default router;
