import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import type { RecurringTransaction } from '../types';

export const useRecurringTransactions = () => {
  return useQuery({
    queryKey: ['recurring-transactions'],
    queryFn: api.getRecurringTransactions,
  });
};

export const useDetectRecurringTransactions = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: api.detectRecurringTransactions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
};

export const useUpdateRecurringTransaction = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<RecurringTransaction> }) =>
      api.updateRecurringTransaction(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-transactions'] });
    },
  });
};

