import type { BudgetGoal, MonthlyStats } from '../types';

export interface CategoryVariance {
  categoryId: string;
  categoryName: string;
  spent: number;
  limit: number;
  overage: number;
}

export interface BudgetVarianceResult {
  overspentCategories: CategoryVariance[];
  unbudgetedSpend: number;
  totalBudgeted: number;
  totalOverage: number;
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
