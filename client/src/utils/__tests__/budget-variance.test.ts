import { describe, it, expect } from 'vitest';
import { buildBudgetStatus, computeBudgetVariance } from '../budget-variance';
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

describe('buildBudgetStatus', () => {
  const byCategory = (entries: [string, number][]) =>
    entries.map(([id, amount]) => ({ category: category(id, id), amount, count: 1 })) as never;

  it('lists categories past 70% of their limit, fullest first, and leaves the rest out', () => {
    const status = buildBudgetStatus(
      [goal('c1', 'Dining', 100, 71), goal('c2', 'Travel', 100, 150), goal('c3', 'Groceries', 100, 70), goal('c4', 'Gym', 100, 10)],
      byCategory([]),
      301,
    );

    expect(status.rows.map(r => r.categoryName)).toEqual(['Travel', 'Dining']);
    expect(status.rows[0]).toMatchObject({ isOver: true, overage: 50, ratio: 1.5 });
    expect(status.rows[1]).toMatchObject({ isOver: false, overage: 0 });
  });

  it('keeps five rows and says how many more there are', () => {
    const goals = Array.from({ length: 7 }, (_, i) => goal(`c${i}`, `Cat ${i}`, 100, 80 + i));
    const status = buildBudgetStatus(goals, byCategory([]), 600);

    expect(status.rows).toHaveLength(5);
    expect(status.hiddenCount).toBe(2);
    expect(status.rows[0].categoryName).toBe('Cat 6');
  });

  it('has nothing to show when every category is comfortably inside its limit', () => {
    const status = buildBudgetStatus([goal('c1', 'Dining', 100, 20)], byCategory([]), 20);

    expect(status.hasContent).toBe(false);
  });

  it('flags total spending past the overall budget even when no single category is over', () => {
    // Two categories each at 60% of their limit are not listed, yet total spend can exceed the sum of limits
    // when spending outside budgeted categories pushes the total up.
    const status = buildBudgetStatus(
      [goal('c1', 'Dining', 100, 60), goal('c2', 'Gym', 100, 60)],
      byCategory([['other', 150]]),
      270,
    );

    expect(status.rows).toEqual([]);
    expect(status.overallOver).toBe(true);
    expect(status.hasContent).toBe(true);
    expect(status.unbudgetedSpend).toBe(150);
  });

  it('shows nothing when there are no budget goals at all', () => {
    const status = buildBudgetStatus([], byCategory([['c1', 500]]), 500);

    expect(status.hasContent).toBe(false);
    expect(status.overallOver).toBe(false);
  });

  it('treats spending against a zero limit as over, and an untouched zero limit as fine', () => {
    const status = buildBudgetStatus([goal('c1', 'Dining', 0, 25), goal('c2', 'Gym', 0, 0)], byCategory([]), 25);

    expect(status.rows.map(r => r.categoryName)).toEqual(['Dining']);
    expect(status.rows[0].isOver).toBe(true);
    expect(Number.isFinite(status.rows[0].overage)).toBe(true);
  });
});
