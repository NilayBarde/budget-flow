import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export const EmptyState = ({ title, description, icon, action }: EmptyStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center py-8 md:py-12 px-4 text-center">
      <div className="p-3 md:p-4 bg-midnight-700 rounded-full mb-3 md:mb-4">
        {icon || <Inbox className="h-6 w-6 md:h-8 md:w-8 text-slate-400" />}
      </div>
      <h3 className="text-base md:text-lg font-medium text-slate-200 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-slate-400 max-w-sm mb-4">{description}</p>
      )}
      {action}
    </div>
  );
};
