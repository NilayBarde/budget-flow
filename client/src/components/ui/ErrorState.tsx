import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

// Rendered when a query fails. A finance app must never present a failed
// load as $0.00 or an empty list, so pages swap this in on isError.
export const ErrorState = ({
  title = "Couldn't load data",
  description,
  onRetry,
}: ErrorStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center py-8 md:py-12 px-4 text-center">
      <div className="p-3 md:p-4 bg-rose-500/10 rounded-full mb-3 md:mb-4">
        <AlertTriangle className="h-6 w-6 md:h-8 md:w-8 text-rose-400" />
      </div>
      <h3 className="text-base md:text-lg font-medium text-slate-200 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-slate-400 max-w-sm mb-4">{description}</p>
      )}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
};
