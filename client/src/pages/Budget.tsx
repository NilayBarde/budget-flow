import { useState, useCallback } from 'react';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Card, Spinner, EmptyState } from '../components/ui';
import { BudgetCard, BudgetGoalModal } from '../components/budget';
import { useBudgetGoals, useMonthlyStats } from '../hooks';
import type { BudgetGoal } from '../types';
import { formatCurrency, getMonthYear } from '../utils/formatters';
import { MONTHS } from '../utils/constants';
import { PiggyBank } from 'lucide-react';

export const Budget = () => {
  const [currentDate, setCurrentDate] = useState(getMonthYear());
  const [editingGoal, setEditingGoal] = useState<BudgetGoal | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: goals, isLoading: goalsLoading } = useBudgetGoals(currentDate.month, currentDate.year);
  const { data: monthlyStats, isLoading: statsLoading } = useMonthlyStats(currentDate.month, currentDate.year);

  const handlePrevMonth = () => {
    setCurrentDate(prev => {
      let newMonth = prev.month - 1;
      let newYear = prev.year;
      if (newMonth < 1) {
        newMonth = 12;
        newYear -= 1;
      }
      return { month: newMonth, year: newYear };
    });
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => {
      let newMonth = prev.month + 1;
      let newYear = prev.year;
      if (newMonth > 12) {
        newMonth = 1;
        newYear += 1;
      }
      return { month: newMonth, year: newYear };
    });
  };

  const handleEditGoal = useCallback((goal: BudgetGoal) => {
    setEditingGoal(goal);
    setIsModalOpen(true);
  }, []);

  const handleAddGoal = useCallback(() => {
    setEditingGoal(null);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingGoal(null);
  }, []);

  const isLoading = goalsLoading || statsLoading;

  // Calculate budget summary
  const totalBudgeted = goals?.reduce((sum, g) => sum + g.limit_amount, 0) || 0;
  // Use actual monthly spending from stats (works even without budget goals)
  const totalSpent = monthlyStats?.total_spent || 0;
  const remaining = totalBudgeted - totalSpent;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header - Stacked on mobile */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-100">Budget</h1>
          <p className="text-slate-400 mt-1">Set and track your spending limits</p>
        </div>
        <Button onClick={handleAddGoal} className="w-full md:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Add Budget
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

      {/* Summary Cards - Stack vertically on very small screens */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <Card padding="sm">
          <p className="text-xs md:text-sm text-slate-400">Total Budgeted</p>
          <p className="text-xl md:text-2xl font-bold text-slate-100 mt-0.5 md:mt-1">
            {formatCurrency(totalBudgeted)}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs md:text-sm text-slate-400">Total Spent</p>
          <p className="text-xl md:text-2xl font-bold text-slate-100 mt-0.5 md:mt-1">
            {formatCurrency(totalSpent)}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs md:text-sm text-slate-400">Remaining</p>
          <p className={`text-xl md:text-2xl font-bold mt-0.5 md:mt-1 ${remaining >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatCurrency(remaining)}
          </p>
        </Card>
      </div>

      {/* Budget Goals */}
      {isLoading ? (
        <Spinner className="py-12" />
      ) : goals && goals.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {goals.map(goal => (
            <BudgetCard key={goal.id} goal={goal} onEdit={handleEditGoal} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No budget goals set"
          description="Create budget goals to track your spending by category."
          icon={<PiggyBank className="h-8 w-8 text-slate-400" />}
          action={
            <Button onClick={handleAddGoal}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Budget
            </Button>
          }
        />
      )}

      <BudgetGoalModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        goal={editingGoal}
        month={currentDate.month}
        year={currentDate.year}
      />
    </div>
  );
};
