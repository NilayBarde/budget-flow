import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

interface YearSelectorProps {
  year: number;
  onYearChange: (year: number) => void;
  minYear?: number;
  maxYear?: number;
  className?: string;
}

export const YearSelector = ({
  year,
  onYearChange,
  minYear,
  maxYear,
  className,
}: YearSelectorProps) => {
  const atMin = minYear !== undefined && year <= minYear;
  const atMax = maxYear !== undefined && year >= maxYear;

  return (
    <div
      className={clsx(
        'flex items-center gap-1 md:gap-2 bg-midnight-800 border border-midnight-600 rounded-xl p-1.5 md:p-2',
        className
      )}
    >
      <button
        onClick={() => onYearChange(year - 1)}
        disabled={atMin}
        className="p-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-700 active:bg-midnight-600 rounded-lg transition-colors touch-target disabled:opacity-40 disabled:pointer-events-none"
        aria-label="Previous year"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <span className="flex-1 md:flex-initial text-base md:text-lg font-semibold text-slate-100 px-3 md:px-4 md:min-w-[60px] text-center">
        {year}
      </span>
      <button
        onClick={() => onYearChange(year + 1)}
        disabled={atMax}
        className="p-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-700 active:bg-midnight-600 rounded-lg transition-colors touch-target disabled:opacity-40 disabled:pointer-events-none"
        aria-label="Next year"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
};
