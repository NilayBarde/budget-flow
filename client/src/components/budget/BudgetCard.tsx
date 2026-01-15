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
      className="hover:border-midnight-500 transition-colors cursor-pointer"
      onClick={() => onEdit(goal)}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${goal.category?.color || '#64748b'}20` }}
          >
            <span style={{ color: goal.category?.color || '#64748b' }}>
              {goal.category?.name?.charAt(0) || '?'}
            </span>
          </div>
          <div>
            <h3 className="font-medium text-slate-100">{goal.category?.name || 'Unknown'}</h3>
            <p className="text-sm text-slate-400">
              {formatCurrency(spent)} of {formatCurrency(goal.limit_amount)}
            </p>
          </div>
        </div>
        <span className="text-lg font-semibold text-slate-100">
          {percentage.toFixed(0)}%
        </span>
      </div>
      <ProgressBar value={spent} max={goal.limit_amount} />
    </Card>
  );
};

