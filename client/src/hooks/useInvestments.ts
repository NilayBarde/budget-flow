import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';

export const useInvestmentHoldings = () => {
  return useQuery({
    queryKey: ['investment-holdings'],
    queryFn: api.getInvestmentHoldings,
  });
};

export const useInvestmentSummary = () => {
  return useQuery({
    queryKey: ['investment-summary'],
    queryFn: api.getInvestmentSummary,
  });
};

export const useSyncInvestmentHoldings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accountId: string) => api.syncInvestmentHoldings(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investment-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['investment-summary'] });
    },
  });
};

export const useSyncAllInvestmentHoldings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.syncAllInvestmentHoldings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investment-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['investment-summary'] });
    },
  });
};

export const useToggleAccountInvestmentExclusion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ accountId, excludeFromInvestments, exclusionNote }: { 
      accountId: string; 
      excludeFromInvestments: boolean; 
      exclusionNote?: string;
    }) => api.toggleAccountInvestmentExclusion(accountId, excludeFromInvestments, exclusionNote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investment-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['investment-summary'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
};
