import clsx from 'clsx';
import type { SelectHTMLAttributes } from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  error?: string;
}

export const Select = ({ label, options, error, className, ...props }: SelectProps) => {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-slate-300">
          {label}
        </label>
      )}
      <select
        className={clsx(
          'w-full bg-midnight-900 border border-midnight-600 rounded-lg px-4 py-2.5 md:py-2 text-slate-100',
          'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent',
          'transition-all appearance-none cursor-pointer text-base md:text-sm',
          // Prevent zoom on iOS
          'touch-manipulation',
          // Custom arrow
          'bg-no-repeat bg-right pr-10',
          'bg-[url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3E%3Cpath stroke=\'%2394a3b8\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'m6 8 4 4 4-4\'/%3E%3C/svg%3E")]',
          'bg-[length:1.5rem_1.5rem] bg-[right_0.5rem_center]',
          error && 'border-rose-500 focus:ring-rose-500',
          className
        )}
        {...props}
      >
        {options.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-sm text-rose-500">{error}</p>
      )}
    </div>
  );
};
