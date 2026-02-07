import { useState, useMemo, useCallback } from 'react';
import {
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,

  ChevronDown,
  ChevronUp,
  RefreshCw,
  X,
  Repeat,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardHeader, Spinner, Badge, Button, EmptyState } from '../components/ui';
import { ProgressBar } from '../components/ui/ProgressBar';
import { useInsights, useRecurringTransactions, useDetectRecurringTransactions, useUpdateRecurringTransaction } from '../hooks';
import { formatCurrency } from '../utils/formatters';
import { MONTHS } from '../utils/constants';
import type { InsightsCategoryTrend } from '../types';

const CHART_TOOLTIP_STYLE = {
  backgroundColor: '#252a3d',
  border: '1px solid #3a4160',
  borderRadius: '8px',
  fontSize: '12px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
};
const CHART_LABEL_STYLE = { color: '#f1f5f9', fontWeight: 500 };
const CHART_ITEM_STYLE = { color: '#cbd5e1' };

// Build short month label from month/year
const monthLabel = (m: number, y: number) =>
  `${MONTHS[m - 1].slice(0, 3)} ${String(y).slice(2)}`;

// Format a change percent as a readable string
const formatChangePercent = (pct: number): string => {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
};

// Transform category trends into recharts-friendly data
const buildTrendChartData = (trends: InsightsCategoryTrend[]) => {
  if (!trends.length) return [];
  const monthCount = trends[0].months.length;
  const data: Record<string, unknown>[] = [];

  for (let i = 0; i < monthCount; i++) {
    const point: Record<string, unknown> = {
      name: monthLabel(trends[0].months[i].month, trends[0].months[i].year),
    };
    for (const trend of trends) {
      point[trend.categoryName] = trend.months[i].amount;
    }
    data.push(point);
  }

  return data;
};

