import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell 
} from 'recharts';
import { Card, CardHeader, Spinner } from '../components/ui';
import { useYearlyStats } from '../hooks';
import { formatCurrency } from '../utils/formatters';
import { MONTHS } from '../utils/constants';

export const YearOverview = () => {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: stats, isLoading } = useYearlyStats(year);

  const monthlyData = stats?.monthly_totals.map((m, index) => ({
    name: MONTHS[index].slice(0, 3),
    spent: m.spent,
    income: m.income,
    invested: m.invested,
  })) || [];

  const categoryData = stats?.category_totals
    .filter(c => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8) || [];

  const totalSpent = stats?.total_spent || 0;
  const totalIncome = stats?.total_income || 0;
  const totalInvested = stats?.total_invested || 0;
  const netSavings = totalIncome - totalSpent;
  const avgMonthly = totalSpent / 12;

  if (isLoading) {
    return <Spinner className="py-12" />;
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header - Stacked on mobile */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-100">Year Overview</h1>
          <p className="text-slate-400 mt-1">Your spending across the entire year</p>
        </div>
        
        {/* Year Selector */}
        <div className="flex flex-1 md:flex-initial items-center gap-1 md:gap-2 bg-midnight-800 border border-midnight-600 rounded-xl p-1.5 md:p-2 md:w-fit">
          <button
            onClick={() => setYear(y => y - 1)}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-700 active:bg-midnight-600 rounded-lg transition-colors touch-target"
            aria-label="Previous year"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="flex-1 md:flex-initial text-base md:text-lg font-semibold text-slate-100 px-3 md:px-4 md:min-w-[60px] text-center">{year}</span>
          <button
            onClick={() => setYear(y => y + 1)}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-700 active:bg-midnight-600 rounded-lg transition-colors touch-target"
            aria-label="Next year"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Summary Cards - 2x2 on mobile, row on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        <Card padding="sm">
          <p className="text-xs md:text-sm text-slate-400">Total Spent</p>
          <p className="text-lg md:text-2xl font-bold text-slate-100 mt-0.5 md:mt-1">
            {formatCurrency(totalSpent)}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs md:text-sm text-slate-400">Total Income</p>
          <p className="text-lg md:text-2xl font-bold text-emerald-400 mt-0.5 md:mt-1">
            {formatCurrency(totalIncome)}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs md:text-sm text-slate-400">Total Invested</p>
          <p className="text-lg md:text-2xl font-bold text-violet-400 mt-0.5 md:mt-1">
            {formatCurrency(totalInvested)}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs md:text-sm text-slate-400">Net Savings</p>
          <p className={`text-lg md:text-2xl font-bold mt-0.5 md:mt-1 ${netSavings >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatCurrency(netSavings)}
          </p>
        </Card>
        <Card padding="sm" className="col-span-2 md:col-span-1">
          <p className="text-xs md:text-sm text-slate-400">Avg. Monthly</p>
          <p className="text-lg md:text-2xl font-bold text-slate-100 mt-0.5 md:mt-1">
            {formatCurrency(avgMonthly)}
          </p>
        </Card>
      </div>

      {/* Monthly Chart - Horizontal scroll on mobile */}
      <Card padding="sm">
        <CardHeader title="Monthly Overview" subtitle="Expenses, income, and investments by month" />
        <div className="h-64 md:h-80 -mx-2 md:mx-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData}>
              <XAxis 
                dataKey="name" 
                stroke="#64748b" 
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                interval={0}
              />
              <YAxis 
                stroke="#64748b" 
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                width={45}
              />
              <Tooltip
                formatter={(value) => formatCurrency(value as number)}
                contentStyle={{
                  backgroundColor: '#252a3d',
                  border: '1px solid #3a4160',
                  borderRadius: '8px',
                  fontSize: '12px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                }}
                labelStyle={{ color: '#f1f5f9', fontWeight: 500 }}
                itemStyle={{ color: '#cbd5e1' }}
              />
              <Bar dataKey="spent" fill="#f43f5e" radius={[4, 4, 0, 0]} name="Expenses" />
              <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} name="Income" />
              <Bar dataKey="invested" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Invested" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card padding="sm">
          <CardHeader title="Spending by Category" subtitle="Where your money went" />
          {categoryData.length > 0 ? (
            <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
              <div className="w-full md:w-48 h-40 md:h-48 mx-auto md:mx-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="amount"
                      nameKey="category.name"
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={60}
                      paddingAngle={2}
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.category.color} />
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
              <div className="flex-1 space-y-2">
                {categoryData.map((item) => (
                  <div key={item.category.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.category.color }}
                      />
                      <span className="text-sm text-slate-300 truncate">{item.category.name}</span>
                    </div>
                    <span className="text-sm font-medium text-slate-100 ml-2">
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-slate-400 text-center py-8">No spending data for {year}</p>
          )}
        </Card>

        {/* Monthly Cards - 2x6 grid on mobile */}
        <Card padding="sm">
          <CardHeader title="Monthly Breakdown" subtitle="Click to view details" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3 max-h-64 md:max-h-80 overflow-y-auto">
            {monthlyData.map((month, index) => (
              <div 
                key={month.name}
                className="bg-midnight-900 rounded-lg p-2.5 md:p-3 hover:bg-midnight-700 active:bg-midnight-600 transition-colors cursor-pointer"
              >
                <p className="text-xs text-slate-400">{MONTHS[index]}</p>
                <p className="text-base md:text-lg font-semibold text-slate-100 mt-0.5 md:mt-1">
                  {formatCurrency(month.spent)}
                </p>
                {month.income > 0 && (
                  <p className="text-xs text-emerald-400">
                    +{formatCurrency(month.income)}
                  </p>
                )}
                {month.invested > 0 && (
                  <p className="text-xs text-violet-400">
                    {formatCurrency(month.invested)} inv.
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
