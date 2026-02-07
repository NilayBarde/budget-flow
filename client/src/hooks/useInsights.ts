import { useQuery } from '@tanstack/react-query';
import * as api from '../services/api';

export const useInsights = () => {
  return useQuery({
    queryKey: ['insights'],
    queryFn: api.getInsights,
  });
};
