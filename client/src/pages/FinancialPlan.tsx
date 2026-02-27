import { useCallback } from 'react';
import { Plus } from 'lucide-react';
import { Button, Card, CardHeader, Spinner, ProgressBar, MonthSelector } from '../components/ui';
import { BudgetGoalModal } from '../components/budget';
import {
  useBudgetGoals,
  useUpdateAppSetting,
  useAppSettings,
  useMonthNavigation,
  useModalState,
} from '../hooks';
import type { BudgetGoal } from '../types';
import { formatCurrency } from '../utils/formatters';
import { MONTHS } from '../utils/constants';

export const FinancialPlan = () => {
  const { currentDate, handlePrevMonth, handleNextMonth } = useMonthNavigation();
  const budgetModal = useModalState<BudgetGoal>();

  // Data hooks
  const { data: budgetGoals, isLoading: budgetLoading } = useBudgetGoals(currentDate.month, currentDate.year);
  const { data: appSettings } = useAppSettings();
  const updateSetting = useUpdateAppSetting();

  // Generic setting save helper – avoids repeating updateSetting.mutate boilerplate
  const saveSetting = useCallback(
    (key: string, value: string) => updateSetting.mutate({ key, value }),
    [updateSetting],
  );

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

      {/* Budget Guardrails */}
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
