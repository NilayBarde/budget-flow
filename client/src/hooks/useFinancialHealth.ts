import { useMonthlyStats } from './useBudget';
import { useExpectedIncome } from './useAppSettings';
import { useInvestmentSummary } from './useInvestments';

export const useFinancialHealth = (month: number, year: number) => {
    const { data: stats, isLoading: statsLoading } = useMonthlyStats(month, year);
    const { expectedIncome, isLoading: incomeLoading } = useExpectedIncome();
    const { data: investmentSummary, isLoading: investmentLoading } = useInvestmentSummary();

    const actualIncome = stats?.total_income || 0;
    const totalSpent = stats?.total_spent || 0;
    const totalInvested = stats?.total_invested || 0;

    // Estimated Savings: Money remaining after expenses, available for saving or investing
    const estimatedSavings = expectedIncome - totalSpent;

    // Net Position: Cash flow remaining after expenses AND investments
    const netPosition = expectedIncome - totalSpent - totalInvested;

    // Savings Rate: Percentage of income saved (before investments)
    const savingsRate = expectedIncome > 0
        ? (estimatedSavings / expectedIncome) * 100
        : 0;

    return {
        expectedIncome,
        actualIncome,
        totalSpent,
        totalInvested,
        estimatedSavings,
        netPosition,
        savingsRate,
        netWorth: investmentSummary?.netWorth ?? 0,
        isLoading: statsLoading || incomeLoading || investmentLoading,
    };
};
