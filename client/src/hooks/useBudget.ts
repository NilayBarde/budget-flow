import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import type { BudgetGoal } from '../types';

export const useBudgetGoals = (month: number, year: number) => {
  return useQuery({
    queryKey: ['budget-goals', month, year],
    queryFn: () => api.getBudgetGoals(month, year),
  });
};

export const useCreateBudgetGoal = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ data, skipExisting = false }: { 
      data: Omit<BudgetGoal, 'id' | 'created_at' | 'category' | 'spent'>; 
      skipExisting?: boolean 
    }) => api.createBudgetGoal(data, skipExisting),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-goals'] });
    },
  });
};

export const useUpdateBudgetGoal = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<BudgetGoal> }) =>
      api.updateBudgetGoal(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-goals'] });
    },
  });
};

export const useDeleteBudgetGoal = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => api.deleteBudgetGoal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-goals'] });
    },
  });
};

export const useMonthlyStats = (month: number, year: number) => {
  return useQuery({
    queryKey: ['stats', 'monthly', month, year],
    queryFn: () => api.getMonthlyStats(month, year),
  });
};

export const useYearlyStats = (year: number) => {
  return useQuery({
    queryKey: ['stats', 'yearly', year],
    queryFn: () => api.getYearlyStats(year),
  });
};

