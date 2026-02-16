import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency } from '../../utils/formatters';
import { CHART_TOOLTIP_STYLE, CHART_LABEL_STYLE, CHART_ITEM_STYLE } from '../../utils/constants';

interface CategoryDataItem {
  [key: string]: unknown;
  amount: number;
  category: {
    id: string;
    name: string;
    color: string;
  };
}

interface CategoryPieChartProps {
  data: CategoryDataItem[];
  emptyMessage?: string;
  /** Tailwind classes for the chart container size, e.g. "w-full md:w-40 h-40" */
  chartClassName?: string;
}

export const CategoryPieChart = ({
  data,
  emptyMessage = 'No spending data',
  chartClassName = 'w-full md:w-40 h-40',
}: CategoryPieChartProps) => {
  if (data.length === 0) {
    return <p className="text-slate-400 text-center py-8">{emptyMessage}</p>;
  }

  return (
    <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
      <div className={`${chartClassName} mx-auto md:mx-0`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="amount"
              nameKey="category.name"
              cx="50%"
              cy="50%"
              innerRadius={35}
              outerRadius={60}
              paddingAngle={2}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.category.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => formatCurrency(value as number)}
              contentStyle={CHART_TOOLTIP_STYLE}
              labelStyle={CHART_LABEL_STYLE}
              itemStyle={CHART_ITEM_STYLE}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-2 min-w-0">
        {data.map((item) => (
          <div key={item.category.id} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: item.category.color }}
              />
              <span className="text-sm text-slate-300 truncate">{item.category.name}</span>
            </div>
            <span className="text-sm font-medium text-slate-100 whitespace-nowrap">
              {formatCurrency(item.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
