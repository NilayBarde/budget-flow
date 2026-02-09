import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import type { SavingsGoal } from '../types';

const QUERY_KEY = 'savings-goals';

export const useSavingsGoals = () => {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: api.getSavingsGoals,
  });
};

export const useCreateSavingsGoal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Omit<SavingsGoal, 'id' | 'created_at' | 'updated_at'>) =>
      api.createSavingsGoal(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
};

export const useUpdateSavingsGoal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SavingsGoal> }) =>
      api.updateSavingsGoal(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
};

export const useDeleteSavingsGoal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteSavingsGoal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
};
