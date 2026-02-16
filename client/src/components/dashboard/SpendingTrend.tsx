
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card, Spinner } from '../ui';
import { useYearlyStats } from '../../hooks';
import { formatCurrency } from '../../utils/formatters';
import { MONTHS } from '../../utils/constants';

export const SpendingTrend = () => {
    const currentYear = new Date().getFullYear();
    const { data: yearlyStats, isLoading } = useYearlyStats(currentYear);

    if (isLoading) {
        return (
            <Card className="h-[400px] flex items-center justify-center">
                <Spinner />
            </Card>
        );
    }

    const data = yearlyStats?.monthly_totals.map(stat => ({
        name: MONTHS[stat.month - 1].substring(0, 3), // "Jan", "Feb"
        Income: stat.income,
        Expenses: stat.spent, // Using 'Expenses' for better label
    })) || [];

    return (
        <Card className="h-[400px] flex flex-col" padding="none">
            <div className="p-6 border-b border-midnight-700">
                <h3 className="text-lg font-semibold text-slate-100">Income vs Expenses</h3>
                <p className="text-sm text-slate-400">Monthly trend for {currentYear}</p>
            </div>
            <div className="flex-1 w-full min-h-0 p-4">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                        <XAxis
                            dataKey="name"
                            stroke="#94a3b8"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            stroke="#94a3b8"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(val) => `$${val / 1000}k`}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#1e293b',
                                borderColor: '#334155',
                                borderRadius: '0.5rem',
                                color: '#f1f5f9'
                            }}
                            formatter={(value: any) => [formatCurrency(value), '']}
                            cursor={{ fill: '#334155', opacity: 0.2 }}
                        />
                        <Bar
                            dataKey="Income"
                            fill="#10b981"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={50}
                        />
                        <Bar
                            dataKey="Expenses"
                            fill="#f43f5e"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={50}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </Card>
    );
};
