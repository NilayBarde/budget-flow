import { useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, Wallet, PiggyBank, Target, TrendingUp, Eye, EyeOff } from 'lucide-react';
import { Card, Spinner } from '../ui';
import { formatCurrency } from '../../utils/formatters';
import { useBudgetGoals, useAppSettings, useFinancialHealth } from '../../hooks';

interface StatRowProps {
    label: string;
    value: number;
    icon: React.ElementType;
    className?: string;
    iconClassName?: string;
    valueClassName?: string;
    formatter?: (val: number) => string;
    isHidable?: boolean;
}

const StatRow = ({
    label,
    value,
    icon: Icon,
    className = "",
    iconClassName = "",
    valueClassName = "",
    formatter = formatCurrency,
    isHidable = false,
}: StatRowProps) => {
    const [isVisible, setIsVisible] = useState(!isHidable);

    return (
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border border-midnight-700 bg-midnight-800/50 transition-all duration-300 ${className}`}>
            <div className={`p-1.5 rounded-lg bg-midnight-700/50 flex-shrink-0 ${iconClassName}`}>
                <Icon className="h-4 w-4" />
            </div>
            <p className="text-sm font-medium text-slate-400 flex-1">{label}</p>
            <div className="flex items-center gap-1.5">
                <span className={`text-sm font-semibold text-slate-100 transition-all duration-300 ${valueClassName}`}>
                    {isVisible ? formatter(value) : '••••••'}
                </span>
                {isHidable && (
                    <button
                        onClick={() => setIsVisible(!isVisible)}
                        className="text-slate-500 hover:text-slate-300 transition-colors"
                        title={isVisible ? "Hide value" : "Show value"}
                    >
                        {isVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                )}
            </div>
        </div>
    );
};


export const DashboardHero = ({ month, year }: { month: number; year: number }) => {
    // Use centralized hook for financial data
    const {
        netPosition,
        actualIncome,
        totalInvested,
        netWorth,
        totalSpent,
        isLoading: healthLoading
    } = useFinancialHealth(month, year);

    const { data: budgetGoals, isLoading: budgetLoading } = useBudgetGoals(month, year);
    const { data: appSettings } = useAppSettings();

    const isLoading = healthLoading || budgetLoading;

    if (isLoading) {
        return (
            <Card className="min-h-[200px] flex items-center justify-center">
                <Spinner />
            </Card>
        );
    }

    // Budget Calculations
    const manualBudgetLimit = appSettings?.monthly_budget_limit ? parseFloat(appSettings.monthly_budget_limit) : 0;
    const totalBudgeted = manualBudgetLimit > 0
        ? manualBudgetLimit
        : (budgetGoals?.reduce((sum, goal) => sum + goal.limit_amount, 0) || 0);

    const remainingBudget = totalBudgeted - totalSpent;
    const isOverBudget = remainingBudget < 0;
    const budgetHealth = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

    const accent = isOverBudget
        ? {
            card: 'bg-gradient-to-br from-rose-900 to-rose-950 shadow-rose-900/10 border-rose-800/50',
            heading: 'text-rose-100',
            sub: 'text-rose-200/80',
            subtle: 'text-rose-200/60',
            innerBorder: 'border-rose-500/20',
        }
        : {
            card: 'bg-gradient-to-br from-emerald-900 to-emerald-950 shadow-emerald-900/10 border-emerald-800/50',
            heading: 'text-emerald-100',
            sub: 'text-emerald-200/80',
            subtle: 'text-emerald-200/60',
            innerBorder: 'border-emerald-500/20',
        };
    const HeadingIcon = isOverBudget ? AlertTriangle : Target;

    return (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Primary: Budget Health (2/3 width) */}
            <div
                aria-label={isOverBudget ? `Over budget by ${formatCurrency(Math.abs(remainingBudget))}` : undefined}
                className={clsx(
                    'lg:col-span-2 rounded-2xl p-5 text-white shadow-xl border flex flex-col justify-center',
                    accent.card,
                )}
            >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <p className={clsx('font-medium mb-1 flex items-center gap-2', accent.heading)}>
                            <HeadingIcon className="h-4 w-4" />
                            Monthly Budget
                            {isOverBudget && (
                                <span
                                    role="status"
                                    aria-live="polite"
                                    className="ml-1 inline-flex items-center rounded-full bg-rose-500/20 px-2 py-0.5 text-xs font-semibold text-white ring-1 ring-inset ring-rose-400/30"
                                >
                                    Over budget
                                </span>
                            )}
                        </p>
                        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                            {formatCurrency(remainingBudget)}
                        </h1>
                        <p className={clsx('mt-2 text-sm', accent.sub)}>
                            {isOverBudget ? 'over' : 'remaining of'} {formatCurrency(totalBudgeted)} limit
                        </p>
                    </div>

                    <div className={clsx(
                        'flex-1 max-w-sm w-full bg-black/20 rounded-xl p-4 backdrop-blur-sm border',
                        accent.innerBorder,
                    )}>
                        <div className="flex justify-between text-sm mb-2">
                            <span className={accent.heading}>Spent so far</span>
                            <span className="font-bold">{Math.round(budgetHealth)}%</span>
                        </div>
                        <div className="h-3 w-full bg-black/20 rounded-full overflow-hidden">
                            <div
                                className={clsx(
                                    'h-full rounded-full transition-all duration-500',
                                    budgetHealth > 100 ? 'bg-rose-500' : budgetHealth > 85 ? 'bg-amber-400' : 'bg-emerald-400',
                                )}
                                style={{ width: `${Math.min(budgetHealth, 100)}%` }}
                            />
                        </div>
                        <div className={clsx('flex justify-between text-xs mt-2', accent.subtle)}>
                            <span>{formatCurrency(totalSpent)} spent</span>
                            <span>{formatCurrency(totalBudgeted)} total</span>
                        </div>
                    </div>
                </div>

            </div>

            {/* Secondary: Stats stacked vertically */}
            <div className="flex flex-col gap-3">
                <StatRow
                    label="Net Worth"
                    value={netWorth}
                    icon={Wallet}
                    className="bg-indigo-950/20 border-indigo-900/50"
                    iconClassName="text-indigo-400"
                    isHidable={true}
                />
                <StatRow
                    label="Income"
                    value={actualIncome}
                    icon={TrendingUp}
                    iconClassName="text-emerald-400"
                />
                <StatRow
                    label="Est. Cash Flow"
                    value={netPosition}
                    icon={PiggyBank}
                    iconClassName={netPosition >= 0 ? "text-emerald-400" : "text-rose-400"}
                    valueClassName={netPosition >= 0 ? "text-emerald-400" : "text-rose-400"}
                />
                <StatRow
                    label="Investments"
                    value={totalInvested}
                    icon={Target}
                    iconClassName="text-blue-400"
                />
            </div>
        </section>
    );
};
