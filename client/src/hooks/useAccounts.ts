import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';

export const useAccounts = () => {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: api.getAccounts,
  });
};

export const useCreatePlaidLinkToken = () => {
  return useMutation({
    mutationFn: api.createPlaidLinkToken,
  });
};

export const useExchangePlaidToken = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ publicToken, metadata }: { publicToken: string; metadata: unknown }) =>
      api.exchangePlaidToken(publicToken, metadata),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
};

export const useSyncAccount = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (accountId: string) => api.syncAccount(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};

export const useDeleteAccount = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (accountId: string) => api.deleteAccount(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
};

