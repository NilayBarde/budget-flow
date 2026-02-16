import { useState, useMemo, useCallback } from 'react';
import {
  TrendingUp,
  ChevronDown,
  ChevronUp,
  X,
  Repeat,
  DollarSign,
  Activity,
  PiggyBank
} from 'lucide-react';

import { Card, CardHeader, Spinner, Badge, EmptyState } from '../components/ui';
import { useInsights, useRecurringTransactions, useUpdateRecurringTransaction, useYearlyStats, useMonthNavigation } from '../hooks';
import { SpendingTrend } from '../components/dashboard/SpendingTrend';
import { formatCurrency } from '../utils/formatters';
import { MONTHS } from '../utils/constants';

export const Insights = () => {
  const { currentDate } = useMonthNavigation();
  const { data: insights, isLoading: insightsLoading } = useInsights();
  const { data: yearlyStats, isLoading: yearlyLoading } = useYearlyStats(currentDate.year);

  const { data: recurring } = useRecurringTransactions();
  const updateRecurring = useUpdateRecurringTransaction();
  const [subscriptionsOpen, setSubscriptionsOpen] = useState(false);

  const handleHideSubscription = useCallback(
    (id: string) => {
      updateRecurring.mutate({ id, data: { is_active: false } });
    },
    [updateRecurring],
  );

  const toggleSubscriptions = useCallback(() => {
    setSubscriptionsOpen(prev => !prev);
  }, []);

  const activeSubscriptions = useMemo(
    () => recurring?.filter(r => r.is_active) || [],
    [recurring],
  );

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
  const maxMerchantSpend = useMemo(() => {
    const merchants = insights?.topMerchants || [];
    return merchants.length > 0 ? merchants[0].totalSpent : 1;
  }, [insights?.topMerchants]);

  const maxCategorySpend = useMemo(() => {
    const categories = insights?.topCategories || [];
    return categories.length > 0 ? categories[0].totalSpent : 1;
  }, [insights?.topCategories]);

  if (insightsLoading || yearlyLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
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

  const { topCategories, topMerchants } = insights;

  const subscriptionMonthlyTotal = activeSubscriptions
    .filter(r => r.frequency === 'monthly')
    .reduce((sum, r) => sum + r.average_amount, 0);
  const subscriptionYearlyTotal = activeSubscriptions
    .filter(r => r.frequency === 'yearly')
    .reduce((sum, r) => sum + r.average_amount, 0);
  const estimatedSubscriptionMonthly = subscriptionMonthlyTotal + subscriptionYearlyTotal / 12;

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-100">Insights</h1>
        <p className="text-slate-400 mt-1">Yearly overview for {currentDate.year}</p>
      </div>

      {/* ── Yearly Overview Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {/* YTD Income */}
        <Card padding="sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs md:text-sm text-slate-400">YTD Income</p>
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
              <p className="text-xs md:text-sm text-slate-400">YTD Spent</p>
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
              <p className="text-xs md:text-sm text-slate-400">YTD Net</p>
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
      <SpendingTrend />

      {/* ── Top Categories & Top Merchants (side by side on lg) ────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Top Categories */}
        <Card padding="sm">
          <CardHeader title="Top Categories" subtitle={`Spending in ${currentDate.year}`} />
          {topCategories.length > 0 ? (
            <div className="space-y-3">
              {topCategories.map(cat => {
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
                      <span className="text-[10px] text-slate-500 flex-shrink-0 w-14 text-right">
                        {cat.transactionCount} txns
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-slate-400 text-center py-8">No category data yet</p>
          )}
        </Card>

        {/* Top Merchants */}
        <Card padding="sm">
          <CardHeader title="Top Merchants" subtitle={`Spending in ${currentDate.year}`} />
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

      {/* ── Recurring Charges (collapsible) ─────────────────────────── */}
      <Card padding="none">
        <button
          onClick={toggleSubscriptions}
          className="w-full flex items-center justify-between px-4 md:px-6 py-3 md:py-4 text-left hover:bg-midnight-700/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Repeat className="h-5 w-5 text-accent-400" />
            <div>
              <p className="text-sm md:text-base font-medium text-slate-100">
                Recurring Charges
              </p>
              <p className="text-xs text-slate-400">
                {activeSubscriptions.length} active · ~{formatCurrency(estimatedSubscriptionMonthly)}/mo
              </p>
            </div>
          </div>
          {subscriptionsOpen ? (
            <ChevronUp className="h-5 w-5 text-slate-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-slate-400" />
          )}
        </button>

        {subscriptionsOpen && (
          <div className="border-t border-midnight-700">
            {activeSubscriptions.length > 0 ? (
              <div className="divide-y divide-midnight-700">
                {activeSubscriptions.map(sub => (
                  <div
                    key={sub.id}
                    className="px-4 md:px-6 py-3 hover:bg-midnight-700/50 transition-colors flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-100 text-sm truncate">
                          {sub.merchant_display_name}
                        </span>
                        <Badge
                          color={sub.frequency === 'monthly' ? '#6366f1' : '#f59e0b'}
                          size="sm"
                        >
                          {sub.frequency}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Last: {new Date(sub.last_seen).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-semibold text-sm text-slate-100">
                        {formatCurrency(sub.average_amount)}
                      </p>
                      <p className="text-xs text-slate-400">
                        /{sub.frequency === 'monthly' ? 'mo' : 'yr'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleHideSubscription(sub.id)}
                      className="p-2 text-slate-500 hover:text-red-400 active:bg-red-500/10 rounded-lg transition-colors flex-shrink-0 touch-target"
                      title="Hide this subscription"
                      aria-label="Hide subscription"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 md:px-6 py-8 text-center">
                <p className="text-slate-400 text-sm">
                  No recurring charges yet. Mark transactions as recurring in the transaction editor.
                </p>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};
