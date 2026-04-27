import { describe, it, expect } from 'vitest';
import {
  rankTopCategories,
  buildCategoryTrends,
  buildTopCategories,
  type CategoryMonthEntry,
} from '../category-trends.js';
import type { CategoryData } from '../../types/stats.js';

const cat = (id: string, name = id): CategoryData => ({
  id,
  name,
  color: '#000',
  icon: 'circle',
});

const entry = (
  category: CategoryData,
  monthAmounts: Record<string, number>,
): CategoryMonthEntry => ({
  category,
  months: new Map(Object.entries(monthAmounts)),
});

describe('rankTopCategories', () => {
  it('ranks by total spend across all months, descending', () => {
    const map = new Map<string, CategoryMonthEntry>([
      ['a', entry(cat('a'), { '2026-01': 100, '2026-02': 50 })], // 150
      ['b', entry(cat('b'), { '2026-01': 200 })],                 // 200
      ['c', entry(cat('c'), { '2026-02': 25 })],                  //  25
    ]);

    const ranked = rankTopCategories(map);

    expect(ranked.map(r => r.id)).toEqual(['b', 'a', 'c']);
    expect(ranked[0].totalSpend).toBe(200);
    expect(ranked[1].totalSpend).toBe(150);
  });

  it('caps results at 8 categories', () => {
    const map = new Map<string, CategoryMonthEntry>();
    for (let i = 0; i < 12; i++) {
      map.set(`c${i}`, entry(cat(`c${i}`), { '2026-01': 100 - i }));
    }

    const ranked = rankTopCategories(map);

    expect(ranked).toHaveLength(8);
    expect(ranked[0].id).toBe('c0'); // highest
  });

  it('returns empty array for empty map', () => {
    expect(rankTopCategories(new Map())).toEqual([]);
  });
});

describe('buildCategoryTrends', () => {
  const months = [
    { month: 1, year: 2026 },
    { month: 2, year: 2026 },
    { month: 3, year: 2026 },
  ];

  it('aligns each category to the requested month sequence', () => {
    const ranked = rankTopCategories(
      new Map([['a', entry(cat('a', 'Food'), { '2026-01': 100, '2026-03': 50 })]]),
    );

    const trends = buildCategoryTrends(ranked, months);

    expect(trends).toHaveLength(1);
    expect(trends[0]).toEqual({
      categoryId: 'a',
      categoryName: 'Food',
      categoryColor: '#000',
      months: [
        { month: 1, year: 2026, amount: 100 },
        { month: 2, year: 2026, amount: 0 },
        { month: 3, year: 2026, amount: 50 },
      ],
    });
  });

  it('returns 0 for months a category has no data in', () => {
    const ranked = rankTopCategories(
      new Map([['a', entry(cat('a'), { '2026-02': 75 })]]),
    );

    const trends = buildCategoryTrends(ranked, months);

    expect(trends[0].months.map(m => m.amount)).toEqual([0, 75, 0]);
  });
});

describe('buildTopCategories', () => {
  it('attaches transaction counts from the provided map', () => {
    const ranked = rankTopCategories(
      new Map([
        ['a', entry(cat('a', 'Food'), { '2026-01': 100 })],
        ['b', entry(cat('b', 'Gas'), { '2026-01': 200 })],
      ]),
    );
    const counts = new Map([['a', 5], ['b', 12]]);

    const top = buildTopCategories(ranked, counts);

    expect(top).toEqual([
      {
        categoryId: 'b',
        categoryName: 'Gas',
        categoryColor: '#000',
        totalSpent: 200,
        transactionCount: 12,
      },
      {
        categoryId: 'a',
        categoryName: 'Food',
        categoryColor: '#000',
        totalSpent: 100,
        transactionCount: 5,
      },
    ]);
  });

  it('defaults transactionCount to 0 when missing from the count map', () => {
    const ranked = rankTopCategories(
      new Map([['a', entry(cat('a'), { '2026-01': 100 })]]),
    );

    const top = buildTopCategories(ranked, new Map());

    expect(top[0].transactionCount).toBe(0);
  });
});
