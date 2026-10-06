import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';

export const useRecurringTransactions = () => {
  return useQuery({
    queryKey: ['recurring-transactions'],
    queryFn: api.getRecurringTransactions,
  });
};

export const useRecurringOverview = () => {
  return useQuery({
    queryKey: ['recurring-overview'],
    queryFn: api.getRecurringOverview,
  });
};

export const useDeleteRecurringTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteRecurringTransaction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['recurring-overview'] });
      // Recurring rows feed the fixed-cost / Spending Pace computation
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      // Deleting clears the Recurring badge on the series' transactions
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
};
