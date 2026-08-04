import { TrendingUp, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../ui';
import { useBudgetGoals, useMonthlyStats } from '../../hooks';
import { computeBudgetVariance } from '../../utils/budget-variance';
import { formatCurrency } from '../../utils/formatters';

interface BudgetVarianceProps {
    month: number;
    year: number;
}

const MAX_ROWS = 5;

export const BudgetVariance = ({ month, year }: BudgetVarianceProps) => {
    const { data: budgetGoals } = useBudgetGoals(month, year);
    const { data: monthlyStats } = useMonthlyStats(month, year);

    // Variance needs per-category limits; hidden while loading, with no
    // goals, or when nothing is over (matches BudgetWatchlist behavior).
    if (!budgetGoals || !monthlyStats || budgetGoals.length === 0) return null;

    const variance = computeBudgetVariance(budgetGoals, monthlyStats.by_category);
    const overTotal = monthlyStats.total_spent > variance.totalBudgeted;
    if (variance.overspentCategories.length === 0 && !overTotal) return null;

    const shown = variance.overspentCategories.slice(0, MAX_ROWS);
    const hiddenCount = variance.overspentCategories.length - shown.length;

    return (
        <Card className="flex flex-col" padding="none">
            <div className="p-4 border-b border-midnight-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-rose-400" />
                    <h3 className="font-medium text-slate-100">Why over budget?</h3>
                </div>
                <Link to="/plan" className="text-sm text-accent-400 hover:text-accent-300 flex items-center gap-1">
                    Manage <ArrowRight className="h-3 w-3" />
                </Link>
            </div>

            <div className="p-4 space-y-3">
                {shown.map(c => (
                    <div key={c.categoryId} className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-200">{c.categoryName}</span>
                        <span className="text-slate-400">
                            {formatCurrency(c.spent)} of {formatCurrency(c.limit)}
                            <span className="ml-2 font-semibold text-rose-400">+{formatCurrency(c.overage)}</span>
                        </span>
                    </div>
                ))}
                {hiddenCount > 0 && (
                    <p className="text-xs text-slate-500">+{hiddenCount} more over-limit categories</p>
                )}
                {shown.length === 0 && (
                    <p className="text-sm text-slate-400">
                        No single category is over its limit, but total spending exceeds the overall budget.
                    </p>
                )}
                {variance.unbudgetedSpend > 0 && (
                    <div className="flex items-center justify-between text-sm pt-3 border-t border-midnight-700">
                        <span className="font-medium text-slate-200">Unbudgeted categories</span>
                        <span className="font-semibold text-amber-400">{formatCurrency(variance.unbudgetedSpend)}</span>
                    </div>
                )}
            </div>
        </Card>
    );
};
