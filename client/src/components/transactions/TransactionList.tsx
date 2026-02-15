import { useCallback } from 'react';
import { TransactionRow } from './TransactionRow';
import { EmptyState, Spinner } from '../ui';
import { Receipt } from 'lucide-react';
import type { Transaction } from '../../types';

interface TransactionListProps {
  transactions: Transaction[] | undefined;
  isLoading: boolean;
  onEdit: (transaction: Transaction) => void;
  onSplit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  selectionMode?: boolean;
}

export const TransactionList = ({ 
  transactions, 
  isLoading, 
  onEdit, 
  onSplit,
  onDelete,
  selectedIds = new Set(),
  onSelectionChange,
  selectionMode = false,
}: TransactionListProps) => {
  const handleSelectTransaction = useCallback((transactionId: string, selected: boolean) => {
    if (!onSelectionChange) return;
    
    const newSelection = new Set(selectedIds);
    if (selected) {
      newSelection.add(transactionId);
    } else {
      newSelection.delete(transactionId);
    }
    onSelectionChange(newSelection);
  }, [selectedIds, onSelectionChange]);

  const handleSelectAll = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onSelectionChange || !transactions) return;
    
    if (e.target.checked) {
      onSelectionChange(new Set(transactions.map(t => t.id)));
    } else {
      onSelectionChange(new Set());
    }
  }, [transactions, onSelectionChange]);

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

  const allSelected = transactions.length > 0 && selectedIds.size === transactions.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < transactions.length;

  return (
    <div className="bg-midnight-800 border border-midnight-600 rounded-xl">
      {/* Header with select all */}
      {selectionMode && (
        <div className="px-3 py-2 md:px-4 border-b border-midnight-600 flex items-center gap-4">
          <input
            type="checkbox"
            checked={allSelected}
            ref={input => {
              if (input) input.indeterminate = someSelected;
            }}
            onChange={handleSelectAll}
            className="w-5 h-5 rounded border-slate-600 bg-midnight-700 text-accent-500 focus:ring-accent-500/20"
          />
          <span className="text-sm text-slate-400">
            {selectedIds.size > 0 
              ? `${selectedIds.size} selected` 
              : 'Select all'}
          </span>
        </div>
      )}
      
      {transactions.map(transaction => (
        <TransactionRow
          key={transaction.id}
          transaction={transaction}
          onEdit={onEdit}
          onSplit={onSplit}
          onDelete={onDelete}
          isSelected={selectedIds.has(transaction.id)}
          onSelect={handleSelectTransaction}
          selectionMode={selectionMode}
        />
      ))}
    </div>
  );
};

