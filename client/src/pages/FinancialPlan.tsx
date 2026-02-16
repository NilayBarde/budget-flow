import { useCallback, useMemo } from 'react';
import { Plus, Target } from 'lucide-react';
import { Button, Card, CardHeader, Spinner, EmptyState, ProgressBar, MonthSelector } from '../components/ui';
import { AllocationBar, SavingsGoalCard, SavingsGoalModal, NetWorthGoalCard } from '../components/plan';
import type { RecurringContribution } from '../components/plan';
import { BudgetGoalModal } from '../components/budget';
import {
  useMonthlyStats,
  useBudgetGoals,
  useRecurringTransactions,
  useSavingsGoals,
  useCreateSavingsGoal,
  useUpdateSavingsGoal,
  useDeleteSavingsGoal,
  useExpectedIncome,
  useUpdateAppSetting,
  useAppSettings,
  useInvestmentSummary,
  useMonthNavigation,
  useModalState,
} from '../hooks';
import type { SavingsGoal, BudgetGoal } from '../types';
import { formatCurrency } from '../utils/formatters';
import { MONTHS } from '../utils/constants';

export const FinancialPlan = () => {
  const { currentDate, handlePrevMonth, handleNextMonth } = useMonthNavigation();
  const goalModal = useModalState<SavingsGoal>();
  const budgetModal = useModalState<BudgetGoal>();

  // Data hooks
  const { data: stats, isLoading: statsLoading } = useMonthlyStats(currentDate.month, currentDate.year);
  const { data: budgetGoals, isLoading: budgetLoading } = useBudgetGoals(currentDate.month, currentDate.year);
  const { data: recurring } = useRecurringTransactions();
  const { data: savingsGoals = [], isLoading: savingsLoading } = useSavingsGoals();
  const { expectedIncome, calculatedIncome, isManualOverride, monthsSampled } = useExpectedIncome();
  const { data: appSettings } = useAppSettings();
  const { data: investmentSummary } = useInvestmentSummary();
  const updateSetting = useUpdateAppSetting();

  // Mutations
  const createGoal = useCreateSavingsGoal();
  const updateGoal = useUpdateSavingsGoal();
  const deleteGoal = useDeleteSavingsGoal();

  // Derived values
  const actualIncome = stats?.total_income || 0;
  const totalSpent = stats?.total_spent || 0;
  const currentNetWorth = investmentSummary?.netWorth ?? 0;
  const netWorthGoalAmount = appSettings?.net_worth_goal_amount
    ? parseFloat(appSettings.net_worth_goal_amount)
    : 0;
  const netWorthGoalYear = appSettings?.net_worth_goal_year
    ? parseInt(appSettings.net_worth_goal_year, 10)
    : 0;
  const netWorthContributions: RecurringContribution[] = useMemo(() => {
    try {
      return appSettings?.net_worth_contributions
        ? JSON.parse(appSettings.net_worth_contributions)
        : [];
    } catch {
      return [];
    }
  }, [appSettings?.net_worth_contributions]);
  const estimatedReturnRate = appSettings?.net_worth_estimated_return
    ? parseFloat(appSettings.net_worth_estimated_return)
    : 0;
  const cashReturnRate = appSettings?.net_worth_cash_return_rate
    ? parseFloat(appSettings.net_worth_cash_return_rate)
    : 0;
  const totalInvestmentValue = investmentSummary?.investments.totalValue ?? 0;

  // Calculated values from transactions
  const calculatedSavingsRate = Math.max(expectedIncome - totalSpent, 0);
  const calculatedMonthlyInvested = stats?.total_invested || 0;
  const calculatedCashRetained = Math.max(calculatedSavingsRate - calculatedMonthlyInvested, 0);

  // Manual overrides for projection inputs
  const manualCashSavings = appSettings?.net_worth_monthly_cash_savings
    ? parseFloat(appSettings.net_worth_monthly_cash_savings)
    : null;
  const manualInvestments = appSettings?.net_worth_monthly_investments
    ? parseFloat(appSettings.net_worth_monthly_investments)
    : null;
  const isManualSavings = manualCashSavings !== null || manualInvestments !== null;

  // Effective values for projection (manual if set, calculated otherwise)
  const effectiveCashSavings = manualCashSavings ?? calculatedCashRetained;
  const effectiveInvestments = manualInvestments ?? calculatedMonthlyInvested;

  // Generic setting save helper – avoids repeating updateSetting.mutate boilerplate
  const saveSetting = useCallback(
    (key: string, value: string) => updateSetting.mutate({ key, value }),
    [updateSetting],
  );

  const handleSaveNetWorthGoal = useCallback(
    (amount: number, year: number) => {
      saveSetting('net_worth_goal_amount', amount.toString());
      saveSetting('net_worth_goal_year', year.toString());
    },
    [saveSetting],
  );

  const handleSaveContributions = useCallback(
    (contributions: RecurringContribution[]) => {
      saveSetting('net_worth_contributions', JSON.stringify(contributions));
    },
    [saveSetting],
  );

  const handleSaveReturnRate = useCallback(
    (rate: number) => saveSetting('net_worth_estimated_return', rate.toString()),
    [saveSetting],
  );

  const handleSaveCashReturnRate = useCallback(
    (rate: number) => saveSetting('net_worth_cash_return_rate', rate.toString()),
    [saveSetting],
  );

  const handleSaveMonthlyInputs = useCallback(
    (cashSavings: number | null, investments: number | null) => {
      saveSetting('net_worth_monthly_cash_savings', cashSavings !== null ? cashSavings.toString() : '');
      saveSetting('net_worth_monthly_investments', investments !== null ? investments.toString() : '');
    },
    [saveSetting],
  );

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

  const totalGoalContributions = useMemo(
    () => savingsGoals.reduce((sum, g) => sum + g.monthly_contribution, 0),
    [savingsGoals],
  );

  // Savings goal handlers
  const handleSaveGoal = useCallback(
    async (data: Omit<SavingsGoal, 'id' | 'created_at' | 'updated_at'>) => {
      if (goalModal.item) {
        await updateGoal.mutateAsync({ id: goalModal.item.id, data });
      } else {
        await createGoal.mutateAsync(data);
      }
    },
    [goalModal.item, updateGoal, createGoal],
  );

  const handleDeleteGoal = useCallback(
    async (id: string) => {
      await deleteGoal.mutateAsync(id);
    },
    [deleteGoal],
  );

  const isLoading = statsLoading || savingsLoading;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-100">Financial Plan</h1>
          <p className="text-slate-400 mt-1">Your income allocation & savings goals</p>
        </div>
        <Button onClick={goalModal.open} className="w-full md:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          New Savings Goal
        </Button>
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
            actualSpent={totalSpent}
            expectedIncome={expectedIncome}
            calculatedIncome={calculatedIncome}
            isManualOverride={isManualOverride}
            monthsSampled={monthsSampled}
            onOverrideChange={handleOverrideChange}
            onClearOverride={handleClearOverride}
          />

          {/* Section 2: Net Worth Goal */}
          <NetWorthGoalCard
            currentNetWorth={currentNetWorth}
            effectiveCashSavings={effectiveCashSavings}
            effectiveInvestments={effectiveInvestments}
            calculatedCashRetained={calculatedCashRetained}
            calculatedMonthlyInvested={calculatedMonthlyInvested}
            isManualSavings={isManualSavings}
            manualCashSavings={manualCashSavings}
            manualInvestments={manualInvestments}
            totalInvestmentValue={totalInvestmentValue}
            estimatedReturnRate={estimatedReturnRate}
            cashReturnRate={cashReturnRate}
            goalAmount={netWorthGoalAmount}
            goalYear={netWorthGoalYear}
            contributions={netWorthContributions}
            onSaveGoal={handleSaveNetWorthGoal}
            onSaveContributions={handleSaveContributions}
            onSaveReturnRate={handleSaveReturnRate}
            onSaveCashReturnRate={handleSaveCashReturnRate}
            onSaveMonthlyInputs={handleSaveMonthlyInputs}
          />

          {/* Section 3: Savings Goals */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg md:text-xl font-semibold text-slate-100">Savings Goals</h2>
              {savingsGoals.length > 0 && (
                <Button variant="ghost" size="sm" onClick={goalModal.open}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              )}
            </div>

            {savingsGoals.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                {savingsGoals.map((goal) => (
                  <SavingsGoalCard
                    key={goal.id}
                    goal={goal}
                    onEdit={goalModal.edit}
                    onDelete={handleDeleteGoal}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No savings goals yet"
                description="Set long-term goals to track your progress toward big milestones."
                icon={<Target className="h-8 w-8 text-slate-400" />}
                action={
                  <Button onClick={goalModal.open}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Goal
                  </Button>
                }
              />
            )}
          </div>

          {/* Section 4: Budget Guardrails */}
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
              <div className="space-y-3">
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
      <SavingsGoalModal
        isOpen={goalModal.isOpen}
        onClose={goalModal.close}
        goal={goalModal.item}
        onSave={handleSaveGoal}
        onDelete={handleDeleteGoal}
      />

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
