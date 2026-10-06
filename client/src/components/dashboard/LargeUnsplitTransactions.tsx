import { useState } from 'react';
import { Scissors } from 'lucide-react';
import { Card, Button, Spinner } from '../ui';
import { useTransactions, useUpdateTransaction, useModalState } from '../../hooks';
import { SplitTransactionModal } from '../transactions/SplitTransactionModal';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { LARGE_UNSPLIT_THRESHOLD } from '../../utils/constants';
import { findMissedSplitCandidates } from '../../utils/missed-splits';
import type { Transaction } from '../../types';

interface LargeUnsplitTransactionsProps {
    month: number;
    year: number;
}

const MAX_ROWS = 5;

export const LargeUnsplitTransactions = ({ month, year }: LargeUnsplitTransactionsProps) => {
    const { data: transactions, isLoading, isPlaceholderData, isError } = useTransactions({ month, year, transaction_type: 'expense' });
    const splitModal = useModalState<Transaction>();
    const updateTransaction = useUpdateTransaction();
    const [saveFailed, setSaveFailed] = useState(false);

    const keepWhole = (id: string) => {
        setSaveFailed(false);
        updateTransaction.mutate({ id, data: { split_dismissed: true } }, { onError: () => setSaveFailed(true) });
    };

    const candidates = findMissedSplitCandidates(transactions || [], LARGE_UNSPLIT_THRESHOLD);

    // Changing month keeps the previous month's rows on screen (placeholder data) while the new month
    // loads. Those rows are not this month's, so they are treated as not loaded: no rows to act on and no
    // "nothing to review" claim until the real data arrives.
    const loading = isLoading || isPlaceholderData;
    const shown = loading ? [] : candidates.slice(0, MAX_ROWS);
    const hiddenCount = loading ? 0 : candidates.length - shown.length;

    return (
        <>
            <Card className="flex flex-col" padding="none">
                <div className="p-4 border-b border-midnight-700 flex items-center gap-2">
                    <Scissors className="h-4 w-4 text-accent-400" />
                    <h3 className="font-medium text-slate-100">Possible missed splits</h3>
                </div>
                <div className="p-4 space-y-3">
                    <p className="text-xs text-slate-400">
                        Large expenses ({formatCurrency(LARGE_UNSPLIT_THRESHOLD)}+) that haven't been split.
                    </p>
                    {/* The card stays put so it does not appear and vanish as the month changes. Nothing is
                        claimed while loading or after a failed load: "no possible splits" must mean none. */}
                    {loading && (
                        <div role="status" aria-label="Loading" className="flex justify-center py-2">
                            <Spinner />
                        </div>
                    )}
                    {!loading && isError && (
                        <p className="text-sm text-rose-400">Could not load this month's transactions.</p>
                    )}
                    {!loading && !isError && candidates.length === 0 && (
                        <p className="text-sm text-slate-400">No possible splits</p>
                    )}
                    {shown.map(t => (
                        <div key={t.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                            <div className="min-w-0 flex-1 basis-32">
                                <p className="font-medium text-slate-200 truncate">
                                    {t.merchant_display_name || t.merchant_name}
                                </p>
                                <p className="text-xs text-slate-500">{formatDate(t.date)}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="font-semibold text-slate-100">
                                    {formatCurrency(Math.abs(t.amount))}
                                </span>
                                <Button variant="ghost" size="sm" onClick={() => splitModal.edit(t)}>
                                    Split
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    aria-label={`Don't split ${t.merchant_display_name || t.merchant_name}`}
                                    disabled={updateTransaction.isPending}
                                    onClick={() => keepWhole(t.id)}
                                >
                                    Don't split
                                </Button>
                            </div>
                        </div>
                    ))}
                    {saveFailed && (
                        <p role="alert" className="text-xs text-rose-400">
                            Could not save that change. Try again.
                        </p>
                    )}
                    {hiddenCount > 0 && (
                        <p className="text-xs text-slate-500">+{hiddenCount} more above the threshold</p>
                    )}
                </div>
            </Card>

            <SplitTransactionModal
                isOpen={splitModal.isOpen}
                onClose={splitModal.close}
                transaction={splitModal.item}
            />
        </>
    );
};
