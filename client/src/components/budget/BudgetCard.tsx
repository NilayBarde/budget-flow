import { Card, ProgressBar } from '../ui';
import type { BudgetGoal } from '../../types';
import { formatCurrency } from '../../utils/formatters';

interface BudgetCardProps {
  goal: BudgetGoal;
  onEdit: (goal: BudgetGoal) => void;
}

export const BudgetCard = ({ goal, onEdit }: BudgetCardProps) => {
  const spent = goal.spent || 0;
  const percentage = goal.limit_amount > 0 ? (spent / goal.limit_amount) * 100 : 0;
  
  return (
    <Card 
      className="hover:border-midnight-500 active:bg-midnight-700/50 transition-colors cursor-pointer"
      onClick={() => onEdit(goal)}
      padding="sm"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div 
            className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${goal.category?.color || '#64748b'}20` }}
          >
            <span className="text-sm" style={{ color: goal.category?.color || '#64748b' }}>
              {goal.category?.name?.charAt(0) || '?'}
            </span>
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-slate-100 truncate">{goal.category?.name || 'Unknown'}</h3>
            <p className="text-xs md:text-sm text-slate-400 truncate">
              {formatCurrency(spent)} / {formatCurrency(goal.limit_amount)}
            </p>
          </div>
        </div>
        <span className="text-base md:text-lg font-semibold text-slate-100 flex-shrink-0 ml-2">
          {percentage.toFixed(0)}%
        </span>
      </div>
      <ProgressBar value={spent} max={goal.limit_amount} />
    </Card>
  );
};
