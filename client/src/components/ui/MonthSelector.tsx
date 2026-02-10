import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTHS } from '../../utils/constants';

interface MonthSelectorProps {
  month: number;
  year: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  className?: string;
}

export const MonthSelector = ({
  month,
  year,
  onPrevMonth,
  onNextMonth,
  className = '',
}: MonthSelectorProps) => (
  <div className={`flex items-center justify-between bg-midnight-800 border border-midnight-600 rounded-xl p-3 md:p-4 ${className}`}>
    <button
      onClick={onPrevMonth}
      className="p-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-700 active:bg-midnight-600 rounded-lg transition-colors touch-target"
      aria-label="Previous month"
    >
      <ChevronLeft className="h-5 w-5" />
    </button>
    <h2 className="text-lg md:text-xl font-semibold text-slate-100">
      {MONTHS[month - 1]} {year}
    </h2>
    <button
      onClick={onNextMonth}
      className="p-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-700 active:bg-midnight-600 rounded-lg transition-colors touch-target"
      aria-label="Next month"
    >
      <ChevronRight className="h-5 w-5" />
    </button>
  </div>
);
