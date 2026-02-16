import clsx from 'clsx';
import type { ReactNode, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card = ({ children, className, padding = 'md', ...props }: CardProps) => {
  const paddingStyles = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  return (
    <div
      className={clsx(
        'bg-midnight-800 border border-midnight-600 rounded-xl relative',
        paddingStyles[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export const CardHeader = ({ title, subtitle, icon, action }: CardHeaderProps) => (
  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4">
    <div className="flex items-center gap-3">
      {icon && <div className="p-2 bg-midnight-700 rounded-lg">{icon}</div>}
      <div>
        <h3 className="text-base md:text-lg font-semibold text-slate-100">{title}</h3>
        {subtitle && <p className="text-xs md:text-sm text-slate-400">{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>
);

