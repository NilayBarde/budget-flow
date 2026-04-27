import type { CategoryData } from '../types/stats.js';

export interface CategoryMonthEntry {
  category: CategoryData;
  months: Map<string, number>;
}

export interface CategoryTrendMonth {
  month: number;
  year: number;
  amount: number;
}

export interface CategoryTrend {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  months: CategoryTrendMonth[];
}

export interface TopCategory {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  totalSpent: number;
  transactionCount: number;
}

const TOP_CATEGORY_LIMIT = 8;

interface RankedCategory {
  id: string;
  category: CategoryData;
  months: Map<string, number>;
  totalSpend: number;
}

/**
 * Rank categories by total spend across all tracked months and keep the top N.
 * Shared between {@link buildCategoryTrends} and {@link buildTopCategories} so
 * both response shapes are guaranteed to be consistent.
 */
export const rankTopCategories = (
  categoryMonthMap: Map<string, CategoryMonthEntry>,
): RankedCategory[] => {
  return Array.from(categoryMonthMap.entries())
    .map(([id, entry]) => {
      const totalSpend = Array.from(entry.months.values()).reduce((a, b) => a + b, 0);
      return { id, category: entry.category, months: entry.months, totalSpend };
    })
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, TOP_CATEGORY_LIMIT);
};

export const buildCategoryTrends = (
  ranked: RankedCategory[],
  months: { month: number; year: number }[],
): CategoryTrend[] => {
  const monthKeys = months.map(m => `${m.year}-${String(m.month).padStart(2, '0')}`);

  return ranked.map(entry => ({
    categoryId: entry.id,
    categoryName: entry.category.name,
    categoryColor: entry.category.color,
    months: monthKeys.map((key, idx) => ({
      month: months[idx].month,
      year: months[idx].year,
      amount: entry.months.get(key) || 0,
    })),
  }));
};

export const buildTopCategories = (
  ranked: RankedCategory[],
  categoryCounts: Map<string, number>,
): TopCategory[] => {
  return ranked.map(entry => ({
    categoryId: entry.id,
    categoryName: entry.category.name,
    categoryColor: entry.category.color,
    totalSpent: entry.totalSpend,
    transactionCount: categoryCounts.get(entry.id) || 0,
  }));
};
