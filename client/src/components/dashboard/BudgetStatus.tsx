import { AlertCircle, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../ui';
import { ProgressBar } from '../ui/ProgressBar';
import { useAppSettings, useBudgetGoals, useMonthlyStats } from '../../hooks';
import { buildBudgetStatus } from '../../utils/budget-variance';
import { resolveBudgetTarget } from '../../utils/budget-target';
import { formatCurrency } from '../../utils/formatters';

interface BudgetStatusProps {
  month: number;
  year: number;
}

// One card for budget trouble: categories close to or past their limit, and spending outside any
// budget. Hidden while loading, with no budget goals, or when everything is comfortably inside.
export const BudgetStatus = ({ month, year }: BudgetStatusProps) => {
  const { data: budgetGoals, isLoading } = useBudgetGoals(month, year);
  const { data: monthlyStats } = useMonthlyStats(month, year);
  const { data: appSettings, isLoading: settingsLoading } = useAppSettings();

  // Wait for the settings too: without the user's own monthly budget the target falls back to the
  // category limits, which could flash "Over budget" while the real figure is still loading.
  if (isLoading || settingsLoading || !budgetGoals || !monthlyStats || budgetGoals.length === 0) return null;

  const status = buildBudgetStatus(
    budgetGoals,
    monthlyStats.by_category,
    monthlyStats.total_spent,
    resolveBudgetTarget(appSettings?.monthly_budget_limit, budgetGoals),
  );
  if (!status.hasContent) return null;

  const anyOver = status.overallOver || status.rows.some(row => row.isOver);

  return (
    <Card className="flex flex-col" padding="none">
      <div className="p-4 border-b border-midnight-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className={anyOver ? 'h-4 w-4 text-rose-400' : 'h-4 w-4 text-amber-400'} />
          <h3 className="font-medium text-slate-100">{anyOver ? 'Over budget' : 'Close to budget limit'}</h3>
        </div>
        <Link to="/plan" className="text-sm text-accent-400 hover:text-accent-300 flex items-center gap-1">
          Manage <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="p-4 space-y-4">
        {status.rows.map(row => (
          <div key={row.categoryId}>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-sm font-medium text-slate-200">{row.categoryName}</span>
              <span className={row.isOver ? 'text-xs font-medium text-rose-400' : 'text-xs font-medium text-amber-400'}>
                {Number.isFinite(row.ratio) ? `${Math.round(row.ratio * 100)}%` : 'No limit'}
              </span>
            </div>
            <ProgressBar
              value={row.spent}
              max={row.limit > 0 ? row.limit : row.spent || 1}
              showLabel={false}
              size="sm"
              color={row.isOver ? 'danger' : 'warning'}
            />
            <div className="flex justify-between mt-1 text-xs text-slate-400">
              <span>
                {formatCurrency(row.spent)} of {formatCurrency(row.limit)}
              </span>
              {row.isOver && <span className="font-semibold text-rose-400">+{formatCurrency(row.overage)} over</span>}
            </div>
          </div>
        ))}

        {status.hiddenCount > 0 && (
          <p className="text-xs text-slate-500">+{status.hiddenCount} more near or over their limit</p>
        )}

        {status.rows.length === 0 && (
          <p className="text-sm text-slate-400">
            No single category is over its limit, but total spending exceeds the overall budget.
          </p>
        )}

        {status.unbudgetedSpend > 0 && (
          <div className="flex items-center justify-between text-sm pt-3 border-t border-midnight-700">
            <span className="font-medium text-slate-200">Unbudgeted categories</span>
            <span className="font-semibold text-amber-400">{formatCurrency(status.unbudgetedSpend)}</span>
          </div>
        )}
      </div>
    </Card>
  );
};
