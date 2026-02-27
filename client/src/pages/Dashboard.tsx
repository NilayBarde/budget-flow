import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { Card, CardHeader, Spinner, Button, MonthSelector, CategoryPieChart } from '../components/ui';
import { DashboardHero } from '../components/dashboard/DashboardHero';
import { DailySpending } from '../components/dashboard/DailySpending';
import { SpendingPace } from '../components/dashboard/SpendingPace';
import { RecentActivity } from '../components/dashboard/RecentActivity';
import { BudgetWatchlist } from '../components/dashboard/BudgetWatchlist';
import { useMonthlyStats, useMonthNavigation } from '../hooks';
import { MONTHS } from '../utils/constants';

export const Dashboard = () => {
  const { currentDate, handlePrevMonth, handleNextMonth } = useMonthNavigation();
  const { data: monthlyStats, isLoading, refetch } = useMonthlyStats(currentDate.month, currentDate.year);

  // Check if viewing current month for Spending Pace widget
  const isCurrentMonth = useMemo(() => {
    const now = new Date();
    return currentDate.month === now.getMonth() + 1 && currentDate.year === now.getFullYear();
  }, [currentDate]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-midnight-900">
        <Spinner size="lg" />
      </div>
    );
  }

  // Calculate top categories for the pie chart
  const categoryData = monthlyStats?.by_category
    ?.filter(c => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6) || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-slate-400 mt-1">
            Overview of your finances
          </p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <MonthSelector
            month={currentDate.month}
            year={currentDate.year}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
            className="flex-1 md:flex-none"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            title="Refresh Data"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <DashboardHero
        month={currentDate.month}
        year={currentDate.year}
      />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2/3 width on large screens) */}
        <div className="lg:col-span-2 space-y-6">
          <DailySpending
            month={currentDate.month}
            year={currentDate.year}
          />
          {isCurrentMonth && <SpendingPace />}
          <RecentActivity
            month={currentDate.month}
            year={currentDate.year}
          />
        </div>

        {/* Right Column (1/3 width on large screens) */}
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-6">
            {/* Monthly Breakdown Chart */}
            <Card padding="sm" className="flex flex-col">
              <CardHeader title="Spending by Category" subtitle={`${MONTHS[currentDate.month - 1]} ${currentDate.year}`} />
              <div className="flex-1 flex items-center justify-center min-h-[300px]">
                <CategoryPieChart
                  data={categoryData}
                  emptyMessage="No spending data for this month"
                />
              </div>
            </Card>

            <BudgetWatchlist
              month={currentDate.month}
              year={currentDate.year}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
