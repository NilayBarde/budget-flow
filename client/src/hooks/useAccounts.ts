import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import type { CreateManualAccountData, UpdateAccountData } from '../services/api';

export const useAccounts = () => {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: api.getAccounts,
  });
};

export const useCreateManualAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateManualAccountData) => api.createManualAccount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
};

export const useCreatePlaidLinkToken = () => {
  return useMutation({
    mutationFn: (redirectUri?: string) => api.createPlaidLinkToken(redirectUri),
  });
};

export const useCreatePlaidUpdateLinkToken = () => {
  return useMutation({
    mutationFn: ({ accountId, redirectUri }: { accountId: string; redirectUri?: string }) => 
      api.createPlaidUpdateLinkToken(accountId, redirectUri),
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
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
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

// CSV Import hooks
export const usePreviewCsvImport = () => {
  return useMutation({
    mutationFn: ({ accountId, file }: { accountId: string; file: File }) =>
      api.previewCsvImport(accountId, file),
  });
};

export const useImportCsv = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ 
      accountId, 
      file, 
      skipDuplicates = true 
    }: { 
      accountId: string; 
      file: File; 
      skipDuplicates?: boolean;
    }) => api.importCsv(accountId, file, skipDuplicates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['csv-imports', variables.accountId] });
    },
  });
};

export const useCsvImports = (accountId: string) => {
  return useQuery({
    queryKey: ['csv-imports', accountId],
    queryFn: () => api.getCsvImports(accountId),
    enabled: !!accountId,
  });
};

export const useDeleteCsvImport = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (importId: string) => api.deleteCsvImport(importId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['csv-imports'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};

export const useBackfillCsvReferences = () => {
  return useMutation({
    mutationFn: ({ accountId, file }: { accountId: string; file: File }) =>
      api.backfillCsvReferences(accountId, file),
  });
};

// Balance alert hooks
export const useUpdateAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ accountId, data }: { accountId: string; data: UpdateAccountData }) =>
      api.updateAccount(accountId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
};

export const useRefreshBalance = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accountId: string) => api.refreshBalance(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
};

export const useRefreshAccounts = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accountId: string) => api.refreshAccounts(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
};
