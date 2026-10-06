import { useState, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  Activity,
  PiggyBank
} from 'lucide-react';

import { Card, CardHeader, Spinner, EmptyState, ErrorState, YearSelector } from '../components/ui';
import { useInsights, useYearlyStats } from '../hooks';
import { SpendingTrend } from '../components/dashboard/SpendingTrend';
import { DailySpending } from '../components/dashboard/DailySpending';
import { SpendingPace } from '../components/dashboard/SpendingPace';
import { SubscriptionOverview } from '../components/insights/SubscriptionOverview';
import { formatCurrency } from '../utils/formatters';

const CURRENT_YEAR = new Date().getFullYear();

export const Insights = () => {
  const [year, setYear] = useState(CURRENT_YEAR);
  const isCurrentYear = year === CURRENT_YEAR;
  const { data: insights, isLoading: insightsLoading, isError: insightsError, refetch: refetchInsights } = useInsights();
  const {
    data: yearlyStats,
    isLoading: yearlyLoading,
    isError: yearlyError,
    refetch: refetchYearly,
  } = useYearlyStats(year);

  // Calculate YTD Stats
  const ytdStats = useMemo(() => {
    if (!yearlyStats?.monthly_totals) return { income: 0, spent: 0, net: 0, savingsRate: 0 };

    // Sum up totals for all available months in the yearly stats
    // Note: This assumes monthly_totals includes all months so far or all months in data
    const totals = yearlyStats.monthly_totals.reduce((acc, curr) => ({
      income: acc.income + curr.income,
      spent: acc.spent + curr.spent,
    }), { income: 0, spent: 0 });

    const net = totals.income - totals.spent;
    const savingsRate = totals.income > 0 ? (net / totals.income) * 100 : 0;

    return { ...totals, net, savingsRate };
  }, [yearlyStats]);

  // Max spend values for relative bar widths
  const topMerchants = useMemo(() => yearlyStats?.top_merchants ?? [], [yearlyStats]);
  const maxMerchantSpend = useMemo(() => {
    return topMerchants.length > 0 ? topMerchants[0].totalSpent : 1;
  }, [topMerchants]);

  // Use yearlyStats for categories to ensure it matches the selected year
  const yearlyCategories = useMemo(() => {
    if (!yearlyStats?.category_totals) return [];
    return yearlyStats.category_totals
      .map(c => ({
        categoryId: c.category.id,
        categoryName: c.category.name,
        categoryColor: c.category.color,
        totalSpent: c.amount,
        transactionCount: 0 // Not available in yearly stats
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5);
  }, [yearlyStats]);

  const maxCategorySpend = useMemo(() => {
    return yearlyCategories.length > 0 ? yearlyCategories[0].totalSpent : 1;
  }, [yearlyCategories]);

  if (insightsError || yearlyError) {
    return (
      <ErrorState
        onRetry={() => {
          // Retry only the query that failed; refetching a healthy one is wasted work.
          if (insightsError) refetchInsights();
          if (yearlyError) refetchYearly();
        }}
        description="Your spending insights couldn't be loaded."
      />
    );
  }

  if (insightsLoading || yearlyLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!insights) {
    return (
      <EmptyState
        title="No insights available"
        description="Connect accounts and sync transactions to see spending insights."
        icon={<TrendingUp className="h-8 w-8 text-slate-400" />}
      />
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-100">Insights</h1>
          <p className="text-slate-400 mt-1">Yearly overview for {year}</p>
        </div>
        <YearSelector
          year={year}
          onYearChange={setYear}
          minYear={2024}
          maxYear={CURRENT_YEAR}
          className="flex-1 md:flex-initial md:w-fit"
        />
      </div>

      {/* ── This month: how today's spending is tracking ─────────────── */}
      {isCurrentYear && (
        <div className="grid grid-cols-1 lg:grid-cols-2 items-start gap-4 md:gap-6">
          {/* Both cards use the server's current month, so they cannot disagree after a month rolls over. */}
          <DailySpending
            month={insights.monthOverMonth.currentMonth.month}
            year={insights.monthOverMonth.currentMonth.year}
          />
          <SpendingPace />
        </div>
      )}

      {/* ── Yearly Overview Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {/* YTD Income */}
        <Card padding="sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs md:text-sm text-slate-400">{isCurrentYear ? 'YTD' : year} Income</p>
              <p className="text-lg md:text-2xl font-bold text-emerald-400 mt-1">
                {formatCurrency(ytdStats.income)}
              </p>
            </div>
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <DollarSign className="h-5 w-5 text-emerald-400" />
            </div>
          </div>
        </Card>

        {/* YTD Spent */}
        <Card padding="sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs md:text-sm text-slate-400">{isCurrentYear ? 'YTD' : year} Spent</p>
              <p className="text-lg md:text-2xl font-bold text-slate-100 mt-1">
                {formatCurrency(ytdStats.spent)}
              </p>
            </div>
            <div className="p-2 bg-rose-500/10 rounded-lg">
              <Activity className="h-5 w-5 text-rose-400" />
            </div>
          </div>
        </Card>

        {/* YTD Net */}
        <Card padding="sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs md:text-sm text-slate-400">{isCurrentYear ? 'YTD' : year} Net</p>
              <p className={`text-lg md:text-2xl font-bold mt-1 ${ytdStats.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatCurrency(ytdStats.net)}
              </p>
            </div>
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <PiggyBank className="h-5 w-5 text-blue-400" />
            </div>
          </div>
        </Card>

        {/* Savings Rate */}
        <Card padding="sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs md:text-sm text-slate-400">Savings Rate</p>
              <p className={`text-lg md:text-2xl font-bold mt-1 ${ytdStats.savingsRate >= 20 ? 'text-emerald-400' : ytdStats.savingsRate > 0 ? 'text-blue-400' : 'text-slate-400'}`}>
                {ytdStats.savingsRate.toFixed(1)}%
              </p>
            </div>
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <TrendingUp className="h-5 w-5 text-indigo-400" />
            </div>
          </div>
        </Card>
      </div>

      {/* ── Yearly Trend Chart ────────────────────────────────────── */}
      <SpendingTrend year={year} />

      {/* ── Top Categories & Top Merchants (side by side on lg) ────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Top Categories */}
        <Card padding="sm">
          <CardHeader title="Top Categories" subtitle={`Spending in ${year}`} />
          {yearlyCategories.length > 0 ? (
            <div className="space-y-3">
              {yearlyCategories.map(cat => {
                const barWidth = maxCategorySpend > 0
                  ? (cat.totalSpent / maxCategorySpend) * 100
                  : 0;

                return (
                  <div key={cat.categoryId}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: cat.categoryColor }}
                        />
                        <span className="text-sm text-slate-200 truncate">
                          {cat.categoryName}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-slate-100 flex-shrink-0">
                        {formatCurrency(cat.totalSpent)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 pl-5">
                      <div className="flex-1 h-1.5 bg-midnight-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${barWidth}%`, backgroundColor: cat.categoryColor }}
                        />
                      </div>
                      {/* Hide transaction count as it's not in yearly stats */}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-slate-400 text-center py-8">No category data for {year}</p>
          )}
        </Card>

        {/* Top Merchants */}
        <Card padding="sm">
          <CardHeader title="Top Merchants" subtitle={`Spending in ${year}`} />
          {topMerchants.length > 0 ? (
            <div className="space-y-3">
              {topMerchants.map((merchant, index) => {
                const barWidth = maxMerchantSpend > 0
                  ? (merchant.totalSpent / maxMerchantSpend) * 100
                  : 0;

                return (
                  <div key={merchant.merchantName}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-slate-500 w-5 flex-shrink-0 text-right">
                          {index + 1}
                        </span>
                        <span className="text-sm text-slate-200 truncate">
                          {merchant.merchantName}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-slate-100 flex-shrink-0">
                        {formatCurrency(merchant.totalSpent)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 pl-7">
                      <div className="flex-1 h-1.5 bg-midnight-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent-500 rounded-full transition-all duration-500"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 flex-shrink-0 w-20 text-right">
                        {merchant.transactionCount} txns · ~{formatCurrency(merchant.avgTransaction)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-slate-400 text-center py-8">No merchant data yet</p>
          )}
        </Card>
      </div>

      {/* ── Subscriptions & Recurring (net of card credits) ──────────── */}
      <SubscriptionOverview />
    </div>
  );
};
