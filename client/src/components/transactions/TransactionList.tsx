import { TransactionRow } from './TransactionRow';
import { EmptyState, Spinner } from '../ui';
import { Receipt } from 'lucide-react';
import type { Transaction } from '../../types';

interface TransactionListProps {
  transactions: Transaction[] | undefined;
  isLoading: boolean;
  onEdit: (transaction: Transaction) => void;
  onSplit: (transaction: Transaction) => void;
}

export const TransactionList = ({ transactions, isLoading, onEdit, onSplit }: TransactionListProps) => {
  if (isLoading) {
    return <Spinner className="py-12" />;
  }

  if (!transactions || transactions.length === 0) {
    return (
      <EmptyState
        title="No transactions found"
        description="Connect an account to start tracking your expenses, or try adjusting your filters."
        icon={<Receipt className="h-8 w-8 text-slate-400" />}
      />
    );
  }

  return (
    <div className="bg-midnight-800 border border-midnight-600 rounded-xl">
      {transactions.map(transaction => (
        <TransactionRow
          key={transaction.id}
          transaction={transaction}
          onEdit={onEdit}
          onSplit={onSplit}
        />
      ))}
    </div>
  );
};

