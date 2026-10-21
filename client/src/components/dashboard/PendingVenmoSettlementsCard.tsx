import { HandCoins } from 'lucide-react';
import { Card, Spinner } from '../ui';
import { usePendingVenmoSettlements } from '../../hooks';
import { formatCurrency, formatDate } from '../../utils/formatters';

const MAX_ROWS = 5;

export const PendingVenmoSettlementsCard = () => {
  const { data, isLoading, isError } = usePendingVenmoSettlements();

  const settlements = data ?? [];
  const shown = settlements.slice(0, MAX_ROWS);
  const hiddenCount = settlements.length - shown.length;

  return (
    <Card className="flex flex-col" padding="none">
      <div className="p-4 border-b border-midnight-700 flex items-center gap-2">
        <HandCoins className="h-4 w-4 text-accent-400" />
        <h3 className="font-medium text-slate-100">Pending Venmo settlements</h3>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-xs text-slate-400">Split expenses still waiting on a Venmo payment.</p>
        {isLoading && (
          <div role="status" aria-label="Loading" className="flex justify-center py-2">
            <Spinner />
          </div>
        )}
        {!isLoading && isError && (
          <p className="text-sm text-rose-400">Could not load pending settlements.</p>
        )}
        {!isLoading && !isError && settlements.length === 0 && (
          <p className="text-sm text-slate-400">No pending settlements</p>
        )}
        {shown.map((s) => (
          <div key={s.splitId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
            <div className="min-w-0 flex-1 basis-32">
              <p className="font-medium text-slate-200 truncate">{s.description}</p>
              <p className="text-xs text-slate-500">{formatDate(s.date)}</p>
            </div>
            <span className="font-semibold text-slate-100 flex-shrink-0">{formatCurrency(s.remainingAmount)}</span>
          </div>
        ))}
        {hiddenCount > 0 && <p className="text-xs text-slate-500">+{hiddenCount} more pending</p>}
      </div>
    </Card>
  );
};
