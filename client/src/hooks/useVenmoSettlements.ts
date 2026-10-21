import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';

export const usePendingVenmoSettlements = () =>
  useQuery({
    queryKey: ['venmo-settlements', 'pending'],
    queryFn: api.getPendingVenmoSettlements,
  });

export const useLinkVenmoSettlement = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ venmoTransactionId, splitIds }: { venmoTransactionId: string; splitIds: string[] }) =>
      api.linkVenmoSettlement(venmoTransactionId, splitIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venmo-settlements'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
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
    },
  });
};
