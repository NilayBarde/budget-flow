import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';

export const useMerchantRules = () => {
  return useQuery({
    queryKey: ['merchant-rules'],
    queryFn: api.getMerchantRules,
  });
};

// Deleting a rule changes how future transactions from that merchant are handled; transactions already
// saved keep what they have, so only the list of rules needs refreshing.
export const useDeleteMerchantRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteMerchantRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-rules'] });
    },
  });
};
