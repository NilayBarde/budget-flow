
import { ArrowUpRight, ArrowDownRight, ArrowRight } from 'lucide-react';
import { Card, Spinner } from '../ui';
import { useTransactions } from '../../hooks';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Link } from 'react-router-dom';

interface RecentActivityProps {
    month: number;
    year: number;
}

export const RecentActivity = ({ month, year }: RecentActivityProps) => {
    const { data: transactions, isLoading } = useTransactions({
        month,
        year
    });

    if (isLoading) {
        return (
            <Card className="min-h-[300px] flex items-center justify-center">
                <Spinner />
            </Card>
        );
    }

    return (
        <Card className="flex flex-col" padding="none">
            <div className="p-4 border-b border-midnight-700 flex items-center justify-between">
                <h3 className="font-medium text-slate-100">Recent Activity</h3>
                <Link to="/transactions" className="text-sm text-accent-400 hover:text-accent-300 flex items-center gap-1">
                    View All <ArrowRight className="h-3 w-3" />
                </Link>
            </div>

            <div className="divide-y divide-midnight-700">
                {transactions?.slice(0, 5).map(transaction => (
                    <div key={transaction.id} className="p-4 flex items-center justify-between hover:bg-midnight-800/50 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${transaction.transaction_type === 'expense' ? 'bg-rose-500/10 text-rose-400' :
                                transaction.transaction_type === 'income' || transaction.transaction_type === 'return' ? 'bg-emerald-500/10 text-emerald-400' :
                                    transaction.transaction_type === 'investment' ? 'bg-violet-500/10 text-violet-400' :
                                        'bg-slate-500/10 text-slate-400'
                                }`}>
                                {transaction.transaction_type === 'expense' ? <ArrowUpRight className="h-4 w-4" /> :
                                    transaction.transaction_type === 'investment' ? <ArrowUpRight className="h-4 w-4" /> :
                                        transaction.transaction_type === 'transfer' ? <ArrowRight className="h-4 w-4" /> :
                                            <ArrowDownRight className="h-4 w-4" />}
                            </div>
                            <div>
                                <p className="text-sm font-medium text-slate-200">{transaction.merchant_name}</p>
                                <p className="text-xs text-slate-400">{formatDate(transaction.date)}</p>
                            </div>
                        </div>
                        <p className={`font-medium ${transaction.transaction_type === 'expense' ? 'text-slate-100' :
                            transaction.transaction_type === 'investment' ? 'text-violet-400' :
                                transaction.transaction_type === 'income' || transaction.transaction_type === 'return' ? 'text-emerald-400' :
                                    'text-slate-100'
                            }`}>
                            {formatCurrency(transaction.amount)}
                        </p>
                    </div>
                ))}

                {(!transactions || transactions.length === 0) && (
                    <div className="p-8 text-center text-slate-400 text-sm">
                        No recent transactions found.
                    </div>
                )}
            </div>
        </Card>
    );
};
