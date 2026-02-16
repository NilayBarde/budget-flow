import { useMemo, useCallback } from 'react';
import { TrendingUp, Wallet, DollarSign, PieChart as PieChartIcon } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, Spinner, Button, EmptyState } from '../components/ui';
import { useInvestmentSummary, useToggleAccountInvestmentExclusion, useAccounts } from '../hooks';
import { formatCurrency } from '../utils/formatters';
import { CHART_TOOLTIP_STYLE, CHART_ITEM_STYLE } from '../utils/constants';

// Colors for the pie chart
const CHART_COLORS = [
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#6366f1', // indigo
  '#84cc16', // lime
];

export const Investments = () => {
  const { data: summary, isLoading: summaryLoading } = useInvestmentSummary();
  const { data: allAccounts } = useAccounts();
  const toggleAccountExclusionMutation = useToggleAccountInvestmentExclusion();

  // Get excluded investment accounts
  const excludedAccounts = useMemo(() => {
    return allAccounts?.filter(acc => acc.exclude_from_investments) || [];
  }, [allAccounts]);

  const handleToggleAccountExclusion = useCallback((accountId: string, currentlyExcluded: boolean) => {
    toggleAccountExclusionMutation.mutate({
      accountId,
      excludeFromInvestments: !currentlyExcluded,
      exclusionNote: !currentlyExcluded ? 'Unvested/potential equity' : undefined,
    });
  }, [toggleAccountExclusionMutation]);

  // Prepare data for the account breakdown pie chart
  const accountChartData = useMemo(() => {
    if (!summary?.accounts) return [];

    return summary.accounts
      .filter((acc: any) => acc.isInvestment && !acc.excluded && (acc.balance || 0) > 0)
      .map((acc: any, index: number) => ({
        id: acc.id,
        name: acc.name,
        value: acc.balance || 0,
        color: CHART_COLORS[index % CHART_COLORS.length],
        excluded: acc.excluded,
      }))
      .sort((a, b) => b.value - a.value);
  }, [summary]);

  const isLoading = summaryLoading;
  const hasAccounts = (summary?.investments?.accountCount ?? 0) > 0;

  if (isLoading) {
    return <Spinner className="py-12" />;
  }

  const investments = summary?.investments;
  const netWorth = summary?.netWorth ?? 0;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-100">Investments</h1>
          <p className="text-slate-400 mt-1">Track your portfolio (Balance Only)</p>
        </div>
      </div>

      {hasAccounts ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            <Card padding="sm">
              <div className="flex items-center gap-3">
                <div className="p-2 md:p-3 bg-midnight-800 rounded-lg">
                  <Wallet className="h-5 w-5 md:h-6 md:w-6 text-accent-400" />
                </div>
                <div>
                  <p className="text-xs md:text-sm text-slate-400 font-medium">Total Invested</p>
                  <p className="text-xl md:text-2xl font-bold text-slate-100 mt-0.5">
                    {formatCurrency(investments?.totalValue || 0)}
                  </p>
                </div>
              </div>
            </Card>

            <Card padding="sm">
              <div className="flex items-center gap-3">
                <div className="p-2 md:p-3 bg-midnight-800 rounded-lg">
                  <DollarSign className="h-5 w-5 md:h-6 md:w-6 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs md:text-sm text-slate-400 font-medium">Net Worth</p>
                  <p className="text-xl md:text-2xl font-bold text-slate-100 mt-0.5">
                    {formatCurrency(netWorth)}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Account Allocation Chart */}
            <div className="lg:col-span-2">
              <Card>
                <div className="flex items-center gap-2 px-6 pt-6 mb-2">
                  <PieChartIcon className="h-5 w-5 text-accent-400" />
                  <h3 className="font-semibold text-slate-100">Portfolio Allocation</h3>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={accountChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {accountChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        itemStyle={CHART_ITEM_STYLE}
                        formatter={(value: any) => formatCurrency(Number(value))}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {accountChartData.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                      <div className="flex-1 truncate text-slate-300">{entry.name}</div>
                      <div className="font-medium text-slate-200">{formatCurrency(entry.value)}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Excluded Accounts List */}
            <div>
              <Card className="h-full">
                <div className="px-6 pt-6 mb-4">
                  <h3 className="font-semibold text-slate-100">Excluded Accounts</h3>
                </div>
                {excludedAccounts.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-400 mb-4">
                      These accounts are tracked but excluded from your investment totals.
                    </p>
                    {excludedAccounts.map(account => (
                      <div key={account.id} className="flex items-start justify-between p-3 bg-midnight-800 rounded-lg border border-midnight-700">
                        <div>
                          <p className="text-sm font-medium text-slate-200">{account.institution_name}</p>
                          <p className="text-xs text-slate-400">{account.account_name}</p>
                          <p className="text-sm font-bold text-slate-300 mt-1">
                            {formatCurrency(account.current_balance || 0)}
                          </p>
                          {account.investment_exclusion_note && (
                            <p className="text-xs text-amber-500/80 mt-1 italic">
                              "{account.investment_exclusion_note}"
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleAccountExclusion(account.id, true)}
                          disabled={toggleAccountExclusionMutation.isPending}
                          className="h-8 w-8 p-0 text-slate-500 hover:text-emerald-400"
                          title="Include in investments"
                        >
                          <TrendingUp className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500 px-6 pb-6">
                    <p>No excluded accounts.</p>
                    <p className="text-xs mt-2">
                      To exclude an account (e.g. unvested equity), go to the Accounts page.
                    </p>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </>
      ) : (
        <EmptyState
          title="No investment accounts"
          description="Connect an investment account to see your portfolio overview."
          icon={<Wallet className="h-8 w-8 text-slate-400" />}
        />
      )}
    </div>
  );
};
