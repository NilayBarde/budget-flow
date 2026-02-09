import { useState, useCallback, useMemo } from 'react';
import { Plus, ChevronLeft, ChevronRight, Target } from 'lucide-react';
import { Button, Card, CardHeader, Spinner, EmptyState, ProgressBar } from '../components/ui';
import { AllocationBar, SavingsGoalCard, SavingsGoalModal } from '../components/plan';
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
} from '../hooks';
import type { SavingsGoal, BudgetGoal } from '../types';
import { formatCurrency, getMonthYear } from '../utils/formatters';
import { MONTHS } from '../utils/constants';

export const FinancialPlan = () => {
  const [currentDate, setCurrentDate] = useState(getMonthYear());
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetGoal | null>(null);

  // Data hooks
  const { data: stats, isLoading: statsLoading } = useMonthlyStats(currentDate.month, currentDate.year);
  const { data: budgetGoals, isLoading: budgetLoading } = useBudgetGoals(currentDate.month, currentDate.year);
  const { data: recurring } = useRecurringTransactions();
  const { data: savingsGoals = [], isLoading: savingsLoading } = useSavingsGoals();
  const { expectedIncome, calculatedIncome, isManualOverride, monthsSampled } = useExpectedIncome();
  const updateSetting = useUpdateAppSetting();

  // Mutations
  const createGoal = useCreateSavingsGoal();
  const updateGoal = useUpdateSavingsGoal();
  const deleteGoal = useDeleteSavingsGoal();

  // Derived values
  const actualIncome = stats?.total_income || 0;
  const totalSpent = stats?.total_spent || 0;

  const handleOverrideChange = useCallback(
    (value: number) => {
      updateSetting.mutate({ key: 'expected_monthly_income', value: value.toString() });
    },
    [updateSetting],
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

  // Navigation
  const handlePrevMonth = useCallback(() => {
    setCurrentDate((prev) => {
      let newMonth = prev.month - 1;
      let newYear = prev.year;
      if (newMonth < 1) {
        newMonth = 12;
        newYear -= 1;
      }
      return { month: newMonth, year: newYear };
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentDate((prev) => {
      let newMonth = prev.month + 1;
      let newYear = prev.year;
      if (newMonth > 12) {
        newMonth = 1;
        newYear += 1;
      }
      return { month: newMonth, year: newYear };
    });
  }, []);

  // Savings goal handlers
  const handleAddGoal = useCallback(() => {
    setEditingGoal(null);
    setIsGoalModalOpen(true);
  }, []);

  const handleEditGoal = useCallback((goal: SavingsGoal) => {
    setEditingGoal(goal);
    setIsGoalModalOpen(true);
  }, []);

  const handleCloseGoalModal = useCallback(() => {
    setIsGoalModalOpen(false);
    setEditingGoal(null);
  }, []);

  const handleSaveGoal = useCallback(
    async (data: Omit<SavingsGoal, 'id' | 'created_at' | 'updated_at'>) => {
      if (editingGoal) {
        await updateGoal.mutateAsync({ id: editingGoal.id, data });
      } else {
        await createGoal.mutateAsync(data);
      }
    },
    [editingGoal, updateGoal, createGoal],
  );

  const handleDeleteGoal = useCallback(
    async (id: string) => {
      await deleteGoal.mutateAsync(id);
    },
    [deleteGoal],
  );

  // Budget guardrail handlers
  const handleEditBudget = useCallback((goal: BudgetGoal) => {
    setEditingBudget(goal);
    setIsBudgetModalOpen(true);
  }, []);

  const handleAddBudget = useCallback(() => {
    setEditingBudget(null);
    setIsBudgetModalOpen(true);
  }, []);

  const handleCloseBudgetModal = useCallback(() => {
    setIsBudgetModalOpen(false);
    setEditingBudget(null);
  }, []);

  const isLoading = statsLoading || savingsLoading;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-100">Financial Plan</h1>
          <p className="text-slate-400 mt-1">Your income allocation & savings goals</p>
        </div>
        <Button onClick={handleAddGoal} className="w-full md:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          New Savings Goal
        </Button>
      </div>

      {/* Month Selector */}
      <div className="flex items-center justify-between bg-midnight-800 border border-midnight-600 rounded-xl p-3 md:p-4">
        <button
          onClick={handlePrevMonth}
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-700 active:bg-midnight-600 rounded-lg transition-colors touch-target"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg md:text-xl font-semibold text-slate-100">
          {MONTHS[currentDate.month - 1]} {currentDate.year}
        </h2>
        <button
          onClick={handleNextMonth}
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-700 active:bg-midnight-600 rounded-lg transition-colors touch-target"
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

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

          {/* Section 2: Savings Goals */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg md:text-xl font-semibold text-slate-100">Savings Goals</h2>
              {savingsGoals.length > 0 && (
                <Button variant="ghost" size="sm" onClick={handleAddGoal}>
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
                    onEdit={handleEditGoal}
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
                  <Button onClick={handleAddGoal}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Goal
                  </Button>
                }
              />
            )}
          </div>

          {/* Section 3: Budget Guardrails */}
          <Card>
            <CardHeader
              title="Budget Guardrails"
              subtitle="Category spending limits for this month"
              action={
                <Button variant="ghost" size="sm" onClick={handleAddBudget}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              }
            />

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
                      onClick={() => handleEditBudget(goal)}
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
                <button onClick={handleAddBudget} className="text-accent-400 hover:underline">
                  Add one
                </button>
              </p>
            )}
          </Card>
        </>
      )}

      {/* Modals */}
      <SavingsGoalModal
        isOpen={isGoalModalOpen}
        onClose={handleCloseGoalModal}
        goal={editingGoal}
        onSave={handleSaveGoal}
        onDelete={handleDeleteGoal}
      />

      <BudgetGoalModal
        isOpen={isBudgetModalOpen}
        onClose={handleCloseBudgetModal}
        goal={editingBudget}
        month={currentDate.month}
        year={currentDate.year}
      />
    </div>
  );
};
