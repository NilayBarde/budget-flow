import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { Card, CardHeader, Spinner, Button, MonthSelector, CategoryPieChart } from '../components/ui';
import { DashboardHero } from '../components/dashboard/DashboardHero';
import { SpendingTrend } from '../components/dashboard/SpendingTrend';
import { RecentActivity } from '../components/dashboard/RecentActivity';
import { BudgetWatchlist } from '../components/dashboard/BudgetWatchlist';
import { useMonthlyStats, useMonthNavigation } from '../hooks';
import { MONTHS } from '../utils/constants';
import { useQueryClient } from '@tanstack/react-query';

export const Dashboard = () => {
  const { currentDate, handlePrevMonth, handleNextMonth } = useMonthNavigation();
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useMonthlyStats(currentDate.month, currentDate.year);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['stats'] });
    queryClient.invalidateQueries({ queryKey: ['investment-summary'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    refetchStats();
  };

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
    <div className="space-y-6 md:space-y-8 pb-8">
      {/* Header with Month Selector - Stacked on mobile */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-slate-400 mt-1">Your financial command center</p>
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

      {/* Hero Section */}
      <DashboardHero />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2/3 width on large screens) */}
        <div className="lg:col-span-2 space-y-6">
          <SpendingTrend />
          <RecentActivity />
        </div>

        {/* Right Column (1/3 width on large screens) */}
        <div className="space-y-6">
          <Card padding="sm" className="min-h-[400px]">
            <CardHeader title="Spending by Category" subtitle={`${MONTHS[currentDate.month - 1]} ${currentDate.year}`} />
            <CategoryPieChart
              data={categoryData}
              emptyMessage="No spending data for this month"
            />
          </Card>

          <BudgetWatchlist />
        </div>
      </div>
    </div>
  );
};
