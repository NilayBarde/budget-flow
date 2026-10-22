import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';

export const usePendingVenmoSettlements = () =>
  useQuery({
    queryKey: ['venmo-settlements', 'pending'],
    queryFn: api.getPendingVenmoSettlements,
  });

// Linking and unlinking change the Venmo transaction's type (transfer vs. income/return), so every
// total that counts by type goes stale too, not just the settlement list.
export const useLinkVenmoSettlement = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ venmoTransactionId, splitIds }: { venmoTransactionId: string; splitIds: string[] }) =>
      api.linkVenmoSettlement(venmoTransactionId, splitIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venmo-settlements'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      queryClient.invalidateQueries({ queryKey: ['budget-goals'] });
    },
  });
};

export const useUnlinkVenmoSettlement = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (venmoTransactionId: string) => api.unlinkVenmoSettlement(venmoTransactionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venmo-settlements'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      queryClient.invalidateQueries({ queryKey: ['budget-goals'] });
    },
  });
};
