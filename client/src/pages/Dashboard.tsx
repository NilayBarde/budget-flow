import { useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, TrendingUp, Wallet, RefreshCw } from 'lucide-react';
import { Card, CardHeader, Spinner, Button, MonthSelector, CategoryPieChart } from '../components/ui';
import { useMonthlyStats, useExpectedIncome, useMonthNavigation } from '../hooks';
import { formatCurrency } from '../utils/formatters';

import { MONTHS } from '../utils/constants';
import { useQueryClient } from '@tanstack/react-query';

export const Dashboard = () => {
  const { currentDate, handlePrevMonth, handleNextMonth } = useMonthNavigation();
  const queryClient = useQueryClient();
  
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useMonthlyStats(currentDate.month, currentDate.year);

  const { expectedIncome } = useExpectedIncome();
  
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['stats'] });
    refetchStats();
  };

  const totalSpent = stats?.total_spent || 0;
  const totalIncome = stats?.total_income || 0;
  const totalInvested = stats?.total_invested || 0;
  const netSavings = totalIncome - totalSpent;

  const categoryData = useMemo(() => {
    if (!stats?.by_category) return [];
    return stats.by_category
      .filter(c => c.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [stats]);



  if (statsLoading) {
    return <Spinner className="py-12" />;
  }

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header with Month Selector - Stacked on mobile */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-slate-400 mt-1">Your financial overview</p>
        </div>
        
        <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto">
          {/* Refresh Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={statsLoading}
            className="text-slate-400 hover:text-slate-200"
            title="Refresh data"
          >
            <RefreshCw className={`h-4 w-4 ${(statsLoading) ? 'animate-spin' : ''}`} />
          </Button>
          
          {/* Month Selector */}
          <MonthSelector
            month={currentDate.month}
            year={currentDate.year}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
            className="flex-1 md:flex-initial !p-1.5 md:!p-2"
          />
        </div>
      </div>

      {/* Stats Cards - 2x2 grid on mobile, 4 across on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        <Card className="bg-gradient-to-br from-midnight-800 to-midnight-900" padding="sm">
          <div className="flex items-center justify-between md:block">
            <div>
              <p className="text-xs md:text-sm text-slate-400">Total Spent</p>
              <p className="text-lg md:text-2xl font-bold text-slate-100 mt-0.5 md:mt-1">
                {formatCurrency(totalSpent)}
              </p>
            </div>
            <div className="p-2 md:p-3 bg-rose-500/20 rounded-xl md:hidden">
              <ArrowUpRight className="h-5 w-5 text-rose-400" />
            </div>
          </div>
          <div className="hidden md:block absolute top-6 right-6">
            <div className="p-3 bg-rose-500/20 rounded-xl">
              <ArrowUpRight className="h-6 w-6 text-rose-400" />
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-midnight-800 to-midnight-900" padding="sm">
          <div className="flex items-center justify-between md:block">
            <div>
              <p className="text-xs md:text-sm text-slate-400">Total Income</p>
              <p className="text-lg md:text-2xl font-bold text-slate-100 mt-0.5 md:mt-1">
                {formatCurrency(totalIncome)}
              </p>
              {expectedIncome > 0 && (
                <p className="text-[10px] md:text-xs text-slate-500 mt-0.5">
                  of {formatCurrency(expectedIncome)} expected
                </p>
              )}
            </div>
            <div className="p-2 md:p-3 bg-emerald-500/20 rounded-xl md:hidden">
              <ArrowDownRight className="h-5 w-5 text-emerald-400" />
            </div>
          </div>
          <div className="hidden md:block absolute top-6 right-6">
            <div className="p-3 bg-emerald-500/20 rounded-xl">
              <ArrowDownRight className="h-6 w-6 text-emerald-400" />
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-midnight-800 to-midnight-900" padding="sm">
          <div className="flex items-center justify-between md:block">
            <div>
              <p className="text-xs md:text-sm text-slate-400">Total Invested</p>
              <p className="text-lg md:text-2xl font-bold text-violet-400 mt-0.5 md:mt-1">
                {formatCurrency(totalInvested)}
              </p>
            </div>
            <div className="p-2 md:p-3 bg-violet-500/20 rounded-xl md:hidden">
              <TrendingUp className="h-5 w-5 text-violet-400" />
            </div>
          </div>
          <div className="hidden md:block absolute top-6 right-6">
            <div className="p-3 bg-violet-500/20 rounded-xl">
              <TrendingUp className="h-6 w-6 text-violet-400" />
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-midnight-800 to-midnight-900" padding="sm">
          <div className="flex items-center justify-between md:block">
            <div>
              <p className="text-xs md:text-sm text-slate-400">Net Savings</p>
              <p className={`text-lg md:text-2xl font-bold mt-0.5 md:mt-1 ${netSavings >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatCurrency(netSavings)}
              </p>
            </div>
            <div className={`p-2 md:p-3 rounded-xl md:hidden ${netSavings >= 0 ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`}>
              <Wallet className={`h-5 w-5 ${netSavings >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} />
            </div>
          </div>
          <div className="hidden md:block absolute top-6 right-6">
            <div className={`p-3 rounded-xl ${netSavings >= 0 ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`}>
              <Wallet className={`h-6 w-6 ${netSavings >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} />
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Row - Full width stacked on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Spending by Category */}
        <Card padding="sm">
          <CardHeader title="Spending by Category" subtitle={`${MONTHS[currentDate.month - 1]} ${currentDate.year}`} />
          <CategoryPieChart
            data={categoryData}
            emptyMessage="No spending data for this month"
          />
        </Card>

        {/* Budget Status */}

      </div>
    </div>
  );
};
