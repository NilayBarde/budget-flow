import { useMemo, useCallback } from 'react';
import { TrendingUp, TrendingDown, Wallet, RefreshCw, DollarSign, PieChart as PieChartIcon, Building2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardHeader, Spinner, Button, EmptyState } from '../components/ui';
import { useInvestmentHoldings, useInvestmentSummary, useSyncAllInvestmentHoldings } from '../hooks';
import { formatCurrency } from '../utils/formatters';
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
  const syncAllMutation = useSyncAllInvestmentHoldings();

  const handleRefresh = useCallback(() => {
    syncAllMutation.mutate();
  }, [syncAllMutation]);

  // Prepare data for the account breakdown pie chart
  const accountChartData = useMemo(() => {
    if (!holdingsData?.byAccount) return [];
    
    return Object.values(holdingsData.byAccount)
      .filter((acc: HoldingsByAccount) => acc.totalValue > 0)
      .map((acc: HoldingsByAccount, index: number) => ({
        name: `${acc.account.institution_name} - ${acc.account.account_name}`,
        value: acc.totalValue,
        color: CHART_COLORS[index % CHART_COLORS.length],
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
            {/* Holdings Table */}
            <Card className="lg:col-span-2" padding="sm">
              <CardHeader title="Holdings" subtitle={`${investments?.holdingCount ?? 0} positions`} />
              <div className="overflow-x-auto -mx-4 md:mx-0">
                <table className="w-full min-w-[600px]">
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
                      const costBasis = holding.cost_basis ?? 0;
                      const value = holding.institution_value ?? 0;
                      const gainLoss = value - costBasis;
                      const gainLossPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;
                      const holdingIsPositive = gainLoss >= 0;
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
                            <div className={holdingIsPositive ? 'text-emerald-400' : 'text-rose-400'}>
                              <p className="font-medium">{formatCurrency(gainLoss)}</p>
                              <p className="text-xs">{formatGainLossPercent(gainLossPercent)}</p>
                            </div>
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
                  <div className="h-48">
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
                          contentStyle={{
                            backgroundColor: '#252a3d',
                            border: '1px solid #3a4160',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                          }}
                          labelStyle={{ color: '#f1f5f9', fontWeight: 500 }}
                          itemStyle={{ color: '#cbd5e1' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {accountChartData.map((item, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-sm text-slate-300 truncate">{item.name}</span>
                        </div>
                        <span className="text-sm font-medium text-slate-100 ml-2 flex-shrink-0">
                          {formatCurrency(item.value)}
                        </span>
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
            </Card>
          </div>

          {/* Accounts List */}
          <Card padding="sm">
            <CardHeader title="All Accounts" subtitle="Investment and cash accounts" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {summary?.accounts?.map((account) => (
                <div 
                  key={account.id}
                  className="flex items-center gap-3 p-3 bg-midnight-800/50 rounded-lg border border-midnight-700"
                >
                  <div className={`p-2 rounded-lg ${account.isInvestment ? 'bg-violet-500/20' : 'bg-emerald-500/20'}`}>
                    {account.isInvestment 
                      ? <TrendingUp className="h-4 w-4 text-violet-400" />
                      : <Building2 className="h-4 w-4 text-emerald-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">{account.name}</p>
                    <p className="text-xs text-slate-500 capitalize">{account.type}</p>
                  </div>
                  <p className="text-sm font-medium text-slate-100">
                    {account.balance !== null ? formatCurrency(account.balance) : '-'}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
};
