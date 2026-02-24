import { useState } from 'react';
import { Wallet, PiggyBank, Target, Eye, EyeOff } from 'lucide-react';
import { Card, Spinner } from '../ui';
import { formatCurrency } from '../../utils/formatters';
import { useBudgetGoals, useAppSettings, useFinancialHealth } from '../../hooks';

interface StatCardProps {
    label: string;
    value: number;
    icon: React.ElementType;
    subtext?: string;
    className?: string;
    iconClassName?: string;
    formatter?: (val: number) => string;
    isHidable?: boolean;
}

const StatCard = ({
    label,
    value,
    icon: Icon,
    subtext,
    className = "",
    iconClassName = "",
    formatter = formatCurrency,
    isHidable = false
}: StatCardProps) => {
    const [isVisible, setIsVisible] = useState(!isHidable);

    return (
        <div className={`p-4 rounded-xl border border-midnight-700 bg-midnight-800/50 transition-all duration-300 ${className}`}>
            <div className="flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-400">{label}</p>
                        {isHidable && (
                            <button
                                onClick={() => setIsVisible(!isVisible)}
                                className="text-slate-500 hover:text-slate-300 transition-colors"
                                title={isVisible ? "Hide value" : "Show value"}
                            >
                                {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                        )}
                    </div>
                    <h3 className="text-2xl font-bold text-slate-100 mt-1 transition-all duration-300">
                        {isVisible ? formatter(value) : '••••••'}
                    </h3>
                    {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
                </div>
                <div className={`p-2 rounded-lg bg-midnight-700/50 ${iconClassName}`}>
                    <Icon className="h-5 w-5" />
                </div>
            </div>
        </div>
    );
};


export const DashboardHero = ({ month, year }: { month: number; year: number }) => {
    // Use centralized hook for financial data
    const {
        netPosition,
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

    const remainingBudget = Math.max(0, totalBudgeted - totalSpent);
    const budgetHealth = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;



    return (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Primary: Budget Health (Takes up 2 cols on LG) */}
            <div className="lg:col-span-2 relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-900 to-emerald-950 p-6 md:p-8 text-white shadow-xl shadow-emerald-900/10 border border-emerald-800/50">
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <p className="text-emerald-100 font-medium mb-1 flex items-center gap-2">
                            <Target className="h-4 w-4" />
                            Monthly Budget
                        </p>
                        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                            {formatCurrency(remainingBudget)}
                        </h1>
                        <p className="text-emerald-200/80 mt-2 text-sm">
                            remaining of {formatCurrency(totalBudgeted)} limit
                        </p>
                    </div>

                    <div className="flex-1 max-w-sm w-full bg-black/20 rounded-xl p-4 backdrop-blur-sm border border-emerald-500/20">
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-emerald-100">Spent so far</span>
                            <span className="font-bold">{Math.round(budgetHealth)}%</span>
                        </div>
                        <div className="h-3 w-full bg-black/20 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${budgetHealth > 100 ? 'bg-rose-500' :
                                    budgetHealth > 85 ? 'bg-amber-400' : 'bg-emerald-400'
                                    }`}
                                style={{ width: `${Math.min(budgetHealth, 100)}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-xs text-emerald-200/60 mt-2">
                            <span>{formatCurrency(totalSpent)} spent</span>
                            <span>{formatCurrency(totalBudgeted)} total</span>
                        </div>
                    </div>
                </div>

                {/* Background Decoration */}
                <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-white/5 to-transparent pointer-events-none" />
                <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
            </div>

            {/* Secondary: Net Worth & Savings (Stacked in 1 col) */}
            <div className="space-y-4">
                <StatCard
                    label="Net Worth"
                    value={netWorth}
                    icon={Wallet}
                    className="bg-indigo-950/20 border-indigo-900/50"
                    iconClassName="text-indigo-400"
                    isHidable={true}
                />

                <div className="grid grid-cols-2 gap-4">
                    <StatCard
                        label="Est. Cash Flow"
                        value={netPosition}
                        icon={PiggyBank}
                        className="bg-midnight-800/50"
                        iconClassName={netPosition >= 0 ? "text-emerald-400" : "text-rose-400"}
                    />
                    <StatCard
                        label="Investments"
                        value={totalInvested}
                        icon={Target} // Using Target icon for investments
                        className="bg-midnight-800/50"
                        iconClassName="text-blue-400"
                    />
                </div>
            </div>
        </section>
    );
};
