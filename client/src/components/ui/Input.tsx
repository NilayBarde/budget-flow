import { forwardRef, type InputHTMLAttributes } from 'react';
import clsx from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-slate-300">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={clsx(
            'w-full bg-midnight-900 border rounded-lg px-4 py-2 text-slate-100 placeholder-slate-500',
            'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-all',
            error ? 'border-rose-500' : 'border-midnight-600',
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-sm text-rose-400">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

