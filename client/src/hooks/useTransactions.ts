import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import type { TransactionFilters, Transaction, TransactionSplit } from '../types';

export const useTransactions = (filters: TransactionFilters = {}) => {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => api.getTransactions(filters),
  });
};

export const useTransaction = (id: string) => {
  return useQuery({
    queryKey: ['transaction', id],
    queryFn: () => api.getTransaction(id),
    enabled: !!id,
  });
};

export const useSimilarTransactionsCount = (merchantName: string | undefined, excludeId?: string) => {
  return useQuery({
    queryKey: ['similarTransactionsCount', merchantName, excludeId],
    queryFn: () => api.getSimilarTransactionsCount(merchantName!, excludeId),
    enabled: !!merchantName,
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
      queryClient.invalidateQueries({ queryKey: ['insights'] });
    },
  });
};

export const useCreateManualTransaction = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: Partial<Transaction>) => api.createManualTransaction(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
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
    },
  });
};

export const useDeleteSplits = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (transactionId: string) => api.deleteSplits(transactionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
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
