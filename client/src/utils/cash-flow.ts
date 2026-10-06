interface CashFlowInput {
    actualIncome: number;
    expectedIncome: number;
    totalSpent: number;
    totalInvested: number;
    isCurrentMonth: boolean;
}

interface CashFlowResult {
    /** Income actually received minus spending and investing. */
    cashFlow: number;
    /** Where the current month lands once the expected income arrives; null for finished months. */
    projectedCashFlow: number | null;
}

/**
 * Cash flow always uses income that actually arrived. The expected income setting is only a
 * forecast, so it is used for the current month's projection and never for a finished month.
 */
export const computeCashFlow = ({
    actualIncome,
    expectedIncome,
    totalSpent,
    totalInvested,
    isCurrentMonth,
}: CashFlowInput): CashFlowResult => ({
    cashFlow: actualIncome - totalSpent - totalInvested,
    // Income already received can exceed the expectation, and a projection must never read
    // lower than the cash flow so far.
    projectedCashFlow:
        isCurrentMonth && expectedIncome > 0
            ? Math.max(expectedIncome, actualIncome) - totalSpent - totalInvested
            : null,
});
