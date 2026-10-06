import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import * as api from '../services/api';
import { monthStaleTime } from '../utils/monthCache';
import type { TransactionFilters, Transaction, TransactionSplit } from '../types';

export const useTransactions = (filters: TransactionFilters = {}) => {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => api.getTransactions(filters),
    // Keep the previous list on screen while a new month/filter loads
    placeholderData: keepPreviousData,
    staleTime: monthStaleTime(filters.month, filters.year),
  });
};

export const useSimilarTransactionsCount = (merchantName: string | undefined, excludeId?: string) => {
  return useQuery({
    queryKey: ['similarTransactionsCount', merchantName, excludeId],
    queryFn: () => api.getSimilarTransactionsCount(merchantName!, excludeId),
    enabled: !!merchantName,
  });
};

export const useSimilarTransactions = (merchantName: string | undefined, excludeId?: string, enabled = false) => {
  return useQuery({
    queryKey: ['similarTransactions', merchantName, excludeId],
    queryFn: () => api.getSimilarTransactions(merchantName!, excludeId),
    enabled: !!merchantName && enabled,
  });
};

export const useUpdateTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data, applyToAll = false }: { id: string; data: Partial<Transaction>; applyToAll?: boolean }) =>
      api.updateTransaction(id, data, applyToAll),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['recurring-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['recurring-overview'] });
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      queryClient.invalidateQueries({ queryKey: ['budget-goals'] });
    },
  });
};

export const useDeleteTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteTransaction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      queryClient.invalidateQueries({ queryKey: ['budget-goals'] });
    },
  });
};

export const useCreateSplit = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      transactionId,
      splits
    }: {
      transactionId: string;
      splits: Omit<TransactionSplit, 'id' | 'parent_transaction_id' | 'created_at'>[]
    }) => api.createSplit(transactionId, splits),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      queryClient.invalidateQueries({ queryKey: ['budget-goals'] });
    },
  });
};

export const useDeleteSplits = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (transactionId: string) => api.deleteSplits(transactionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      queryClient.invalidateQueries({ queryKey: ['budget-goals'] });
    },
  });
};

export const useDuplicates = (enabled = true) => {
  return useQuery({
    queryKey: ['duplicates'],
    queryFn: () => api.getDuplicates(),
    enabled,
  });
};

export const useBulkDeleteTransactions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (transactionIds: string[]) => api.bulkDeleteTransactions(transactionIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['duplicates'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['insights'] });
    },
  });
};
