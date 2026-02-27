
import { Card, CardHeader, Spinner } from '../ui';
import { ProgressBar } from '../ui/ProgressBar';
import { useInsights, useAppSettings, useBudgetGoals } from '../../hooks';
import { formatCurrency } from '../../utils/formatters';
import { MONTHS } from '../../utils/constants';

export const SpendingPace = () => {
    const { data: insights, isLoading } = useInsights();
    const { data: appSettings } = useAppSettings();

    const currentMonth = insights?.monthOverMonth.currentMonth;
    const { data: budgetGoals } = useBudgetGoals(currentMonth?.month ?? 0, currentMonth?.year ?? 0);

    if (isLoading) {
        return (
            <Card className="min-h-[200px] flex items-center justify-center">
                <Spinner />
            </Card>
        );
    }

    if (!insights) return null;

    const { spendingVelocity, monthOverMonth: { currentMonth: cm } } = insights;

    // Resolve monthly budget target (same logic as DashboardHero)
    const manualBudgetLimit = appSettings?.monthly_budget_limit ? parseFloat(appSettings.monthly_budget_limit) : 0;
    const budgetTarget = manualBudgetLimit > 0
        ? manualBudgetLimit
        : (budgetGoals?.reduce((sum, goal) => sum + goal.limit_amount, 0) || 0);
    const hasBudget = budgetTarget > 0;

    // Calculate pace percentage
    const pacePercent = spendingVelocity.daysInMonth > 0
        ? (spendingVelocity.daysElapsed / spendingVelocity.daysInMonth) * 100
        : 0;

    // Determine if on pace against the budget (with 5% grace period)
    const benchmark = hasBudget ? budgetTarget : spendingVelocity.lastMonthTotal;
    const isOnPace = benchmark > 0
        ? spendingVelocity.projectedTotal <= benchmark * 1.05
        : true;

    return (
        <Card padding="sm">
            <CardHeader
                title="Spending Pace"
                subtitle={`${MONTHS[cm.month - 1]} ${cm.year} — Day ${spendingVelocity.daysElapsed} of ${spendingVelocity.daysInMonth}`}
            />
            <div className="space-y-3">
                {/* Progress bar: current spend vs monthly budget */}
                <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                        <span>Spent so far: {formatCurrency(spendingVelocity.spentSoFar)}</span>
                        <span>{hasBudget ? 'Budget' : 'Last month'}: {formatCurrency(hasBudget ? budgetTarget : spendingVelocity.lastMonthTotal)}</span>
                    </div>
                    <ProgressBar
                        value={spendingVelocity.spentSoFar}
                        max={benchmark || 1}
                        color={isOnPace ? 'success' : 'warning'}
                        showLabel={false}
                        size="md"
                    />
                    {/* Expected pace marker */}
                    <div className="relative h-0">
                        <div
                            className="absolute -top-2.5 w-0.5 h-2.5 bg-slate-400 rounded-full"
                            style={{ left: `${Math.min(pacePercent, 100)}%` }}
                            title={`Expected pace: ${pacePercent.toFixed(0)}%`}
                        />
                    </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                    <div>
                        <p className="text-xs text-slate-500">Fixed Costs</p>
                        <p className="text-sm font-medium text-slate-200">
                            {formatCurrency(spendingVelocity.fixedCosts)}
                        </p>
                        {spendingVelocity.fixedCosts > 0 && (
                            <p className="text-[10px] text-slate-500 mt-0.5">
                                {formatCurrency(spendingVelocity.recurringSpent)} paid
                            </p>
                        )}
                    </div>
                    <div>
                        <p className="text-xs text-slate-500">Variable / day</p>
                        <p className="text-sm font-medium text-slate-200">
                            {formatCurrency(spendingVelocity.dailyAverage)}
                        </p>
                        {spendingVelocity.variableSpent > 0 && (
                            <p className="text-[10px] text-slate-500 mt-0.5">
                                {formatCurrency(spendingVelocity.variableSpent)} so far
                            </p>
                        )}
                    </div>
                    <div>
                        <p className="text-xs text-slate-500">Projected Total</p>
                        <p className={`text-sm font-medium ${spendingVelocity.projectedTotal > benchmark ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {formatCurrency(spendingVelocity.projectedTotal)}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500">Status</p>
                        <p className={`text-sm font-medium ${isOnPace ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {isOnPace ? 'On pace' : 'Over pace'}
                        </p>
                    </div>
                </div>
            </div>
        </Card>
    );
};
