import { supabase } from '../db/supabase.js';
import { fetchAllRows } from '../utils/paginate.js';
import { getMyShareAmount } from './category-spend.js';
import type { CategoryData } from '../types/stats.js';

export interface YearlyRow {
  id: string;
  amount: number;
  date: string;
  transaction_type: string | null;
  is_split: boolean;
  category: CategoryData | null;
  splits: { amount: number; is_my_share: boolean }[] | null;
}

export interface MonthlyTotals {
  month: number;
  spent: number;
  income: number;
  invested: number;
}

export interface YearlyStats {
  year: number;
  monthly_totals: MonthlyTotals[];
  category_totals: { category: CategoryData; amount: number }[];
  total_spent: number;
  total_income: number;
  total_invested: number;
}

/**
 * Totals for a year from its transactions. Expenses and returns count only the user's share of a
 * split; transfers are ignored; returns are netted off their month and category after the expenses.
 */
export const buildYearlyStats = (year: number, transactions: YearlyRow[]): YearlyStats => {
  const monthlyTotals: MonthlyTotals[] = [];
  for (let i = 1; i <= 12; i++) {
    monthlyTotals.push({ month: i, spent: 0, income: 0, invested: 0 });
  }

  let grossExpenses = 0;
  let totalReturns = 0;
  let totalIncome = 0;
  let totalInvested = 0;
  const categoryTotals = new Map<string, { category: CategoryData; amount: number }>();
  const returns: { amount: number; month: number; category: CategoryData | null }[] = [];

  // Pass 1: accumulate expenses, income, investments
  for (const t of transactions) {
    // Use string splitting to avoid timezone issues with new Date(); t.date is YYYY-MM-DD
    const month = parseInt(t.date.split('-')[1], 10) - 1; // 0-indexed
    const transactionType = t.transaction_type || (t.amount > 0 ? 'expense' : 'income');

    if (transactionType === 'transfer') continue;

    if (transactionType === 'investment') {
      const amount = Math.abs(t.amount);
      totalInvested += amount;
      monthlyTotals[month].invested += amount;
    } else if (transactionType === 'expense') {
      const amountToCount = getMyShareAmount(t);
      grossExpenses += amountToCount;
      monthlyTotals[month].spent += amountToCount;

      if (t.category && amountToCount > 0) {
        const existing = categoryTotals.get(t.category.id);
        if (existing) {
          existing.amount += amountToCount;
        } else {
          categoryTotals.set(t.category.id, { category: t.category, amount: amountToCount });
        }
      }
    } else if (transactionType === 'return') {
      // Returns respect splits like everywhere else (only my share nets out)
      const returnAmount = getMyShareAmount(t);
      totalReturns += returnAmount;
      returns.push({ amount: returnAmount, month, category: t.category });
    } else if (transactionType === 'income') {
      const incomeAmount = Math.abs(t.amount);
      totalIncome += incomeAmount;
      monthlyTotals[month].income += incomeAmount;
    }
  }

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

  return {
    year,
    monthly_totals: monthlyTotals,
    category_totals: Array.from(categoryTotals.values()).sort((a, b) => b.amount - a.amount),
    // Total spent = gross expenses - returns (same formula as the transactions page)
    total_spent: Math.max(0, grossExpenses - totalReturns),
    total_income: totalIncome,
    total_invested: totalInvested,
  };
};

/**
 * Read a year of transactions and total them. A year has more than the 1000 rows Supabase returns
 * from one request, so it is read page by page; reading it in one request silently dropped the later
 * rows and made income and spending wrong.
 */
export const loadYearlyStats = async (year: number): Promise<YearlyStats> => {
  const transactions = await fetchAllRows<YearlyRow>(
    (from, to) =>
      supabase
        .from('transactions')
        .select(`
          id,
          amount,
          date,
          transaction_type,
          is_split,
          category:categories(id, name, color, icon),
          splits:transaction_splits(amount, is_my_share)
        `)
        .gte('date', `${year}-01-01`)
        .lte('date', `${year}-12-31`)
        // A stable order is what makes paging safe: without it rows can be skipped or repeated.
        .order('date')
        .order('id')
        .range(from, to) as unknown as PromiseLike<{ data: YearlyRow[] | null; error: unknown }>,
    // A sync between two pages can shift the offsets and repeat a row; counting it twice would double it.
    { keyOf: row => row.id },
  );

  return buildYearlyStats(year, transactions);
};
