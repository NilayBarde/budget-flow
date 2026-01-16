import { useState, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, TrendingUp, Wallet, ChevronLeft, ChevronRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardHeader, Spinner } from '../components/ui';
import { useMonthlyStats, useBudgetGoals } from '../hooks';
import { formatCurrency, getMonthYear } from '../utils/formatters';
import { ProgressBar } from '../components/ui/ProgressBar';
import { MONTHS } from '../utils/constants';

export const Dashboard = () => {
  const [currentDate, setCurrentDate] = useState(getMonthYear());
  
  const { data: stats, isLoading: statsLoading } = useMonthlyStats(currentDate.month, currentDate.year);
  const { data: budgetGoals, isLoading: goalsLoading } = useBudgetGoals(currentDate.month, currentDate.year);

  const handlePrevMonth = () => {
    setCurrentDate(prev => {
      let newMonth = prev.month - 1;
      let newYear = prev.year;
      if (newMonth < 1) {
        newMonth = 12;
        newYear -= 1;
      }
      return { month: newMonth, year: newYear };
    });
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => {
      let newMonth = prev.month + 1;
      let newYear = prev.year;
      if (newMonth > 12) {
        newMonth = 1;
        newYear += 1;
      }
      return { month: newMonth, year: newYear };
    });
  };

  const totalSpent = stats?.total_spent || 0;
  const totalIncome = stats?.total_income || 0;
  const totalInvested = stats?.total_invested || 0;
  const netSavings = totalIncome - totalSpent - totalInvested;

  const categoryData = useMemo(() => {
    if (!stats?.by_category) return [];
    return stats.by_category
      .filter(c => c.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [stats]);

  const topOverBudget = useMemo(() => {
    if (!budgetGoals) return [];
    return budgetGoals
      .filter(g => (g.spent || 0) > g.limit_amount * 0.8)
      .sort((a, b) => {
        const aRatio = (a.spent || 0) / a.limit_amount;
        const bRatio = (b.spent || 0) / b.limit_amount;
        return bRatio - aRatio;
      })
      .slice(0, 3);
  }, [budgetGoals]);

  if (statsLoading || goalsLoading) {
    return <Spinner className="py-12" />;
  }

  return (
    <div className="space-y-8">
      {/* Header with Month Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-slate-400 mt-1">Your financial overview</p>
        </div>
        
        {/* Month Selector */}
        <div className="flex items-center gap-2 bg-midnight-800 border border-midnight-600 rounded-xl p-2">
          <button
            onClick={handlePrevMonth}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-700 rounded-lg transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-lg font-semibold text-slate-100 px-4 min-w-[160px] text-center">
            {MONTHS[currentDate.month - 1]} {currentDate.year}
          </span>
          <button
            onClick={handleNextMonth}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-700 rounded-lg transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-midnight-800 to-midnight-900">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Total Spent</p>
              <p className="text-2xl font-bold text-slate-100 mt-1">
                {formatCurrency(totalSpent)}
              </p>
            </div>
            <div className="p-3 bg-rose-500/20 rounded-xl">
              <ArrowUpRight className="h-6 w-6 text-rose-400" />
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-midnight-800 to-midnight-900">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Total Income</p>
              <p className="text-2xl font-bold text-slate-100 mt-1">
                {formatCurrency(totalIncome)}
              </p>
            </div>
            <div className="p-3 bg-emerald-500/20 rounded-xl">
              <ArrowDownRight className="h-6 w-6 text-emerald-400" />
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-midnight-800 to-midnight-900">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Total Invested</p>
              <p className="text-2xl font-bold text-violet-400 mt-1">
                {formatCurrency(totalInvested)}
              </p>
            </div>
            <div className="p-3 bg-violet-500/20 rounded-xl">
              <TrendingUp className="h-6 w-6 text-violet-400" />
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-midnight-800 to-midnight-900">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Net Savings</p>
              <p className={`text-2xl font-bold mt-1 ${netSavings >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatCurrency(netSavings)}
              </p>
            </div>
            <div className={`p-3 rounded-xl ${netSavings >= 0 ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`}>
              {netSavings >= 0 
                ? <Wallet className="h-6 w-6 text-emerald-400" />
                : <Wallet className="h-6 w-6 text-rose-400" />
              }
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spending by Category */}
        <Card>
          <CardHeader title="Spending by Category" subtitle={`${MONTHS[currentDate.month - 1]} ${currentDate.year}`} />
          {categoryData.length > 0 ? (
            <div className="flex items-center gap-6">
              <div className="w-40 h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="amount"
                      nameKey="category.name"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                    >
                      {categoryData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.category.color} 
                        />
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
            <p className="text-slate-400 text-center py-8">No spending data for this month</p>
          )}
        </Card>

        {/* Budget Status */}
        <Card>
          <CardHeader title="Budget Status" subtitle="Categories to watch" />
          {topOverBudget.length > 0 ? (
            <div className="space-y-4">
              {topOverBudget.map((goal) => (
                <div key={goal.id}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-slate-200">
                      {goal.category?.name}
                    </span>
                    <span className="text-sm text-slate-400">
                      {formatCurrency(goal.spent || 0)} / {formatCurrency(goal.limit_amount)}
                    </span>
                  </div>
                  <ProgressBar value={goal.spent || 0} max={goal.limit_amount} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-center py-8">All budgets on track!</p>
          )}
        </Card>
      </div>
    </div>
  );
};
