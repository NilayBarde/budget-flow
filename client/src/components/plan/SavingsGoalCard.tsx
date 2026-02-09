import { useMemo } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { Card } from '../ui';
import { formatCurrency } from '../../utils/formatters';
import type { SavingsGoal } from '../../types';

interface SavingsGoalCardProps {
  goal: SavingsGoal;
  onEdit: (goal: SavingsGoal) => void;
  onDelete: (id: string) => void;
}

const getIcon = (iconName: string) => {
  const pascalName = iconName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  const IconComponent = (LucideIcons as Record<string, React.ComponentType<LucideIcons.LucideProps>>)[pascalName];
  return IconComponent || LucideIcons.PiggyBank;
};

export const SavingsGoalCard = ({ goal, onEdit, onDelete }: SavingsGoalCardProps) => {
  const { percentage, projectedDate, remaining } = useMemo(() => {
    const pct = goal.target_amount > 0
      ? Math.min((goal.current_amount / goal.target_amount) * 100, 100)
      : 0;

    const rem = Math.max(goal.target_amount - goal.current_amount, 0);

    let projected: string | null = null;
    if (goal.monthly_contribution > 0 && rem > 0) {
      const monthsLeft = Math.ceil(rem / goal.monthly_contribution);
      const date = new Date();
      date.setMonth(date.getMonth() + monthsLeft);
      projected = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } else if (rem <= 0) {
      projected = 'Completed!';
    }

    return { percentage: pct, projectedDate: projected, remaining: rem };
  }, [goal]);

  const Icon = getIcon(goal.icon);
  const isComplete = percentage >= 100;

  return (
    <Card padding="sm" className="group">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${goal.color}20` }}
        >
          <Icon size={20} style={{ color: goal.color }} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-slate-100 truncate">{goal.name}</h3>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0">
              <button
                onClick={() => onEdit(goal)}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-midnight-600 rounded-lg transition-colors"
                aria-label="Edit goal"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => onDelete(goal.id)}
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-midnight-600 rounded-lg transition-colors"
                aria-label="Delete goal"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* Amounts */}
          <p className="text-xs text-slate-400 mt-0.5">
            {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}
          </p>

          {/* Progress bar */}
          <div className="mt-2">
            <div className="h-2 w-full bg-midnight-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: isComplete ? '#22c55e' : goal.color,
                }}
              />
            </div>
          </div>

          {/* Bottom details */}
          <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
            <span>{percentage.toFixed(0)}% saved</span>
            <div className="flex items-center gap-3">
              {goal.monthly_contribution > 0 && (
                <span>{formatCurrency(goal.monthly_contribution)}/mo</span>
              )}
              {projectedDate && (
                <span className={isComplete ? 'text-emerald-400 font-medium' : ''}>
                  {isComplete ? '✓ Complete' : `Est. ${projectedDate}`}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
