import clsx from 'clsx';
import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  color?: string;
  variant?: 'filled' | 'outline';
  size?: 'sm' | 'md';
  className?: string;
  onRemove?: () => void;
}

export const Badge = ({ children, color, variant = 'filled', size = 'sm', className, onRemove }: BadgeProps) => {
  const baseStyles = 'inline-flex items-center gap-1 rounded-full font-medium';
  
  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
  };

  // If className is provided, use it for styling instead of color-based styles
  const variantStyles = className ? undefined : (
    variant === 'filled' 
      ? { backgroundColor: `${color || '#6366f1'}20`, color: color || '#6366f1' }
      : { borderColor: color || '#6366f1', color: color || '#6366f1', borderWidth: '1px' }
  );

  return (
    <span 
      className={clsx(baseStyles, sizeStyles[size], className)}
      style={variantStyles}
    >
      {children}
      {onRemove && (
        <button 
          onClick={onRemove}
          className="ml-0.5 hover:opacity-70 active:opacity-50 transition-opacity p-0.5 -mr-1"
          type="button"
          aria-label="Remove"
        >
          ×
        </button>
      )}
    </span>
  );
};

