import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { computeSpendingVelocity } from '../services/spending-velocity.js';
import {
  rankTopCategories,
  buildCategoryTrends,
  buildTopCategories,
  type CategoryMonthEntry,
} from '../services/category-trends.js';
import {
  buildTopMerchants,
  type MerchantAggregate,
} from '../services/merchant-stats.js';
import { percentChange } from '../services/mom-totals.js';
import type { CategoryData } from '../types/stats.js';

const router = Router();

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

    let grossExpenses = 0;
    let totalReturns = 0;
    let totalIncome = 0;
    let totalInvested = 0;
    const categoryTotals = new Map<string, { category: CategoryData; amount: number }>();

    // Two-pass approach: accumulate expenses first, then subtract returns
    // This avoids order-dependent bugs where returns processed before expenses get swallowed
    const returns: Array<{ amount: number; category: CategoryData | null }> = [];

    // Pass 1: accumulate expenses, income, investments
    transactions?.forEach(t => {
      const transactionType = t.transaction_type || (t.amount > 0 ? 'expense' : 'income');

      if (transactionType === 'transfer') return;

      if (transactionType === 'investment') {
        totalInvested += Math.abs(t.amount);
      } else if (transactionType === 'expense') {
        const amountToCount = getExpenseAmount(t);
        grossExpenses += amountToCount;

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
        const returnAmount = Math.abs(t.amount);
        totalReturns += returnAmount;
        returns.push({ amount: returnAmount, category: t.category as unknown as CategoryData | null });
      } else if (transactionType === 'income') {
        totalIncome += Math.abs(t.amount);
      }
    });

    // Pass 2: subtract returns from their respective categories (now fully accumulated)
    for (const ret of returns) {
      if (ret.category) {
        const existing = categoryTotals.get(ret.category.id);
        if (existing) {
          existing.amount = Math.max(0, existing.amount - ret.amount);
        }
      }
    }

    // Total spent = gross expenses - returns (same formula as transactions page)
    const totalSpent = Math.max(0, grossExpenses - totalReturns);

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

    let grossExpenses = 0;
    let totalReturns = 0;
    let totalIncome = 0;
    let totalInvested = 0;
    const categoryTotals = new Map<string, { category: CategoryData; amount: number }>();

    // Two-pass approach: accumulate expenses first, then subtract returns
    const returns: Array<{ amount: number; month: number; category: CategoryData | null }> = [];

    // Pass 1: accumulate expenses, income, investments
    transactions?.forEach(t => {
      // Use string splitting to avoid timezone issues with new Date()
      // t.date is YYYY-MM-DD
      const month = parseInt(t.date.split('-')[1], 10) - 1; // 0-indexed
      const transactionType = t.transaction_type || (t.amount > 0 ? 'expense' : 'income');

      if (transactionType === 'transfer') return;

      if (transactionType === 'investment') {
        const amount = Math.abs(t.amount);
        totalInvested += amount;
        monthlyTotals[month].invested += amount;
      } else if (transactionType === 'expense') {
        const amountToCount = getExpenseAmount(t);
        grossExpenses += amountToCount;
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
        const returnAmount = Math.abs(t.amount);
        totalReturns += returnAmount;
        returns.push({ amount: returnAmount, month, category: t.category as unknown as CategoryData | null });
      } else if (transactionType === 'income') {
        const incomeAmount = Math.abs(t.amount);
        totalIncome += incomeAmount;
        monthlyTotals[month].income += incomeAmount;
      }
    });

    // Pass 2: subtract returns from their respective categories and monthly totals
    for (const ret of returns) {
      if (ret.category) {
        const existing = categoryTotals.get(ret.category.id);
        if (existing) {
          existing.amount = Math.max(0, existing.amount - ret.amount);
        }
      }
      monthlyTotals[ret.month].spent = Math.max(0, monthlyTotals[ret.month].spent - ret.amount);
    }

    // Total spent = gross expenses - returns (same formula as transactions page)
    const totalSpent = Math.max(0, grossExpenses - totalReturns);

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
    const categoryMonthMap = new Map<string, CategoryMonthEntry>();

    // ── Top Merchants ──────────────────────────────────────────────────
    const merchantMap = new Map<string, MerchantAggregate>();

    // ── Daily Spending (current month only) ────────────────────────────
    // dailySpending covers the full month (for the chart). dailyVariable
    // only covers days elapsed so far (for velocity projection); trailing
    // zeros would dilute the rate.
    const dailySpending = new Map<number, number>(); // day -> amount
    const dailyVariable = new Map<number, number>(); // day -> non-recurring amount
    for (let d = 1; d <= daysInMonth; d++) {
      dailySpending.set(d, 0);
    }
    for (let d = 1; d <= today; d++) {
      dailyVariable.set(d, 0);
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
      // Use string parsing for month/year to avoid timezone shifts
      const dateParts = t.date.split('-');
      const txMonth = parseInt(dateParts[1], 10);
      const txYear = parseInt(dateParts[0], 10);
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
          const isRecurring = !!merchantName && recurringMerchants.has(merchantName);
          if (isRecurring) {
            currentMonthRecurringSpent += amountToCount;
          } else {
            dailyVariable.set(day, (dailyVariable.get(day) || 0) + amountToCount);
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
          dailyVariable.set(day, Math.max(0, (dailyVariable.get(day) || 0) - returnAmount));
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

    // ── Build category responses (trends + top categories) ────────────
    const rankedCategories = rankTopCategories(categoryMonthMap);
    const categoryTrends = buildCategoryTrends(rankedCategories, months);

    // Per-category transaction counts (expenses only — splits already
    // accounted for in totals, but counts are at the transaction level).
    const categoryCounts = new Map<string, number>();
    transactions?.forEach(t => {
      const txType = t.transaction_type || (t.amount > 0 ? 'expense' : 'income');
      if (txType !== 'expense') return;
      const category = t.category as unknown as CategoryData | null;
      if (category) {
        categoryCounts.set(category.id, (categoryCounts.get(category.id) || 0) + 1);
      }
    });
    const topCategories = buildTopCategories(rankedCategories, categoryCounts);

    // ── Build top merchants response ───────────────────────────────────
    const topMerchants = buildTopMerchants(merchantMap);

    // ── Build daily spending response ──────────────────────────────────
    const dailySpendingArr = Array.from(dailySpending.entries())
      .sort(([a], [b]) => a - b)
      .map(([day, amount]) => ({ day, amount }));

    // ── Build spending velocity ────────────────────────────────────────
    const dailyVariableSpending: number[] = [];
    for (let d = 1; d <= today; d++) {
      dailyVariableSpending.push(dailyVariable.get(d) || 0);
    }

    const spendingVelocity = computeSpendingVelocity({
      daysElapsed: today,
      daysInMonth,
      spentSoFar: currentMonthSpent,
      recurringSpent: currentMonthRecurringSpent,
      expectedFixedCosts,
      lastMonthTotal: prevMonthTotalSpent,
      dailyVariableSpending,
    });

    // ── Build month-over-month ─────────────────────────────────────────
    const currentMom = momTotals[currentMonthKey];
    const prevMom = momTotals[prevMonthKey];
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
      spentChangePercent: percentChange(currentMom.spent, prevMom.spent),
      incomeChangePercent: percentChange(currentMom.income, prevMom.income),
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
