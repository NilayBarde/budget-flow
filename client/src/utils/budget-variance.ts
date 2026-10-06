import type { BudgetGoal, MonthlyStats } from '../types';

export interface CategoryVariance {
  categoryId: string;
  categoryName: string;
  spent: number;
  limit: number;
  overage: number;
}

export interface BudgetStatusRow {
  categoryId: string;
  categoryName: string;
  spent: number;
  limit: number;
  /** Spent as a share of the limit; Infinity when money went to a category with a zero limit. */
  ratio: number;
  isOver: boolean;
  /** How far past the limit, or 0 when still inside it. */
  overage: number;
}

export interface BudgetStatus {
  rows: BudgetStatusRow[];
  /** Qualifying rows beyond the cap. */
  hiddenCount: number;
  unbudgetedSpend: number;
  /** Total spending is past the overall budget, even if no single category is. */
  overallOver: boolean;
  hasContent: boolean;
}

export interface BudgetVarianceResult {
  overspentCategories: CategoryVariance[];
  unbudgetedSpend: number;
  totalBudgeted: number;
  totalOverage: number;
}

// Categories shown once they pass this share of their limit.
export const BUDGET_WATCH_THRESHOLD = 0.7;
export const BUDGET_STATUS_MAX_ROWS = 5;

// What the dashboard's budget card shows: every category close to or past its limit, fullest
// first, plus spending outside any budget. One card answers both "what is about to put me over?"
// and "what already did?". What is over comes first, biggest dollar overage first, since that is
// what put the month over; then what is close, fullest first. `budgetTarget` is the overall
// monthly budget (the user's own figure when set, see resolveBudgetTarget) and defaults to the sum
// of the category limits.
export function buildBudgetStatus(
  goals: BudgetGoal[],
  byCategory: MonthlyStats['by_category'],
  totalSpent: number,
  budgetTarget?: number,
): BudgetStatus {
  const { unbudgetedSpend, totalBudgeted } = computeBudgetVariance(goals, byCategory);

  const qualifying = goals
    .map(g => {
      const spent = g.spent || 0;
      const limit = g.limit_amount;
      const ratio = limit > 0 ? spent / limit : spent > 0 ? Infinity : 0;
      return {
        categoryId: g.category_id,
        categoryName: g.category?.name || 'Unknown',
        spent,
        limit,
        ratio,
        isOver: spent > limit,
        overage: Math.max(0, spent - limit),
      };
    })
    .filter(row => row.ratio > BUDGET_WATCH_THRESHOLD)
    .sort((a, b) => Number(b.isOver) - Number(a.isOver) || (a.isOver ? b.overage - a.overage : b.ratio - a.ratio));

  const rows = qualifying.slice(0, BUDGET_STATUS_MAX_ROWS);
  const overallOver = goals.length > 0 && totalSpent > (budgetTarget ?? totalBudgeted);

  return {
    rows,
    hiddenCount: qualifying.length - rows.length,
    unbudgetedSpend,
    overallOver,
    hasContent: rows.length > 0 || overallOver,
  };
}

// Answers "what put me over this month?": categories past their limit
// ranked by overage, plus spending in categories with no budget at all
// (invisible on the Plan page but still counted in the hero total).
export function computeBudgetVariance(
  goals: BudgetGoal[],
  byCategory: MonthlyStats['by_category'],
): BudgetVarianceResult {
  const overspentCategories = goals
    .filter(g => (g.spent || 0) > g.limit_amount)
    .map(g => ({
      categoryId: g.category_id,
      categoryName: g.category?.name || 'Unknown',
      spent: g.spent || 0,
      limit: g.limit_amount,
      overage: (g.spent || 0) - g.limit_amount,
    }))
    .sort((a, b) => b.overage - a.overage);

  const budgetedIds = new Set(goals.map(g => g.category_id));
  const unbudgetedSpend = byCategory
    .filter(c => !budgetedIds.has(c.category.id))
    .reduce((sum, c) => sum + c.amount, 0);

  return {
    overspentCategories,
    unbudgetedSpend,
    totalBudgeted: goals.reduce((sum, g) => sum + g.limit_amount, 0),
    totalOverage: overspentCategories.reduce((sum, c) => sum + c.overage, 0),
  };
}
