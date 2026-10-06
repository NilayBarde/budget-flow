import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  buildFixedCostSeries,
  computeSpendingVelocity,
  reconcileRecurringSeries,
  type UnmatchedExpense,
} from '../services/spending-velocity.js';
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
import { getMyShareAmount, computeCategorySpend, type SpendRow } from '../services/category-spend.js';
import { loadYearlyStats } from '../services/yearly-stats.js';
import { fetchAllRows } from '../utils/paginate.js';
import type { RecurringFrequency } from '../services/recurring-normalize.js';
import type { CategoryData } from '../types/stats.js';

const router = Router();

// Get monthly stats
router.get('/monthly', asyncHandler(async (req, res) => {
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
        pending,
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
    let pendingSpent = 0;

    transactions?.forEach(t => {
      const transactionType = t.transaction_type || (t.amount > 0 ? 'expense' : 'income');

      if (transactionType === 'transfer') return;

      if (transactionType === 'investment') {
        totalInvested += Math.abs(t.amount);
      } else if (transactionType === 'expense') {
        const amountToCount = getMyShareAmount(t);
        grossExpenses += amountToCount;
        if (t.pending) pendingSpent += amountToCount;
      } else if (transactionType === 'return') {
        totalReturns += getMyShareAmount(t);
      } else if (transactionType === 'income') {
        totalIncome += Math.abs(t.amount);
      }
    });

    // Per-category spend via the shared service so the Dashboard hero,
    // budget goals, and this endpoint can never disagree.
    const categoryById = new Map<string, CategoryData>();
    const spendRows: SpendRow[] = (transactions || []).map(t => {
      const category = t.category as unknown as CategoryData | null;
      if (category) categoryById.set(category.id, category);
      return {
        category_id: category?.id ?? null,
        amount: t.amount,
        transaction_type: t.transaction_type,
        is_split: t.is_split,
        splits: t.splits as SpendRow['splits'],
      };
    });
    const spentByCategory = computeCategorySpend(spendRows);

    const byCategory = Array.from(spentByCategory.entries())
      .filter(([, amount]) => amount > 0)
      .map(([id, amount]) => ({ category: categoryById.get(id)!, amount }))
      .sort((a, b) => b.amount - a.amount);

    // Total spent = gross expenses - returns (same formula as transactions page)
    const totalSpent = Math.max(0, grossExpenses - totalReturns);

    res.json({
      month: Number(month),
      year: Number(year),
      total_spent: totalSpent,
      total_income: totalIncome,
      total_invested: totalInvested,
      pending_spent: pendingSpent,
      by_category: byCategory,
    });
}));

// Get yearly stats
router.get('/yearly', asyncHandler(async (req, res) => {
    const { year } = req.query;

    if (!year) {
      return res.status(400).json({ message: 'Year is required' });
    }

    // Paged read: a year has more transactions than one Supabase request returns.
    res.json(await loadYearlyStats(Number(year)));
}));

