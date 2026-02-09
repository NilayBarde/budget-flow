import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';

const SETTINGS_KEY = 'app-settings';
const ESTIMATED_INCOME_KEY = 'estimated-income';

export const useAppSettings = () => {
  return useQuery({
    queryKey: [SETTINGS_KEY],
    queryFn: api.getAppSettings,
    staleTime: 10 * 60 * 1000, // 10 minutes — settings rarely change
  });
};

export const useUpdateAppSetting = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.updateAppSetting(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SETTINGS_KEY] });
    },
  });
};

/**
 * Returns the expected monthly income.
 *
 * Priority:
 *  1. Manual override from app_settings (if > 0)
 *  2. Auto-calculated average from last 3 complete months of income transactions
 *
 * Also exposes `isManualOverride` and `monthsSampled` for UI context.
 */
export const useExpectedIncome = () => {
  const { data: settings } = useAppSettings();
  const { data: estimated, isLoading } = useQuery({
    queryKey: [ESTIMATED_INCOME_KEY],
    queryFn: api.getEstimatedIncome,
    staleTime: 30 * 60 * 1000, // 30 min — doesn't change often
  });

  const manualValue = settings?.expected_monthly_income
    ? parseFloat(settings.expected_monthly_income)
    : 0;

  const calculatedValue = estimated?.estimated_monthly_income ?? 0;
  const isManualOverride = manualValue > 0;
  const expectedIncome = isManualOverride ? manualValue : calculatedValue;

  return {
    expectedIncome,
    calculatedIncome: calculatedValue,
    isManualOverride,
    monthsSampled: estimated?.months_sampled ?? 0,
    isLoading,
  };
};
