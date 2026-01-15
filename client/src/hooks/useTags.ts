import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import type { Tag } from '../types';

export const useTags = () => {
  return useQuery({
    queryKey: ['tags'],
    queryFn: api.getTags,
  });
};

export const useCreateTag = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: Omit<Tag, 'id' | 'created_at'>) => api.createTag(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
};

export const useUpdateTag = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Tag> }) =>
      api.updateTag(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
};

export const useDeleteTag = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => api.deleteTag(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
};

export const useAddTagToTransaction = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ transactionId, tagId }: { transactionId: string; tagId: string }) =>
      api.addTagToTransaction(transactionId, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
};

export const useRemoveTagFromTransaction = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ transactionId, tagId }: { transactionId: string; tagId: string }) =>
      api.removeTagFromTransaction(transactionId, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
};