// Get spending insights (trends, merchants, velocity, daily breakdown)
router.get('/insights', asyncHandler(async (req, res) => {
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

    // ── Query all active recurring charges (any frequency) ────────────
    // user_hidden mirrors the hide button: a hidden series must not count
    // toward the fixed-cost projection either.
    const { data: recurringCharges } = await supabase
      .from('recurring_transactions')
      .select('merchant_display_name, average_amount, frequency')
      .eq('is_active', true)
      .eq('user_hidden', false);

    const recurringMerchants = new Set(
      (recurringCharges || []).map(r => r.merchant_display_name)
    );

    // All 6 months of transactions. That is more rows than one Supabase request returns (1000), so
    // it is read in pages; a single request silently dropped the rest and skewed every number below.
    const transactions = await fetchAllRows(
      (from, to) =>
        supabase
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
          .lte('date', currentMonthEnd)
          .order('date')
          .order('id')
          .range(from, to),
    );

    // ── Category Trends (per-category, per-month) ──────────────────────
    const categoryMonthMap = new Map<string, CategoryMonthEntry>();

    // ── Top Merchants ──────────────────────────────────────────────────
    const merchantMap = new Map<string, MerchantAggregate>();
    // Calendar months (YYYY-MM) each merchant charged in, used to tell a
    // renamed recurring series apart from a similar looking separate bill.
    const chargeMonthsByMerchant = new Map<string, Set<string>>();

    // ── Daily variable spend (current month only) ──────────────────────
    // Only covers days elapsed so far (for velocity projection); trailing
    // zeros would dilute the rate. The DailySpending chart computes its own
    // series client-side from the shared month query.
    const dailyVariable = new Map<number, number>(); // day -> non-recurring amount
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
    const recurringPaidByMerchant = new Map<string, number>();
    // Current-month expenses not matched to a recurring series by name; a
    // second pass attributes renamed recurring payments (see below).
    const unmatchedExpenses: UnmatchedExpense[] = [];
    let prevMonthTotalSpent = 0;

    // ── Process all transactions ───────────────────────────────────────
    transactions?.forEach(t => {
      const transactionType = t.transaction_type || (t.amount > 0 ? 'expense' : 'income');
      if (transactionType === 'transfer') return;

      // Use string parsing for month/year to avoid timezone shifts
      const dateParts = t.date.split('-');
      const txMonth = parseInt(dateParts[1], 10);
      const txYear = parseInt(dateParts[0], 10);
      const monthKey = `${txYear}-${String(txMonth).padStart(2, '0')}`;

      if (transactionType === 'expense') {
        const amountToCount = getMyShareAmount(t);

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
          const months = chargeMonthsByMerchant.get(merchant) ?? new Set<string>();
          months.add(monthKey);
          chargeMonthsByMerchant.set(merchant, months);
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

        // Current-month velocity tracking
        if (txMonth === currentMonth && txYear === currentYear) {
          const day = parseInt(dateParts[2], 10);
          currentMonthSpent += amountToCount;

          // Track recurring vs variable for velocity
          const merchantName = t.merchant_display_name || t.merchant_name;
          const isRecurring = !!merchantName && recurringMerchants.has(merchantName);
          if (isRecurring) {
            recurringPaidByMerchant.set(
              merchantName,
              (recurringPaidByMerchant.get(merchantName) || 0) + amountToCount,
            );
          } else {
            dailyVariable.set(day, (dailyVariable.get(day) || 0) + amountToCount);
            if (amountToCount > 0) {
              unmatchedExpenses.push({ day, amount: amountToCount, merchantName: merchantName || '' });
            }
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
        const returnAmount = getMyShareAmount(t);

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

        // Current-month velocity tracking
        if (txMonth === currentMonth && txYear === currentYear) {
          const day = parseInt(dateParts[2], 10);
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

    // ── Build spending velocity ────────────────────────────────────────
    // Only recurring series whose merchant has actually charged recently
    // count as fixed costs; merchantMap already holds each merchant's most
    // recent expense date across the 6-month window.
    const lastExpenseDateByMerchant = new Map<string, string>(
      Array.from(merchantMap.values()).map(m => [m.merchantName, m.lastDate]),
    );
    const todayStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(today).padStart(2, '0')}`;
    const recurringChargeRows = (recurringCharges || []).map(r => ({
      merchantDisplayName: r.merchant_display_name,
      averageAmount: r.average_amount,
      frequency: r.frequency as RecurringFrequency,
    }));

    // A recurring bill that posted under a different merchant name than its
    // series (rent via a payment processor) was counted as variable spend
    // above. Move it to its series so it is neither extrapolated across the
    // month nor projected a second time as an unpaid fixed cost.
    const reconciled = reconcileRecurringSeries({
      charges: recurringChargeRows,
      paidThisMonthByMerchant: recurringPaidByMerchant,
      lastExpenseDateByMerchant,
      chargeMonthsByMerchant,
      unmatchedExpenses,
      dailyVariable,
      today: todayStr,
      daysInMonth,
    });
    const dailyVariableSpending = reconciled.dailyVariableSpending;

    const fixedCostSeries = buildFixedCostSeries(
      reconciled.charges,
      lastExpenseDateByMerchant,
      reconciled.paidThisMonthByMerchant,
      todayStr,
    );

    const spendingVelocity = computeSpendingVelocity({
      daysElapsed: today,
      daysInMonth,
      spentSoFar: currentMonthSpent,
      fixedCostSeries,
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
      monthOverMonth,
    });
}));

// Estimated monthly income, the average of the last 3 complete months of income
router.get('/estimated-income', asyncHandler(async (req, res) => {
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
}));

export default router;
