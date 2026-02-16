import { useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Button, Card, CardHeader, Spinner, ProgressBar, MonthSelector } from '../components/ui';
import { AllocationBar } from '../components/plan';
import { BudgetGoalModal } from '../components/budget';
import {
  useBudgetGoals,
  useRecurringTransactions,
  useUpdateAppSetting,
  useAppSettings,
  useExpectedIncome,
  useMonthNavigation,
  useModalState,
  useFinancialHealth,
} from '../hooks';
import type { BudgetGoal } from '../types';
import { formatCurrency } from '../utils/formatters';
import { MONTHS } from '../utils/constants';

export const FinancialPlan = () => {
  const { currentDate, handlePrevMonth, handleNextMonth } = useMonthNavigation();
  const budgetModal = useModalState<BudgetGoal>();

  // Data hooks
  const { data: budgetGoals, isLoading: budgetLoading } = useBudgetGoals(currentDate.month, currentDate.year);
  const { data: recurring } = useRecurringTransactions();
  const { data: appSettings } = useAppSettings();
  const updateSetting = useUpdateAppSetting();

  // Use centralized financial hook
  const {
    expectedIncome,
    actualIncome,
    totalSpent,
    totalInvested,
    isLoading: healthLoading,
    // We also need these specific details from the hook related to income
  } = useFinancialHealth(currentDate.month, currentDate.year);

  // Create a separate call for income specifics if needed by child components (AllocationBar)
  // or pass necessary props. Looking at AllocationBar props, it needs calculation details.
  // We should actually extend the hook or use useExpectedIncome directly for the detailed breakdown if needed.
  // For now, let's keep useExpectedIncome just for the breakdown details used in AllocationBar
  // but use the hook for the main numbers.
  // Wait, AllocationBar needs: calculatedIncome, isManualOverride, monthsSampled.
  // Let's bring those back from useExpectedIncome for now to feed the UI component,
  // but use the hook's outputs for the calculations below.
  const { calculatedIncome, isManualOverride, monthsSampled } = useExpectedIncome();

  // Mutations

  // Calculated values from financial hook
  const calculatedMonthlyInvested = totalInvested;

  // Manual overrides for projection inputs
  const manualInvestments = appSettings?.net_worth_monthly_investments
    ? parseFloat(appSettings.net_worth_monthly_investments)
    : null;

  // Effective values for projection (manual if set, calculated otherwise)
  const effectiveInvestments = manualInvestments ?? calculatedMonthlyInvested;

  // Generic setting save helper – avoids repeating updateSetting.mutate boilerplate
  const saveSetting = useCallback(
    (key: string, value: string) => updateSetting.mutate({ key, value }),
    [updateSetting],
  );

  // Derived values
  const handleOverrideChange = useCallback(
    (value: number) => saveSetting('expected_monthly_income', value.toString()),
    [saveSetting],
  );

  const handleClearOverride = useCallback(() => {
    updateSetting.mutate({ key: 'expected_monthly_income', value: '0' });
  }, [updateSetting]);

  const fixedCosts = useMemo(() => {
    if (!recurring) return 0;
    return recurring
      .filter((r) => r.is_active)
      .reduce((sum, r) => {
        const { average_amount, frequency } = r;
        if (frequency === 'monthly') return sum + average_amount;
        if (frequency === 'weekly') return sum + average_amount * 4.33;
        if (frequency === 'yearly') return sum + average_amount / 12;
        return sum;
      }, 0);
  }, [recurring]);

  const monthlyBudgetLimit = appSettings?.monthly_budget_limit
    ? parseFloat(appSettings.monthly_budget_limit)
    : 0;

  const totalGoalContributions = useMemo(() => {
    // Savings goals removed, so base contributions is 0
    const definedGoals = 0;
    if (monthlyBudgetLimit > 0) {
      // If a budget limit is set, the "implied savings" is Income - LIMIT.
      // However, Investments also count towards this "not spending" bucket.
      // So we should only force extra Cash Savings if (Income - LIMIT) > Investments.
      const totalImpliedSavings = Math.max(0, expectedIncome - monthlyBudgetLimit);
      const remainingCashSavingsNeeded = Math.max(0, totalImpliedSavings - effectiveInvestments);
      return Math.max(definedGoals, remainingCashSavingsNeeded);
    }
    return definedGoals;
  }, [monthlyBudgetLimit, expectedIncome, effectiveInvestments]);

  const isLoading = healthLoading;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-100">Financial Plan</h1>
          <p className="text-slate-400 mt-1">Your income allocation & budget limits</p>
        </div>
      </div>

      {/* Month Selector */}
      <MonthSelector
        month={currentDate.month}
        year={currentDate.year}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
      />

      {isLoading ? (
        <Spinner className="py-12" />
      ) : (
        <>
          {/* Section 1: Monthly Allocation Bar */}
          <AllocationBar
            actualIncome={actualIncome}
            fixedCosts={fixedCosts}
            goalContributions={totalGoalContributions}
            investments={effectiveInvestments}
            actualSpent={totalSpent}
            expectedIncome={expectedIncome}
            calculatedIncome={calculatedIncome}
            isManualOverride={isManualOverride}
            monthsSampled={monthsSampled}
            onOverrideChange={handleOverrideChange}
            onClearOverride={handleClearOverride}
            budgetLimit={monthlyBudgetLimit}
          />

          {/* Section 2: Budget Guardrails */}
          <Card>
            <CardHeader
              title="Budget Guardrails"
              subtitle="Category spending limits for this month"
              action={
                <Button variant="ghost" size="sm" onClick={budgetModal.open}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              }
            />

            <div className="px-6 pb-6 pt-2">
              <label className="block text-sm font-medium text-slate-300 mb-2">Total Monthly Budget Goal</label>
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-slate-400">$</span>
                  </div>
                  <input
                    type="number"
                    placeholder="Sum of categories"
                    className="block w-full pl-7 pr-3 py-2 bg-midnight-800 border border-midnight-700 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent sm:text-sm"
                    defaultValue={appSettings?.monthly_budget_limit || ''}
                    onBlur={(e) => saveSetting('monthly_budget_limit', e.target.value)}
                  />
                </div>
                <p className="text-xs text-slate-500 max-w-[200px]">
                  Set a total budget to override the sum of individual categories.
                </p>
              </div>
            </div>

            {budgetLoading ? (
              <Spinner className="py-6" />
            ) : budgetGoals && budgetGoals.length > 0 ? (
              <div className="space-y-3 px-6 pb-6">
                {budgetGoals.map((goal) => {
                  const spent = goal.spent || 0;
                  const categoryName = goal.category?.name || 'Unknown';
                  const categoryColor = goal.category?.color || '#64748b';

                  return (
                    <button
                      key={goal.id}
                      onClick={() => budgetModal.edit(goal)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-midnight-700/50 active:bg-midnight-700 transition-colors text-left"
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${categoryColor}20` }}
                      >
                        <span className="text-xs font-medium" style={{ color: categoryColor }}>
                          {categoryName.charAt(0)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-slate-200 truncate">{categoryName}</span>
                          <span className="text-xs text-slate-400 flex-shrink-0 ml-2">
                            {formatCurrency(spent)} / {formatCurrency(goal.limit_amount)}
                          </span>
                        </div>
                        <ProgressBar value={spent} max={goal.limit_amount} showLabel={false} size="sm" />
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">
                No budget limits set for {MONTHS[currentDate.month - 1]}.{' '}
                <button onClick={budgetModal.open} className="text-accent-400 hover:underline">
                  Add one
                </button>
              </p>
            )}
          </Card>
        </>
      )}

      {/* Modals */}
      <BudgetGoalModal
        isOpen={budgetModal.isOpen}
        onClose={budgetModal.close}
        goal={budgetModal.item}
        month={currentDate.month}
        year={currentDate.year}
      />
    </div>
  );
};
