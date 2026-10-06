import { useMonthlyStats } from './useBudget';
import { useExpectedIncome } from './useAppSettings';
import { useInvestmentSummary } from './useInvestments';
import { computeCashFlow } from '../utils/cash-flow';

export const useFinancialHealth = (month: number, year: number) => {
    const { data: stats, isLoading: statsLoading } = useMonthlyStats(month, year);
    const { expectedIncome, isLoading: incomeLoading } = useExpectedIncome();
    const { data: investmentSummary, isLoading: investmentLoading } = useInvestmentSummary();

    const actualIncome = stats?.total_income || 0;
    const totalSpent = stats?.total_spent || 0;
    const totalInvested = stats?.total_invested || 0;
    const pendingSpent = stats?.pending_spent || 0;

    // Estimated Savings: Money remaining after expenses, available for saving or investing
    const estimatedSavings = expectedIncome - totalSpent;

    // Cash flow remaining after expenses AND investments, from income actually received
    const now = new Date();
    const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
    const { cashFlow: netPosition, projectedCashFlow } = computeCashFlow({
        actualIncome,
        expectedIncome,
        totalSpent,
        totalInvested,
        isCurrentMonth,
    });

    // Savings Rate: Percentage of income saved (before investments)
    const savingsRate = expectedIncome > 0
        ? (estimatedSavings / expectedIncome) * 100
        : 0;

    return {
        expectedIncome,
        actualIncome,
        totalSpent,
        totalInvested,
        pendingSpent,
        estimatedSavings,
        netPosition,
        projectedCashFlow,
        isCurrentMonth,
        savingsRate,
        netWorth: investmentSummary?.netWorth ?? 0,
        isLoading: statsLoading || incomeLoading || investmentLoading,
    };
};
