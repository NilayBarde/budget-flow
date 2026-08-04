import { Scissors } from 'lucide-react';
import { Card, Button } from '../ui';
import { useTransactions, useModalState } from '../../hooks';
import { SplitTransactionModal } from '../transactions/SplitTransactionModal';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { LARGE_UNSPLIT_THRESHOLD } from '../../utils/constants';
import type { Transaction } from '../../types';

interface LargeUnsplitTransactionsProps {
    month: number;
    year: number;
}

const MAX_ROWS = 5;

export const LargeUnsplitTransactions = ({ month, year }: LargeUnsplitTransactionsProps) => {
    const { data: transactions } = useTransactions({ month, year, transaction_type: 'expense' });
    const splitModal = useModalState<Transaction>();

    const candidates = (transactions || [])
        .filter(t => !t.is_split && Math.abs(t.amount) >= LARGE_UNSPLIT_THRESHOLD)
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

    if (candidates.length === 0) return null;

    const shown = candidates.slice(0, MAX_ROWS);
    const hiddenCount = candidates.length - shown.length;

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
                    {shown.map(t => (
                        <div key={t.id} className="flex items-center justify-between gap-3 text-sm">
                            <div className="min-w-0">
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
                            </div>
                        </div>
                    ))}
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