export const Insights = () => {
  const { data: insights, isLoading } = useInsights();
  const { data: recurring } = useRecurringTransactions();
  const detectRecurring = useDetectRecurringTransactions();
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

  const trendChartData = useMemo(
    () => buildTrendChartData(insights?.categoryTrends || []),
    [insights?.categoryTrends],
  );

  // Max spend values for relative bar widths
  const maxMerchantSpend = useMemo(() => {
    const merchants = insights?.topMerchants || [];
    return merchants.length > 0 ? merchants[0].totalSpent : 1;
  }, [insights?.topMerchants]);

  const maxCategorySpend = useMemo(() => {
    const categories = insights?.topCategories || [];
    return categories.length > 0 ? categories[0].totalSpent : 1;
  }, [insights?.topCategories]);

  if (isLoading) {
    return <Spinner className="py-12" />;
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

  const { monthOverMonth, spendingVelocity, categoryTrends, topCategories, topMerchants, dailySpending } = insights;
  const { currentMonth, previousMonth, spentChangePercent, incomeChangePercent } = monthOverMonth;
  const netChangePercent =
    previousMonth.net !== 0
      ? ((currentMonth.net - previousMonth.net) / Math.abs(previousMonth.net)) * 100
      : 0;
  const isSpentUp = spentChangePercent > 0;
  const isIncomeUp = incomeChangePercent > 0;
  const isNetUp = netChangePercent > 0;

  // Spending velocity
  const pacePercent = spendingVelocity.daysInMonth > 0
    ? (spendingVelocity.daysElapsed / spendingVelocity.daysInMonth) * 100
    : 0;
  const spentPercent = spendingVelocity.lastMonthTotal > 0
    ? (spendingVelocity.spentSoFar / spendingVelocity.lastMonthTotal) * 100
    : 0;
  const isOnPace = spentPercent <= pacePercent + 5; // 5% grace

  const subscriptionMonthlyTotal = activeSubscriptions
    .filter(r => r.frequency === 'monthly')
    .reduce((sum, r) => sum + r.average_amount, 0);
  const subscriptionYearlyTotal = activeSubscriptions
    .filter(r => r.frequency === 'yearly')
    .reduce((sum, r) => sum + r.average_amount, 0);
  const estimatedSubscriptionMonthly = subscriptionMonthlyTotal + subscriptionYearlyTotal / 12;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-100">Insights</h1>
        <p className="text-slate-400 mt-1">Trends, patterns, and spending analysis</p>
      </div>

      {/* ── This Month vs Last ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        {/* Spent */}
        <Card padding="sm">
          <p className="text-xs md:text-sm text-slate-400">Spent</p>
          <p className="text-lg md:text-2xl font-bold text-slate-100 mt-0.5 md:mt-1">
            {formatCurrency(currentMonth.spent)}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Badge
              className={`text-xs ${isSpentUp ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}
            >
              {isSpentUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {formatChangePercent(spentChangePercent)}
            </Badge>
            <span className="text-xs text-slate-500">vs last month</span>
          </div>
        </Card>

        {/* Income */}
        <Card padding="sm">
          <p className="text-xs md:text-sm text-slate-400">Income</p>
          <p className="text-lg md:text-2xl font-bold text-emerald-400 mt-0.5 md:mt-1">
            {formatCurrency(currentMonth.income)}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Badge
              className={`text-xs ${isIncomeUp ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}
            >
              {isIncomeUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {formatChangePercent(incomeChangePercent)}
            </Badge>
            <span className="text-xs text-slate-500">vs last month</span>
          </div>
        </Card>

        {/* Net */}
        <Card padding="sm">
          <p className="text-xs md:text-sm text-slate-400">Net</p>
          <p className={`text-lg md:text-2xl font-bold mt-0.5 md:mt-1 ${currentMonth.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatCurrency(currentMonth.net)}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Badge
              className={`text-xs ${isNetUp ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}
            >
              {isNetUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {formatChangePercent(netChangePercent)}
            </Badge>
            <span className="text-xs text-slate-500">vs last month</span>
          </div>
        </Card>
      </div>

      {/* ── Spending Pace ───────────────────────────────────────────── */}
      <Card padding="sm">
        <CardHeader
          title="Spending Pace"
          subtitle={`${MONTHS[currentMonth.month - 1]} ${currentMonth.year} — Day ${spendingVelocity.daysElapsed} of ${spendingVelocity.daysInMonth}`}
        />
        <div className="space-y-3">
          {/* Progress bar: current spend vs last month total */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1.5">
              <span>Spent so far: {formatCurrency(spendingVelocity.spentSoFar)}</span>
              <span>Last month: {formatCurrency(spendingVelocity.lastMonthTotal)}</span>
            </div>
            <ProgressBar
              value={spendingVelocity.spentSoFar}
              max={spendingVelocity.lastMonthTotal || 1}
              color={isOnPace ? 'success' : 'warning'}
              showLabel={false}
              size="md"
            />
            {/* Expected pace marker */}
            <div className="relative h-0">
              <div
                className="absolute -top-2.5 w-0.5 h-2.5 bg-slate-400 rounded-full"
                style={{ left: `${Math.min(pacePercent, 100)}%` }}
                title={`Expected pace: ${pacePercent.toFixed(0)}%`}
              />
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
            <div>
              <p className="text-xs text-slate-500">Daily Average</p>
              <p className="text-sm font-medium text-slate-200">
                {formatCurrency(spendingVelocity.dailyAverage)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Projected Total</p>
              <p className={`text-sm font-medium ${spendingVelocity.projectedTotal > spendingVelocity.lastMonthTotal ? 'text-rose-400' : 'text-emerald-400'}`}>
                {formatCurrency(spendingVelocity.projectedTotal)}
              </p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-xs text-slate-500">Status</p>
              <p className={`text-sm font-medium ${isOnPace ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isOnPace ? 'On pace' : 'Over pace'}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Category Trends (full width) ──────────────────────────── */}
      <Card padding="sm">
        <CardHeader title="Category Trends" subtitle="Last 6 months" />
        {categoryTrends.length > 0 ? (
          <div>
            <div className="h-56 md:h-64 -mx-2 md:mx-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendChartData}>
                  <XAxis
                    dataKey="name"
                    stroke="#64748b"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                  />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    width={45}
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(value as number)}
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={CHART_LABEL_STYLE}
                    itemStyle={CHART_ITEM_STYLE}
                  />
                  {categoryTrends.map(trend => (
                    <Line
                      key={trend.categoryId}
                      type="monotone"
                      dataKey={trend.categoryName}
                      stroke={trend.categoryColor}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
              {categoryTrends.map(trend => (
                <div key={trend.categoryId} className="flex items-center gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: trend.categoryColor }}
                  />
                  <span className="text-xs text-slate-400">{trend.categoryName}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-slate-400 text-center py-8">No category data yet</p>
        )}
      </Card>

      {/* ── Top Categories & Top Merchants (side by side on lg) ────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Top Categories */}
        <Card padding="sm">
          <CardHeader title="Top Categories" subtitle="Last 6 months by spend" />
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
          <CardHeader title="Top Merchants" subtitle="Last 6 months by spend" />
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

      {/* ── Daily Spending ──────────────────────────────────────────── */}
      <Card padding="sm">
        <CardHeader
          title="Daily Spending"
          subtitle={`${MONTHS[currentMonth.month - 1]} ${currentMonth.year}`}
        />
        <div className="h-48 md:h-56 -mx-2 md:mx-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailySpending}>
              <XAxis
                dataKey="day"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}`}
                width={45}
              />
              <Tooltip
                formatter={(value) => formatCurrency(value as number)}
                labelFormatter={(label) => `Day ${label}`}
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={CHART_LABEL_STYLE}
                itemStyle={CHART_ITEM_STYLE}
              />
              <Bar dataKey="amount" fill="#6366f1" radius={[3, 3, 0, 0]} name="Spent" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

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
            {/* Detect button */}
            <div className="px-4 md:px-6 py-3 border-b border-midnight-700">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => detectRecurring.mutate()}
                isLoading={detectRecurring.isPending}
                className="w-full md:w-auto"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Detect Subscriptions
              </Button>
            </div>

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
                  No subscriptions detected. Click &quot;Detect Subscriptions&quot; to scan your transactions.
                </p>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};
