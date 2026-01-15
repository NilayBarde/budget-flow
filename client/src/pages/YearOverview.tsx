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
  })) || [];

  const categoryData = stats?.category_totals
    .filter(c => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8) || [];

  const totalSpent = stats?.total_spent || 0;
  const totalIncome = stats?.total_income || 0;
  const avgMonthly = totalSpent / 12;

  if (isLoading) {
    return <Spinner className="py-12" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Year Overview</h1>
          <p className="text-slate-400 mt-1">Your spending across the entire year</p>
        </div>
        
        {/* Year Selector */}
        <div className="flex items-center gap-2 bg-midnight-800 border border-midnight-600 rounded-xl p-2">
          <button
            onClick={() => setYear(y => y - 1)}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-700 rounded-lg transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-lg font-semibold text-slate-100 px-4">{year}</span>
          <button
            onClick={() => setYear(y => y + 1)}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-700 rounded-lg transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <p className="text-sm text-slate-400">Total Spent</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">
            {formatCurrency(totalSpent)}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Total Income</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">
            {formatCurrency(totalIncome)}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Net Savings</p>
          <p className={`text-2xl font-bold mt-1 ${totalIncome - totalSpent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatCurrency(totalIncome - totalSpent)}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Avg. Monthly</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">
            {formatCurrency(avgMonthly)}
          </p>
        </Card>
      </div>

      {/* Monthly Chart */}
      <Card>
        <CardHeader title="Monthly Spending" subtitle="Expenses and income by month" />
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData}>
              <XAxis 
                dataKey="name" 
                stroke="#64748b" 
                tick={{ fill: '#94a3b8' }}
              />
              <YAxis 
                stroke="#64748b" 
                tick={{ fill: '#94a3b8' }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value) => formatCurrency(value as number)}
                contentStyle={{
                  backgroundColor: '#1c2030',
                  border: '1px solid #252a3d',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#f1f5f9' }}
              />
              <Bar dataKey="spent" fill="#f43f5e" radius={[4, 4, 0, 0]} name="Expenses" />
              <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} name="Income" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Spending by Category" subtitle="Where your money went" />
          {categoryData.length > 0 ? (
            <div className="flex items-center gap-6">
              <div className="w-48 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="amount"
                      nameKey="category.name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.category.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatCurrency(value as number)}
                      contentStyle={{
                        backgroundColor: '#1c2030',
                        border: '1px solid #252a3d',
                        borderRadius: '8px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                {categoryData.map((item) => (
                  <div key={item.category.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: item.category.color }}
                      />
                      <span className="text-sm text-slate-300">{item.category.name}</span>
                    </div>
                    <span className="text-sm font-medium text-slate-100">
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

        {/* Monthly Cards */}
        <Card>
          <CardHeader title="Monthly Breakdown" subtitle="Click to view details" />
          <div className="grid grid-cols-3 gap-3 max-h-80 overflow-y-auto">
            {monthlyData.map((month, index) => (
              <div 
                key={month.name}
                className="bg-midnight-900 rounded-lg p-3 hover:bg-midnight-700 transition-colors cursor-pointer"
              >
                <p className="text-xs text-slate-400">{MONTHS[index]}</p>
                <p className="text-lg font-semibold text-slate-100 mt-1">
                  {formatCurrency(month.spent)}
                </p>
                {month.income > 0 && (
                  <p className="text-xs text-emerald-400">
                    +{formatCurrency(month.income)}
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

