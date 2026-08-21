import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import { adjacentMonths, monthStaleTime } from '../utils/monthCache';

// Matches the global staleTime configured in App.tsx
const DEFAULT_STALE_TIME = 5 * 60 * 1000;

/**
 * Warms the cache for the months adjacent to the one being viewed, so
 * prev/next month navigation paints instantly. Prefetches the three
 * month-keyed queries the Dashboard and Transactions pages share:
 * monthly stats, the plain {month, year} transaction list, and budget goals.
 */
export const usePrefetchAdjacentMonths = (month?: number, year?: number) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!month || !year) return;

    for (const adj of adjacentMonths(month, year)) {
      const staleTime = monthStaleTime(adj.month, adj.year) ?? DEFAULT_STALE_TIME;

      queryClient.prefetchQuery({
        queryKey: ['stats', 'monthly', adj.month, adj.year],
        queryFn: () => api.getMonthlyStats(adj.month, adj.year),
        staleTime,
      });
      queryClient.prefetchQuery({
        queryKey: ['transactions', { month: adj.month, year: adj.year }],
        queryFn: () => api.getTransactions({ month: adj.month, year: adj.year }),
        staleTime,
      });
      queryClient.prefetchQuery({
        queryKey: ['budget-goals', adj.month, adj.year],
        queryFn: () => api.getBudgetGoals(adj.month, adj.year),
        staleTime: DEFAULT_STALE_TIME,
      });
    }
  }, [month, year, queryClient]);
};
