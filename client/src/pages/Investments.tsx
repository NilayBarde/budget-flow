import { useMemo, useCallback } from 'react';
import { TrendingUp, TrendingDown, Wallet, RefreshCw, DollarSign, PieChart as PieChartIcon, Building2, EyeOff, Eye } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardHeader, Spinner, Button, EmptyState } from '../components/ui';
import { useInvestmentHoldings, useInvestmentSummary, useSyncAllInvestmentHoldings, useToggleAccountInvestmentExclusion, useAccounts } from '../hooks';
import { formatCurrency } from '../utils/formatters';
import { CHART_TOOLTIP_STYLE, CHART_LABEL_STYLE, CHART_ITEM_STYLE } from '../utils/constants';
import type { Holding, HoldingsByAccount } from '../types';

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

const formatQuantity = (quantity: number): string => {
  if (quantity >= 1) {
    return quantity.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  }
  return quantity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
};

const formatGainLossPercent = (percent: number): string => {
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
};

export const Investments = () => {
  const { data: holdingsData, isLoading: holdingsLoading } = useInvestmentHoldings();
  const { data: summary, isLoading: summaryLoading } = useInvestmentSummary();
  const { data: allAccounts } = useAccounts();
  const syncAllMutation = useSyncAllInvestmentHoldings();
  const toggleAccountExclusionMutation = useToggleAccountInvestmentExclusion();
  
  // Get excluded investment accounts
  const excludedAccounts = useMemo(() => {
    return allAccounts?.filter(acc => acc.exclude_from_investments) || [];
  }, [allAccounts]);

  const handleRefresh = useCallback(() => {
    syncAllMutation.mutate();
  }, [syncAllMutation]);

  const handleToggleAccountExclusion = useCallback((accountId: string, currentlyExcluded: boolean) => {
    toggleAccountExclusionMutation.mutate({
      accountId,
      excludeFromInvestments: !currentlyExcluded,
      exclusionNote: !currentlyExcluded ? 'Unvested/potential equity' : undefined,
    });
  }, [toggleAccountExclusionMutation]);

  // Prepare data for the account breakdown pie chart
  const accountChartData = useMemo(() => {
    if (!holdingsData?.byAccount) return [];
    
    return Object.values(holdingsData.byAccount)
      .filter((acc: HoldingsByAccount) => acc.totalValue > 0)
      .map((acc: HoldingsByAccount, index: number) => ({
        id: acc.account.id,
        name: `${acc.account.institution_name} - ${acc.account.account_name}`,
        value: acc.totalValue,
        color: CHART_COLORS[index % CHART_COLORS.length],
        excluded: (acc.account as { exclude_from_investments?: boolean }).exclude_from_investments ?? false,
      }))
      .sort((a, b) => b.value - a.value);
  }, [holdingsData]);

  const isLoading = holdingsLoading || summaryLoading;
  const hasHoldings = (holdingsData?.holdings?.length ?? 0) > 0;

  if (isLoading) {
    return <Spinner className="py-12" />;
  }

  const investments = summary?.investments;
  const netWorth = summary?.netWorth ?? 0;
  const totalGainLoss = investments?.totalGainLoss ?? 0;
  const totalGainLossPercent = investments?.totalGainLossPercent ?? 0;
  const isPositive = totalGainLoss >= 0;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-100">Investments</h1>
          <p className="text-slate-400 mt-1">Track your portfolio and net worth</p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={syncAllMutation.isPending}
          className="w-full sm:w-auto"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncAllMutation.isPending ? 'animate-spin' : ''}`} />
          {syncAllMutation.isPending ? 'Syncing...' : 'Sync Holdings'}
        </Button>
      </div>

      {!hasHoldings ? (
        <EmptyState
          title="No investment holdings"
          description="Connect an investment account (like Robinhood, Fidelity, or Vanguard) through Plaid to see your holdings here. If you've already connected one, click 'Sync Holdings' to fetch your data."
          icon={<TrendingUp className="h-8 w-8 text-slate-400" />}
          action={
            <Button onClick={handleRefresh} disabled={syncAllMutation.isPending}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncAllMutation.isPending ? 'animate-spin' : ''}`} />
              Sync Holdings
            </Button>
          }
        />
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {/* Net Worth */}
            <Card className="bg-gradient-to-br from-violet-600/20 to-midnight-900 border-violet-500/30" padding="sm">
              <div className="flex items-center justify-between md:block">
                <div>
                  <p className="text-xs md:text-sm text-slate-400">Net Worth</p>
                  <p className="text-lg md:text-2xl font-bold text-violet-300 mt-0.5 md:mt-1">
                    {formatCurrency(netWorth)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 hidden md:block">
                    Investments + Cash − Debt
                  </p>
                </div>
                <div className="p-2 md:p-3 bg-violet-500/20 rounded-xl md:hidden">
                  <Wallet className="h-5 w-5 text-violet-400" />
                </div>
              </div>
              <div className="hidden md:block absolute top-6 right-6">
                <div className="p-3 bg-violet-500/20 rounded-xl">
                  <Wallet className="h-6 w-6 text-violet-400" />
                </div>
              </div>
            </Card>

            {/* Investment Value */}
            <Card className="bg-gradient-to-br from-midnight-800 to-midnight-900" padding="sm">
              <div className="flex items-center justify-between md:block">
                <div>
                  <p className="text-xs md:text-sm text-slate-400">Investments</p>
                  <p className="text-lg md:text-2xl font-bold text-slate-100 mt-0.5 md:mt-1">
                    {formatCurrency(investments?.totalValue ?? 0)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 hidden md:block">
                    {investments?.holdingCount ?? 0} holdings
                  </p>
                </div>
                <div className="p-2 md:p-3 bg-cyan-500/20 rounded-xl md:hidden">
                  <TrendingUp className="h-5 w-5 text-cyan-400" />
                </div>
              </div>
              <div className="hidden md:block absolute top-6 right-6">
                <div className="p-3 bg-cyan-500/20 rounded-xl">
                  <TrendingUp className="h-6 w-6 text-cyan-400" />
                </div>
              </div>
            </Card>

            {/* Total Gain/Loss */}
            <Card className="bg-gradient-to-br from-midnight-800 to-midnight-900" padding="sm">
              <div className="flex items-center justify-between md:block">
                <div>
                  <p className="text-xs md:text-sm text-slate-400">Total Gain/Loss</p>
                  <p className={`text-lg md:text-2xl font-bold mt-0.5 md:mt-1 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatCurrency(totalGainLoss)}
                  </p>
                  <p className={`text-xs mt-1 hidden md:block ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {formatGainLossPercent(totalGainLossPercent)}
                  </p>
                </div>
                <div className={`p-2 md:p-3 rounded-xl md:hidden ${isPositive ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`}>
                  {isPositive 
                    ? <TrendingUp className="h-5 w-5 text-emerald-400" />
                    : <TrendingDown className="h-5 w-5 text-rose-400" />
                  }
                </div>
              </div>
              <div className="hidden md:block absolute top-6 right-6">
                <div className={`p-3 rounded-xl ${isPositive ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`}>
                  {isPositive 
                    ? <TrendingUp className="h-6 w-6 text-emerald-400" />
                    : <TrendingDown className="h-6 w-6 text-rose-400" />
                  }
                </div>
              </div>
            </Card>

            {/* Cash Balance (Net: Assets - Liabilities) */}
            <Card className="bg-gradient-to-br from-midnight-800 to-midnight-900" padding="sm">
              <div className="flex items-center justify-between md:block">
                <div>
                  <p className="text-xs md:text-sm text-slate-400">Cash (Net)</p>
                  <p className={`text-lg md:text-2xl font-bold mt-0.5 md:mt-1 ${(summary?.cash?.netBalance ?? 0) >= 0 ? 'text-slate-100' : 'text-rose-400'}`}>
                    {formatCurrency(summary?.cash?.netBalance ?? 0)}
                  </p>
                  <div className="text-xs text-slate-500 mt-1 hidden md:block">
                    <span className="text-emerald-400">{formatCurrency(summary?.cash?.totalAssets ?? 0)}</span>
                    {(summary?.cash?.totalLiabilities ?? 0) > 0 && (
                      <span className="text-rose-400"> − {formatCurrency(summary?.cash?.totalLiabilities ?? 0)}</span>
                    )}
                  </div>
                </div>
                <div className="p-2 md:p-3 bg-amber-500/20 rounded-xl md:hidden">
                  <DollarSign className="h-5 w-5 text-amber-400" />
                </div>
              </div>
              <div className="hidden md:block absolute top-6 right-6">
                <div className="p-3 bg-amber-500/20 rounded-xl">
                  <DollarSign className="h-6 w-6 text-amber-400" />
                </div>
              </div>
            </Card>
          </div>

          {/* Holdings Table and Account Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            {/* Holdings Table (desktop) / Cards (mobile) */}
            <Card className="lg:col-span-2" padding="sm">
              <CardHeader title="Holdings" subtitle={`${investments?.holdingCount ?? 0} positions`} />

              {/* Mobile: Card layout */}
              <div className="md:hidden space-y-3">
                {holdingsData?.holdings?.map((holding: Holding) => {
                  const rawCostBasis = holding.cost_basis ?? 0;
                  const value = holding.institution_value ?? 0;
                  const isBadData = rawCostBasis > 0 && Math.abs(rawCostBasis - value) > value * 10;
                  const costBasis = isBadData ? 0 : rawCostBasis;
                  const gainLoss = isBadData ? null : (value - costBasis);
                  const gainLossPercent = (!isBadData && costBasis > 0) ? ((value - costBasis) / costBasis) * 100 : 0;
                  const holdingIsPositive = (gainLoss ?? 0) >= 0;
                  const security = holding.security;
                  const account = holding.account;

                  return (
                    <div key={holding.id} className="p-3 bg-midnight-800/50 rounded-lg border border-midnight-700">
                      {/* Row 1: Ticker + Value */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-100">
                            {security?.ticker_symbol || security?.name || 'Unknown'}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {security?.name}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-medium text-slate-100">{formatCurrency(value)}</p>
                          {isBadData ? (
                            <p className="text-xs text-amber-400">⚠️ Bad data</p>
                          ) : (
                            <p className={`text-xs ${holdingIsPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {formatCurrency(gainLoss ?? 0)} ({formatGainLossPercent(gainLossPercent)})
                            </p>
                          )}
                        </div>
                      </div>
                      {/* Row 2: Details */}
                      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-midnight-700">
                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span>{formatQuantity(holding.quantity)} shares</span>
                          <span>@ {security?.close_price ? formatCurrency(security.close_price) : '-'}</span>
                        </div>
                        <p className="text-xs text-slate-500 truncate max-w-[120px]">
                          {account?.institution_name || ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: Table layout */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-midnight-700">
                      <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">
                        Security
                      </th>
                      <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">
                        Shares
                      </th>
                      <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">
                        Price
                      </th>
                      <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">
                        Value
                      </th>
                      <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">
                        Gain/Loss
                      </th>
                      <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">
                        Account
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-midnight-700">
                    {holdingsData?.holdings?.map((holding: Holding) => {
                      const rawCostBasis = holding.cost_basis ?? 0;
                      const value = holding.institution_value ?? 0;
                      const isBadData = rawCostBasis > 0 && Math.abs(rawCostBasis - value) > value * 10;
                      const costBasis = isBadData ? 0 : rawCostBasis;
                      const gainLoss = isBadData ? null : (value - costBasis);
                      const gainLossPercent = (!isBadData && costBasis > 0) ? ((value - costBasis) / costBasis) * 100 : 0;
                      const holdingIsPositive = (gainLoss ?? 0) >= 0;
                      const security = holding.security;
                      const account = holding.account;

                      return (
                        <tr key={holding.id} className="hover:bg-midnight-800/50 transition-colors">
                          <td className="py-3 px-4">
                            <div>
                              <p className="font-medium text-slate-100">
                                {security?.ticker_symbol || security?.name || 'Unknown'}
                              </p>
                              <p className="text-xs text-slate-500 truncate max-w-[200px]">
                                {security?.name}
                              </p>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right text-slate-300">
                            {formatQuantity(holding.quantity)}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-300">
                            {security?.close_price ? formatCurrency(security.close_price) : '-'}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-slate-100">
                            {formatCurrency(value)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {isBadData ? (
                              <div className="text-amber-400 text-xs" title="Cost basis data from institution appears incorrect">
                                <p className="font-medium">⚠️ Bad data</p>
                                <p className="text-[10px]">Report to Plaid</p>
                              </div>
                            ) : (
                              <div className={holdingIsPositive ? 'text-emerald-400' : 'text-rose-400'}>
                                <p className="font-medium">{formatCurrency(gainLoss ?? 0)}</p>
                                <p className="text-xs">{formatGainLossPercent(gainLossPercent)}</p>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="max-w-[150px]">
                              <p className="text-sm text-slate-300 truncate">
                                {account?.account_name || account?.account_type || '-'}
                              </p>
                              <p className="text-xs text-slate-500 truncate">
                                {account?.institution_name || ''}
                              </p>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Account Breakdown */}
            <Card padding="sm">
              <CardHeader title="By Account" subtitle="Investment allocation" />
              {accountChartData.length > 0 ? (
                <div className="space-y-4">
                  <div className="h-48 md:h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={accountChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={70}
                          paddingAngle={2}
                        >
                          {accountChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => formatCurrency(value as number)}
                          contentStyle={CHART_TOOLTIP_STYLE}
                          labelStyle={CHART_LABEL_STYLE}
                          itemStyle={CHART_ITEM_STYLE}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {accountChartData.map((item, index) => (
                      <div key={index} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-xs sm:text-sm text-slate-300 truncate">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 pl-5 sm:pl-0">
                          <span className="text-xs sm:text-sm font-medium text-slate-100">
                            {formatCurrency(item.value)}
                          </span>
                          <button
                            onClick={() => handleToggleAccountExclusion(item.id, item.excluded)}
                            className="p-1.5 sm:p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Exclude this account from investments (e.g., unvested equity)"
                          >
                            <EyeOff className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                  <PieChartIcon className="h-8 w-8 mb-2" />
                  <p className="text-sm">No account data</p>
                </div>
              )}
              
              {/* Excluded Accounts */}
              {excludedAccounts.length > 0 && (
                <div className="mt-4 pt-4 border-t border-midnight-700">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                    Excluded from Portfolio
                  </p>
                  <div className="space-y-2">
                    {excludedAccounts.map((account) => (
                      <div key={account.id} className="flex items-center justify-between gap-2 opacity-60">
                        <span className="text-xs sm:text-sm text-slate-400 truncate">
                          {account.institution_name} - {account.account_name}
                        </span>
                        <button
                          onClick={() => handleToggleAccountExclusion(account.id, true)}
                          className="p-1.5 sm:p-1 rounded text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors flex-shrink-0"
                          title="Include this account in investments"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Accounts List */}
          <Card padding="sm">
            <CardHeader title="All Accounts" subtitle="Investment and cash accounts" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
              {summary?.accounts?.map((account) => {
                const iconBg = account.isInvestment ? 'bg-violet-500/20' : account.isLiability ? 'bg-rose-500/20' : 'bg-emerald-500/20';
                const icon = account.isInvestment
                  ? <TrendingUp className="h-4 w-4 text-violet-400" />
                  : account.isLiability
                    ? <Building2 className="h-4 w-4 text-rose-400" />
                    : <Building2 className="h-4 w-4 text-emerald-400" />;

                return (
                  <div 
                    key={account.id}
                    className="flex items-center gap-2.5 md:gap-3 p-2.5 md:p-3 bg-midnight-800/50 rounded-lg border border-midnight-700"
                  >
                    <div className={`p-1.5 md:p-2 rounded-lg flex-shrink-0 ${iconBg}`}>
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs md:text-sm font-medium text-slate-100 truncate">{account.name}</p>
                      <p className="text-[10px] md:text-xs text-slate-500 capitalize">{account.type}</p>
                    </div>
                    <p className={`text-xs md:text-sm font-medium flex-shrink-0 ${account.isLiability ? 'text-rose-400' : 'text-slate-100'}`}>
                      {account.balance !== null ? formatCurrency(account.balance) : '-'}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
};
