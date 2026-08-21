import type { MonthYear } from '../hooks/useMonthNavigation';

// Plaid can still settle pending transactions for a few days after a month
// ends, so a month only counts as immutable once it has been closed this long.
const IMMUTABLE_AFTER_DAYS = 7;

/**
 * staleTime for a month-scoped query. Months that closed more than
 * IMMUTABLE_AFTER_DAYS ago never change on their own, so they can be cached
 * for the whole session (Infinity). Mutations still invalidate these queries,
 * so user edits to old transactions show up immediately.
 *
 * Returns undefined for the current/recent months (and when month/year are
 * missing), which falls back to the global staleTime default.
 */
export const monthStaleTime = (month?: number, year?: number): number | undefined => {
  if (!month || !year) return undefined;
  const monthEnd = new Date(year, month, 0); // last day of the given month
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - IMMUTABLE_AFTER_DAYS);
  return monthEnd < cutoff ? Infinity : undefined;
};

/** The months immediately before and after the given one. */
export const adjacentMonths = (month: number, year: number): MonthYear[] => {
  const prev: MonthYear = month === 1
    ? { month: 12, year: year - 1 }
    : { month: month - 1, year };
  const next: MonthYear = month === 12
    ? { month: 1, year: year + 1 }
    : { month: month + 1, year };
  return [prev, next];
};
