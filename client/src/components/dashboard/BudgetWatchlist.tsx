
import { AlertCircle, ArrowRight } from 'lucide-react';
import { Card, Spinner } from '../ui';
import { useBudgetGoals } from '../../hooks';
import { formatCurrency } from '../../utils/formatters';
import { Link } from 'react-router-dom';
import { ProgressBar } from '../ui/ProgressBar';

interface BudgetWatchlistProps {
    month: number;
    year: number;
}

export const BudgetWatchlist = ({ month, year }: BudgetWatchlistProps) => {
    const { data: budgetGoals, isLoading } = useBudgetGoals(month, year);

    if (isLoading) {
        return (
            <Card className="min-h-[200px] flex items-center justify-center">
                <Spinner />
            </Card>
        );
    }

    // Filter for goals that are > 70% spent
    const watchItems = budgetGoals
        ?.filter(goal => {
            const spent = goal.spent || 0;
            return (spent / goal.limit_amount) > 0.7;
        })
        .sort((a, b) => {
            const ratioA = (a.spent || 0) / a.limit_amount;
            const ratioB = (b.spent || 0) / b.limit_amount;
            return ratioB - ratioA; // Descending order of usage
        })
        .slice(0, 4) || [];

    if (watchItems.length === 0) {
        return null; // Don't show if everything is fine
    }

    return (
        <Card className="flex flex-col h-full" padding="none">
            <div className="p-4 border-b border-midnight-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-400" />
                    <h3 className="font-medium text-slate-100">Budget Watchlist</h3>
                </div>
                <Link to="/plan" className="text-sm text-accent-400 hover:text-accent-300 flex items-center gap-1">
                    Manage <ArrowRight className="h-3 w-3" />
                </Link>
            </div>

            <div className="p-4 space-y-4">
                {watchItems.map(goal => {
                    const spent = goal.spent || 0;
                    const ratio = spent / goal.limit_amount;
                    const isOver = ratio > 1;

                    return (
                        <div key={goal.id}>
                            <div className="flex justify-between items-center mb-1.5">
                                <span className="text-sm font-medium text-slate-200">{goal.category?.name}</span>
                                <span className={`text-xs font-medium ${isOver ? 'text-rose-400' : 'text-amber-400'}`}>
                                    {Math.round(ratio * 100)}%
                                </span>
                            </div>
                            <ProgressBar
                                value={spent}
                                max={goal.limit_amount}
                                showLabel={false}
                                size="sm"
                                color={isOver ? 'danger' : 'warning'}
                            />
                            <div className="flex justify-between mt-1 text-xs text-slate-400">
                                <span>{formatCurrency(spent)} spent</span>
                                <span>{formatCurrency(goal.limit_amount)} limit</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
};
