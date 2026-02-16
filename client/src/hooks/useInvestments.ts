import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';

// Only keeping InvestmentSummary and the exclusion toggle
export const useInvestmentSummary = () => {
  return useQuery({
    queryKey: ['investment-summary'],
    queryFn: api.getInvestmentSummary,
  });
};

export const useToggleAccountInvestmentExclusion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      accountId,
      excludeFromInvestments,
      exclusionNote
    }: {
      accountId: string;
      excludeFromInvestments: boolean;
      exclusionNote?: string;
    }) => api.toggleAccountInvestmentExclusion(accountId, excludeFromInvestments, exclusionNote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investment-summary'] });
      queryClient.invalidateQueries({ queryKey: ['financial-health'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
};
