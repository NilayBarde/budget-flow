
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, Spinner } from '../ui';
import { useTransactions } from '../../hooks';
import { formatCurrency } from '../../utils/formatters';
import { MONTHS, CHART_TOOLTIP_STYLE, CHART_LABEL_STYLE, CHART_ITEM_STYLE } from '../../utils/constants';

// Helper to get days in month
function getDaysInMonth(year: number, month: number) {
    return new Date(year, month, 0).getDate();
}

// Define props interface
interface DailySpendingProps {
    month: number;
    year: number;
}

export const DailySpending = ({ month, year }: DailySpendingProps) => {
    const navigate = useNavigate();

    // Remove internal state
    const { data: transactions, isLoading } = useTransactions({
        month,
        year
    });

    const chartData = useMemo(() => {
        if (!transactions) return [];

        const daysInMonth = getDaysInMonth(year, month);
        const dailyMap = new Map<number, number>();

        // Initialize all days with 0
        for (let i = 1; i <= daysInMonth; i++) {
            dailyMap.set(i, 0);
        }

        // Aggregate expenses
        transactions.forEach(t => {
            const txType = t.transaction_type || (t.amount > 0 ? 'expense' : 'income');

            // Helper to calculating amount (handling splits)
            let amount = Math.abs(t.amount);
            if (t.is_split && t.splits && t.splits.length > 0) {
                const myShare = t.splits
                    .filter(s => s.is_my_share)
                    .reduce((sum, s) => sum + Math.abs(s.amount), 0);
                // If there are splits marked as my share, use that sum. 
                // Otherwise fallback to total (though usually if split, there should be shares)
                if (myShare > 0) amount = myShare;
            }

            // Only count expenses
            if (txType === 'expense') {
                // Ensure date parsing is correct (t.date is YYYY-MM-DD string usually)
                // Using split to avoid timezone issues
                const dateParts = t.date.split('-');
                const txDay = parseInt(dateParts[2], 10);

                dailyMap.set(txDay, (dailyMap.get(txDay) || 0) + amount);
            } else if (txType === 'return') {
                // Subtract returns (allow negative temporary storage to handle order independence)
                const dateParts = t.date.split('-');
                const txDay = parseInt(dateParts[2], 10);
                dailyMap.set(txDay, (dailyMap.get(txDay) || 0) - amount);
            }
        });

        return Array.from(dailyMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([day, amount]) => ({
                day,
                amount: Math.max(0, amount) // Clamp to 0 at the end
            }));
    }, [transactions, month, year]);

    if (isLoading) {
        return (
            <Card className="h-[300px] flex items-center justify-center">
                <Spinner />
            </Card>
        );
    }

    return (
        <Card className="h-[300px] flex flex-col" padding="none">
            <div className="p-4 border-b border-midnight-700">
                <h3 className="font-medium text-slate-100">Daily Spending</h3>
                <p className="text-xs text-slate-400">
                    {MONTHS[month - 1]} {year}
                </p>
            </div>
            <div className="flex-1 w-full min-h-0 p-4">
                <ResponsiveContainer width="100%" height="100%" className="cursor-pointer">
                    <BarChart
                        data={chartData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        onClick={(state: any) => {
                            // Try to get day from activeLabel first (most reliable for categorical axis)
                            let day = state?.activeLabel;

                            // Fallback to activePayload if needed
                            if (!day && state?.activePayload?.[0]?.payload) {
                                day = state.activePayload[0].payload.day;
                            }

                            if (day) {
                                const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                                navigate(`/transactions?date=${dateStr}`);
                            }
                        }}
                    >
                        <XAxis
                            dataKey="day"
                            stroke="#64748b"
                            tick={{ fill: '#94a3b8', fontSize: 10 }}
                            interval="preserveStartEnd"
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            stroke="#64748b"
                            tick={{ fill: '#94a3b8', fontSize: 10 }}
                            tickFormatter={(v) => {
                                if (v >= 1000) {
                                    return `$${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
                                }
                                return `$${v}`;
                            }}
                            width={60}
                            tickLine={false}
                            axisLine={false}
                        />
                        <Tooltip
                            formatter={(value: any) => [formatCurrency(value), 'Spent']}
                            labelFormatter={(label) => `Day ${label}`}
                            contentStyle={CHART_TOOLTIP_STYLE}
                            labelStyle={CHART_LABEL_STYLE}
                            itemStyle={CHART_ITEM_STYLE}
                            cursor={{ fill: '#334155', opacity: 0.2 }}
                        />
                        <Bar
                            dataKey="amount"
                            fill="#6366f1"
                            radius={[3, 3, 0, 0]}
                            maxBarSize={40}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </Card>
    );
};
