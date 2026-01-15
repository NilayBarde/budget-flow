import clsx from 'clsx';

interface ProgressBarProps {
  value: number;
  max: number;
  color?: 'default' | 'success' | 'warning' | 'danger';
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const ProgressBar = ({ 
  value, 
  max, 
  color = 'default', 
  showLabel = true,
  size = 'md' 
}: ProgressBarProps) => {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const isOverBudget = value > max;
  
  const getColor = () => {
    if (color !== 'default') {
      const colors = {
        success: 'bg-emerald-500',
        warning: 'bg-amber-500',
        danger: 'bg-rose-500',
      };
      return colors[color];
    }
    
    if (isOverBudget) return 'bg-rose-500';
    if (percentage >= 80) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const sizes = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  };

  return (
    <div className="w-full">
      <div className={clsx('w-full bg-midnight-700 rounded-full overflow-hidden', sizes[size])}>
        <div
          className={clsx('h-full rounded-full transition-all duration-500', getColor())}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between mt-1 text-xs text-slate-400">
          <span>{percentage.toFixed(0)}%</span>
          {isOverBudget && (
            <span className="text-rose-400 font-medium">Over budget!</span>
          )}
        </div>
      )}
    </div>
  );
};

