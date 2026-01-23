import clsx from 'clsx';
import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = ({ label, error, className, ...props }: InputProps) => {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-slate-300">
          {label}
        </label>
      )}
      <input
        className={clsx(
          'w-full bg-midnight-900 border border-midnight-600 rounded-lg px-4 py-2.5 md:py-2 text-slate-100',
          'placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent',
          'transition-all text-base md:text-sm',
          // Prevent zoom on iOS
          'touch-manipulation',
          error && 'border-rose-500 focus:ring-rose-500',
          className
        )}
        {...props}
      />
      {error && (
        <p className="text-sm text-rose-500">{error}</p>
      )}
    </div>
  );
};
