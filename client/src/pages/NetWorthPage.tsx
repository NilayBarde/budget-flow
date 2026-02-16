import { useCallback, useMemo } from 'react';
import { NetWorthGoalCard } from '../components/plan';
import type { RecurringContribution } from '../components/plan';
import {
    useUpdateAppSetting,
    useAppSettings,
    useFinancialHealth,
    useInvestmentSummary,
    useMonthNavigation,
} from '../hooks';
import { Spinner } from '../components/ui';

export const NetWorthPage = () => {
    const { currentDate } = useMonthNavigation();
    const { data: appSettings } = useAppSettings();
    const updateSetting = useUpdateAppSetting();

    // Use centralized financial hook
    const {
        estimatedSavings,
        totalInvested,
        netWorth,
        isLoading: healthLoading,
    } = useFinancialHealth(currentDate.month, currentDate.year);

    const { data: investmentSummary } = useInvestmentSummary();
    const totalInvestmentValue = investmentSummary?.investments.totalValue ?? 0;

    // Calculated values from financial hook
    const calculatedSavingsRate = Math.max(estimatedSavings, 0);
    const calculatedMonthlyInvested = totalInvested;
    const calculatedCashRetained = Math.max(calculatedSavingsRate - calculatedMonthlyInvested, 0);

    // Manual overrides for projection inputs
    const manualCashSavings = appSettings?.net_worth_monthly_cash_savings
        ? parseFloat(appSettings.net_worth_monthly_cash_savings)
        : null;
    const manualInvestments = appSettings?.net_worth_monthly_investments
        ? parseFloat(appSettings.net_worth_monthly_investments)
        : null;
    const isManualSavings = manualCashSavings !== null || manualInvestments !== null;

    // Effective values for projection (manual if set, calculated otherwise)
    const effectiveCashSavings = manualCashSavings ?? calculatedCashRetained;
    const effectiveInvestments = manualInvestments ?? calculatedMonthlyInvested;

    const netWorthGoalAmount = appSettings?.net_worth_goal_amount
        ? parseFloat(appSettings.net_worth_goal_amount)
        : 0;
    const netWorthGoalYear = appSettings?.net_worth_goal_year
        ? parseInt(appSettings.net_worth_goal_year, 10)
        : 0;
    const netWorthContributions: RecurringContribution[] = useMemo(() => {
        try {
            return appSettings?.net_worth_contributions
                ? JSON.parse(appSettings.net_worth_contributions)
                : [];
        } catch {
            return [];
        }
    }, [appSettings?.net_worth_contributions]);
    const estimatedReturnRate = appSettings?.net_worth_estimated_return
        ? parseFloat(appSettings.net_worth_estimated_return)
        : 0;
    const cashReturnRate = appSettings?.net_worth_cash_return_rate
        ? parseFloat(appSettings.net_worth_cash_return_rate)
        : 0;

    // Generic setting save helper
    const saveSetting = useCallback(
        (key: string, value: string) => updateSetting.mutate({ key, value }),
        [updateSetting],
    );

    const handleSaveNetWorthGoal = useCallback(
        (amount: number, year: number) => {
            saveSetting('net_worth_goal_amount', amount.toString());
            saveSetting('net_worth_goal_year', year.toString());
        },
        [saveSetting],
    );

    const handleSaveContributions = useCallback(
        (contributions: RecurringContribution[]) => {
            saveSetting('net_worth_contributions', JSON.stringify(contributions));
        },
        [saveSetting],
    );

    const handleSaveReturnRate = useCallback(
        (rate: number) => saveSetting('net_worth_estimated_return', rate.toString()),
        [saveSetting],
    );

    const handleSaveCashReturnRate = useCallback(
        (rate: number) => saveSetting('net_worth_cash_return_rate', rate.toString()),
        [saveSetting],
    );

    const handleSaveMonthlyInputs = useCallback(
        (cashSavings: number | null, investments: number | null) => {
            saveSetting('net_worth_monthly_cash_savings', cashSavings !== null ? cashSavings.toString() : '');
            saveSetting('net_worth_monthly_investments', investments !== null ? investments.toString() : '');
        },
        [saveSetting],
    );

    return (
        <div className="space-y-4 md:space-y-6">
            <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-100">Net Worth Goal</h1>
                <p className="text-slate-400 mt-1">Track and project your net worth growth</p>
            </div>

            {healthLoading ? (
                <Spinner className="py-12" />
            ) : (
                <NetWorthGoalCard
                    currentNetWorth={netWorth}
                    effectiveCashSavings={effectiveCashSavings}
                    effectiveInvestments={effectiveInvestments}
                    calculatedCashRetained={calculatedCashRetained}
                    calculatedMonthlyInvested={calculatedMonthlyInvested}
                    isManualSavings={isManualSavings}
                    manualCashSavings={manualCashSavings}
                    manualInvestments={manualInvestments}
                    totalInvestmentValue={totalInvestmentValue}
                    estimatedReturnRate={estimatedReturnRate}
                    cashReturnRate={cashReturnRate}
                    goalAmount={netWorthGoalAmount}
                    goalYear={netWorthGoalYear}
                    contributions={netWorthContributions}
                    onSaveGoal={handleSaveNetWorthGoal}
                    onSaveContributions={handleSaveContributions}
                    onSaveReturnRate={handleSaveReturnRate}
                    onSaveCashReturnRate={handleSaveCashReturnRate}
                    onSaveMonthlyInputs={handleSaveMonthlyInputs}
                />
            )}
        </div>
    );
};
