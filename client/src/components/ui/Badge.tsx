import clsx from 'clsx';
import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  color?: string;
  variant?: 'filled' | 'outline';
  size?: 'sm' | 'md';
  onRemove?: () => void;
}

export const Badge = ({ children, color = '#6366f1', variant = 'filled', size = 'sm', onRemove }: BadgeProps) => {
  const baseStyles = 'inline-flex items-center gap-1 rounded-full font-medium';
  
  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
  };

  const variantStyles = variant === 'filled' 
    ? { backgroundColor: `${color}20`, color }
    : { borderColor: color, color, borderWidth: '1px' };

  return (
    <span 
      className={clsx(baseStyles, sizeStyles[size])}
      style={variantStyles}
    >
      {children}
      {onRemove && (
        <button 
          onClick={onRemove}
          className="ml-0.5 hover:opacity-70 transition-opacity"
          type="button"
        >
          ×
        </button>
      )}
    </span>
  );
};

