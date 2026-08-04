import { describe, it, expect } from 'vitest';
import { computeBudgetVariance } from '../budget-variance';
import type { BudgetGoal, Category } from '../../types';

const category = (id: string, name: string): Category => ({
  id, name, icon: 'tag', color: '#fff', is_default: false,
});

const goal = (categoryId: string, name: string, limit: number, spent: number): BudgetGoal => ({
  id: `goal-${categoryId}`,
  category_id: categoryId,
  month: 7,
  year: 2026,
  limit_amount: limit,
  created_at: '',
  category: category(categoryId, name),
  spent,
});

describe('computeBudgetVariance', () => {
  it('ranks overspent categories by overage descending', () => {
    const result = computeBudgetVariance(
      [
        goal('c1', 'Dining', 450, 580),
        goal('c2', 'Groceries', 400, 390),
        goal('c3', 'Travel', 100, 400),
      ],
      []
    );
    expect(result.overspentCategories.map(c => c.categoryName)).toEqual(['Travel', 'Dining']);
    expect(result.overspentCategories[0].overage).toBe(300);
    expect(result.totalOverage).toBe(430);
    expect(result.totalBudgeted).toBe(950);
  });

  it('sums spending in categories that have no goal', () => {
    const result = computeBudgetVariance(
      [goal('c1', 'Dining', 450, 100)],
      [
        { category: category('c1', 'Dining'), amount: 100 },
        { category: category('c9', 'Pets'), amount: 75 },
        { category: category('c8', 'Gifts'), amount: 25 },
      ]
    );
    expect(result.unbudgetedSpend).toBe(100);
    expect(result.overspentCategories).toEqual([]);
  });

  it('handles no goals at all', () => {
    const result = computeBudgetVariance([], [{ category: category('c9', 'Pets'), amount: 75 }]);
    expect(result.overspentCategories).toEqual([]);
    expect(result.unbudgetedSpend).toBe(75);
    expect(result.totalBudgeted).toBe(0);
  });

  it('treats missing spent as zero', () => {
    const g = goal('c1', 'Dining', 450, 0);
    delete (g as { spent?: number }).spent;
    const result = computeBudgetVariance([g], []);
    expect(result.overspentCategories).toEqual([]);
  });
});
